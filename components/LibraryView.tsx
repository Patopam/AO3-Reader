'use client';
import React, { useState, useEffect } from 'react';
import { db, type Fic } from '../lib/db';

export function LibraryView({
	onSelectFic,
	onOpenUpload,
	onUploadUrl,
}: {
	onSelectFic: (fic: Fic) => void;
	onOpenUpload: () => void;
	onUploadUrl?: (url: string) => void;
}) {
	const [fics, setFics] = useState<Fic[]>([]);
	const [searchQuery, setSearchQuery] = useState('');
	const [toastMessage, setToastMessage] = useState<string | null>(null);

	const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
	const [urlInput, setUrlInput] = useState('');

	const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
	const [selectedWarnings, setSelectedWarnings] = useState<string[]>([]);
	const [selectedRelationships, setSelectedRelationships] = useState<string[]>([]);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);

	const [filterRatingSearch, setFilterRatingSearch] = useState('');
	const [filterWarningSearch, setFilterWarningSearch] = useState('');
	const [filterRelationshipSearch, setFilterRelationshipSearch] = useState('');
	const [filterTagSearch, setFilterTagSearch] = useState('');

	const loadFics = async () => {
		const allFics = await db.fics.toArray();
		setFics(allFics);
	};

	useEffect(() => {
		loadFics();
	}, []);

	const showToast = (msg: string) => {
		setToastMessage(msg);
		setTimeout(() => setToastMessage(null), 4000);
	};

	const handleDeleteFic = async (id?: number) => {
		if (!id) return;
		await db.fics.delete(id);
		await loadFics();
		showToast('🗑️ Fanfic eliminado correctamente.');
	};

	const handleToggleFavorite = async (fic: Fic) => {
		if (!fic.id) return;
		const newFavState = !fic.isFavorite;
		await db.fics.update(fic.id, { isFavorite: newFavState });
		await loadFics();
		showToast(newFavState ? '❤️ Añadido a favoritos' : '🤍 Eliminado de favoritos');
	};

	const handleToggleRead = async (fic: Fic) => {
		if (!fic.id) return;
		const newReadState = !fic.isRead;
		await db.fics.update(fic.id, { isRead: newReadState });
		await loadFics();
		showToast(newReadState ? '✓ Marcado como leído' : '📖 Marcado como no leído');
	};

	const allRatings = Array.from(new Set(fics.map((f) => f.rating).filter((r): r is string => Boolean(r))));
	const allWarnings = Array.from(
		new Set(fics.flatMap((f) => f.archiveWarnings || []).filter((w): w is string => Boolean(w))),
	);
	const allRelationships = Array.from(
		new Set(fics.flatMap((f) => f.relationships || []).filter((rel): rel is string => Boolean(rel))),
	);
	const allTags = Array.from(new Set(fics.flatMap((f) => f.tags || []).filter((tag): tag is string => Boolean(tag))));

	const filteredRatings = allRatings.filter((r) => r.toLowerCase().includes(filterRatingSearch.toLowerCase()));
	const filteredWarnings = allWarnings.filter((w) => w.toLowerCase().includes(filterWarningSearch.toLowerCase()));
	const filteredRelationships = allRelationships.filter((rel) =>
		rel.toLowerCase().includes(filterRelationshipSearch.toLowerCase()),
	);
	const filteredTags = allTags.filter((tag) => tag.toLowerCase().includes(filterTagSearch.toLowerCase()));

	const filteredFics = fics.filter((fic) => {
		const matchesSearch =
			fic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			fic.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
			fic.fandom.toLowerCase().includes(searchQuery.toLowerCase());

		const matchesRating = selectedRatings.length === 0 || (fic.rating && selectedRatings.includes(fic.rating));
		const matchesWarning =
			selectedWarnings.length === 0 ||
			(fic.archiveWarnings && selectedWarnings.some((w) => fic.archiveWarnings?.includes(w)));
		const matchesRelationship =
			selectedRelationships.length === 0 ||
			(fic.relationships && selectedRelationships.some((r) => fic.relationships?.includes(r)));
		const matchesTag = selectedTags.length === 0 || (fic.tags && selectedTags.some((t) => fic.tags?.includes(t)));

		return matchesSearch && matchesRating && matchesWarning && matchesRelationship && matchesTag;
	});

	const toggleFilter = (list: string[], setList: (val: string[]) => void, item: string) => {
		if (list.includes(item)) {
			setList(list.filter((i) => i !== item));
		} else {
			setList([...list, item]);
		}
	};

	const handleUrlSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!urlInput.trim()) return;
		if (onUploadUrl) {
			await onUploadUrl(urlInput.trim());
			await loadFics();
		}
		setUrlInput('');
		setIsUrlModalOpen(false);
	};

	return (
		<div className='flex-1 flex flex-col h-full bg-[#f9f9f9] text-gray-900 font-sans overflow-hidden relative'>
			{toastMessage && (
				<div className='absolute top-4 right-6 z-50 bg-green-800 text-white px-4 py-2.5 rounded-md shadow-lg text-xs font-semibold flex items-center space-x-2 animate-bounce'>
					<span>✓</span>
					<span>{toastMessage}</span>
				</div>
			)}

			<div className='flex items-center justify-between px-6 py-4 border-b border-gray-300 bg-white shadow-xs z-10'>
				<div className='flex items-center space-x-3'>
					<h1 className='text-xl font-bold font-serif text-[#990000] tracking-wide'>AO3 Reader</h1>
					<span className='text-xs bg-red-50 text-[#990000] px-2.5 py-1 rounded-full font-semibold border border-red-200'>
						{filteredFics.length} works
					</span>
				</div>

				<div className='flex items-center space-x-4 flex-1 max-w-lg mx-8'>
					<div className='relative w-full'>
						<span className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400'>
							🔍
						</span>
						<input
							type='text'
							placeholder='Search works, authors, fandoms...'
							value={searchQuery}
							onChange={(e: any) => setSearchQuery(e.target.value)}
							className='w-full pl-9 pr-4 py-2 border border-gray-300 rounded-full text-xs bg-gray-50 focus:bg-white focus:outline-none focus:border-[#990000] transition-all shadow-inner'
						/>
					</div>
				</div>

				<div className='flex items-center space-x-2'>
					<button
						onClick={onOpenUpload}
						className='px-3.5 py-2 bg-[#990000] hover:bg-[#800000] text-white rounded-md font-bold text-xs cursor-pointer transition-all shadow-xs flex items-center space-x-1.5'
					>
						<span>📂</span>
						<span>Upload EPUB</span>
					</button>

					<button
						onClick={() => setIsUrlModalOpen(true)}
						className='px-3.5 py-2 bg-white hover:bg-gray-50 text-[#990000] border border-[#990000] rounded-md font-bold text-xs cursor-pointer transition-all shadow-xs flex items-center space-x-1.5'
					>
						<span>🔗</span>
						<span>Add Link / Drive</span>
					</button>
				</div>
			</div>

			<div className='flex-1 flex overflow-hidden'>
				<main className='flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full'>
					{filteredFics.length === 0 ? (
						<div className='text-center py-20 bg-white border border-dashed border-gray-300 rounded-lg'>
							<p className='text-gray-500 font-medium text-sm mb-2'>No works found in your bookshelf.</p>
							<p className='text-gray-400 text-xs mb-4'>Upload an EPUB or add a link to get started.</p>
							<div className='flex justify-center space-x-3'>
								<button
									onClick={onOpenUpload}
									className='px-4 py-2 bg-[#990000] text-white rounded font-bold text-xs hover:bg-[#800000] transition-colors'
								>
									Upload EPUB
								</button>
								<button
									onClick={() => setIsUrlModalOpen(true)}
									className='px-4 py-2 bg-white text-[#990000] border border-[#990000] rounded font-bold text-xs hover:bg-red-50 transition-colors'
								>
									Add Link
								</button>
							</div>
						</div>
					) : (
						filteredFics.map((fic) => (
							<div
								key={fic.id}
								className='bg-white border border-gray-300 p-6 rounded-md shadow-xs space-y-4 font-sans text-sm transition-all hover:shadow-md relative'
							>
								<div className='absolute top-4 right-4 flex items-center space-x-2'>
									<button
										onClick={() => handleToggleFavorite(fic)}
										title={fic.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
										className={`p-1.5 rounded border text-xs cursor-pointer ${fic.isFavorite ? 'bg-red-50 border-red-300 text-red-600' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-red-500'}`}
									>
										{fic.isFavorite ? '❤️' : '🤍'}
									</button>

									<button
										onClick={() => handleToggleRead(fic)}
										title={fic.isRead ? 'Marcar como no leído' : 'Marcar como leído'}
										className={`p-1.5 rounded border text-xs cursor-pointer ${fic.isRead ? 'bg-green-50 border-green-300 text-green-700 font-bold' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-green-600'}`}
									>
										{fic.isRead ? '✓ Leído' : '📖 No leído'}
									</button>

									<button
										onClick={() => handleDeleteFic(fic.id)}
										title='Eliminar fic'
										className='p-1.5 rounded border border-gray-200 bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-[#990000] text-xs cursor-pointer transition-colors'
									>
										🗑️
									</button>
								</div>

								<div>
									<h3
										onClick={() => onSelectFic(fic)}
										className='text-lg font-bold font-serif text-[#990000] hover:underline cursor-pointer pr-32'
									>
										{fic.title}
									</h3>
									<p className='text-gray-700 text-xs mt-0.5'>
										by <span className='font-semibold text-gray-900'>{fic.author}</span>
									</p>
									<p className='text-gray-600 text-xs font-semibold mt-1'>{fic.fandom}</p>
								</div>

								<div className='text-xs text-gray-700 space-y-1.5 bg-gray-50 p-3 rounded border border-gray-200'>
									<div>
										<span className='font-bold text-gray-900'>Rating:</span>{' '}
										<span className='text-[#990000] font-medium'>{fic.rating}</span>
									</div>
									<div>
										<span className='font-bold text-gray-900'>Archive Warnings:</span> {fic.archiveWarnings?.join(', ')}
									</div>
									<div>
										<span className='font-bold text-gray-900'>Fandoms:</span> {fic.fandom}
									</div>
									{fic.relationships && fic.relationships.length > 0 && (
										<div>
											<span className='font-bold text-gray-900'>Relationships:</span> {fic.relationships.join(', ')}
										</div>
									)}
									{fic.characters && fic.characters.length > 0 && (
										<div>
											<span className='font-bold text-gray-900'>Characters:</span> {fic.characters.join(', ')}
										</div>
									)}
									{fic.tags && fic.tags.length > 0 && (
										<div>
											<span className='font-bold text-gray-900'>Additional Tags:</span> {fic.tags.join(', ')}
										</div>
									)}
								</div>

								{fic.summary && (
									<div className='text-gray-800 text-xs leading-relaxed whitespace-pre-line border-l-2 border-[#990000] pl-3 py-1 italic'>
										{fic.summary}
									</div>
								)}

								<div className='flex justify-between items-center pt-3 border-t border-gray-200 text-xs'>
									<div className='text-gray-600 space-y-0.5'>
										{fic.wordCount && (
											<div>
												<span className='font-bold'>Words:</span> {fic.wordCount.toLocaleString()}
											</div>
										)}
										<div>
											<span className='font-bold'>Chapters:</span> {fic.chapters?.length || 1} readable sections
										</div>
									</div>

									<button
										onClick={() => onSelectFic(fic)}
										className='px-4 py-2 bg-[#990000] hover:bg-[#800000] text-white font-bold rounded shadow-xs cursor-pointer transition-colors'
									>
										Read fic →
									</button>
								</div>
							</div>
						))
					)}
				</main>

				<aside className='w-72 bg-white border-l border-gray-200 p-4 overflow-y-auto space-y-6 text-xs shadow-sm'>
					<div className='flex justify-between items-center border-b pb-2'>
						<h2 className='font-bold text-gray-800 uppercase tracking-wider'>Filters</h2>
						{(selectedRatings.length > 0 ||
							selectedWarnings.length > 0 ||
							selectedRelationships.length > 0 ||
							selectedTags.length > 0) && (
							<button
								onClick={() => {
									setSelectedRatings([]);
									setSelectedWarnings([]);
									setSelectedRelationships([]);
									setSelectedTags([]);
								}}
								className='text-[#990000] hover:underline text-[11px] font-semibold'
							>
								Clear all
							</button>
						)}
					</div>

					<div className='space-y-2'>
						<h3 className='font-bold text-gray-900'>Ratings</h3>
						<div className='space-y-1 max-h-32 overflow-y-auto'>
							{filteredRatings.map((r) => (
								<label key={r} className='flex items-center space-x-2 cursor-pointer hover:text-[#990000]'>
									<input
										type='checkbox'
										checked={selectedRatings.includes(r)}
										onChange={() => toggleFilter(selectedRatings, setSelectedRatings, r)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0'
									/>
									<span className='truncate'>{r}</span>
								</label>
							))}
						</div>
					</div>

					<div className='space-y-2 border-t pt-4'>
						<h3 className='font-bold text-gray-900'>Archive Warnings</h3>
						<div className='space-y-1 max-h-32 overflow-y-auto'>
							{filteredWarnings.map((w) => (
								<label key={w} className='flex items-center space-x-2 cursor-pointer hover:text-[#990000]'>
									<input
										type='checkbox'
										checked={selectedWarnings.includes(w)}
										onChange={() => toggleFilter(selectedWarnings, setSelectedWarnings, w)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0'
									/>
									<span className='truncate'>{w}</span>
								</label>
							))}
						</div>
					</div>

					<div className='space-y-2 border-t pt-4'>
						<h3 className='font-bold text-gray-900'>Relationships</h3>
						<input
							type='text'
							placeholder='Search relationships...'
							value={filterRelationshipSearch}
							onChange={(e: any) => setFilterRelationshipSearch(e.target.value)}
							className='w-full px-2 py-1 border border-gray-300 rounded text-[11px] mb-1 focus:outline-none focus:border-[#990000]'
						/>
						<div className='space-y-1 max-h-40 overflow-y-auto'>
							{filteredRelationships.map((rel) => (
								<label key={rel} className='flex items-center space-x-2 cursor-pointer hover:text-[#990000]'>
									<input
										type='checkbox'
										checked={selectedRelationships.includes(rel)}
										onChange={() => toggleFilter(selectedRelationships, setSelectedRelationships, rel)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0'
									/>
									<span className='truncate'>{rel}</span>
								</label>
							))}
						</div>
					</div>

					<div className='space-y-2 border-t pt-4'>
						<h3 className='font-bold text-gray-900'>Additional Tags</h3>
						<input
							type='text'
							placeholder='Search tags...'
							value={filterTagSearch}
							onChange={(e: any) => setFilterTagSearch(e.target.value)}
							className='w-full px-2 py-1 border border-gray-300 rounded text-[11px] mb-1 focus:outline-none focus:border-[#990000]'
						/>
						<div className='space-y-1 max-h-48 overflow-y-auto'>
							{filteredTags.map((tag) => (
								<label key={tag} className='flex items-center space-x-2 cursor-pointer hover:text-[#990000]'>
									<input
										type='checkbox'
										checked={selectedTags.includes(tag)}
										onChange={() => toggleFilter(selectedTags, setSelectedTags, tag)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0'
									/>
									<span className='truncate'>{tag}</span>
								</label>
							))}
						</div>
					</div>
				</aside>
			</div>

			{isUrlModalOpen && (
				<div className='fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4'>
					<div className='bg-white p-6 rounded-lg max-w-md w-full shadow-xl border border-gray-200 space-y-4'>
						<div className='flex justify-between items-center border-b pb-3'>
							<h3 className='font-bold text-sm text-[#990000]'>Add Fanfic from Link</h3>
							<button
								onClick={() => setIsUrlModalOpen(false)}
								className='text-gray-400 hover:text-gray-600 font-bold text-sm'
							>
								✕
							</button>
						</div>

						<form onSubmit={handleUrlSubmit} className='space-y-3'>
							<div>
								<label className='block text-xs font-semibold text-gray-700 mb-1'>Google Drive Link or EPUB URL</label>
								<input
									type='url'
									placeholder='https://drive.google.com/... or direct link'
									value={urlInput}
									onChange={(e: any) => setUrlInput(e.target.value)}
									className='w-full px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#990000]'
									required
								/>
							</div>

							<div className='flex justify-end space-x-2 pt-2'>
								<button
									type='button'
									onClick={() => setIsUrlModalOpen(false)}
									className='px-4 py-2 border border-gray-300 rounded text-xs font-semibold text-gray-700 hover:bg-gray-50'
								>
									Cancel
								</button>
								<button
									type='submit'
									className='px-4 py-2 bg-[#990000] hover:bg-[#800000] text-white rounded text-xs font-bold shadow-xs transition-colors'
								>
									Import Work
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
