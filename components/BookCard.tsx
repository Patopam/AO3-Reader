'use client';

import React, { useState } from 'react';
import type { Fic } from '../lib/db';
import { db, deleteBookAndFile } from '../lib/db';
import {
	Heart,
	CheckCircle,
	BookOpen,
	Trash2,
	Edit3,
	ChevronDown,
	ChevronUp,
	Calendar,
} from 'lucide-react';

interface BookCardProps {
	fic: Fic;
	onSelect: (fic: Fic) => void;
	onTagClick?: (type: 'fandom' | 'character' | 'relationship' | 'tag' | 'warning', value: string) => void;
	onUpdated?: () => void;
}

export function BookCard({ fic, onSelect, onTagClick, onUpdated }: BookCardProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

	// Edit states
	const [editTitle, setEditTitle] = useState(fic.title);
	const [editAuthor, setEditAuthor] = useState(fic.author);
	const [editFandom, setEditFandom] = useState(fic.fandom);
	const [editRating, setEditRating] = useState(fic.rating || '');
	const [editSummary, setEditSummary] = useState(fic.summary || '');
	const [editStatus, setEditStatus] = useState(fic.publicationStatus || 'Completed');

	const handleDelete = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		if (window.confirm(`¿Estás seguro de eliminar "${fic.title}" y su archivo de tu biblioteca?`)) {
			await deleteBookAndFile(fic.id);
			if (onUpdated) onUpdated();
		}
	};

	const toggleRead = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		const nextState = !fic.isRead;
		await db.fics.update(fic.id, {
			isRead: nextState,
			readingProgress: nextState ? 100 : fic.readingProgress,
			lastReadAt: Date.now(),
		});
		if (onUpdated) onUpdated();
	};

	const toggleFavorite = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		await db.fics.update(fic.id, { isFavorite: !fic.isFavorite });
		if (onUpdated) onUpdated();
	};

	const handleSaveEdit = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		await db.fics.update(fic.id, {
			title: editTitle.trim(),
			author: editAuthor.trim(),
			fandom: editFandom.trim(),
			fandoms: editFandom ? [editFandom.trim()] : [],
			rating: editRating || null,
			summary: editSummary.trim() || null,
			publicationStatus: editStatus as any,
		});
		setIsEditing(false);
		if (onUpdated) onUpdated();
	};

	// Rating color style (Classic AO3 palette)
	const getRatingBadgeClass = (r: string | null) => {
		const val = (r || '').toLowerCase();
		if (val.includes('general')) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
		if (val.includes('teen')) return 'bg-amber-50 text-amber-800 border-amber-300';
		if (val.includes('mature')) return 'bg-orange-50 text-orange-800 border-orange-300';
		if (val.includes('explicit')) return 'bg-red-50 text-red-800 border-red-300';
		return 'bg-gray-100 text-gray-700 border-gray-300';
	};

	const allFandoms = fic.fandoms && fic.fandoms.length > 0 ? fic.fandoms : fic.fandom ? [fic.fandom] : [];
	const allWarnings = fic.warnings && fic.warnings.length > 0 ? fic.warnings : fic.archiveWarnings || [];
	const allTags = fic.additionalTags && fic.additionalTags.length > 0 ? fic.additionalTags : fic.tags || [];

	if (isEditing) {
		return (
			<div
				onClick={(e) => e.stopPropagation()}
				className='bg-white border-2 border-[#990000] p-5 rounded-md shadow-md text-xs space-y-3 font-sans'
			>
				<div className='flex justify-between items-center border-b pb-2'>
					<h4 className='font-bold text-sm text-[#990000] uppercase tracking-wider'>Editar Metadatos</h4>
					<button onClick={() => setIsEditing(false)} className='text-gray-400 hover:text-gray-600 font-bold'>
						✕
					</button>
				</div>
				<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
					<div>
						<label className='block font-semibold text-gray-700 mb-1'>Título</label>
						<input
							type='text'
							value={editTitle}
							onChange={(e) => setEditTitle(e.target.value)}
							className='w-full border border-gray-300 p-2 rounded focus:outline-none focus:border-[#990000]'
						/>
					</div>
					<div>
						<label className='block font-semibold text-gray-700 mb-1'>Autor</label>
						<input
							type='text'
							value={editAuthor}
							onChange={(e) => setEditAuthor(e.target.value)}
							className='w-full border border-gray-300 p-2 rounded focus:outline-none focus:border-[#990000]'
						/>
					</div>
				</div>

				<div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
					<div>
						<label className='block font-semibold text-gray-700 mb-1'>Fandom</label>
						<input
							type='text'
							value={editFandom}
							onChange={(e) => setEditFandom(e.target.value)}
							className='w-full border border-gray-300 p-2 rounded focus:outline-none focus:border-[#990000]'
						/>
					</div>
					<div>
						<label className='block font-semibold text-gray-700 mb-1'>Clasificación</label>
						<select
							value={editRating}
							onChange={(e) => setEditRating(e.target.value)}
							className='w-full border border-gray-300 p-2 rounded focus:outline-none focus:border-[#990000]'
						>
							<option value=''>Not Rated</option>
							<option value='General Audiences'>General Audiences</option>
							<option value='Teen And Up Audiences'>Teen And Up Audiences</option>
							<option value='Mature'>Mature</option>
							<option value='Explicit'>Explicit</option>
						</select>
					</div>
					<div>
						<label className='block font-semibold text-gray-700 mb-1'>Estado</label>
						<select
							value={editStatus}
							onChange={(e) => setEditStatus(e.target.value as any)}
							className='w-full border border-gray-300 p-2 rounded focus:outline-none focus:border-[#990000]'
						>
							<option value='Completed'>Completed</option>
							<option value='Work in Progress'>Work in Progress</option>
							<option value='Unknown'>Unknown</option>
						</select>
					</div>
				</div>

				<div>
					<label className='block font-semibold text-gray-700 mb-1'>Resumen</label>
					<textarea
						value={editSummary}
						onChange={(e) => setEditSummary(e.target.value)}
						className='w-full border border-gray-300 p-2 rounded h-24 focus:outline-none focus:border-[#990000]'
						placeholder='Ingresa el resumen de la obra...'
					/>
				</div>

				<div className='flex justify-end space-x-2 pt-2 border-t'>
					<button
						onClick={() => setIsEditing(false)}
						className='px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded font-semibold transition-colors cursor-pointer'
					>
						Cancelar
					</button>
					<button
						onClick={handleSaveEdit}
						className='px-4 py-1.5 bg-[#990000] hover:bg-[#800000] text-white rounded font-bold shadow-xs transition-colors cursor-pointer'
					>
						Guardar cambios
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			onClick={() => onSelect(fic)}
			className='group bg-white border border-gray-300 hover:border-[#990000] rounded-md p-5 shadow-xs hover:shadow-md transition-all cursor-pointer relative font-sans space-y-3.5'
		>
			{/* Top Bar: Badges + Quick Actions */}
			<div className='flex justify-between items-start gap-3'>
				<div className='flex flex-wrap items-center gap-2'>
					{/* Rating Badge */}
					<span
						className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border rounded ${getRatingBadgeClass(
							fic.rating
						)}`}
					>
						{fic.rating || 'Not Rated'}
					</span>

					{/* Format Badge */}
					<span
						className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${
							fic.format === 'pdf'
								? 'bg-rose-50 text-rose-700 border-rose-200'
								: 'bg-blue-50 text-blue-700 border-blue-200'
						}`}
					>
						{fic.format?.toUpperCase() || 'EPUB'}
					</span>

					{/* Read status tag */}
					{fic.isRead && (
						<span className='inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded'>
							<CheckCircle className='w-3 h-3 text-emerald-600' />
							<span>Leído</span>
						</span>
					)}

					{/* Favorite tag */}
					{fic.isFavorite && (
						<span className='inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-[#990000] border border-red-200 rounded'>
							<Heart className='w-3 h-3 fill-red-600 text-red-600' />
							<span>Favorito</span>
						</span>
					)}

					{/* Progress Pill if started */}
					{fic.readingProgress > 0 && (
						<span className='text-[10px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200'>
							{fic.readingProgress}% completado
						</span>
					)}
				</div>

				{/* Action Buttons (Light buttons with clear contrast, zero dark buttons) */}
				<div className='flex items-center space-x-1.5 shrink-0' onClick={(e) => e.stopPropagation()}>
					<button
						onClick={toggleFavorite}
						title={fic.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
						className={`p-1.5 rounded border transition-colors cursor-pointer ${
							fic.isFavorite
								? 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100'
								: 'bg-white border-gray-300 text-gray-400 hover:text-red-600 hover:bg-gray-50'
						}`}
					>
						<Heart className={`w-3.5 h-3.5 ${fic.isFavorite ? 'fill-red-600 text-red-600' : ''}`} />
					</button>

					<button
						onClick={toggleRead}
						title={fic.isRead ? 'Marcar como no leído' : 'Marcar como leído'}
						className={`p-1.5 rounded border transition-colors cursor-pointer ${
							fic.isRead
								? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
								: 'bg-white border-gray-300 text-gray-400 hover:text-emerald-700 hover:bg-gray-50'
						}`}
					>
						<CheckCircle
							className={`w-3.5 h-3.5 ${fic.isRead ? 'fill-emerald-100 text-emerald-600' : ''}`}
						/>
					</button>

					<button
						onClick={(e) => {
							e.stopPropagation();
							setIsEditing(true);
						}}
						title='Editar metadatos'
						className='p-1.5 rounded border border-gray-300 bg-white text-gray-600 hover:text-blue-700 hover:bg-gray-50 transition-colors cursor-pointer'
					>
						<Edit3 className='w-3.5 h-3.5' />
					</button>

					<button
						onClick={handleDelete}
						title='Eliminar obra'
						className='p-1.5 rounded border border-gray-300 bg-white text-gray-400 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer'
					>
						<Trash2 className='w-3.5 h-3.5' />
					</button>
				</div>
			</div>

			{/* Title and Author Header */}
			<div>
				<h3 className='text-lg font-bold font-serif text-[#990000] group-hover:underline leading-snug'>
					{fic.title}
				</h3>
				<p className='text-xs text-gray-700 mt-1'>
					por{' '}
					<span className='font-semibold text-gray-900 hover:underline'>
						{fic.author || 'Autor desconocido'}
					</span>
				</p>
			</div>

			{/* Fandoms */}
			{allFandoms.length > 0 && (
				<div className='flex flex-wrap items-center gap-1.5 text-xs'>
					<span className='font-semibold text-gray-900'>Fandom:</span>
					{allFandoms.map((f, i) => (
						<button
							key={i}
							type='button'
							onClick={(e) => {
								e.stopPropagation();
								if (onTagClick) onTagClick('fandom', f);
							}}
							className='text-[#990000] hover:underline font-medium cursor-pointer text-xs'
						>
							{f}
							{i < allFandoms.length - 1 && <span className='text-gray-400 ml-1'>·</span>}
						</button>
					))}
				</div>
			)}

			{/* AO3 Tags Box */}
			{(allWarnings.length > 0 ||
				(fic.relationships && fic.relationships.length > 0) ||
				(fic.characters && fic.characters.length > 0) ||
				allTags.length > 0) && (
				<div className='text-xs text-gray-700 bg-gray-50/80 p-3 rounded-md border border-gray-200 space-y-1.5'>
					{/* Warnings */}
					{allWarnings.length > 0 && (
						<div className='flex flex-wrap items-baseline gap-1'>
							<span className='font-bold text-gray-900'>Advertencias:</span>
							{allWarnings.map((w, idx) => (
								<span
									key={idx}
									onClick={(e) => {
										e.stopPropagation();
										if (onTagClick) onTagClick('warning', w);
									}}
									className='font-medium text-[#990000] hover:underline cursor-pointer'
								>
									{w}
									{idx < allWarnings.length - 1 && <span className='text-gray-400 ml-1'>,</span>}
								</span>
							))}
						</div>
					)}

					{/* Relationships */}
					{fic.relationships && fic.relationships.length > 0 && (
						<div className='flex flex-wrap items-baseline gap-1'>
							<span className='font-bold text-gray-900'>Relaciones:</span>
							{fic.relationships.map((rel, idx) => (
								<span
									key={idx}
									onClick={(e) => {
										e.stopPropagation();
										if (onTagClick) onTagClick('relationship', rel);
									}}
									className='text-gray-800 hover:text-[#990000] hover:underline cursor-pointer'
								>
									{rel}
									{idx < fic.relationships!.length - 1 && <span className='text-gray-400 ml-1'>·</span>}
								</span>
							))}
						</div>
					)}

					{/* Characters */}
					{fic.characters && fic.characters.length > 0 && (
						<div className='flex flex-wrap items-baseline gap-1'>
							<span className='font-bold text-gray-900'>Personajes:</span>
							{fic.characters.map((char, idx) => (
								<span
									key={idx}
									onClick={(e) => {
										e.stopPropagation();
										if (onTagClick) onTagClick('character', char);
									}}
									className='text-gray-800 hover:text-[#990000] hover:underline cursor-pointer'
								>
									{char}
									{idx < fic.characters!.length - 1 && <span className='text-gray-400 ml-1'>·</span>}
								</span>
							))}
						</div>
					)}

					{/* Additional Tags */}
					{allTags.length > 0 && (
						<div className='flex flex-wrap items-baseline gap-1 pt-1 border-t border-gray-200/60'>
							<span className='font-bold text-gray-900'>Etiquetas:</span>
							{allTags.map((tag, idx) => (
								<span
									key={idx}
									onClick={(e) => {
										e.stopPropagation();
										if (onTagClick) onTagClick('tag', tag);
									}}
									className='text-[11px] bg-white text-gray-700 hover:text-[#990000] hover:border-[#990000] px-1.5 py-0.5 rounded border border-gray-300 font-normal transition-colors cursor-pointer'
								>
									{tag}
								</span>
							))}
						</div>
					)}
				</div>
			)}

			{/* Summary Box (NO FORCED ITALIC, clean readable normal font style) */}
			{fic.summary && (
				<div className='text-xs text-gray-800 leading-relaxed font-sans bg-[#fafafa] border-l-2 border-[#990000] pl-3.5 py-1.5 not-italic relative'>
					<p
						className={`whitespace-pre-line font-normal not-italic text-gray-800 ${
							!isSummaryExpanded && fic.summary.length > 300 ? 'line-clamp-3' : ''
						}`}
					>
						{fic.summary}
					</p>
					{fic.summary.length > 300 && (
						<button
							type='button'
							onClick={(e) => {
								e.stopPropagation();
								setIsSummaryExpanded(!isSummaryExpanded);
							}}
							className='text-[11px] font-semibold text-[#990000] hover:underline mt-1.5 inline-flex items-center space-x-1 cursor-pointer not-italic'
						>
							<span>{isSummaryExpanded ? 'Mostrar menos' : 'Leer resumen completo...'}</span>
							{isSummaryExpanded ? <ChevronUp className='w-3 h-3' /> : <ChevronDown className='w-3 h-3' />}
						</button>
					)}
				</div>
			)}

			{/* Bottom Stats & CTA */}
			<div className='flex flex-wrap justify-between items-center pt-3 border-t border-gray-200 text-xs text-gray-600 gap-2'>
				<div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]'>
					{fic.wordCount !== null && fic.wordCount !== undefined && (
						<div>
							<span className='font-bold text-gray-800'>Palabras:</span> {fic.wordCount.toLocaleString()}
						</div>
					)}

					<div>
						<span className='font-bold text-gray-800'>
							{fic.format === 'pdf' ? 'Páginas:' : 'Capítulos:'}
						</span>{' '}
						{fic.chapterCount || 1}
					</div>

					{fic.publicationStatus && (
						<div className='font-medium text-gray-700'>
							<span className='font-bold text-gray-800'>Estado:</span> {fic.publicationStatus}
						</div>
					)}

					{fic.publishedAt && (
						<div className='flex items-center space-x-1 text-gray-500'>
							<Calendar className='w-3 h-3' />
							<span>{fic.publishedAt}</span>
						</div>
					)}
				</div>

				<button
					type='button'
					onClick={() => onSelect(fic)}
					className='px-3.5 py-1.5 bg-[#990000] hover:bg-[#800000] text-white font-bold rounded shadow-xs cursor-pointer transition-colors flex items-center space-x-1.5 ml-auto'
				>
					<BookOpen className='w-3.5 h-3.5' />
					<span>{fic.format === 'pdf' ? 'Abrir PDF' : 'Leer obra'} →</span>
				</button>
			</div>
		</div>
	);
}
