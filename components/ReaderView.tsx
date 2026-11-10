'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { Fic, FicChapter } from '../lib/db';
import { db, updateReadingProgress } from '../lib/db';
import { escapeRegex } from '../lib/epubParser';
import { PdfReader } from './PdfReader';
import {
	ArrowLeft,
	Heart,
	CheckCircle,
	Sliders,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Sun,
	Moon,
	Coffee,
	Type,
	AlignLeft,
	List,
} from 'lucide-react';

interface ReaderViewProps {
	fic: Fic;
	onBack: () => void;
}

type ReaderTheme = 'default' | 'sepia' | 'dark' | 'black';
type ReaderWidth = 'compact' | 'normal' | 'wide' | 'full';
type ReaderFont = 'serif' | 'sans' | 'mono';

export function ReaderView({ fic, onBack }: ReaderViewProps) {
	// If this is a PDF, delegate immediately to the integrated PdfReader
	if (fic.format === 'pdf') {
		return (
			<PdfReader
				fic={fic}
				onBack={onBack}
				isFavorite={Boolean(fic.isFavorite)}
				isRead={Boolean(fic.isRead)}
				onToggleFavorite={async () => {
					if (!fic.id) return;
					const next = !fic.isFavorite;
					await db.fics.update(fic.id, { isFavorite: next });
					fic.isFavorite = next;
				}}
				onToggleRead={async () => {
					if (!fic.id) return;
					const next = !fic.isRead;
					await db.fics.update(fic.id, { isRead: next, readingProgress: next ? 100 : fic.readingProgress });
					fic.isRead = next;
				}}
			/>
		);
	}

	const [chapters, setChapters] = useState<FicChapter[]>([]);
	const [currentChapterIdx, setCurrentChapterIdx] = useState<number>(fic.currentChapterIdx || 0);
	const [loading, setLoading] = useState<boolean>(true);
	const [viewMode, setViewMode] = useState<'chapters' | 'entire'>('chapters');
	const [isRead, setIsRead] = useState<boolean>(Boolean(fic.isRead));
	const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(fic.isFavorite));
	const [showSettings, setShowSettings] = useState<boolean>(false);

	// Customization settings
	const [fontSize, setFontSize] = useState<number>(17); // in pixels
	const [fontFamily, setFontFamily] = useState<ReaderFont>('serif');
	const [theme, setTheme] = useState<ReaderTheme>('default');
	const [contentWidth, setContentWidth] = useState<ReaderWidth>('normal');
	const [lineHeight, setLineHeight] = useState<number>(1.75);

	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	// Load chapters and safely sanitize preface duplication using escapeRegex
	useEffect(() => {
		async function loadChapters() {
			setLoading(true);
			const rawChapters: FicChapter[] =
				fic.chapters && fic.chapters.length > 0
					? fic.chapters
					: [{ title: 'Chapter 1', content: fic.fullTextContent || 'No content found in this work.' }];

			const safeTitleRegex = new RegExp(`^${escapeRegex(fic.title)}[\\s\\S]*?\\bby\\b.*?\\n+`, 'i');

			const cleanedChapters = rawChapters.map((chap, idx) => {
				if (idx === 0) {
					let cleaned = chap.content;
					if (fic.summary) {
						cleaned = cleaned.replace(fic.summary, '');
					}
					cleaned = cleaned
						.replace(/^Summary:?[\s\S]*?(?=\n\n|\r\n\r\n)/i, '')
						.replace(safeTitleRegex, '')
						.trim();
					return { ...chap, content: cleaned || chap.content };
				}
				return chap;
			});

			setChapters(cleanedChapters);
			const validIdx = Math.min(Math.max(0, fic.currentChapterIdx || 0), cleanedChapters.length - 1);
			setCurrentChapterIdx(validIdx);
			setLoading(false);
		}

		loadChapters();
	}, [fic]);

	// Auto-save reading position on chapter change
	const handleChapterChange = (newIdx: number) => {
		if (newIdx < 0 || newIdx >= chapters.length) return;
		setCurrentChapterIdx(newIdx);
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollTop = 0;
		}

		if (fic.id && chapters.length > 0) {
			const progressPercent = Math.round(((newIdx + 1) / chapters.length) * 100);
			updateReadingProgress(fic.id, progressPercent, newIdx, undefined);
		}
	};

	const handleToggleRead = async () => {
		if (!fic.id) return;
		const next = !isRead;
		await db.fics.update(fic.id, {
			isRead: next,
			readingProgress: next ? 100 : fic.readingProgress,
			lastReadAt: Date.now(),
		});
		setIsRead(next);
	};

	const handleToggleFavorite = async () => {
		if (!fic.id) return;
		const next = !isFavorite;
		await db.fics.update(fic.id, { isFavorite: next });
		setIsFavorite(next);
	};

	// Theme classes
	const getThemeClasses = () => {
		switch (theme) {
			case 'sepia':
				return {
					bg: 'bg-[#f8f1e3]',
					text: 'text-[#473623]',
					headerBg: 'bg-[#eee3ce] border-[#d9ccb4]',
					navBg: 'bg-[#f2e7d3] border-[#d9ccb4]',
					accent: 'text-[#8b2500]',
					box: 'bg-[#eedec4] border-[#d9ccb4]',
				};
			case 'dark':
				return {
					bg: 'bg-[#1e1e1e]',
					text: 'text-[#d6d6d6]',
					headerBg: 'bg-[#181818] border-[#333333]',
					navBg: 'bg-[#252525] border-[#383838]',
					accent: 'text-[#ff6b6b]',
					box: 'bg-[#2a2a2a] border-[#3a3a3a]',
				};
			case 'black':
				return {
					bg: 'bg-black',
					text: 'text-[#b0b0b0]',
					headerBg: 'bg-[#0d0d0d] border-[#222]',
					navBg: 'bg-[#141414] border-[#222]',
					accent: 'text-[#ff5252]',
					box: 'bg-[#161616] border-[#292929]',
				};
			default:
				return {
					bg: 'bg-white',
					text: 'text-gray-900',
					headerBg: 'bg-[#f7f7f7] border-gray-300',
					navBg: 'bg-gray-100 border-gray-300',
					accent: 'text-[#990000]',
					box: 'bg-gray-50 border-gray-200',
				};
		}
	};

	const themeCls = getThemeClasses();

	const getWidthClass = () => {
		switch (contentWidth) {
			case 'compact':
				return 'max-w-xl';
			case 'wide':
				return 'max-w-4xl';
			case 'full':
				return 'max-w-6xl';
			default:
				return 'max-w-3xl';
		}
	};

	const getFontClass = () => {
		switch (fontFamily) {
			case 'sans':
				return 'font-sans';
			case 'mono':
				return 'font-mono text-[92%]';
			default:
				return 'font-serif';
		}
	};

	const allWarnings = fic.warnings && fic.warnings.length > 0 ? fic.warnings : fic.archiveWarnings || [];

	return (
		<div className={`flex-1 flex flex-col h-full ${themeCls.bg} ${themeCls.text} font-sans overflow-hidden`}>
			{/* Shared Header Bar */}
			<header
				className={`flex items-center justify-between px-4 md:px-6 py-2.5 border-b ${themeCls.headerBg} z-20 text-xs shadow-xs`}
			>
				<div className='flex items-center space-x-3 overflow-hidden'>
					<button
						onClick={onBack}
						className='flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-bold hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors shadow-xs shrink-0 text-gray-800 dark:text-gray-200'
					>
						<ArrowLeft className='w-4 h-4' />
						<span className='hidden sm:inline'>Works</span>
					</button>

					<div className='truncate'>
						<h2 className='font-bold text-sm truncate font-serif text-[#990000] dark:text-red-400'>
							{fic.title}
						</h2>
						<p className='text-[11px] text-gray-500 truncate'>
							by <span className='font-semibold'>{fic.author}</span>
						</p>
					</div>
				</div>

				<div className='flex items-center space-x-2 shrink-0'>
					{/* Mode Switcher */}
					{chapters.length > 1 && (
						<button
							onClick={() => setViewMode(viewMode === 'chapters' ? 'entire' : 'chapters')}
							className='px-2.5 py-1.5 bg-white dark:bg-gray-800 hover:bg-red-50 border border-gray-300 dark:border-gray-600 rounded font-semibold text-xs cursor-pointer transition-colors shadow-xs hidden sm:inline-flex items-center space-x-1'
						>
							<BookOpen className='w-3.5 h-3.5 text-[#990000]' />
							<span>{viewMode === 'chapters' ? 'Entire Work' : 'Chapter Mode'}</span>
						</button>
					)}

					{/* Settings Toggle */}
					<button
						onClick={() => setShowSettings(!showSettings)}
						title='Display Settings'
						className={`p-1.5 rounded border transition-colors ${
							showSettings
								? 'bg-red-50 border-red-300 text-[#990000]'
								: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
						}`}
					>
						<Sliders className='w-4 h-4' />
					</button>

					{/* Favorite */}
					<button
						onClick={handleToggleFavorite}
						title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
						className={`p-1.5 rounded border transition-colors ${
							isFavorite
								? 'bg-red-50 border-red-300 text-red-600'
								: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 hover:text-red-600'
						}`}
					>
						<Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-600' : ''}`} />
					</button>

					{/* Mark Read */}
					<button
						onClick={handleToggleRead}
						title={isRead ? 'Mark as unread' : 'Mark as read'}
						className={`flex items-center space-x-1 px-2.5 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
							isRead
								? 'bg-green-50 border-green-300 text-green-700'
								: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 hover:text-green-700'
						}`}
					>
						<CheckCircle className={`w-3.5 h-3.5 ${isRead ? 'fill-green-100 text-green-600' : ''}`} />
						<span className='hidden md:inline'>{isRead ? 'Read' : 'Mark Read'}</span>
					</button>
				</div>
			</header>

			{/* Reading Display Settings Drawer */}
			{showSettings && (
				<div
					className={`border-b ${themeCls.navBg} px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs z-10 shadow-inner`}
				>
					{/* Font Size */}
					<div className='flex items-center space-x-2'>
						<span className='font-bold text-gray-600 dark:text-gray-400'>Size:</span>
						<button
							onClick={() => setFontSize((s) => Math.max(13, s - 1))}
							className='px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-bold'
						>
							A-
						</button>
						<span className='font-mono w-6 text-center'>{fontSize}</span>
						<button
							onClick={() => setFontSize((s) => Math.min(28, s + 1))}
							className='px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-bold'
						>
							A+
						</button>
					</div>

					{/* Font Family */}
					<div className='flex items-center space-x-1'>
						<span className='font-bold text-gray-600 dark:text-gray-400 mr-1'>Font:</span>
						<button
							onClick={() => setFontFamily('serif')}
							className={`px-2.5 py-1 rounded border font-serif ${
								fontFamily === 'serif'
									? 'bg-[#990000] text-white border-[#990000]'
									: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
							}`}
						>
							Serif
						</button>
						<button
							onClick={() => setFontFamily('sans')}
							className={`px-2.5 py-1 rounded border font-sans ${
								fontFamily === 'sans'
									? 'bg-[#990000] text-white border-[#990000]'
									: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
							}`}
						>
							Sans
						</button>
						<button
							onClick={() => setFontFamily('mono')}
							className={`px-2.5 py-1 rounded border font-mono ${
								fontFamily === 'mono'
									? 'bg-[#990000] text-white border-[#990000]'
									: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
							}`}
						>
							Mono
						</button>
					</div>

					{/* Themes */}
					<div className='flex items-center space-x-1.5'>
						<span className='font-bold text-gray-600 dark:text-gray-400 mr-1'>Theme:</span>
						<button
							onClick={() => setTheme('default')}
							className={`p-1.5 rounded-full border-2 ${
								theme === 'default' ? 'border-[#990000] scale-110' : 'border-gray-300'
							} bg-white`}
							title='Light Paper'
						>
							<Sun className='w-3.5 h-3.5 text-gray-800' />
						</button>
						<button
							onClick={() => setTheme('sepia')}
							className={`p-1.5 rounded-full border-2 ${
								theme === 'sepia' ? 'border-[#990000] scale-110' : 'border-gray-400'
							} bg-[#f8f1e3]`}
							title='Warm Sepia'
						>
							<Coffee className='w-3.5 h-3.5 text-[#5f4b32]' />
						</button>
						<button
							onClick={() => setTheme('dark')}
							className={`p-1.5 rounded-full border-2 ${
								theme === 'dark' ? 'border-red-400 scale-110' : 'border-gray-600'
							} bg-[#1e1e1e]`}
							title='Night Dark'
						>
							<Moon className='w-3.5 h-3.5 text-gray-200' />
						</button>
						<button
							onClick={() => setTheme('black')}
							className={`p-1.5 rounded-full border-2 ${
								theme === 'black' ? 'border-red-500 scale-110' : 'border-gray-700'
							} bg-black`}
							title='Pitch Black'
						>
							<div className='w-3.5 h-3.5 rounded-full bg-black border border-gray-600' />
						</button>
					</div>

					{/* Width */}
					<div className='flex items-center space-x-1'>
						<span className='font-bold text-gray-600 dark:text-gray-400 mr-1'>Width:</span>
						{(['compact', 'normal', 'wide', 'full'] as ReaderWidth[]).map((w) => (
							<button
								key={w}
								onClick={() => setContentWidth(w)}
								className={`px-2 py-0.5 rounded capitalize ${
									contentWidth === w
										? 'bg-[#990000] text-white'
										: 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600'
								}`}
							>
								{w}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Chapter Navigation Bar (when in chapters mode and multiple chapters) */}
			{viewMode === 'chapters' && chapters.length > 1 && (
				<div
					className={`border-b ${themeCls.navBg} px-4 md:px-6 py-2 flex justify-between items-center text-xs shrink-0`}
				>
					<button
						disabled={currentChapterIdx === 0}
						onClick={() => handleChapterChange(currentChapterIdx - 1)}
						className='flex items-center space-x-1 px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-semibold disabled:opacity-30 cursor-pointer transition-colors shadow-xs'
					>
						<ChevronLeft className='w-3.5 h-3.5' />
						<span>Previous</span>
					</button>

					<div className='flex items-center space-x-2'>
						<select
							value={currentChapterIdx}
							onChange={(e) => handleChapterChange(parseInt(e.target.value, 10))}
							className='bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1 font-semibold text-xs cursor-pointer focus:outline-none focus:border-[#990000]'
						>
							{chapters.map((chap, idx) => (
								<option key={idx} value={idx}>
									{idx + 1}. {chap.title}
								</option>
							))}
						</select>
						<span className='text-gray-500 font-mono text-[11px] hidden sm:inline'>
							({currentChapterIdx + 1} of {chapters.length})
						</span>
					</div>

					<button
						disabled={currentChapterIdx === chapters.length - 1}
						onClick={() => handleChapterChange(currentChapterIdx + 1)}
						className='flex items-center space-x-1 px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-semibold disabled:opacity-30 cursor-pointer transition-colors shadow-xs'
					>
						<span>Next</span>
						<ChevronRight className='w-3.5 h-3.5' />
					</button>
				</div>
			)}

			{/* Scrollable Reader Body */}
			<div ref={scrollContainerRef} className='flex-1 overflow-y-auto p-4 md:p-12'>
				{loading ? (
					<div className='flex justify-center items-center h-64 text-gray-500 font-medium'>
						Loading story text...
					</div>
				) : (
					<div className={`${getWidthClass()} mx-auto space-y-8 ${getFontClass()} leading-relaxed`}>
						{/* Full AO3 Metadata Header */}
						<div className={`border-b border-gray-300 dark:border-gray-700 pb-6 mb-8 font-sans text-xs space-y-2`}>
							{fic.rating && (
								<div className='grid grid-cols-[130px_1fr] gap-2'>
									<span className='font-bold opacity-80'>Rating:</span>
									<span className={`font-semibold ${themeCls.accent}`}>{fic.rating}</span>
								</div>
							)}

							{allWarnings.length > 0 && (
								<div className='grid grid-cols-[130px_1fr] gap-2'>
									<span className='font-bold opacity-80'>Archive Warnings:</span>
									<span className='font-medium'>{allWarnings.join(', ')}</span>
								</div>
							)}

							{fic.category && fic.category.length > 0 && (
								<div className='grid grid-cols-[130px_1fr] gap-2'>
									<span className='font-bold opacity-80'>Category:</span>
									<span>{fic.category.join(', ')}</span>
								</div>
							)}

							{fic.fandom && (
								<div className='grid grid-cols-[130px_1fr] gap-2'>
									<span className='font-bold opacity-80'>Fandom:</span>
									<span className='font-medium'>{fic.fandom}</span>
								</div>
							)}

							{fic.relationships && fic.relationships.length > 0 && (
								<div className='grid grid-cols-[130px_1fr] gap-2'>
									<span className='font-bold opacity-80'>Relationships:</span>
									<span>{fic.relationships.join(' · ')}</span>
								</div>
							)}

							{fic.characters && fic.characters.length > 0 && (
								<div className='grid grid-cols-[130px_1fr] gap-2'>
									<span className='font-bold opacity-80'>Characters:</span>
									<span>{fic.characters.join(' · ')}</span>
								</div>
							)}

							{fic.additionalTags && fic.additionalTags.length > 0 && (
								<div className='grid grid-cols-[130px_1fr] gap-2'>
									<span className='font-bold opacity-80'>Additional Tags:</span>
									<span>{fic.additionalTags.join(', ')}</span>
								</div>
							)}

							<div className='flex flex-wrap justify-between items-center text-gray-500 pt-3 border-t border-gray-200 dark:border-gray-800 text-[11px] font-sans mt-4'>
								<div className='space-x-4'>
									{fic.language && <span>Language: {fic.language}</span>}
									{fic.wordCount && <span>Words: {fic.wordCount.toLocaleString()}</span>}
								</div>
								<div>
									<span>
										Chapters: {chapters.length}/{chapters.length}
									</span>
								</div>
							</div>
						</div>

						{/* Title Header */}
						<div className='text-center space-y-2 mb-10'>
							<h1 className='text-2xl md:text-3xl font-bold tracking-tight'>{fic.title}</h1>
							<p className='text-sm text-gray-600 dark:text-gray-400 font-sans'>
								by <span className='font-semibold text-gray-900 dark:text-gray-100'>{fic.author}</span>
							</p>
						</div>

						{/* Summary Block */}
						{fic.summary && (
							<div className={`p-4 rounded-md border ${themeCls.box} text-xs font-sans space-y-1 mb-8`}>
								<h4 className='font-bold uppercase tracking-wider text-xs opacity-70'>Summary:</h4>
								<div className='leading-relaxed whitespace-pre-line text-sm italic'>{fic.summary}</div>
							</div>
						)}

						{/* Notes Block */}
						{fic.notes && (
							<div className={`p-4 rounded-md border ${themeCls.box} text-xs font-sans space-y-1 mb-8`}>
								<h4 className='font-bold uppercase tracking-wider text-xs opacity-70'>Notes:</h4>
								<div className='leading-relaxed whitespace-pre-line text-xs'>{fic.notes}</div>
							</div>
						)}

						<hr className='my-8 border-gray-300 dark:border-gray-700' />

						{/* Story Chapter Content */}
						{viewMode === 'chapters' ? (
							<article className='space-y-6'>
								<h3 className={`text-center font-bold text-xl md:text-2xl mb-8 ${themeCls.accent}`}>
									{chapters[currentChapterIdx]?.title}
								</h3>
								<div
									style={{ fontSize: `${fontSize}px`, lineHeight }}
									className='whitespace-pre-wrap space-y-6'
								>
									{chapters[currentChapterIdx]?.content}
								</div>
							</article>
						) : (
							<div className='space-y-14'>
								{chapters.map((chap, idx) => (
									<article key={idx} className='border-t border-gray-300 dark:border-gray-700 pt-8 space-y-6'>
										<h3 className={`text-center font-bold text-xl md:text-2xl mb-6 ${themeCls.accent}`}>
											{chap.title}
										</h3>
										<div
											style={{ fontSize: `${fontSize}px`, lineHeight }}
											className='whitespace-pre-wrap space-y-6'
										>
											{chap.content}
										</div>
									</article>
								))}
							</div>
						)}

						{/* Bottom Chapter Navigation Bar (in chapter mode) */}
						{viewMode === 'chapters' && chapters.length > 1 && (
							<div className='pt-10 flex justify-between items-center text-xs font-sans'>
								<button
									disabled={currentChapterIdx === 0}
									onClick={() => handleChapterChange(currentChapterIdx - 1)}
									className='flex items-center space-x-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-bold disabled:opacity-30 cursor-pointer shadow-xs'
								>
									<ChevronLeft className='w-4 h-4' />
									<span>Previous Chapter</span>
								</button>

								<span className='font-semibold text-gray-500 font-mono'>
									Chapter {currentChapterIdx + 1} of {chapters.length}
								</span>

								<button
									disabled={currentChapterIdx === chapters.length - 1}
									onClick={() => handleChapterChange(currentChapterIdx + 1)}
									className='flex items-center space-x-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded font-bold disabled:opacity-30 cursor-pointer shadow-xs'
								>
									<span>Next Chapter</span>
									<ChevronRight className='w-4 h-4' />
								</button>
							</div>
						)}

						{/* Bottom Mark as Read Card */}
						<div className='mt-16 pt-8 border-t border-gray-300 dark:border-gray-700 flex flex-col items-center space-y-3 font-sans pb-12'>
							<p className='text-xs text-gray-500'>Finished reading or want to mark progress?</p>
							<button
								onClick={handleToggleRead}
								className={`px-6 py-2.5 rounded font-bold text-xs cursor-pointer transition-colors shadow-sm flex items-center space-x-2 ${
									isRead
										? 'bg-emerald-700 hover:bg-emerald-800 text-white'
										: 'bg-[#990000] hover:bg-[#800000] text-white'
								}`}
							>
								<CheckCircle className='w-4 h-4' />
								<span>{isRead ? 'Work Marked as Read (Click to toggle)' : 'Mark Work as Read'}</span>
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
