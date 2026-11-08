'use client';
import React, { useEffect, useState } from 'react';
import type { Fic } from '../lib/db';
import { db } from '../lib/db';

export function ReaderView({ fic, onBack }: { fic: Fic; onBack: () => void }) {
	const [chapters, setChapters] = useState<{ title: string; content: string }[]>([]);
	const [currentChapterIdx, setCurrentChapterIdx] = useState<number>(0);
	const [loading, setLoading] = useState<boolean>(true);
	const [viewMode, setViewMode] = useState<'chapters' | 'entire'>('chapters');
	const [isRead, setIsRead] = useState<boolean>(fic.isRead || false);

	// Estado para el tamaño de fuente (estilo AO3 A-/A+)
	const [fontSizeClass, setFontSizeClass] = useState<'text-sm' | 'text-base' | 'text-lg' | 'text-xl'>('text-base');

	useEffect(() => {
		async function loadChapters() {
			let rawChapters =
				fic.chapters && fic.chapters.length > 0
					? fic.chapters
					: [{ title: 'Chapter 1', content: fic.fullTextContent || 'No content found.' }];

			// Limpieza profunda: si el primer capítulo incluye por dentro la cabecera repetida o el resumen, lo filtramos limpiamente
			const cleanedChapters = rawChapters.map((chap, idx) => {
				if (idx === 0) {
					let cleaned = chap.content;
					// Si el contenido arranca repitiendo el título, summary o notas que ya se muestran en la cabecera AO3, los removemos del texto
					if (fic.summary) {
						cleaned = cleaned.replace(fic.summary, '');
					}
					cleaned = cleaned
						.replace(/^Summary:?[\s\S]*?(?=\n\n|\r\n\r\n)/i, '')
						.replace(new RegExp(`^${fic.title}[\s\S]*?\\bby\\b.*?\\n+`, 'i'), '')
						.trim();
					return { ...chap, content: cleaned || chap.content };
				}
				return chap;
			});

			setChapters(cleanedChapters);
			setLoading(false);
		}
		loadChapters();
	}, [fic]);

	const handleMarkAsRead = async () => {
		if (!fic.id) return;
		const newState = !isRead;
		await db.fics.update(fic.id, { isRead: newState });
		setIsRead(newState);
	};

	const increaseFontSize = () => {
		if (fontSizeClass === 'text-sm') setFontSizeClass('text-base');
		else if (fontSizeClass === 'text-base') setFontSizeClass('text-lg');
		else if (fontSizeClass === 'text-lg') setFontSizeClass('text-xl');
	};

	const decreaseFontSize = () => {
		if (fontSizeClass === 'text-xl') setFontSizeClass('text-lg');
		else if (fontSizeClass === 'text-lg') setFontSizeClass('text-base');
		else if (fontSizeClass === 'text-base') setFontSizeClass('text-sm');
	};

	return (
		<div className='flex-1 flex flex-col h-full bg-white text-gray-900 font-sans overflow-hidden'>
			{/* Barra superior estilo AO3 con botones A-, A+ y selector de capítulos/modo */}
			<div className='flex items-center justify-between px-6 py-2.5 border-b border-gray-300 bg-[#f9f9f9] z-10 text-xs'>
				<div className='flex items-center space-x-2'>
					<button
						onClick={decreaseFontSize}
						className='px-2.5 py-1 bg-white border border-gray-300 rounded font-bold text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs'
					>
						A-
					</button>
					<button
						onClick={increaseFontSize}
						className='px-2.5 py-1 bg-white border border-gray-300 rounded font-bold text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs'
					>
						A+
					</button>

					<button
						onClick={() => setViewMode(viewMode === 'chapters' ? 'entire' : 'chapters')}
						className='ml-4 px-3 py-1 bg-white hover:bg-red-50 border border-gray-300 text-[#990000] rounded font-bold cursor-pointer transition-colors shadow-xs'
					>
						{viewMode === 'chapters' ? '📖 Entire Work' : '📄 Chapter Mode'}
					</button>
				</div>

				<button
					onClick={onBack}
					className='px-3 py-1 bg-white hover:bg-gray-100 border border-gray-300 text-gray-800 rounded font-bold cursor-pointer transition-colors shadow-xs'
				>
					← Back to Works
				</button>
			</div>

			{/* Navegador de capítulos si está activo */}
			{viewMode === 'chapters' && chapters.length > 1 && (
				<div className='bg-gray-100 border-b border-gray-300 px-6 py-2 flex justify-between items-center text-xs'>
					<button
						disabled={currentChapterIdx === 0}
						onClick={() => setCurrentChapterIdx((prev) => Math.max(0, prev - 1))}
						className='px-3 py-1 bg-white border border-gray-300 rounded font-semibold disabled:opacity-40 cursor-pointer hover:bg-gray-50'
					>
						&larr; Previous Chapter
					</button>

					<span className='font-bold text-gray-800'>
						{chapters[currentChapterIdx]?.title || `Chapter ${currentChapterIdx + 1}`} ({currentChapterIdx + 1} of{' '}
						{chapters.length})
					</span>

					<button
						disabled={currentChapterIdx === chapters.length - 1}
						onClick={() => setCurrentChapterIdx((prev) => Math.min(chapters.length - 1, prev + 1))}
						className='px-3 py-1 bg-white border border-gray-300 rounded font-semibold disabled:opacity-40 cursor-pointer hover:bg-gray-50'
					>
						Next Chapter &rarr;
					</button>
				</div>
			)}

			{/* Visor de Lectura */}
			<div className='flex-1 overflow-y-auto p-4 md:p-12 bg-white'>
				{loading ? (
					<div className='flex justify-center items-center h-64 text-gray-500 font-medium'>Loading chapters...</div>
				) : (
					<div className='max-w-3xl mx-auto space-y-6 font-serif leading-relaxed'>
						{/* Cabecera AO3 Completa (Metadata Header igual a la imagen) */}
						<div className='border-b border-gray-300 pb-6 mb-8 font-sans text-xs space-y-2 text-gray-800'>
							<div className='grid grid-cols-[140px_1fr] gap-2'>
								<span className='font-bold text-gray-900'>Rating:</span>
								<span className='text-gray-800'>{fic.rating || 'Not Rated'}</span>
							</div>
							<div className='grid grid-cols-[140px_1fr] gap-2'>
								<span className='font-bold text-gray-900'>Archive Warnings:</span>
								<span className='text-gray-800'>{fic.archiveWarnings?.join(', ') || 'No Archive Warnings Apply'}</span>
							</div>
							<div className='grid grid-cols-[140px_1fr] gap-2'>
								<span className='font-bold text-gray-900'>Fandoms:</span>
								<span className='text-gray-800'>{fic.fandom}</span>
							</div>
							{fic.relationships && fic.relationships.length > 0 && (
								<div className='grid grid-cols-[140px_1fr] gap-2'>
									<span className='font-bold text-gray-900'>Relationships:</span>
									<span className='text-gray-800'>{fic.relationships.join(' · ')}</span>
								</div>
							)}
							{fic.characters && fic.characters.length > 0 && (
								<div className='grid grid-cols-[140px_1fr] gap-2'>
									<span className='font-bold text-gray-900'>Characters:</span>
									<span className='text-gray-800'>{fic.characters.join(' · ')}</span>
								</div>
							)}
							{fic.tags && fic.tags.length > 0 && (
								<div className='grid grid-cols-[140px_1fr] gap-2'>
									<span className='font-bold text-gray-900'>Additional Tags:</span>
									<span className='text-gray-800'>{fic.tags.join(', ')}</span>
								</div>
							)}
							<div className='grid grid-cols-[140px_1fr] gap-2 pt-2'>
								<span className='font-bold text-gray-900'>Language:</span>
								<span className='text-gray-800'>English</span>
							</div>

							<div className='flex justify-end space-x-4 text-gray-600 pt-2 text-[11px] font-sans border-t border-gray-200 mt-4'>
								{fic.wordCount && <span>Words: {fic.wordCount.toLocaleString()}</span>}
								<span>
									Chapters: {chapters.length}/{chapters.length}
								</span>
							</div>
						</div>

						{/* Título Principal y Autor */}
						<div className='text-center space-y-2 mb-8 font-serif'>
							<h1 className='text-2xl md:text-3xl font-bold text-gray-900'>{fic.title}</h1>
							<p className='text-sm text-gray-700 font-sans'>
								by <span className='font-semibold text-gray-900'>{fic.author}</span>
							</p>
						</div>

						{/* Summary (Solo se muestra arriba en la cabecera, limpio sin duplicarse en el capítulo) */}
						{fic.summary && (
							<div className='space-y-1 font-sans mb-10'>
								<h4 className='font-bold text-xs text-gray-900 uppercase tracking-wider'>Summary:</h4>
								<p className='text-xs text-gray-800 leading-normal whitespace-pre-line'>{fic.summary}</p>
							</div>
						)}

						{/* Notes iniciales si las hay */}
						{fic.notes && (
							<div className='p-4 bg-gray-50 border border-gray-200 rounded text-xs font-sans space-y-1 mb-8'>
								<h4 className='font-bold text-gray-900 uppercase tracking-wider'>Notes:</h4>
								<p className='text-gray-800 leading-normal whitespace-pre-line'>{fic.notes}</p>
							</div>
						)}

						<hr className='my-8 border-gray-300' />

						{/* Contenido limpio del capítulo (Sin resumen repetido) */}
						{viewMode === 'chapters' ? (
							<div className='space-y-6'>
								<h3 className='text-center font-bold text-xl text-gray-900 font-serif mb-6'>
									{chapters[currentChapterIdx]?.title}
								</h3>
								<div className={`whitespace-pre-wrap space-y-6 text-gray-900 ${fontSizeClass}`}>
									{chapters[currentChapterIdx]?.content}
								</div>
							</div>
						) : (
							<div className='space-y-12'>
								{chapters.map((chap, idx) => (
									<div key={idx} className='border-t border-gray-200 pt-8 space-y-6'>
										<h3 className='font-bold text-xl text-gray-900 font-serif mb-4 text-center'>{chap.title}</h3>
										<div className={`whitespace-pre-wrap space-y-6 text-gray-900 ${fontSizeClass}`}>{chap.content}</div>
									</div>
								))}
							</div>
						)}

						{/* Botón para Marcar como Leído */}
						<div className='mt-16 pt-6 border-t border-gray-300 flex justify-center font-sans'>
							<button
								onClick={handleMarkAsRead}
								className={`px-6 py-2.5 rounded font-bold text-xs cursor-pointer transition-colors shadow-xs ${
									isRead ? 'bg-green-700 hover:bg-green-800 text-white' : 'bg-gray-800 hover:bg-black text-white'
								}`}
							>
								{isRead ? '✓ Work Marked as Read (Click to undo)' : '📖 Mark Work as Read'}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
