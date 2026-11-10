'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db, type Fic, reprocessAllFicsFromBlobs } from '../lib/db';
import { BookCard } from './BookCard';
import { FicDetailsModal } from './FicDetailsModal';
import {
	Search,
	Upload,
	Heart,
	CheckCircle,
	BookOpen,
	Filter,
	SlidersHorizontal,
	RotateCcw,
	ChevronLeft,
	ChevronRight,
	X,
	FileText,
	Bookmark,
	Layers,
	SortAsc,
} from 'lucide-react';

interface LibraryViewProps {
	onSelectFic: (fic: Fic) => void;
	onOpenUpload: () => void;
}

type QuickTab = 'all' | 'favorites' | 'read' | 'unread';
type SortOption =
	| 'dateAddedDesc'
	| 'dateAddedAsc'
	| 'titleAsc'
	| 'titleDesc'
	| 'authorAsc'
	| 'wordsDesc'
	| 'wordsAsc'
	| 'chaptersDesc'
	| 'chaptersAsc'
	| 'updatedDesc';

export function LibraryView({ onSelectFic, onOpenUpload }: LibraryViewProps) {
	const [fics, setFics] = useState<Fic[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [quickTab, setQuickTab] = useState<QuickTab>('all');
	const [sortBy, setSortBy] = useState<SortOption>('dateAddedDesc');

	// Fic details modal state
	const [detailsFic, setDetailsFic] = useState<Fic | null>(null);
	const [isReprocessingAll, setIsReprocessingAll] = useState(false);

	// Responsive mobile filter drawer toggle
	const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

	// Pagination
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);

	// Specific Filters
	const [selectedFormat, setSelectedFormat] = useState<'all' | 'epub' | 'pdf'>('all');
	const [selectedStatus, setSelectedStatus] = useState<string>('all');
	const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
	const [selectedWarnings, setSelectedWarnings] = useState<string[]>([]);
	const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
	const [selectedFandoms, setSelectedFandoms] = useState<string[]>([]);
	const [selectedRelationships, setSelectedRelationships] = useState<string[]>([]);
	const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

	// Range filters
	const [minWords, setMinWords] = useState<string>('');
	const [maxWords, setMaxWords] = useState<string>('');
	const [minChapters, setMinChapters] = useState<string>('');
	const [maxChapters, setMaxChapters] = useState<string>('');

	// In-filter search inputs
	const [fandomSearch, setFandomSearch] = useState('');
	const [relSearch, setRelSearch] = useState('');
	const [charSearch, setCharSearch] = useState('');
	const [tagSearch, setTagSearch] = useState('');

	const loadFics = async () => {
		try {
			setLoading(true);
			const allFics = await db.fics.toArray();
			setFics(allFics);
		} catch (err) {
			console.error('Error loading library:', err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadFics();
	}, []);

	// Reset page when any filter changes
	useEffect(() => {
		setCurrentPage(1);
	}, [
		searchQuery,
		quickTab,
		sortBy,
		selectedFormat,
		selectedStatus,
		selectedRatings,
		selectedWarnings,
		selectedCategories,
		selectedFandoms,
		selectedRelationships,
		selectedCharacters,
		selectedTags,
		selectedLanguage,
		minWords,
		maxWords,
		minChapters,
		maxChapters,
	]);

	const clearAllFilters = () => {
		setSearchQuery('');
		setQuickTab('all');
		setSelectedFormat('all');
		setSelectedStatus('all');
		setSelectedRatings([]);
		setSelectedWarnings([]);
		setSelectedCategories([]);
		setSelectedFandoms([]);
		setSelectedRelationships([]);
		setSelectedCharacters([]);
		setSelectedTags([]);
		setSelectedLanguage('all');
		setMinWords('');
		setMaxWords('');
		setMinChapters('');
		setMaxChapters('');
		setFandomSearch('');
		setRelSearch('');
		setCharSearch('');
		setTagSearch('');
	};

	const activeFiltersCount =
		(searchQuery ? 1 : 0) +
		(quickTab !== 'all' ? 1 : 0) +
		(selectedFormat !== 'all' ? 1 : 0) +
		(selectedStatus !== 'all' ? 1 : 0) +
		selectedRatings.length +
		selectedWarnings.length +
		selectedCategories.length +
		selectedFandoms.length +
		selectedRelationships.length +
		selectedCharacters.length +
		selectedTags.length +
		(selectedLanguage !== 'all' ? 1 : 0) +
		(minWords ? 1 : 0) +
		(maxWords ? 1 : 0) +
		(minChapters ? 1 : 0) +
		(maxChapters ? 1 : 0);

	// Quick tag click from BookCard
	const handleTagClick = (
		type: 'fandom' | 'character' | 'relationship' | 'tag' | 'warning',
		value: string
	) => {
		if (type === 'fandom') {
			if (!selectedFandoms.includes(value)) setSelectedFandoms([...selectedFandoms, value]);
		} else if (type === 'character') {
			if (!selectedCharacters.includes(value)) setSelectedCharacters([...selectedCharacters, value]);
		} else if (type === 'relationship') {
			if (!selectedRelationships.includes(value)) setSelectedRelationships([...selectedRelationships, value]);
		} else if (type === 'tag') {
			if (!selectedTags.includes(value)) setSelectedTags([...selectedTags, value]);
		} else if (type === 'warning') {
			if (!selectedWarnings.includes(value)) setSelectedWarnings([...selectedWarnings, value]);
		}
	};

	// Calculate counts for filter facets
	const facetCounts = useMemo(() => {
		const ratings = new Map<string, number>();
		const warnings = new Map<string, number>();
		const categories = new Map<string, number>();
		const fandoms = new Map<string, number>();
		const rels = new Map<string, number>();
		const chars = new Map<string, number>();
		const tags = new Map<string, number>();
		const languages = new Set<string>();

		let favCount = 0;
		let readCount = 0;
		let unreadCount = 0;
		let epubCount = 0;
		let pdfCount = 0;

		fics.forEach((f) => {
			if (f.isFavorite) favCount++;
			if (f.isRead) readCount++;
			else unreadCount++;

			if (f.format === 'pdf') pdfCount++;
			else epubCount++;

			if (f.rating) ratings.set(f.rating, (ratings.get(f.rating) || 0) + 1);

			const wList = f.warnings && f.warnings.length > 0 ? f.warnings : f.archiveWarnings || [];
			wList.forEach((w) => warnings.set(w, (warnings.get(w) || 0) + 1));

			f.category?.forEach((c) => categories.set(c, (categories.get(c) || 0) + 1));

			const fanList = f.fandoms && f.fandoms.length > 0 ? f.fandoms : f.fandom ? [f.fandom] : [];
			fanList.forEach((fan) => fandoms.set(fan, (fandoms.get(fan) || 0) + 1));

			f.relationships?.forEach((r) => rels.set(r, (rels.get(r) || 0) + 1));
			f.characters?.forEach((ch) => chars.set(ch, (chars.get(ch) || 0) + 1));

			const tList = f.additionalTags && f.additionalTags.length > 0 ? f.additionalTags : f.tags || [];
			tList.forEach((t) => tags.set(t, (tags.get(t) || 0) + 1));

			if (f.language) languages.add(f.language);
		});

		return {
			ratings,
			warnings,
			categories,
			fandoms,
			rels,
			chars,
			tags,
			languages: Array.from(languages),
			favCount,
			readCount,
			unreadCount,
			epubCount,
			pdfCount,
		};
	}, [fics]);

	// Filter and sort the works
	const filteredFics = useMemo(() => {
		const parsedMinWords = minWords ? parseInt(minWords, 10) : null;
		const parsedMaxWords = maxWords ? parseInt(maxWords, 10) : null;
		const parsedMinChapters = minChapters ? parseInt(minChapters, 10) : null;
		const parsedMaxChapters = maxChapters ? parseInt(maxChapters, 10) : null;
		const query = searchQuery.trim().toLowerCase();

		return fics.filter((fic) => {
			// Quick Tab Filter
			if (quickTab === 'favorites' && !fic.isFavorite) return false;
			if (quickTab === 'read' && !fic.isRead) return false;
			if (quickTab === 'unread' && fic.isRead) return false;

			// Format Filter
			if (selectedFormat !== 'all' && fic.format !== selectedFormat) return false;

			// Publication Status Filter
			if (selectedStatus !== 'all' && fic.publicationStatus !== selectedStatus) return false;

			// General Search Query (title, author, fandom, characters, relationships, tags)
			if (query) {
				const titleMatch = fic.title.toLowerCase().includes(query);
				const authorMatch = fic.author.toLowerCase().includes(query);
				const fandomMatch = (fic.fandom || '').toLowerCase().includes(query);
				const charMatch = fic.characters?.some((c) => c.toLowerCase().includes(query));
				const relMatch = fic.relationships?.some((r) => r.toLowerCase().includes(query));
				const tagMatch = (fic.additionalTags || fic.tags || []).some((t) =>
					t.toLowerCase().includes(query)
				);
				if (!titleMatch && !authorMatch && !fandomMatch && !charMatch && !relMatch && !tagMatch) {
					return false;
				}
			}

			// Specific Ratings
			if (selectedRatings.length > 0) {
				if (!fic.rating || !selectedRatings.includes(fic.rating)) return false;
			}

			// Specific Warnings
			if (selectedWarnings.length > 0) {
				const ficW = fic.warnings && fic.warnings.length > 0 ? fic.warnings : fic.archiveWarnings || [];
				if (!selectedWarnings.some((w) => ficW.includes(w))) return false;
			}

			// Categories
			if (selectedCategories.length > 0) {
				if (!fic.category || !selectedCategories.some((c) => fic.category.includes(c))) return false;
			}

			// Fandoms
			if (selectedFandoms.length > 0) {
				const ficF = fic.fandoms && fic.fandoms.length > 0 ? fic.fandoms : [fic.fandom];
				if (!selectedFandoms.some((fan) => ficF.includes(fan))) return false;
			}

			// Relationships
			if (selectedRelationships.length > 0) {
				if (!fic.relationships || !selectedRelationships.some((r) => fic.relationships?.includes(r))) {
					return false;
				}
			}

			// Characters
			if (selectedCharacters.length > 0) {
				if (!fic.characters || !selectedCharacters.some((c) => fic.characters?.includes(c))) {
					return false;
				}
			}

			// Additional Tags
			if (selectedTags.length > 0) {
				const ficT = fic.additionalTags && fic.additionalTags.length > 0 ? fic.additionalTags : fic.tags || [];
				if (!selectedTags.some((t) => ficT.includes(t))) return false;
			}

			// Language
			if (selectedLanguage !== 'all') {
				if (fic.language !== selectedLanguage) return false;
			}

			// Word Count Range
			if (parsedMinWords !== null && (fic.wordCount === null || fic.wordCount < parsedMinWords)) return false;
			if (parsedMaxWords !== null && (fic.wordCount === null || fic.wordCount > parsedMaxWords)) return false;

			// Chapter Count Range
			if (parsedMinChapters !== null && (fic.chapterCount || 1) < parsedMinChapters) return false;
			if (parsedMaxChapters !== null && (fic.chapterCount || 1) > parsedMaxChapters) return false;

			return true;
		});
	}, [
		fics,
		searchQuery,
		quickTab,
		selectedFormat,
		selectedStatus,
		selectedRatings,
		selectedWarnings,
		selectedCategories,
		selectedFandoms,
		selectedRelationships,
		selectedCharacters,
		selectedTags,
		selectedLanguage,
		minWords,
		maxWords,
		minChapters,
		maxChapters,
	]);

	// Sorted works
	const sortedFics = useMemo(() => {
		const list = [...filteredFics];
		list.sort((a, b) => {
			switch (sortBy) {
				case 'dateAddedAsc':
					return (a.importedAt || 0) - (b.importedAt || 0);
				case 'titleAsc':
					return a.title.localeCompare(b.title);
				case 'titleDesc':
					return b.title.localeCompare(a.title);
				case 'authorAsc':
					return a.author.localeCompare(b.author);
				case 'wordsDesc':
					return (b.wordCount || 0) - (a.wordCount || 0);
				case 'wordsAsc':
					return (a.wordCount || 0) - (b.wordCount || 0);
				case 'chaptersDesc':
					return (b.chapterCount || 1) - (a.chapterCount || 1);
				case 'chaptersAsc':
					return (a.chapterCount || 1) - (b.chapterCount || 1);
				case 'updatedDesc':
					return (b.lastReadAt || b.importedAt || 0) - (a.lastReadAt || a.importedAt || 0);
				case 'dateAddedDesc':
				default:
					return (b.importedAt || 0) - (a.importedAt || 0);
			}
		});
		return list;
	}, [filteredFics, sortBy]);

	// Paginated slice
	const totalItems = sortedFics.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const paginatedFics = useMemo(() => {
		const start = (currentPage - 1) * pageSize;
		return sortedFics.slice(start, start + pageSize);
	}, [sortedFics, currentPage, pageSize]);

	const toggleItemInList = (list: string[], setList: (l: string[]) => void, item: string) => {
		if (list.includes(item)) setList(list.filter((x) => x !== item));
		else setList([...list, item]);
	};

	// Sidebar filter section component
	const FilterSection = () => (
		<div className='space-y-6 text-xs text-gray-800'>
			<div className='flex justify-between items-center border-b border-gray-300 pb-2.5'>
				<h2 className='font-bold uppercase tracking-wider text-gray-900 flex items-center space-x-1.5'>
					<SlidersHorizontal className='w-3.5 h-3.5 text-[#990000]' />
					<span>Filters</span>
				</h2>
				{activeFiltersCount > 0 && (
					<button
						onClick={clearAllFilters}
						className='text-[#990000] hover:underline font-semibold flex items-center space-x-1 cursor-pointer'
					>
						<RotateCcw className='w-3 h-3' />
						<span>Clear all ({activeFiltersCount})</span>
					</button>
				)}
			</div>

			{/* Format */}
			<div className='space-y-1.5'>
				<h3 className='font-bold text-gray-900'>Format</h3>
				<div className='grid grid-cols-3 gap-1'>
					{(['all', 'epub', 'pdf'] as const).map((fmt) => (
						<button
							key={fmt}
							type='button'
							onClick={() => setSelectedFormat(fmt)}
							className={`py-1 px-2 rounded border text-center font-semibold uppercase text-[10px] cursor-pointer transition-colors ${
								selectedFormat === fmt
									? 'bg-[#990000] text-white border-[#990000]'
									: 'bg-white hover:bg-gray-100 border-gray-300 text-gray-700'
							}`}
						>
							{fmt}
							<span className='ml-1 opacity-70'>
								(
								{fmt === 'all'
									? fics.length
									: fmt === 'epub'
									? facetCounts.epubCount
									: facetCounts.pdfCount}
								)
							</span>
						</button>
					))}
				</div>
			</div>

			{/* Publication Status */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Completion Status</h3>
				<select
					value={selectedStatus}
					onChange={(e) => setSelectedStatus(e.target.value)}
					className='w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#990000]'
				>
					<option value='all'>All Statuses</option>
					<option value='Completed'>Completed Works</option>
					<option value='Work in Progress'>Work in Progress</option>
				</select>
			</div>

			{/* Ratings */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Rating</h3>
				<div className='space-y-1 max-h-36 overflow-y-auto pr-1'>
					{['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated'].map((r) => {
						const count = facetCounts.ratings.get(r) || 0;
						return (
							<label
								key={r}
								className='flex items-center justify-between space-x-2 cursor-pointer hover:text-[#990000] py-0.5'
							>
								<div className='flex items-center space-x-1.5 truncate'>
									<input
										type='checkbox'
										checked={selectedRatings.includes(r)}
										onChange={() => toggleItemInList(selectedRatings, setSelectedRatings, r)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0 cursor-pointer'
									/>
									<span className='truncate'>{r}</span>
								</div>
								<span className='text-[10px] text-gray-400 font-mono'>({count})</span>
							</label>
						);
					})}
				</div>
			</div>

			{/* Warnings */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Archive Warnings</h3>
				<div className='space-y-1 max-h-36 overflow-y-auto pr-1'>
					{Array.from(facetCounts.warnings.entries()).map(([w, count]) => (
						<label
							key={w}
							className='flex items-center justify-between space-x-2 cursor-pointer hover:text-[#990000] py-0.5'
						>
							<div className='flex items-center space-x-1.5 truncate'>
								<input
									type='checkbox'
									checked={selectedWarnings.includes(w)}
									onChange={() => toggleItemInList(selectedWarnings, setSelectedWarnings, w)}
									className='rounded border-gray-300 text-[#990000] focus:ring-0 cursor-pointer'
								/>
								<span className='truncate'>{w}</span>
							</div>
							<span className='text-[10px] text-gray-400 font-mono'>({count})</span>
						</label>
					))}
				</div>
			</div>

			{/* Fandoms */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Fandoms</h3>
				<input
					type='text'
					placeholder='Filter fandoms...'
					value={fandomSearch}
					onChange={(e) => setFandomSearch(e.target.value)}
					className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] mb-1 focus:outline-none focus:border-[#990000]'
				/>
				<div className='space-y-1 max-h-40 overflow-y-auto pr-1'>
					{Array.from(facetCounts.fandoms.entries())
						.filter(([fan]) => fan.toLowerCase().includes(fandomSearch.toLowerCase()))
						.map(([fan, count]) => (
							<label
								key={fan}
								className='flex items-center justify-between space-x-2 cursor-pointer hover:text-[#990000] py-0.5'
							>
								<div className='flex items-center space-x-1.5 truncate'>
									<input
										type='checkbox'
										checked={selectedFandoms.includes(fan)}
										onChange={() => toggleItemInList(selectedFandoms, setSelectedFandoms, fan)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0 cursor-pointer'
									/>
									<span className='truncate'>{fan}</span>
								</div>
								<span className='text-[10px] text-gray-400 font-mono'>({count})</span>
							</label>
						))}
				</div>
			</div>

			{/* Relationships */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Relationships</h3>
				<input
					type='text'
					placeholder='Filter relationships...'
					value={relSearch}
					onChange={(e) => setRelSearch(e.target.value)}
					className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] mb-1 focus:outline-none focus:border-[#990000]'
				/>
				<div className='space-y-1 max-h-40 overflow-y-auto pr-1'>
					{Array.from(facetCounts.rels.entries())
						.filter(([r]) => r.toLowerCase().includes(relSearch.toLowerCase()))
						.map(([r, count]) => (
							<label
								key={r}
								className='flex items-center justify-between space-x-2 cursor-pointer hover:text-[#990000] py-0.5'
							>
								<div className='flex items-center space-x-1.5 truncate'>
									<input
										type='checkbox'
										checked={selectedRelationships.includes(r)}
										onChange={() => toggleItemInList(selectedRelationships, setSelectedRelationships, r)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0 cursor-pointer'
									/>
									<span className='truncate'>{r}</span>
								</div>
								<span className='text-[10px] text-gray-400 font-mono'>({count})</span>
							</label>
						))}
				</div>
			</div>

			{/* Characters */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Characters</h3>
				<input
					type='text'
					placeholder='Filter characters...'
					value={charSearch}
					onChange={(e) => setCharSearch(e.target.value)}
					className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] mb-1 focus:outline-none focus:border-[#990000]'
				/>
				<div className='space-y-1 max-h-40 overflow-y-auto pr-1'>
					{Array.from(facetCounts.chars.entries())
						.filter(([ch]) => ch.toLowerCase().includes(charSearch.toLowerCase()))
						.map(([ch, count]) => (
							<label
								key={ch}
								className='flex items-center justify-between space-x-2 cursor-pointer hover:text-[#990000] py-0.5'
							>
								<div className='flex items-center space-x-1.5 truncate'>
									<input
										type='checkbox'
										checked={selectedCharacters.includes(ch)}
										onChange={() => toggleItemInList(selectedCharacters, setSelectedCharacters, ch)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0 cursor-pointer'
									/>
									<span className='truncate'>{ch}</span>
								</div>
								<span className='text-[10px] text-gray-400 font-mono'>({count})</span>
							</label>
						))}
				</div>
			</div>

			{/* Additional Tags */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Additional Tags</h3>
				<input
					type='text'
					placeholder='Filter tags...'
					value={tagSearch}
					onChange={(e) => setTagSearch(e.target.value)}
					className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] mb-1 focus:outline-none focus:border-[#990000]'
				/>
				<div className='space-y-1 max-h-48 overflow-y-auto pr-1'>
					{Array.from(facetCounts.tags.entries())
						.filter(([t]) => t.toLowerCase().includes(tagSearch.toLowerCase()))
						.map(([t, count]) => (
							<label
								key={t}
								className='flex items-center justify-between space-x-2 cursor-pointer hover:text-[#990000] py-0.5'
							>
								<div className='flex items-center space-x-1.5 truncate'>
									<input
										type='checkbox'
										checked={selectedTags.includes(t)}
										onChange={() => toggleItemInList(selectedTags, setSelectedTags, t)}
										className='rounded border-gray-300 text-[#990000] focus:ring-0 cursor-pointer'
									/>
									<span className='truncate'>{t}</span>
								</div>
								<span className='text-[10px] text-gray-400 font-mono'>({count})</span>
							</label>
						))}
				</div>
			</div>

			{/* Word Count Range */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Word Count Range</h3>
				<div className='grid grid-cols-2 gap-2'>
					<div>
						<label className='block text-[10px] text-gray-500 mb-0.5'>Min words</label>
						<input
							type='number'
							placeholder='e.g. 5000'
							value={minWords}
							onChange={(e) => setMinWords(e.target.value)}
							className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] focus:outline-none focus:border-[#990000]'
						/>
					</div>
					<div>
						<label className='block text-[10px] text-gray-500 mb-0.5'>Max words</label>
						<input
							type='number'
							placeholder='e.g. 100000'
							value={maxWords}
							onChange={(e) => setMaxWords(e.target.value)}
							className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] focus:outline-none focus:border-[#990000]'
						/>
					</div>
				</div>
			</div>

			{/* Chapter Count Range */}
			<div className='space-y-1.5 border-t border-gray-200 pt-3'>
				<h3 className='font-bold text-gray-900'>Chapter / Page Count</h3>
				<div className='grid grid-cols-2 gap-2'>
					<div>
						<label className='block text-[10px] text-gray-500 mb-0.5'>Min</label>
						<input
							type='number'
							placeholder='1'
							value={minChapters}
							onChange={(e) => setMinChapters(e.target.value)}
							className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] focus:outline-none focus:border-[#990000]'
						/>
					</div>
					<div>
						<label className='block text-[10px] text-gray-500 mb-0.5'>Max</label>
						<input
							type='number'
							placeholder='50'
							value={maxChapters}
							onChange={(e) => setMaxChapters(e.target.value)}
							className='w-full px-2 py-1 bg-white border border-gray-300 rounded text-[11px] focus:outline-none focus:border-[#990000]'
						/>
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div className='flex-1 flex flex-col h-full bg-[#f8f8f8] text-gray-900 font-sans overflow-hidden'>
			{/* Top Navbar */}
			<header className='flex flex-wrap items-center justify-between px-4 md:px-8 py-3.5 border-b border-gray-300 bg-white shadow-xs z-10 gap-3'>
				{/* Brand */}
				<div className='flex items-center space-x-3'>
					<h1 className='text-xl md:text-2xl font-bold font-serif text-[#990000] tracking-wide'>
						AO3 Reader
					</h1>
					<span className='text-xs bg-red-50 text-[#990000] px-2.5 py-0.5 rounded-full font-semibold border border-red-200'>
						{filteredFics.length} works
					</span>
				</div>

				{/* Search Bar */}
				<div className='flex-1 max-w-md mx-2 min-w-[200px]'>
					<div className='relative w-full'>
						<Search className='w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' />
						<input
							type='text'
							placeholder='Search titles, authors, fandoms, tags...'
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className='w-full pl-9 pr-4 py-2 bg-gray-50 hover:bg-white focus:bg-white border border-gray-300 rounded-full text-xs focus:outline-none focus:border-[#990000] transition-all shadow-inner'
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery('')}
								className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'
							>
								<X className='w-3.5 h-3.5' />
							</button>
						)}
					</div>
				</div>

				{/* Quick Actions */}
				<div className='flex items-center space-x-2'>
					{fics.some((f) => f.format === 'epub' && (f.fileId || (f as any).fileData)) && (
						<button
							disabled={isReprocessingAll}
							onClick={async () => {
								setIsReprocessingAll(true);
								try {
									const res = await reprocessAllFicsFromBlobs();
									if (res.updated > 0) {
										await loadFics();
										alert(`Se han actualizado los resúmenes de ${res.updated} obra(s) desde sus archivos EPUB.`);
									} else {
										alert('Todos los resúmenes ya están al día.');
									}
								} finally {
									setIsReprocessingAll(false);
								}
							}}
							title='Re-extraer resúmenes limpios de todos los archivos EPUB almacenados'
							className='hidden sm:flex items-center space-x-1 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50'
						>
							<RotateCcw className={`w-3.5 h-3.5 text-gray-500 ${isReprocessingAll ? 'animate-spin' : ''}`} />
							<span>{isReprocessingAll ? 'Actualizando...' : 'Actualizar resúmenes'}</span>
						</button>
					)}

					<button
						onClick={() => setIsMobileFilterOpen(true)}
						className='md:hidden px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-md font-semibold text-xs flex items-center space-x-1.5'
					>
						<Filter className='w-3.5 h-3.5 text-[#990000]' />
						<span>Filters ({activeFiltersCount})</span>
					</button>

					<button
						onClick={onOpenUpload}
						className='px-4 py-2 bg-[#990000] hover:bg-[#800000] text-white rounded-md font-bold text-xs shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer'
					>
						<Upload className='w-3.5 h-3.5' />
						<span>Import Works</span>
					</button>
				</div>
			</header>

			{/* Secondary Navigation Bar: Quick Tabs & Sorting */}
			<div className='flex flex-wrap items-center justify-between px-4 md:px-8 py-2 border-b border-gray-200 bg-[#fafafa] text-xs gap-2'>
				{/* Quick View Tabs */}
				<div className='flex items-center space-x-1 overflow-x-auto py-0.5'>
					<button
						onClick={() => setQuickTab('all')}
						className={`px-3 py-1 rounded-full font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
							quickTab === 'all'
								? 'bg-[#990000] text-white'
								: 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
						}`}
					>
						<Layers className='w-3 h-3' />
						<span>All Works ({fics.length})</span>
					</button>

					<button
						onClick={() => setQuickTab('favorites')}
						className={`px-3 py-1 rounded-full font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
							quickTab === 'favorites'
								? 'bg-[#990000] text-white'
								: 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
						}`}
					>
						<Heart className='w-3 h-3 fill-red-500 text-red-500' />
						<span>Favorites ({facetCounts.favCount})</span>
					</button>

					<button
						onClick={() => setQuickTab('read')}
						className={`px-3 py-1 rounded-full font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
							quickTab === 'read'
								? 'bg-[#990000] text-white'
								: 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
						}`}
					>
						<CheckCircle className='w-3 h-3 text-green-600' />
						<span>Read ({facetCounts.readCount})</span>
					</button>

					<button
						onClick={() => setQuickTab('unread')}
						className={`px-3 py-1 rounded-full font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
							quickTab === 'unread'
								? 'bg-[#990000] text-white'
								: 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
						}`}
					>
						<BookOpen className='w-3 h-3 text-blue-600' />
						<span>Unread ({facetCounts.unreadCount})</span>
					</button>
				</div>

				{/* Sorting Dropdown */}
				<div className='flex items-center space-x-2'>
					<span className='text-gray-500 font-medium text-[11px] hidden sm:inline'>Sort by:</span>
					<select
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value as SortOption)}
						className='bg-white border border-gray-300 rounded px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-[#990000] cursor-pointer'
					>
						<option value='dateAddedDesc'>Date Added (Newest)</option>
						<option value='dateAddedAsc'>Date Added (Oldest)</option>
						<option value='titleAsc'>Title (A to Z)</option>
						<option value='titleDesc'>Title (Z to A)</option>
						<option value='authorAsc'>Author (A to Z)</option>
						<option value='wordsDesc'>Word Count (High to Low)</option>
						<option value='wordsAsc'>Word Count (Low to High)</option>
						<option value='chaptersDesc'>Chapters / Pages (High to Low)</option>
						<option value='chaptersAsc'>Chapters / Pages (Low to High)</option>
						<option value='updatedDesc'>Recent Activity</option>
					</select>
				</div>
			</div>

			{/* Main Layout Area: Works Grid + Desktop Filter Sidebar */}
			<div className='flex-1 flex overflow-hidden'>
				{/* Works Feed */}
				<main className='flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full'>
					{loading ? (
						<div className='flex justify-center items-center h-64 text-gray-500 font-medium'>
							Loading your library...
						</div>
					) : paginatedFics.length === 0 ? (
						<div className='text-center py-20 bg-white border border-dashed border-gray-300 rounded-lg p-8 space-y-3'>
							<p className='text-gray-700 font-bold text-base'>No works found matching your criteria.</p>
							<p className='text-gray-500 text-xs max-w-md mx-auto'>
								{activeFiltersCount > 0
									? 'Try clearing or relaxing some of your filters to see more results.'
									: 'Your library is empty. Import EPUB or PDF files from your computer or Google Drive to begin reading.'}
							</p>
							<div className='flex justify-center space-x-3 pt-3'>
								{activeFiltersCount > 0 && (
									<button
										onClick={clearAllFilters}
										className='px-4 py-2 border border-gray-300 text-gray-700 rounded font-semibold text-xs hover:bg-gray-50'
									>
										Clear All Filters
									</button>
								)}
								<button
									onClick={onOpenUpload}
									className='px-4 py-2 bg-[#990000] hover:bg-[#800000] text-white rounded font-bold text-xs shadow-xs transition-colors'
								>
									Import Works
								</button>
							</div>
						</div>
					) : (
						<>
							{/* Books Cards List */}
							<div className='space-y-4'>
								{paginatedFics.map((fic) => (
									<BookCard
										key={fic.id}
										fic={fic}
										onSelect={onSelectFic}
										onOpenDetails={(f) => setDetailsFic(f)}
										onTagClick={handleTagClick}
										onUpdated={loadFics}
									/>
								))}
							</div>

							{/* Pagination Footer */}
							{totalPages > 1 && (
								<div className='flex flex-wrap justify-between items-center pt-6 border-t border-gray-300 text-xs gap-3'>
									<div className='text-gray-500'>
										Showing {(currentPage - 1) * pageSize + 1}–
										{Math.min(currentPage * pageSize, totalItems)} of {totalItems} works
									</div>

									<div className='flex items-center space-x-1.5'>
										<button
											disabled={currentPage <= 1}
											onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
											className='p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-30 cursor-pointer'
										>
											<ChevronLeft className='w-4 h-4' />
										</button>

										<div className='flex items-center space-x-1 px-1 font-semibold text-gray-700'>
											<span>Page</span>
											<span className='font-bold text-[#990000]'>{currentPage}</span>
											<span>of</span>
											<span>{totalPages}</span>
										</div>

										<button
											disabled={currentPage >= totalPages}
											onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
											className='p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-30 cursor-pointer'
										>
											<ChevronRight className='w-4 h-4' />
										</button>
									</div>

									<div className='flex items-center space-x-1'>
										<span className='text-gray-500'>Per page:</span>
										<select
											value={pageSize}
											onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
											className='bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs'
										>
											<option value={10}>10</option>
											<option value={20}>20</option>
											<option value={50}>50</option>
										</select>
									</div>
								</div>
							)}
						</>
					)}
				</main>

				{/* Desktop Sidebar Filters */}
				<aside className='hidden md:block w-80 bg-white border-l border-gray-300 p-5 overflow-y-auto shadow-2xs shrink-0'>
					<FilterSection />
				</aside>
			</div>

			{/* Mobile Responsive Filter Drawer */}
			{isMobileFilterOpen && (
				<div className='fixed inset-0 bg-black/50 z-50 flex justify-end md:hidden'>
					<div className='w-80 bg-white h-full p-5 overflow-y-auto shadow-2xl space-y-4'>
						<div className='flex justify-between items-center border-b pb-2'>
							<h3 className='font-bold text-sm text-[#990000]'>Filters</h3>
							<button onClick={() => setIsMobileFilterOpen(false)} className='p-1 text-gray-500 font-bold'>
								✕
							</button>
						</div>
						<FilterSection />
					</div>
				</div>
			)}

			{/* Fic Details Modal */}
			<FicDetailsModal
				fic={detailsFic}
				isOpen={Boolean(detailsFic)}
				onClose={() => setDetailsFic(null)}
				onStartReading={(selectedFic, chapterIdx) => {
					setDetailsFic(null);
					if (chapterIdx !== undefined && selectedFic.id) {
						selectedFic.currentChapterIdx = chapterIdx;
					}
					onSelectFic(selectedFic);
				}}
				onTagClick={handleTagClick}
				onFicUpdated={(updated) => {
					setDetailsFic(updated);
					loadFics();
				}}
			/>
		</div>
	);
}
