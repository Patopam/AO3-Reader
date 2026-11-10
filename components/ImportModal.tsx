'use client';

import React, { useState, useRef } from 'react';
import { db, saveBookWithFile, type Fic } from '../lib/db';
import { parseEpubMetadata } from '../lib/epubParser';
import { parsePdfMetadata } from '../lib/pdfParser';
import {
	getDriveAccessToken,
	openGooglePicker,
	downloadDriveFile,
	listFilesInDriveFolder,
	type DriveFileItem,
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
	Key,
	X,
	Info,
	Check,
} from 'lucide-react';

interface ImportModalProps {
	isOpen: boolean;
	onClose: () => void;
	onImportFinished: () => void;
}

type ImportTab = 'local' | 'drive' | 'url';

interface ImportItemStatus {
	id: string;
	name: string;
	format: 'epub' | 'pdf' | 'unknown';
	status: 'pending' | 'downloading' | 'parsing' | 'saved' | 'duplicate' | 'error';
	message?: string;
}

export function ImportModal({ isOpen, onClose, onImportFinished }: ImportModalProps) {
	const [activeTab, setActiveTab] = useState<ImportTab>('local');
	const [isProcessing, setIsProcessing] = useState<boolean>(false);
	const [items, setItems] = useState<ImportItemStatus[]>([]);
	const [summary, setSummary] = useState<{
		imported: number;
		duplicates: number;
		errors: number;
		skipped: number;
	} | null>(null);

	// URL direct import state
	const [urlInput, setUrlInput] = useState<string>('');

	// Google Drive Client ID configuration state
	const envClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
	const [customClientId, setCustomClientId] = useState<string>(envClientId);
	const [showDriveSetupGuide, setShowDriveSetupGuide] = useState<boolean>(!envClientId);

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

	// Helper to process a single File / Blob
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
			updateStatus('error', 'Unsupported format (only .epub and .pdf are supported)');
			return 'skipped';
		}

		try {
			updateStatus('parsing', 'Reading metadata...');
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
				updateStatus('duplicate', 'Already exists in your library');
				return 'duplicate';
			}

			// Save book metadata and store binary in files table
			await saveBookWithFile(
				{
					...parsedData,
					source,
				},
				fileBlob,
				filename
			);

			updateStatus('saved', 'Successfully imported');
			return 'imported';
		} catch (err: any) {
			console.error(`Error processing ${filename}:`, err);
			updateStatus('error', err.message || 'Corrupt or unreadable file');
			return 'error';
		}
	};

	// 1. Handle Local Files
	const handleLocalFiles = async (fileList: FileList | File[]) => {
		const files = Array.from(fileList).filter((f) => {
			const n = f.name.toLowerCase();
			return (n.endsWith('.epub') || n.endsWith('.pdf')) && f.size > 50;
		});

		if (files.length === 0) {
			alert('No valid .epub or .pdf files found.');
			return;
		}

		setIsProcessing(true);
		setSummary(null);
		abortControllerRef.current = new AbortController();

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
			if (abortControllerRef.current.signal.aborted) break;

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
		onImportFinished();
	};

	// 2. Handle Google Drive Import via GIS & Picker
	const handleGoogleDriveImport = async () => {
		const clientId = customClientId || envClientId;
		if (!clientId) {
			setShowDriveSetupGuide(true);
			return;
		}

		try {
			setIsProcessing(true);
			setSummary(null);
			abortControllerRef.current = new AbortController();

			// 1. Authenticate with Google
			const token = await getDriveAccessToken(clientId);

			// 2. Open Google Picker
			await openGooglePicker({
				clientId,
				accessToken: token,
				onSelect: async (selectedItems: DriveFileItem[]) => {
					// Expand folders if user selected any folder
					const allFilesToDownload: DriveFileItem[] = [];

					for (const item of selectedItems) {
						if (item.mimeType === 'application/vnd.google-apps.folder') {
							const folderFiles = await listFilesInDriveFolder(
								item.id,
								token,
								abortControllerRef.current?.signal
							);
							allFilesToDownload.push(...folderFiles);
						} else {
							allFilesToDownload.push(item);
						}
					}

					if (allFilesToDownload.length === 0) {
						setIsProcessing(false);
						alert('No .epub or .pdf files found in the selection.');
						return;
					}

					const initialDriveItems: ImportItemStatus[] = allFilesToDownload.map((f, idx) => ({
						id: `gdrive-${idx}-${f.id}`,
						name: f.name,
						format: f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub',
						status: 'pending',
					}));
					setItems(initialDriveItems);

					let imported = 0;
					let duplicates = 0;
					let errors = 0;
					let skipped = 0;

					for (let i = 0; i < allFilesToDownload.length; i++) {
						if (abortControllerRef.current?.signal.aborted) break;

						const fileItem = allFilesToDownload[i];
						const itemId = initialDriveItems[i].id;

						const updateItem = (status: ImportItemStatus['status'], message?: string) => {
							setItems((prev) =>
								prev.map((it) => (it.id === itemId ? { ...it, status, message } : it))
							);
						};

						try {
							updateItem('downloading', 'Downloading from Google Drive...');
							const { blob } = await downloadDriveFile(
								fileItem.id,
								token,
								abortControllerRef.current?.signal
							);

							const result = await processFileBlob(blob, fileItem.name, 'gdrive', updateItem);
							if (result === 'imported') imported++;
							else if (result === 'duplicate') duplicates++;
							else if (result === 'error') errors++;
							else if (result === 'skipped') skipped++;
						} catch (downloadErr: any) {
							updateItem('error', downloadErr.message || 'Download error');
							errors++;
						}
					}

					setIsProcessing(false);
					setSummary({ imported, duplicates, errors, skipped });
					onImportFinished();
				},
				onCancel: () => {
					setIsProcessing(false);
				},
			});
		} catch (err: any) {
			console.error('Drive import failed:', err);
			setIsProcessing(false);
			alert(`Google Drive connection error: ${err.message}`);
		}
	};

	// 3. Handle Direct Link Import
	const handleUrlImport = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!urlInput.trim()) return;

		setIsProcessing(true);
		setSummary(null);

		const filename = urlInput.split('/').pop()?.split('?')[0] || 'imported-work.epub';
		const item: ImportItemStatus = {
			id: 'url-1',
			name: filename,
			format: filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub',
			status: 'downloading',
			message: 'Fetching from URL...',
		};
		setItems([item]);

		try {
			const res = await fetch(`/api/fetch-epub?url=${encodeURIComponent(urlInput.trim())}`);
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.error || `Failed with status ${res.status}`);
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
			setUrlInput('');
			onImportFinished();
		} catch (err: any) {
			setItems([{ ...item, status: 'error', message: err.message || 'Failed to download link' }]);
			setSummary({ imported: 0, duplicates: 0, errors: 1, skipped: 0 });
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans text-xs'>
			<div className='bg-white rounded-lg max-w-xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150'>
				{/* Modal Header */}
				<div className='flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-[#fbfbfb]'>
					<div className='flex items-center space-x-2'>
						<Upload className='w-4 h-4 text-[#990000]' />
						<h3 className='font-bold text-sm text-[#990000] font-serif uppercase tracking-wider'>
							Import Works to Library
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
							onClick={() => setActiveTab('local')}
							className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-2 ${
								activeTab === 'local'
									? 'border-[#990000] text-[#990000] bg-white font-bold'
									: 'border-transparent text-gray-600 hover:text-gray-900'
							}`}
						>
							<Folder className='w-3.5 h-3.5' />
							<span>Local Files & Folders</span>
						</button>

						<button
							onClick={() => setActiveTab('drive')}
							className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-2 ${
								activeTab === 'drive'
									? 'border-[#990000] text-[#990000] bg-white font-bold'
									: 'border-transparent text-gray-600 hover:text-gray-900'
							}`}
						>
							<Cloud className='w-3.5 h-3.5 text-blue-600' />
							<span>Google Drive</span>
						</button>

						<button
							onClick={() => setActiveTab('url')}
							className={`flex-1 py-3 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-2 ${
								activeTab === 'url'
									? 'border-[#990000] text-[#990000] bg-white font-bold'
									: 'border-transparent text-gray-600 hover:text-gray-900'
							}`}
						>
							<FileText className='w-3.5 h-3.5' />
							<span>Web URL / Direct Link</span>
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
									{isProcessing ? 'Processing files...' : 'Import Complete!'}
								</h4>
								{isProcessing && (
									<button
										onClick={handleCancel}
										className='text-xs font-bold text-red-600 hover:underline cursor-pointer'
									>
										Cancel batch
									</button>
								)}
							</div>

							{/* Progress Items List */}
							<div className='max-h-60 overflow-y-auto space-y-2 border border-gray-200 rounded p-3 bg-gray-50'>
								{items.map((it) => (
									<div
										key={it.id}
										className='flex items-center justify-between text-xs p-2 bg-white rounded border border-gray-200 shadow-2xs'
									>
										<div className='flex items-center space-x-2 truncate pr-2'>
											<span
												className={`text-[9px] uppercase font-bold px-1 py-0.5 rounded border ${
													it.format === 'pdf'
														? 'bg-rose-50 text-rose-700 border-rose-200'
														: 'bg-blue-50 text-blue-700 border-blue-200'
												}`}
											>
												{it.format}
											</span>
											<span className='font-medium text-gray-800 truncate'>{it.name}</span>
										</div>

										<div className='flex items-center space-x-1.5 shrink-0 text-[11px]'>
											{it.status === 'pending' && <span className='text-gray-400'>Queued</span>}
											{it.status === 'downloading' && (
												<span className='text-blue-600 flex items-center space-x-1'>
													<Loader2 className='w-3 h-3 animate-spin' />
													<span>Downloading...</span>
												</span>
											)}
											{it.status === 'parsing' && (
												<span className='text-amber-600 flex items-center space-x-1'>
													<Loader2 className='w-3 h-3 animate-spin' />
													<span>Parsing...</span>
												</span>
											)}
											{it.status === 'saved' && (
												<span className='text-green-700 font-semibold flex items-center space-x-1'>
													<CheckCircle2 className='w-3.5 h-3.5 text-green-600' />
													<span>Imported</span>
												</span>
											)}
											{it.status === 'duplicate' && (
												<span className='text-amber-700 font-semibold flex items-center space-x-1'>
													<AlertTriangle className='w-3.5 h-3.5 text-amber-600' />
													<span>Duplicate</span>
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
									<p className='font-bold text-gray-800'>Batch Summary:</p>
									<div className='grid grid-cols-3 gap-2 text-center text-xs'>
										<div className='p-2 bg-green-50 border border-green-200 rounded text-green-800 font-bold'>
											<div>{summary.imported}</div>
											<div className='text-[10px] font-normal'>Imported</div>
										</div>
										<div className='p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 font-bold'>
											<div>{summary.duplicates}</div>
											<div className='text-[10px] font-normal'>Duplicates</div>
										</div>
										<div className='p-2 bg-red-50 border border-red-200 rounded text-red-800 font-bold'>
											<div>{summary.errors}</div>
											<div className='text-[10px] font-normal'>Errors / Skipped</div>
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Tab 1: Local Files and Folder */}
					{!isProcessing && !summary && activeTab === 'local' && (
						<div className='space-y-4'>
							<p className='text-gray-600'>
								Select one or more <strong className='text-gray-900'>.epub</strong> or{' '}
								<strong className='text-gray-900'>.pdf</strong> files from your computer, or choose an
								entire folder.
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

							<div className='grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2'>
								<button
									onClick={() => fileInputRef.current?.click()}
									className='flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 hover:border-[#990000] rounded-lg bg-gray-50 hover:bg-red-50/40 cursor-pointer transition-all space-y-2'
								>
									<FileText className='w-8 h-8 text-[#990000]' />
									<span className='font-bold text-gray-900'>Choose Files</span>
									<span className='text-[11px] text-gray-500 text-center'>
										Select multiple EPUB / PDF files
									</span>
								</button>

								<button
									onClick={() => folderInputRef.current?.click()}
									className='flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 hover:border-[#990000] rounded-lg bg-gray-50 hover:bg-red-50/40 cursor-pointer transition-all space-y-2'
								>
									<Folder className='w-8 h-8 text-[#990000]' />
									<span className='font-bold text-gray-900'>Choose Folder</span>
									<span className='text-[11px] text-gray-500 text-center'>
										Batch import an entire folder
									</span>
								</button>
							</div>

							<div className='p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 flex items-start space-x-2 text-[11px] leading-relaxed'>
								<Info className='w-4 h-4 shrink-0 text-blue-600 mt-0.5' />
								<span>
									All metadata, chapters, and files are stored safely inside your browser&apos;s
									IndexedDB database. No files are uploaded to any external server.
								</span>
							</div>
						</div>
					)}

					{/* Tab 2: Google Drive */}
					{!isProcessing && !summary && activeTab === 'drive' && (
						<div className='space-y-4'>
							<p className='text-gray-600'>
								Import files directly from your personal Google Drive or Shared Drives using official
								Google OAuth & Picker.
							</p>

							{/* Client ID Setting */}
							<div className='p-4 bg-gray-50 border border-gray-200 rounded-md space-y-3'>
								<div className='flex justify-between items-center'>
									<label className='font-bold text-gray-800 flex items-center space-x-1.5'>
										<Key className='w-3.5 h-3.5 text-[#990000]' />
										<span>Google OAuth Client ID</span>
									</label>
									<button
										type='button'
										onClick={() => setShowDriveSetupGuide(!showDriveSetupGuide)}
										className='text-[11px] text-[#990000] hover:underline font-semibold'
									>
										{showDriveSetupGuide ? 'Hide Setup Instructions' : 'View Setup Instructions'}
									</button>
								</div>

								<input
									type='text'
									placeholder='e.g. 123456789-abcdef.apps.googleusercontent.com'
									value={customClientId}
									onChange={(e) => setCustomClientId(e.target.value.trim())}
									className='w-full px-3 py-2 bg-white border border-gray-300 rounded font-mono text-[11px] focus:outline-none focus:border-[#990000]'
								/>

								<p className='text-[11px] text-gray-500'>
									{envClientId
										? 'Loaded from NEXT_PUBLIC_GOOGLE_CLIENT_ID.'
										: 'You can paste your Client ID above or define NEXT_PUBLIC_GOOGLE_CLIENT_ID.'}
								</p>
							</div>

							{/* Step-by-step Setup Guide */}
							{showDriveSetupGuide && (
								<div className='p-4 bg-amber-50 border border-amber-200 rounded-md space-y-2 text-[11px] text-amber-950 leading-relaxed'>
									<p className='font-bold text-amber-900'>How to get your Google OAuth Client ID:</p>
									<ol className='list-decimal list-inside space-y-1 pl-1 text-gray-800'>
										<li>
											Go to the{' '}
											<a
												href='https://console.cloud.google.com/'
												target='_blank'
												rel='noreferrer'
												className='text-[#990000] underline font-semibold'
											>
												Google Cloud Console
											</a>{' '}
											and select or create a project.
										</li>
										<li>
											Enable the <strong className='text-gray-900'>Google Drive API</strong> in APIs &
											Services &gt; Library.
										</li>
										<li>
											Under <strong className='text-gray-900'>OAuth consent screen</strong>, set User
											Type to <em>External</em> and add scope{' '}
											<code className='bg-white px-1 py-0.5 rounded border'>
												.../auth/drive.readonly
											</code>
											.
										</li>
										<li>
											Under <strong className='text-gray-900'>Credentials</strong>, create{' '}
											<em>OAuth client ID &gt; Web application</em>.
										</li>
										<li>
											Add Authorized JavaScript origins:
											<code className='block bg-white p-1 rounded border my-1 font-mono'>
												{typeof window !== 'undefined'
													? window.location.origin
													: 'https://ais-dev-...run.app'}
											</code>
										</li>
										<li>
											Copy the Client ID and paste it above or set{' '}
											<code className='bg-white px-1 rounded'>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>.
										</li>
									</ol>
								</div>
							)}

							<button
								onClick={handleGoogleDriveImport}
								className='w-full py-3 bg-[#990000] hover:bg-[#800000] text-white rounded font-bold text-xs shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer'
							>
								<Cloud className='w-4 h-4' />
								<span>Open Google Drive Picker</span>
							</button>
						</div>
					)}

					{/* Tab 3: URL Direct Link */}
					{!isProcessing && !summary && activeTab === 'url' && (
						<form onSubmit={handleUrlImport} className='space-y-4'>
							<p className='text-gray-600'>
								Paste a direct public download link to an <strong className='text-gray-900'>.epub</strong>{' '}
								or <strong className='text-gray-900'>.pdf</strong> file on the web.
							</p>

							<div>
								<label className='block font-semibold text-gray-700 mb-1'>Direct Download URL</label>
								<input
									type='url'
									placeholder='https://example.com/fanfic.epub'
									value={urlInput}
									onChange={(e) => setUrlInput(e.target.value)}
									required
									className='w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-[#990000]'
								/>
							</div>

							<div className='flex justify-end'>
								<button
									type='submit'
									className='px-5 py-2 bg-[#990000] hover:bg-[#800000] text-white rounded font-bold shadow-xs transition-colors cursor-pointer'
								>
									Download & Import
								</button>
							</div>
						</form>
					)}
				</div>

				{/* Modal Footer */}
				<div className='px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end space-x-2'>
					{summary ? (
						<button
							onClick={() => {
								setSummary(null);
								setItems([]);
								onClose();
							}}
							className='px-5 py-2 bg-[#990000] hover:bg-[#800000] text-white font-bold rounded shadow-xs cursor-pointer'
						>
							View Library
						</button>
					) : (
						<button
							onClick={onClose}
							disabled={isProcessing}
							className='px-4 py-2 border border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-30 cursor-pointer'
						>
							Close
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
