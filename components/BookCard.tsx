import React, { useState } from 'react';
import type { Fic } from '../lib/db';
import { db } from '../lib/db';

declare const window: any;

export function BookCard({ layout, fic, onSelect }: { layout: string; fic: Fic; onSelect?: (fic: Fic) => void }) {
	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(fic.title);
	const [editAuthor, setEditAuthor] = useState(fic.author);
	const [editFandom, setEditFandom] = useState(fic.fandom);
	const [editRating, setEditRating] = useState(fic.rating || 'Not Rated');
	const [editSummary, setEditSummary] = useState(fic.summary || '');

	const handleDelete = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		if (window.confirm(`Delete "${fic.title}" from library?`)) {
			await db.fics.delete(fic.id);
		}
	};

	const toggleRead = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		await db.fics.update(fic.id, { isRead: !fic.isRead });
	};

	const toggleFavorite = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		await db.fics.update(fic.id, { isFavorite: !fic.isFavorite });
	};

	const handleSaveEdit = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!fic.id) return;
		await db.fics.update(fic.id, {
			title: editTitle,
			author: editAuthor,
			fandom: editFandom,
			rating: editRating,
			summary: editSummary,
		});
		setIsEditing(false);
	};

	if (isEditing) {
		return (
			<div
				onClick={(e) => e.stopPropagation()}
				className='bg-white border-2 border-[#990000] p-4 rounded shadow-md text-xs space-y-2'
			>
				<h4 className='font-bold text-[#990000] uppercase'>Edit Work Metadata</h4>
				<div>
					<label className='block font-semibold text-gray-600'>Title:</label>
					<input
						type='text'
						value={editTitle}
						onChange={(e: any) => setEditTitle(e.target.value)}
						className='w-full border p-1 rounded'
					/>
				</div>
				<div>
					<label className='block font-semibold text-gray-600'>Author:</label>
					<input
						type='text'
						value={editAuthor}
						onChange={(e: any) => setEditAuthor(e.target.value)}
						className='w-full border p-1 rounded'
					/>
				</div>
				<div>
					<label className='block font-semibold text-gray-600'>Fandom:</label>
					<input
						type='text'
						value={editFandom}
						onChange={(e: any) => setEditFandom(e.target.value)}
						className='w-full border p-1 rounded'
					/>
				</div>
				<div>
					<label className='block font-semibold text-gray-600'>Rating:</label>
					<select
						value={editRating}
						onChange={(e: any) => setEditRating(e.target.value)}
						className='w-full border p-1 rounded'
					>
						<option>General Audiences</option>
						<option>Teen And Up Audiences</option>
						<option>Mature</option>
						<option>Explicit</option>
						<option>Not Rated</option>
					</select>
				</div>
				<div>
					<label className='block font-semibold text-gray-600'>Summary:</label>
					<textarea
						value={editSummary}
						onChange={(e: any) => setEditSummary(e.target.value)}
						className='w-full border p-1 rounded h-16'
					/>
				</div>
				<div className='flex justify-end space-x-2 pt-2'>
					<button
						onClick={() => setIsEditing(false)}
						className='px-2 py-1 bg-gray-200 rounded font-bold cursor-pointer'
					>
						Cancel
					</button>
					<button
						onClick={handleSaveEdit}
						className='px-2 py-1 bg-[#990000] text-white rounded font-bold cursor-pointer'
					>
						Save
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			onClick={() => onSelect && onSelect(fic)}
			className='group relative bg-white border border-gray-300 p-4 rounded-sm shadow-xs hover:border-[#990000] cursor-pointer transition-all'
		>
			<div className='flex justify-between items-start'>
				<div className='flex items-start space-x-3 w-full'>
					<span className='px-2 py-0.5 text-[11px] font-bold uppercase border border-gray-400 rounded bg-[#f7f7f7] text-gray-800 shrink-0 mt-0.5'>
						{fic.rating || 'Not Rated'}
					</span>

					<div className='flex-1'>
						<div className='flex justify-between items-center'>
							<div className='flex items-center space-x-2'>
								<h3 className='font-bold text-base text-[#990000] group-hover:underline font-serif leading-tight'>
									{fic.title}
								</h3>
								{fic.isRead && (
									<span className='text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold'>
										✓ Read
									</span>
								)}
								{fic.isFavorite && (
									<span className='text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-bold'>
										♥ Favorite
									</span>
								)}
							</div>

							<div className='flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity'>
								<button
									onClick={toggleRead}
									className='text-gray-500 hover:text-green-600 p-1 text-xs font-bold cursor-pointer'
									title={fic.isRead ? 'Mark as unread' : 'Mark as read'}
								>
									{fic.isRead ? '📖' : '✔️'}
								</button>
								<button
									onClick={toggleFavorite}
									className='text-gray-500 hover:text-red-600 p-1 text-xs font-bold cursor-pointer'
									title='Toggle favorite'
								>
									{fic.isFavorite ? '❤️' : '🤍'}
								</button>
								<button
									onClick={(e) => {
										e.stopPropagation();
										setIsEditing(true);
									}}
									className='text-gray-500 hover:text-blue-600 p-1 text-xs font-bold cursor-pointer'
									title='Edit metadata'
								>
									✏️
								</button>
								<button
									onClick={handleDelete}
									className='text-gray-400 hover:text-red-600 p-1 text-xs font-bold cursor-pointer'
									title='Delete work'
								>
									✕
								</button>
							</div>
						</div>

						<p className='text-xs text-gray-700 mt-0.5'>
							by <span className='text-[#990000] font-semibold'>{fic.author}</span>
						</p>
					</div>
				</div>
			</div>

			<div className='mt-3 text-xs space-y-1.5 pl-12'>
				<p className='font-semibold text-gray-900'>
					Fandom: <span className='font-normal text-gray-700'>{fic.fandom}</span>
				</p>

				{fic.archiveWarnings && fic.archiveWarnings.length > 0 && (
					<p className='text-[#990000] font-medium text-[11px]'>{fic.archiveWarnings.join(', ')}</p>
				)}

				{fic.summary && (
					<div className='text-gray-700 text-xs font-sans mt-2 p-2.5 bg-[#f9f9f9] border-l-2 border-[#990000] rounded-r-xs line-clamp-3'>
						{fic.summary}
					</div>
				)}

				{fic.tags && fic.tags.length > 0 && (
					<div className='flex flex-wrap gap-1 mt-2 pt-2 border-t border-gray-200'>
						{fic.tags.map((tag, idx) => (
							<span
								key={idx}
								className='text-[10px] bg-[#eee] text-gray-800 px-1.5 py-0.5 rounded border border-gray-300 font-medium'
							>
								{tag}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
