'use client';
import React, { useState } from 'react';
import { LibraryView } from './LibraryView';
import { ReaderView } from './ReaderView';
import { db, type Fic } from '../lib/db';
import { parseEpubMetadata } from '../lib/epubParser';

export default function AppShell() {
	const [activeTab] = useState('library');
	const [selectedFic, setSelectedFic] = useState<Fic | null>(null);
	const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
	const [refreshKey, setRefreshKey] = useState<number>(0);
	const [notification, setNotification] = useState<string | null>(null);

	const showNotification = (msg: string) => {
		setNotification(msg);
		setTimeout(() => setNotification(null), 5000);
	};

	const handleSaveFic = async (parsedData: any, file: File) => {
		const existingFic = await db.fics
			.where('title')
			.equals(parsedData.title)
			.and((f) => f.author.toLowerCase() === parsedData.author.toLowerCase())
			.first();

		if (existingFic) {
			return false; // Ya existe, omitimos duplicado
		}

		await db.fics.add({
			title: parsedData.title,
			author: parsedData.author,
			rating: parsedData.rating,
			archiveWarnings: parsedData.archiveWarnings,
			category: parsedData.category,
			fandom: parsedData.fandom,
			relationships: parsedData.relationships,
			characters: parsedData.characters,
			tags: parsedData.tags,
			summary: parsedData.summary,
			notes: parsedData.notes,
			wordCount: parsedData.wordCount,
			progress: 0,
			status: 'unread',
			fileData: file,
			chapters: parsedData.chapters,
			fullTextContent: parsedData.fullTextContent,
			isRead: false,
			isFavorite: false,
		});

		return true;
	};

	const handleUploadUrl = async (url: string) => {
		try {
			showNotification('⏳ Conectando con Google Drive...');
			const response = await fetch(`/api/fetch-epub?url=${encodeURIComponent(url)}`);
			const data: any = await response.json(); // <--- Tipado explícito como any para evitar el error

			if (!response.ok) {
				throw new Error(data.error || 'No se pudo procesar el enlace.');
			}

			// Si la respuesta contiene múltiples archivos (es una carpeta)
			if (data.files && Array.isArray(data.files)) {
				let importedCount = 0;
				let duplicateCount = 0;

				showNotification(`⏳ Procesando carpeta con ${data.files.length} archivo(s)...`);

				for (const f of data.files) {
					try {
						// Convertir base64 a Buffer/File de nuevo
						const binaryString = atob(f.data);
						const len = binaryString.length;
						const bytes = new Uint8Array(len);
						for (let i = 0; i < len; i++) {
							bytes[i] = binaryString.charCodeAt(i);
						}
						const blob = new Blob([bytes], { type: 'application/epub+zip' });
						const file = new File([blob], f.name, { type: 'application/epub+zip' });

						const parsedData = await parseEpubMetadata(file);
						const success = await handleSaveFic(parsedData, file);
						if (success) importedCount++;
						else duplicateCount++;
					} catch (err) {
						console.error(`Error procesando ${f.name}:`, err);
					}
				}

				setRefreshKey((prev) => prev + 1);
				showNotification(`✓ Carpeta importada: ${importedCount} nuevos (${duplicateCount} duplicados omitidos).`);
				return;
			}

			// Si es un archivo individual normal
			const blob = await response.blob();
			const file = new File([blob], 'imported-fic.epub', { type: 'application/epub+zip' });
			const parsedData = await parseEpubMetadata(file);
			const success = await handleSaveFic(parsedData, file);

			if (success) {
				showNotification(`✓ ¡Fanfic "${parsedData.title}" importado con éxito!`);
				setRefreshKey((prev) => prev + 1);
			} else {
				showNotification(`⚠️ El fanfic ya estaba en tu biblioteca.`);
			}
		} catch (error: any) {
			console.error('Error al importar:', error);
			showNotification(`❌ Error: ${error.message || 'Enlace no válido o carpeta privada.'}`);
		}
	};

	if (selectedFic) {
		return <ReaderView fic={selectedFic} onBack={() => setSelectedFic(null)} />;
	}

	return (
		<div className='flex h-screen w-full bg-white text-gray-900 overflow-hidden relative'>
			{notification && (
				<div className='absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-[#990000] text-white px-6 py-2.5 rounded-md shadow-xl text-xs font-bold flex items-center space-x-2'>
					<span>Check:</span>
					<span>{notification}</span>
				</div>
			)}

			<main className='flex-1 flex flex-col overflow-hidden'>
				{activeTab === 'library' && (
					<LibraryView
						key={refreshKey}
						onSelectFic={(fic) => setSelectedFic(fic)}
						onOpenUpload={() => setIsUploadOpen(true)}
						onUploadUrl={handleUploadUrl}
					/>
				)}
			</main>

			{/* Modal de subida masiva (Múltiples EPUBs o Carpetas) */}
			{isUploadOpen && (
				<div className='fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4'>
					<div className='bg-white p-6 rounded-lg max-w-md w-full shadow-xl border border-gray-200 space-y-4'>
						<div className='flex justify-between items-center border-b pb-3'>
							<h3 className='font-bold text-sm text-[#990000]'>Upload Fanfics or Folder (.epub)</h3>
							<button
								onClick={() => setIsUploadOpen(false)}
								className='text-gray-400 hover:text-gray-600 font-bold text-sm'
							>
								✕
							</button>
						</div>

						<div className='py-4 space-y-3'>
							<p className='text-xs text-gray-600'>
								Puedes seleccionar múltiples archivos EPUB a la vez o una carpeta entera.
							</p>
							<input
								type='file'
								accept='.epub'
								multiple
								// @ts-ignore
								webkitdirectory=''
								directory=''
								onChange={async (e: any) => {
									const targetFiles = e.target.files;
									if (!targetFiles || targetFiles.length === 0) return;

									let importedCount = 0;
									let duplicateCount = 0;
									let errorCount = 0;

									showNotification(`⏳ Procesando archivos de la carpeta...`);

									for (let i = 0; i < targetFiles.length; i++) {
										const file = targetFiles[i];

										// Verificación estricta: debe terminar en .epub y tener tamaño real
										if (file && file.name && file.name.toLowerCase().endsWith('.epub') && file.size > 100) {
											try {
												const parsedData = await parseEpubMetadata(file);
												const success = await handleSaveFic(parsedData, file);
												if (success) {
													importedCount++;
												} else {
													duplicateCount++;
												}
											} catch (err) {
												console.warn(`Omitido (archivo no válido o corrupto): ${file.name}`);
												errorCount++;
											}
										}
									}

									setIsUploadOpen(false);
									setRefreshKey((prev) => prev + 1);
									showNotification(
										`✓ Importados: ${importedCount} nuevos | Duplicados: ${duplicateCount} | Omitidos: ${errorCount}`,
									);
								}}
								className='w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-[#990000] hover:file:bg-red-100 cursor-pointer'
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
