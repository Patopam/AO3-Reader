'use client';

import React, { useState, useRef } from 'react';
import { db, saveBookWithFile, type Fic } from '../lib/db';
import { parseEpubMetadata } from '../lib/epubParser';
import { parsePdfMetadata } from '../lib/pdfParser';
import {
	downloadPublicDriveFile,
	inspectPublicDriveFolder,
	extractDriveId,
	type DriveFileInfo,
} from '../lib/googleDrive';
import {
	Upload,
	Folder,
	FileText,
	CheckCircle2,
	AlertTriangle,
	XCircle,
	Loader2,
	Cloud,
	X,
	Info,
	Link2,
} from 'lucide-react';

interface ImportModalProps {
	isOpen: boolean;
	onClose: () => void;
	onImportFinished: () => void;
}

type ImportTab = 'drive' | 'local' | 'url';

interface ImportItemStatus {
	id: string;
	name: string;
	format: 'epub' | 'pdf' | 'unknown';
	status: 'pending' | 'downloading' | 'parsing' | 'saved' | 'duplicate' | 'error';
	message?: string;
}

export function ImportModal({ isOpen, onClose, onImportFinished }: ImportModalProps) {
	const [activeTab, setActiveTab] = useState<ImportTab>('drive');
	const [isProcessing, setIsProcessing] = useState<boolean>(false);
	const [items, setItems] = useState<ImportItemStatus[]>([]);
	const [summary, setSummary] = useState<{
		imported: number;
		duplicates: number;
		errors: number;
		skipped: number;
	} | null>(null);

	// Google Drive input state
	const [driveInput, setDriveInput] = useState<string>('');
	const [driveNotice, setDriveNotice] = useState<string | null>(null);

	// Generic Direct URL input state
	const [urlInput, setUrlInput] = useState<string>('');

	const abortControllerRef = useRef<AbortController | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const folderInputRef = useRef<HTMLInputElement | null>(null);

	if (!isOpen) return null;

	const handleCancel = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		setIsProcessing(false);
	};

	// Helper to process a single File / Blob into IndexedDB
	const processFileBlob = async (
		fileBlob: Blob,
		filename: string,
		source: 'local' | 'gdrive' | 'url',
		updateStatus: (status: ImportItemStatus['status'], message?: string) => void
	): Promise<'imported' | 'duplicate' | 'error' | 'skipped'> => {
		const lowerName = filename.toLowerCase();
		const isEpub = lowerName.endsWith('.epub') || fileBlob.type.includes('epub');
		const isPdf = lowerName.endsWith('.pdf') || fileBlob.type.includes('pdf');

		if (!isEpub && !isPdf) {
			updateStatus('error', 'Formato no compatible (sólo se admiten archivos .epub y .pdf)');
			return 'skipped';
		}

		try {
			updateStatus('parsing', 'Extrayendo metadatos y capítulos...');
			let parsedData: Omit<Fic, 'id' | 'fileId'>;

			if (isEpub) {
				parsedData = await parseEpubMetadata(fileBlob, filename);
			} else {
				parsedData = await parsePdfMetadata(fileBlob, filename);
			}

			// Check for duplicates in Dexie
			const existing = await db.fics
				.where('title')
				.equals(parsedData.title)
				.and((f) => f.author.toLowerCase() === parsedData.author.toLowerCase())
				.first();

			if (existing) {
				updateStatus('duplicate', 'Ya existe en la biblioteca');
				return 'duplicate';
			}

			// Save metadata and store file binary blob
			await saveBookWithFile(
				{
					...parsedData,
					source,
				},
				fileBlob,
				filename
			);

			updateStatus('saved', 'Importado con éxito');
			return 'imported';
		} catch (err: any) {
			console.error(`Error al procesar ${filename}:`, err);
			updateStatus('error', err.message || 'Archivo corrupto o ilegible');
			return 'error';
		}
	};

	// 1. Google Drive Link Import (Single, Folder, or Multi-link without login)
	const handleGoogleDriveImport = async (e: React.FormEvent) => {
		e.preventDefault();
		const rawInput = driveInput.trim();
		if (!rawInput) return;

		setDriveNotice(null);
		setIsProcessing(true);
		setSummary(null);
		abortControllerRef.current = new AbortController();
		const signal = abortControllerRef.current.signal;

		try {
			// Split by lines or commas to support multiple links
			const links = rawInput
				.split(/[\n,]+/)
				.map((s) => s.trim())
				.filter(Boolean);

			if (links.length === 0) {
				setIsProcessing(false);
				return;
			}

			const filesToDownload: Array<{ urlOrId: string; name: string; formatHint?: 'epub' | 'pdf' }> = [];

			for (const link of links) {
				const parsed = extractDriveId(link);
				if (!parsed) {
					// Fallback to treat as direct file url
					filesToDownload.push({ urlOrId: link, name: 'archivo_drive.epub' });
					continue;
				}

				if (parsed.type === 'folder') {
					// Inspect public folder
					try {
						const folderRes = await inspectPublicDriveFolder(link, signal);
						if (folderRes.type === 'folder' && folderRes.compatibleFiles && folderRes.compatibleFiles.length > 0) {
							for (const f of folderRes.compatibleFiles) {
								filesToDownload.push({
									urlOrId: f.downloadUrl || f.id,
									name: f.name,
									formatHint: f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub',
								});
							}
						} else {
							setDriveNotice(
								folderRes.message ||
									'Google Drive requiere enlaces directos para carpetas públicas sin autenticación. Por favor, pega los enlaces directos de los archivos de la carpeta.'
							);
						}
					} catch (folderErr: any) {
						setDriveNotice(
							`No se pudo leer la carpeta automáticamente: ${folderErr.message}. Puedes importar los archivos copiando sus enlaces individuales.`
						);
					}
				} else {
					filesToDownload.push({
						urlOrId: link,
						name: 'Archivo de Google Drive',
					});
				}
			}

			if (filesToDownload.length === 0) {
				setIsProcessing(false);
				return;
			}

			const initialItems: ImportItemStatus[] = filesToDownload.map((f, idx) => ({
				id: `gdrive-${idx}-${Date.now()}`,
				name: f.name,
				format: f.formatHint || (f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub'),
				status: 'pending',
			}));
			setItems(initialItems);

			let imported = 0;
			let duplicates = 0;
			let errors = 0;
			let skipped = 0;

			for (let i = 0; i < filesToDownload.length; i++) {
				if (signal.aborted) break;

				const target = filesToDownload[i];
				const itemId = initialItems[i].id;

				const updateItem = (status: ImportItemStatus['status'], message?: string, newName?: string, newFormat?: 'epub' | 'pdf') => {
					setItems((prev) =>
						prev.map((it) =>
							it.id === itemId
								? {
										...it,
										status,
										message: message ?? it.message,
										name: newName ?? it.name,
										format: newFormat ?? it.format,
								  }
								: it
						)
					);
				};

				try {
					updateItem('downloading', 'Descargando desde Google Drive...');
					const { blob, filename, format } = await downloadPublicDriveFile(target.urlOrId, signal);

					updateItem('downloading', 'Descargado, iniciando análisis...', filename, format);

					const result = await processFileBlob(blob, filename, 'gdrive', (s, msg) => {
						updateItem(s, msg, filename, format);
					});

					if (result === 'imported') imported++;
					else if (result === 'duplicate') duplicates++;
					else if (result === 'error') errors++;
					else if (result === 'skipped') skipped++;
				} catch (downloadErr: any) {
					console.error('Error downloading Drive file:', downloadErr);
					updateItem('error', downloadErr.message || 'Error al descargar');
					errors++;
				}
			}

			setIsProcessing(false);
			setSummary({ imported, duplicates, errors, skipped });
			if (imported > 0) {
				setDriveInput('');
				onImportFinished();
			}
		} catch (err: any) {
			console.error('Drive import error:', err);
			setIsProcessing(false);
			setDriveNotice(`Error en la importación: ${err.message || 'Error desconocido'}`);
		}
	};

	// 2. Handle Local Files & Folders
	const handleLocalFiles = async (fileList: FileList | File[]) => {
		const files = Array.from(fileList).filter((f) => {
			const n = f.name.toLowerCase();
			return (n.endsWith('.epub') || n.endsWith('.pdf')) && f.size > 50;
		});

		if (files.length === 0) {
			alert('No se encontraron archivos .epub o .pdf válidos en la selección.');
			return;
		}

		setIsProcessing(true);
		setSummary(null);
		abortControllerRef.current = new AbortController();
		const signal = abortControllerRef.current.signal;

		const initialItems: ImportItemStatus[] = files.map((f, i) => ({
			id: `local-${i}-${f.name}`,
			name: f.name,
			format: f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub',
			status: 'pending',
		}));
		setItems(initialItems);

		let imported = 0;
		let duplicates = 0;
		let errors = 0;
		let skipped = 0;

		for (let i = 0; i < files.length; i++) {
			if (signal.aborted) break;

			const file = files[i];
			const itemId = initialItems[i].id;

			const updateItem = (status: ImportItemStatus['status'], message?: string) => {
				setItems((prev) =>
					prev.map((it) => (it.id === itemId ? { ...it, status, message } : it))
				);
			};

			const result = await processFileBlob(file, file.name, 'local', updateItem);
			if (result === 'imported') imported++;
			else if (result === 'duplicate') duplicates++;
			else if (result === 'error') errors++;
			else if (result === 'skipped') skipped++;
		}

		setIsProcessing(false);
		setSummary({ imported, duplicates, errors, skipped });
		if (imported > 0) {
			onImportFinished();
		}
	};

	// 3. Handle Generic URL Download
	const handleUrlImport = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!urlInput.trim()) return;

		setIsProcessing(true);
		setSummary(null);
		abortControllerRef.current = new AbortController();
		const signal = abortControllerRef.current.signal;

		const filename = urlInput.split('/').pop()?.split('?')[0] || 'obra_importada.epub';
		const item: ImportItemStatus = {
			id: 'url-1',
			name: filename,
			format: filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub',
			status: 'downloading',
			message: 'Descargando enlace...',
		};
		setItems([item]);

		try {
			const res = await fetch(`/api/fetch-drive?url=${encodeURIComponent(urlInput.trim())}`, { signal });
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.error || `Error HTTP ${res.status}`);
			}

			const blob = await res.blob();
			const result = await processFileBlob(blob, filename, 'url', (status, message) => {
				setItems([{ ...item, status, message }]);
			});

			setSummary({
				imported: result === 'imported' ? 1 : 0,
				duplicates: result === 'duplicate' ? 1 : 0,
				errors: result === 'error' ? 1 : 0,
				skipped: result === 'skipped' ? 1 : 0,
			});
			if (result === 'imported') {
				setUrlInput('');
				onImportFinished();
			}
		} catch (err: any) {
			setItems([{ ...item, status: 'error', message: err.message || 'Error al descargar' }]);
			setSummary({ imported: 0, duplicates: 0, errors: 1, skipped: 0 });
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans text-xs'>
			<div className='bg-white rounded-lg max-w-xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150'>
				{/* Modal Header */}
				<div className='flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-[#fbfbfb]'>
					<div className='flex items-center space-x-2'>
						<Upload className='w-4 h-4 text-[#990000]' />
						<h3 className='font-bold text-sm text-[#990000] font-serif uppercase tracking-wider'>
							Añadir Obras a la Biblioteca
						</h3>
					</div>
					<button
						onClick={onClose}
						disabled={isProcessing}
						className='text-gray-400 hover:text-gray-700 font-bold p-1 cursor-pointer disabled:opacity-30'
					>
						<X className='w-4 h-4' />
					</button>
				</div>

				{/* Navigation Tabs */}
				{!isProcessing && !summary && (
					<div className='flex border-b border-gray-200 bg-gray-50 text-xs font-semibold'>
						<button
							onClick={() => setActiveTab('drive')}
							className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-2 ${
								activeTab === 'drive'
									? 'border-[#990000] text-[#990000] bg-white font-bold'
									: 'border-transparent text-gray-600 hover:text-gray-900'
							}`}
						>
							<Cloud className='w-3.5 h-3.5 text-[#990000]' />
							<span>Google Drive (Enlace)</span>
						</button>

						<button
							onClick={() => setActiveTab('local')}
							className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-2 ${
								activeTab === 'local'
									? 'border-[#990000] text-[#990000] bg-white font-bold'
									: 'border-transparent text-gray-600 hover:text-gray-900'
							}`}
						>
							<Folder className='w-3.5 h-3.5 text-gray-500' />
							<span>Archivos Locales</span>
						</button>

						<button
							onClick={() => setActiveTab('url')}
							className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-2 ${
								activeTab === 'url'
									? 'border-[#990000] text-[#990000] bg-white font-bold'
									: 'border-transparent text-gray-600 hover:text-gray-900'
							}`}
						>
							<Link2 className='w-3.5 h-3.5 text-gray-500' />
							<span>Enlace Web Directo</span>
						</button>
					</div>
				)}

				{/* Modal Body */}
				<div className='p-6 overflow-y-auto flex-1 space-y-4'>
					{/* Active Batch Progress State */}
					{(isProcessing || summary) && (
						<div className='space-y-4'>
							<div className='flex justify-between items-center'>
								<h4 className='font-bold text-sm text-gray-900'>
									{isProcessing ? 'Procesando archivos...' : '¡Importación finalizada!'}
								</h4>
								{isProcessing && (
									<button
										onClick={handleCancel}
										className='text-xs font-bold text-red-700 hover:text-red-900 underline cursor-pointer'
									>
										Cancelar operación
									</button>
								)}
							</div>

							{/* Progress Items List */}
							<div className='max-h-60 overflow-y-auto space-y-2 border border-gray-200 rounded p-3 bg-gray-50'>
								{items.map((it) => (
									<div
										key={it.id}
										className='flex items-center justify-between text-xs p-2.5 bg-white rounded border border-gray-200 shadow-2xs'
									>
										<div className='flex items-center space-x-2 truncate pr-2'>
											<span
												className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
													it.format === 'pdf'
														? 'bg-rose-50 text-rose-700 border-rose-200'
														: 'bg-red-50 text-[#990000] border-red-200'
												}`}
											>
												{it.format}
											</span>
											<span className='font-medium text-gray-800 truncate'>{it.name}</span>
										</div>

										<div className='flex items-center space-x-1.5 shrink-0 text-[11px]'>
											{it.status === 'pending' && <span className='text-gray-400'>En cola</span>}
											{it.status === 'downloading' && (
												<span className='text-blue-700 flex items-center space-x-1 font-medium'>
													<Loader2 className='w-3 h-3 animate-spin' />
													<span>Descargando...</span>
												</span>
											)}
											{it.status === 'parsing' && (
												<span className='text-amber-700 flex items-center space-x-1 font-medium'>
													<Loader2 className='w-3 h-3 animate-spin' />
													<span>Extrayendo datos...</span>
												</span>
											)}
											{it.status === 'saved' && (
												<span className='text-green-700 font-semibold flex items-center space-x-1'>
													<CheckCircle2 className='w-3.5 h-3.5 text-green-600' />
													<span>Importado</span>
												</span>
											)}
											{it.status === 'duplicate' && (
												<span className='text-amber-700 font-semibold flex items-center space-x-1'>
													<AlertTriangle className='w-3.5 h-3.5 text-amber-600' />
													<span>Duplicado</span>
												</span>
											)}
											{it.status === 'error' && (
												<span
													className='text-red-700 font-semibold flex items-center space-x-1'
													title={it.message}
												>
													<XCircle className='w-3.5 h-3.5 text-red-600' />
													<span>Error</span>
												</span>
											)}
										</div>
									</div>
								))}
							</div>

							{/* Summary Card */}
							{summary && (
								<div className='p-4 bg-gray-50 border border-gray-200 rounded-md space-y-2'>
									<p className='font-bold text-gray-800'>Resumen del lote:</p>
									<div className='grid grid-cols-3 gap-2 text-center text-xs'>
										<div className='p-2 bg-green-50 border border-green-200 rounded text-green-800 font-bold'>
											<div>{summary.imported}</div>
											<div className='text-[10px] font-normal'>Importados</div>
										</div>
										<div className='p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 font-bold'>
											<div>{summary.duplicates}</div>
											<div className='text-[10px] font-normal'>Duplicados</div>
										</div>
										<div className='p-2 bg-red-50 border border-red-200 rounded text-red-800 font-bold'>
											<div>{summary.errors}</div>
											<div className='text-[10px] font-normal'>Errores / Omitidos</div>
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Tab 1: Google Drive (No auth, pure link based) */}
					{!isProcessing && !summary && activeTab === 'drive' && (
						<form onSubmit={handleGoogleDriveImport} className='space-y-4'>
							<div className='text-gray-700 text-xs leading-relaxed space-y-1.5'>
								<p className='font-medium text-gray-900'>
									Importa archivos <strong className='text-[#990000]'>EPUB</strong> y{' '}
									<strong className='text-[#990000]'>PDF</strong> pegando enlaces públicos de Google
									Drive.
								</p>
								<p className='text-gray-500 text-[11px]'>
									Procesa los archivos de forma anónima mediante Google Drive V3 REST API. El archivo
									o carpeta debe tener permiso de <em>&ldquo;Cualquier persona con el enlace&rdquo;</em>.
								</p>
							</div>

							<div className='space-y-1.5'>
								<div className='flex justify-between items-center'>
									<label className='block font-semibold text-gray-800'>
										Enlace de archivo o carpeta de Google Drive:
									</label>
									{driveInput.trim() && (
										<div className='flex items-center space-x-2 text-[11px]'>
											<span className='font-semibold text-[#990000]'>
												{driveInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length}{' '}
												enlace(s) detectado(s)
											</span>
											<button
												type='button'
												onClick={() => setDriveInput('')}
												className='text-gray-500 hover:text-gray-800 underline cursor-pointer'
											>
												Limpiar
											</button>
										</div>
									)}
								</div>
								<textarea
									rows={3}
									value={driveInput}
									onChange={(e) => setDriveInput(e.target.value)}
									placeholder='https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2up08/view?usp=sharing&#10;(o pega múltiples enlaces, uno por línea)'
									required
									className='w-full px-3 py-2 border border-gray-300 rounded text-xs font-mono bg-white focus:outline-none focus:border-[#990000] focus:ring-1 focus:ring-[#990000]'
								/>
								<div className='text-[11px] text-gray-500 flex flex-wrap justify-between items-center gap-1'>
									<span>Formatos: enlaces directos de archivo (/file/d/...), carpeta (/folders/...) o ID.</span>
									<span className='text-gray-400'>Google Drive V3 REST API</span>
								</div>
							</div>

							{driveNotice && (
								<div className='p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 flex items-start space-x-2 text-[11px] leading-relaxed'>
									<Info className='w-4 h-4 shrink-0 text-amber-600 mt-0.5' />
									<span>{driveNotice}</span>
								</div>
							)}

							<div className='p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 flex items-start space-x-2 text-[11px] leading-relaxed'>
								<Info className='w-4 h-4 shrink-0 text-blue-600 mt-0.5' />
								<span>
									La descarga se procesa a través del proxy del servidor para sortear las restricciones
									CORS de Google Drive y se almacena directamente en el IndexedDB local de tu navegador.
								</span>
							</div>

							<div className='flex justify-end pt-2'>
								<button
									type='submit'
									disabled={!driveInput.trim()}
									className='px-5 py-2.5 bg-[#990000] hover:bg-[#800000] text-white rounded font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-40 flex items-center space-x-2'
								>
									<Cloud className='w-4 h-4' />
									<span>Importar desde Google Drive</span>
								</button>
							</div>
						</form>
					)}

					{/* Tab 2: Local Files and Folders */}
					{!isProcessing && !summary && activeTab === 'local' && (
						<div className='space-y-4'>
							<p className='text-gray-600 text-xs'>
								Selecciona uno o varios archivos <strong className='text-gray-900'>.epub</strong> o{' '}
								<strong className='text-gray-900'>.pdf</strong> de tu equipo, o importa una carpeta
								completa.
							</p>

							{/* Hidden File Inputs */}
							<input
								ref={fileInputRef}
								type='file'
								accept='.epub,.pdf'
								multiple
								className='hidden'
								onChange={(e) => {
									if (e.target.files) handleLocalFiles(e.target.files);
								}}
							/>
							<input
								ref={folderInputRef}
								type='file'
								// @ts-ignore
								webkitdirectory=''
								directory=''
								multiple
								className='hidden'
								onChange={(e) => {
									if (e.target.files) handleLocalFiles(e.target.files);
								}}
							/>

							<div className='grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1'>
								<button
									type='button'
									onClick={() => fileInputRef.current?.click()}
									className='flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 hover:border-[#990000] rounded-lg bg-white hover:bg-red-50/30 cursor-pointer transition-all space-y-2'
								>
									<FileText className='w-8 h-8 text-[#990000]' />
									<span className='font-bold text-gray-900'>Seleccionar Archivos</span>
									<span className='text-[11px] text-gray-500 text-center'>
										Archivos individuales EPUB o PDF
									</span>
								</button>

								<button
									type='button'
									onClick={() => folderInputRef.current?.click()}
									className='flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 hover:border-[#990000] rounded-lg bg-white hover:bg-red-50/30 cursor-pointer transition-all space-y-2'
								>
									<Folder className='w-8 h-8 text-[#990000]' />
									<span className='font-bold text-gray-900'>Seleccionar Carpeta</span>
									<span className='text-[11px] text-gray-500 text-center'>
										Importar todo el contenido de una carpeta
									</span>
								</button>
							</div>

							<div className='p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 flex items-start space-x-2 text-[11px] leading-relaxed'>
								<Info className='w-4 h-4 shrink-0 text-blue-600 mt-0.5' />
								<span>
									Todos los metadatos y archivos se procesan y almacenan localmente en IndexedDB. No se
									envía ninguna copia de tus fanfics a servidores externos.
								</span>
							</div>
						</div>
					)}

					{/* Tab 3: URL Direct Link */}
					{!isProcessing && !summary && activeTab === 'url' && (
						<form onSubmit={handleUrlImport} className='space-y-4'>
							<p className='text-gray-600 text-xs'>
								Pega un enlace directo de descarga a un archivo{' '}
								<strong className='text-gray-900'>.epub</strong> o{' '}
								<strong className='text-gray-900'>.pdf</strong> en la web.
							</p>

							<div className='space-y-1.5'>
								<label className='block font-semibold text-gray-800'>Enlace directo de descarga:</label>
								<input
									type='url'
									placeholder='https://ejemplo.com/archivo.epub'
									value={urlInput}
									onChange={(e) => setUrlInput(e.target.value)}
									required
									className='w-full px-3 py-2 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:border-[#990000] focus:ring-1 focus:ring-[#990000]'
								/>
							</div>

							<div className='flex justify-end pt-2'>
								<button
									type='submit'
									disabled={!urlInput.trim()}
									className='px-5 py-2.5 bg-[#990000] hover:bg-[#800000] text-white rounded font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-40'
								>
									Descargar e Importar
								</button>
							</div>
						</form>
					)}
				</div>

				{/* Modal Footer */}
				<div className='px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex justify-end space-x-2'>
					{summary ? (
						<button
							onClick={() => {
								setSummary(null);
								setItems([]);
								onClose();
							}}
							className='px-5 py-2 bg-[#990000] hover:bg-[#800000] text-white font-bold rounded shadow-xs cursor-pointer text-xs'
						>
							Ver Biblioteca
						</button>
					) : (
						<button
							type='button'
							onClick={onClose}
							disabled={isProcessing}
							className='px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 rounded font-semibold text-gray-700 disabled:opacity-30 cursor-pointer text-xs transition-colors'
						>
							Cerrar
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
