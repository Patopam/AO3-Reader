'use client';

import React, { useState } from 'react';
import type { Fic } from '../lib/db';
import { db, reprocessFicFromBlob } from '../lib/db';
import { FicSummary } from './FicSummary';
import {
	BookOpen,
	Heart,
	CheckCircle,
	X,
	Calendar,
	FileText,
	RotateCw,
	Layers,
	Clock,
} from 'lucide-react';

interface FicDetailsModalProps {
	fic: Fic | null;
	isOpen: boolean;
	onClose: () => void;
	onStartReading: (fic: Fic, chapterIdx?: number) => void;
	onTagClick?: (type: 'fandom' | 'character' | 'relationship' | 'tag' | 'warning', value: string) => void;
	onFicUpdated?: (updated: Fic) => void;
}

export function FicDetailsModal({
	fic,
	isOpen,
	onClose,
	onStartReading,
	onTagClick,
	onFicUpdated,
}: FicDetailsModalProps) {
	const [isReprocessing, setIsReprocessing] = useState(false);
	const [statusNotice, setStatusNotice] = useState<string | null>(null);

	if (!isOpen || !fic) return null;

	const allFandoms = fic.fandoms && fic.fandoms.length > 0 ? fic.fandoms : fic.fandom ? [fic.fandom] : [];
	const allWarnings = fic.warnings && fic.warnings.length > 0 ? fic.warnings : fic.archiveWarnings || [];
	const allTags = fic.additionalTags && fic.additionalTags.length > 0 ? fic.additionalTags : fic.tags || [];

	const toggleFavorite = async () => {
		if (!fic.id) return;
		const nextState = !fic.isFavorite;
		await db.fics.update(fic.id, { isFavorite: nextState });
		const updated = { ...fic, isFavorite: nextState };
		if (onFicUpdated) onFicUpdated(updated);
	};

	const toggleRead = async () => {
		if (!fic.id) return;
		const nextState = !fic.isRead;
		await db.fics.update(fic.id, {
			isRead: nextState,
			readingProgress: nextState ? 100 : fic.readingProgress,
			lastReadAt: Date.now(),
		});
		const updated = {
			...fic,
			isRead: nextState,
			readingProgress: nextState ? 100 : fic.readingProgress,
			lastReadAt: Date.now(),
		};
		if (onFicUpdated) onFicUpdated(updated);
	};

	const handleReprocess = async () => {
		if (!fic.id) return;
		setIsReprocessing(true);
		setStatusNotice(null);
		try {
			const updated = await reprocessFicFromBlob(fic.id);
			if (updated) {
				if (onFicUpdated) onFicUpdated(updated);
				setStatusNotice('Resumen y metadatos actualizados con éxito desde el archivo EPUB.');
			} else {
				setStatusNotice('No se encontró el archivo original para reprocesar.');
			}
		} catch (err: any) {
			setStatusNotice(`Error al reprocesar: ${err.message || 'Error desconocido'}`);
		} finally {
			setIsReprocessing(false);
		}
	};

	const getRatingBadgeClass = (r: string | null) => {
		const val = (r || '').toLowerCase();
		if (val.includes('general')) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
		if (val.includes('teen')) return 'bg-amber-50 text-amber-800 border-amber-300';
		if (val.includes('mature')) return 'bg-orange-50 text-orange-800 border-orange-300';
		if (val.includes('explicit')) return 'bg-red-50 text-red-800 border-red-300';
		return 'bg-gray-100 text-gray-700 border-gray-300';
	};

	return (
		<div className='fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans text-xs'>
			<div className='bg-white rounded-lg max-w-2xl w-full shadow-2xl border border-gray-300 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150'>
				{/* Modal Top Header */}
				<div className='flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-[#fbfbfb]'>
					<div className='flex items-center space-x-2'>
						<FileText className='w-4 h-4 text-[#990000]' />
						<h3 className='font-bold text-sm text-[#990000] font-serif uppercase tracking-wider'>
							Detalles de la Obra
						</h3>
					</div>
					<div className='flex items-center space-x-2'>
						<button
							onClick={toggleFavorite}
							title={fic.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
							className={`p-1.5 rounded border transition-colors cursor-pointer ${
								fic.isFavorite
									? 'bg-red-50 border-red-300 text-red-600'
									: 'bg-white border-gray-300 text-gray-400 hover:text-red-600'
							}`}
						>
							<Heart className={`w-3.5 h-3.5 ${fic.isFavorite ? 'fill-red-600' : ''}`} />
						</button>

						<button
							onClick={toggleRead}
							title={fic.isRead ? 'Marcar como no leído' : 'Marcar como leído'}
							className={`p-1.5 rounded border transition-colors cursor-pointer ${
								fic.isRead
									? 'bg-emerald-50 border-emerald-300 text-emerald-700'
									: 'bg-white border-gray-300 text-gray-400 hover:text-emerald-700'
							}`}
						>
							<CheckCircle
								className={`w-3.5 h-3.5 ${fic.isRead ? 'fill-emerald-100 text-emerald-600' : ''}`}
							/>
						</button>

						<button
							onClick={onClose}
							className='text-gray-400 hover:text-gray-700 font-bold p-1 cursor-pointer'
						>
							<X className='w-4 h-4' />
						</button>
					</div>
				</div>

				{/* Modal Body */}
				<div className='p-6 overflow-y-auto flex-1 space-y-6'>
					{/* Status Notice if any */}
					{statusNotice && (
						<div className='p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 text-xs flex justify-between items-center'>
							<span>{statusNotice}</span>
							<button onClick={() => setStatusNotice(null)} className='text-blue-700 font-bold ml-2'>
								✕
							</button>
						</div>
					)}

					{/* Title, Author & Badges */}
					<div className='space-y-2 border-b border-gray-200 pb-4'>
						<div className='flex flex-wrap items-center gap-2'>
							<span
								className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border rounded ${getRatingBadgeClass(
									fic.rating
								)}`}
							>
								{fic.rating || 'Not Rated'}
							</span>

							<span
								className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${
									fic.format === 'pdf'
										? 'bg-rose-50 text-rose-700 border-rose-200'
										: 'bg-blue-50 text-blue-700 border-blue-200'
								}`}
							>
								{fic.format?.toUpperCase() || 'EPUB'}
							</span>

							{fic.publicationStatus && (
								<span className='px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded'>
									{fic.publicationStatus}
								</span>
							)}
						</div>

						<h2 className='text-xl md:text-2xl font-bold font-serif text-[#990000] leading-snug'>
							{fic.title}
						</h2>
						<p className='text-xs text-gray-700'>
							por <span className='font-semibold text-gray-900'>{fic.author || 'Autor desconocido'}</span>
						</p>
					</div>

					{/* COMPLETE UNTRUNCATED SUMMARY SECTION */}
					<div className='space-y-2'>
						<div className='flex items-center justify-between'>
							<h4 className='font-bold uppercase tracking-wider text-xs text-[#990000] flex items-center space-x-1.5'>
								<span>Resumen</span>
							</h4>
							{fic.format === 'epub' && fic.fileId && (
								<button
									type='button'
									disabled={isReprocessing}
									onClick={handleReprocess}
									className='text-[11px] text-gray-500 hover:text-[#990000] flex items-center space-x-1 cursor-pointer transition-colors disabled:opacity-50'
									title='Re-extraer resumen desde el archivo EPUB original'
								>
									<RotateCw className={`w-3 h-3 ${isReprocessing ? 'animate-spin' : ''}`} />
									<span>{isReprocessing ? 'Reprocesando...' : 'Actualizar resumen'}</span>
								</button>
							)}
						</div>

						<div className='bg-[#fafafa] border-l-3 border-[#990000] p-4 rounded-r-md border border-gray-200'>
							<FicSummary summary={fic.summary} isExpanded={true} />
						</div>
					</div>

					{/* Author Notes if present */}
					{fic.notes && (
						<div className='space-y-2'>
							<h4 className='font-bold uppercase tracking-wider text-xs text-gray-800'>
								Notas del autor
							</h4>
							<div className='bg-gray-50 border-l-2 border-gray-300 p-3.5 rounded-r-md border border-gray-200'>
								<FicSummary summary={fic.notes} isExpanded={true} />
							</div>
						</div>
					)}

					{/* Tags Breakdown */}
					{(allFandoms.length > 0 ||
						allWarnings.length > 0 ||
						(fic.relationships && fic.relationships.length > 0) ||
						(fic.characters && fic.characters.length > 0) ||
						allTags.length > 0) && (
						<div className='bg-gray-50/90 p-4 rounded-md border border-gray-200 space-y-2.5 text-xs'>
							{/* Fandoms */}
							{allFandoms.length > 0 && (
								<div className='flex flex-wrap items-baseline gap-1'>
									<span className='font-bold text-gray-900 w-24 shrink-0'>Fandom:</span>
									<div className='flex flex-wrap gap-1'>
										{allFandoms.map((f, idx) => (
											<button
												key={idx}
												type='button'
												onClick={() => {
													onClose();
													if (onTagClick) onTagClick('fandom', f);
												}}
												className='text-[#990000] hover:underline font-semibold cursor-pointer'
											>
												{f}
												{idx < allFandoms.length - 1 && <span className='text-gray-400 ml-1'>·</span>}
											</button>
										))}
									</div>
								</div>
							)}

							{/* Warnings */}
							{allWarnings.length > 0 && (
								<div className='flex flex-wrap items-baseline gap-1'>
									<span className='font-bold text-gray-900 w-24 shrink-0'>Advertencias:</span>
									<div className='flex flex-wrap gap-1'>
										{allWarnings.map((w, idx) => (
											<button
												key={idx}
												type='button'
												onClick={() => {
													onClose();
													if (onTagClick) onTagClick('warning', w);
												}}
												className='text-[#990000] hover:underline font-medium cursor-pointer'
											>
												{w}
												{idx < allWarnings.length - 1 && <span className='text-gray-400 ml-1'>,</span>}
											</button>
										))}
									</div>
								</div>
							)}

							{/* Relationships */}
							{fic.relationships && fic.relationships.length > 0 && (
								<div className='flex flex-wrap items-baseline gap-1'>
									<span className='font-bold text-gray-900 w-24 shrink-0'>Relaciones:</span>
									<div className='flex flex-wrap gap-1'>
										{fic.relationships.map((r, idx) => (
											<button
												key={idx}
												type='button'
												onClick={() => {
													onClose();
													if (onTagClick) onTagClick('relationship', r);
												}}
												className='text-gray-800 hover:text-[#990000] hover:underline cursor-pointer'
											>
												{r}
												{idx < fic.relationships!.length - 1 && (
													<span className='text-gray-400 ml-1'>·</span>
												)}
											</button>
										))}
									</div>
								</div>
							)}

							{/* Characters */}
							{fic.characters && fic.characters.length > 0 && (
								<div className='flex flex-wrap items-baseline gap-1'>
									<span className='font-bold text-gray-900 w-24 shrink-0'>Personajes:</span>
									<div className='flex flex-wrap gap-1'>
										{fic.characters.map((ch, idx) => (
											<button
												key={idx}
												type='button'
												onClick={() => {
													onClose();
													if (onTagClick) onTagClick('character', ch);
												}}
												className='text-gray-800 hover:text-[#990000] hover:underline cursor-pointer'
											>
												{ch}
												{idx < fic.characters!.length - 1 && (
													<span className='text-gray-400 ml-1'>·</span>
												)}
											</button>
										))}
									</div>
								</div>
							)}

							{/* Additional Tags */}
							{allTags.length > 0 && (
								<div className='flex flex-wrap items-baseline gap-1 pt-1.5 border-t border-gray-200/80'>
									<span className='font-bold text-gray-900 w-24 shrink-0'>Etiquetas:</span>
									<div className='flex flex-wrap gap-1'>
										{allTags.map((tag, idx) => (
											<button
												key={idx}
												type='button'
												onClick={() => {
													onClose();
													if (onTagClick) onTagClick('tag', tag);
												}}
												className='text-[11px] bg-white text-gray-700 hover:text-[#990000] hover:border-[#990000] px-1.5 py-0.5 rounded border border-gray-300 font-normal transition-colors cursor-pointer'
											>
												{tag}
											</button>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{/* Technical Stats Grid */}
					<div className='grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs'>
						<div className='p-2.5 bg-gray-50 border border-gray-200 rounded'>
							<div className='text-gray-500 text-[10px] uppercase font-bold'>Palabras</div>
							<div className='font-bold text-gray-800 mt-0.5'>
								{fic.wordCount ? fic.wordCount.toLocaleString() : '–'}
							</div>
						</div>

						<div className='p-2.5 bg-gray-50 border border-gray-200 rounded'>
							<div className='text-gray-500 text-[10px] uppercase font-bold'>
								{fic.format === 'pdf' ? 'Páginas' : 'Capítulos'}
							</div>
							<div className='font-bold text-gray-800 mt-0.5'>{fic.chapterCount || 1}</div>
						</div>

						<div className='p-2.5 bg-gray-50 border border-gray-200 rounded'>
							<div className='text-gray-500 text-[10px] uppercase font-bold'>Progreso</div>
							<div className='font-bold text-gray-800 mt-0.5'>{fic.readingProgress || 0}%</div>
						</div>

						<div className='p-2.5 bg-gray-50 border border-gray-200 rounded'>
							<div className='text-gray-500 text-[10px] uppercase font-bold'>Idioma</div>
							<div className='font-bold text-gray-800 mt-0.5'>{fic.language || 'Español / Inglés'}</div>
						</div>
					</div>

					{/* Chapters List (If EPUB with multiple chapters) */}
					{fic.chapters && fic.chapters.length > 1 && (
						<div className='space-y-2 border-t border-gray-200 pt-4'>
							<h4 className='font-bold text-gray-900 text-xs flex items-center space-x-1.5'>
								<Layers className='w-3.5 h-3.5 text-[#990000]' />
								<span>Índice de Capítulos ({fic.chapters.length})</span>
							</h4>
							<div className='max-h-44 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100 bg-white'>
								{fic.chapters.map((chap, idx) => (
									<button
										key={idx}
										type='button'
										onClick={() => {
											onClose();
											onStartReading(fic, idx);
										}}
										className={`w-full px-3 py-2 text-left text-xs hover:bg-red-50/50 flex justify-between items-center transition-colors cursor-pointer ${
											idx === (fic.currentChapterIdx || 0)
												? 'font-bold text-[#990000] bg-red-50/30'
												: 'text-gray-700'
										}`}
									>
										<span className='truncate'>
											{idx + 1}. {chap.title}
										</span>
										{idx === (fic.currentChapterIdx || 0) && (
											<span className='text-[10px] uppercase font-semibold text-[#990000] ml-2 shrink-0'>
												Actual
											</span>
										)}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Modal Footer */}
				<div className='px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex justify-between items-center'>
					<button
						type='button'
						onClick={onClose}
						className='px-4 py-2 border border-gray-300 bg-white hover:bg-gray-100 rounded font-semibold text-gray-700 cursor-pointer text-xs transition-colors'
					>
						Cerrar
					</button>

					<button
						type='button'
						onClick={() => {
							onClose();
							onStartReading(fic);
						}}
						className='px-5 py-2 bg-[#990000] hover:bg-[#800000] text-white font-bold rounded shadow-xs cursor-pointer text-xs transition-colors flex items-center space-x-1.5'
					>
						<BookOpen className='w-4 h-4' />
						<span>
							{fic.readingProgress && fic.readingProgress > 0
								? `Continuar Lectura (${fic.readingProgress}%)`
								: 'Empezar a Leer'}
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}
