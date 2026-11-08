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
		setTimeout(() => setNotification(null), 4000);
	};

	const handleSaveFic = async (parsedData: any, file: File) => {
		const existingFic = await db.fics
			.where('title')
			.equals(parsedData.title)
			.and((f) => f.author.toLowerCase() === parsedData.author.toLowerCase())
			.first();

		if (existingFic) {
			showNotification(`⚠️ Este fanfic ("${parsedData.title}") ya está en tu biblioteca.`);
			return false;
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

		showNotification(`✓ ¡Fanfic "${parsedData.title}" subido y guardado con éxito!`);
		setRefreshKey((prev) => prev + 1);
		return true;
	};

	// Usamos nuestra propia API interna de Next.js para evitar bloqueos CORS
	const handleUploadUrl = async (url: string) => {
		try {
			const response = await fetch(`/api/fetch-epub?url=${encodeURIComponent(url)}`);
			if (!response.ok) throw new Error('No se pudo descargar el archivo mediante el enlace.');

			const blob = await response.blob();
			const file = new File([blob], 'imported-fic.epub', { type: 'application/epub+zip' });

			const parsedData = await parseEpubMetadata(file);
			await handleSaveFic(parsedData, file);
		} catch (error) {
			console.error('Error al importar:', error);
			showNotification('❌ Error al descargar. Asegúrate de que el enlace sea público.');
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

			{isUploadOpen && (
				<div className='fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4'>
					<div className='bg-white p-6 rounded-lg max-w-md w-full shadow-xl border border-gray-200 space-y-4'>
						<div className='flex justify-between items-center border-b pb-3'>
							<h3 className='font-bold text-sm text-[#990000]'>Upload Fanfic (.epub)</h3>
							<button
								onClick={() => setIsUploadOpen(false)}
								className='text-gray-400 hover:text-gray-600 font-bold text-sm'
							>
								✕
							</button>
						</div>

						<div className='py-4'>
							<input
								type='file'
								accept='.epub'
								onChange={async (e: any) => {
									const file = e.target.files?.[0];
									if (file) {
										const parsedData = await parseEpubMetadata(file);
										const success = await handleSaveFic(parsedData, file);
										if (success) {
											setIsUploadOpen(false);
										}
									}
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
