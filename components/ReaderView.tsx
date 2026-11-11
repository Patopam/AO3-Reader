'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { Fic, FicChapter } from '../lib/db';
import { db, updateReadingProgress, getReadingProgress } from '../lib/db';
import { escapeRegex } from '../lib/epubParser';
import { PdfReader } from './PdfReader';
import { FicDetailsModal } from './FicDetailsModal';
import {
	ArrowLeft,
	Heart,
	CheckCircle,
	Sliders,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Sun,
	Coffee,
	Info,
} from 'lucide-react';

interface ReaderViewProps {
	fic: Fic;
	onBack: () => void;
	onFicUpdated?: (updated: Fic) => void;
}

type ReaderTheme = 'default' | 'sepia' | 'dark';
type ReaderWidth = 'compact' | 'normal' | 'wide' | 'full';
type ReaderFont = 'serif' | 'sans' | 'mono';

export function ReaderView({ fic: initialFic, onBack, onFicUpdated }: ReaderViewProps) {
	const [fic, setFic] = useState<Fic>(initialFic);

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
					const updated = { ...fic, isFavorite: next };
					setFic(updated);
					if (onFicUpdated) onFicUpdated(updated);
				}}
				onToggleRead={async () => {
					if (!fic.id) return;
					const next = !fic.isRead;
					await db.fics.update(fic.id, { isRead: next, readingProgress: next ? 100 : fic.readingProgress });
					const updated = { ...fic, isRead: next };
					setFic(updated);
					if (onFicUpdated) onFicUpdated(updated);
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
	const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);

	// Customization settings
	const [fontSize, setFontSize] = useState<number>(18);
	const [fontFamily, setFontFamily] = useState<ReaderFont>('serif');
	const [theme, setTheme] = useState<ReaderTheme>('default');
	const [contentWidth, setContentWidth] = useState<ReaderWidth>('normal');
	const [lineHeight] = useState<number>(1.75);

	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	// Load chapters cleanly
	useEffect(() => {
		async function loadChapters() {
			setLoading(true);
			const rawChapters: FicChapter[] =
				fic.chapters && fic.chapters.length > 0
					? fic.chapters
					: [{ title: 'Capítulo 1', content: fic.fullTextContent || '<p>No se encontró contenido.</p>' }];

			const safeTitleRegex = new RegExp(`^${escapeRegex(fic.title)}[\\s\\S]*?\\bby\\b.*?\\n+`, 'i');

			const cleanedChapters = rawChapters.map((chap, idx) => {
				if (idx === 0) {
					let cleaned = chap.content;
					cleaned = cleaned.replace(safeTitleRegex, '').trim();
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

	// Restore saved scroll position for current chapter or entire work
	const restoredScrollRef = useRef(false);
	const scrollDebounceRef = useRef<any>(null);

	// Fetch saved reading_progress record from Dexie on mount
	useEffect(() => {
		async function restorePosition() {
			if (!fic.id) return;
			try {
				const saved = await getReadingProgress(fic.id);
				if (saved && saved.scrollPosition && saved.scrollPosition > 0 && !restoredScrollRef.current) {
					restoredScrollRef.current = true;
					setTimeout(() => {
						if (scrollContainerRef.current) {
							scrollContainerRef.current.scrollTop = saved.scrollPosition!;
						}
					}, 80);
				} else if (fic.currentScrollPosition && fic.currentScrollPosition > 0 && !restoredScrollRef.current) {
					restoredScrollRef.current = true;
					setTimeout(() => {
						if (scrollContainerRef.current) {
							scrollContainerRef.current.scrollTop = fic.currentScrollPosition!;
						}
					}, 80);
				}
			} catch (err) {
				console.warn('Could not restore reading position:', err);
			}
		}

		if (!loading) {
			restorePosition();
		}
	}, [loading, fic.id, fic.currentScrollPosition]);

	// Auto-save reading position and scroll offset on user scroll
	const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
		if (!fic.id || chapters.length === 0) return;

		const target = e.currentTarget;
		const { scrollTop, scrollHeight, clientHeight } = target;

		if (scrollDebounceRef.current) {
			clearTimeout(scrollDebounceRef.current);
		}

		scrollDebounceRef.current = setTimeout(() => {
			const maxScroll = Math.max(1, scrollHeight - clientHeight);
			const scrollRatio = Math.min(1, Math.max(0, scrollTop / maxScroll));

			let totalProgress = 0;
			if (viewMode === 'chapters') {
				const baseChapterProgress = (currentChapterIdx / chapters.length) * 100;
				const chapterShare = (1 / chapters.length) * scrollRatio * 100;
				totalProgress = Math.min(100, Math.round(baseChapterProgress + chapterShare));
			} else {
				totalProgress = Math.min(100, Math.round(scrollRatio * 100));
			}

			// Automatically save to Dexie reading_progress table and sync to Supabase
			updateReadingProgress(
				fic.id!,
				totalProgress,
				currentChapterIdx,
				undefined,
				scrollTop,
				scrollRatio
			);

			if (onFicUpdated) {
				onFicUpdated({
					...fic,
					readingProgress: totalProgress,
					currentChapterIdx,
					currentScrollPosition: Math.round(scrollTop),
					currentScrollRatio: scrollRatio,
					lastReadAt: Date.now(),
				});
			}
		}, 300);
	};

	// Auto-save reading position on chapter change
	const handleChapterChange = (newIdx: number) => {
		if (newIdx < 0 || newIdx >= chapters.length) return;
		setCurrentChapterIdx(newIdx);
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollTop = 0;
		}

		if (fic.id && chapters.length > 0) {
			const progressPercent = Math.round(((newIdx + 1) / chapters.length) * 100);
			updateReadingProgress(fic.id, progressPercent, newIdx, undefined, 0, 0);
			if (onFicUpdated) {
				onFicUpdated({
					...fic,
					readingProgress: progressPercent,
					currentChapterIdx: newIdx,
					currentScrollPosition: 0,
					currentScrollRatio: 0,
					lastReadAt: Date.now(),
				});
			}
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
		const updated = { ...fic, isRead: next, readingProgress: next ? 100 : fic.readingProgress };
		setFic(updated);
		if (onFicUpdated) onFicUpdated(updated);
	};

	const handleToggleFavorite = async () => {
		if (!fic.id) return;
		const next = !isFavorite;
		await db.fics.update(fic.id, { isFavorite: next });
		setIsFavorite(next);
		const updated = { ...fic, isFavorite: next };
		setFic(updated);
		if (onFicUpdated) onFicUpdated(updated);
	};

	// Theme color schemes (All light/comfortable, no dark buttons)
	const getThemeClasses = () => {
		switch (theme) {
			case 'sepia':
				return {
					bg: 'bg-[#fbf4e8]',
					text: 'text-[#443525]',
					headerBg: 'bg-[#f4ebd9] border-[#e2d5bf]',
					navBg: 'bg-[#eee4cf] border-[#e2d5bf]',
					accent: 'text-[#8b2500]',
					box: 'bg-[#f5ecdc] border-[#e2d5bf]',
				};
			case 'dark':
				return {
					bg: 'bg-[#f5f5f5]',
					text: 'text-gray-900',
					headerBg: 'bg-white border-gray-200',
					navBg: 'bg-gray-100 border-gray-200',
					accent: 'text-[#990000]',
					box: 'bg-white border-gray-200',
				};
			default:
				return {
					bg: 'bg-white',
					text: 'text-gray-900',
					headerBg: 'bg-[#fafafa] border-gray-200',
					navBg: 'bg-[#f5f5f5] border-gray-200',
					accent: 'text-[#990000]',
					box: 'bg-[#fafafa] border-gray-200',
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

	/**
	 * Renders chapter text safely:
	 * Supports rich HTML paragraphs, keeping italics ONLY where specified by author (<em>, <i>),
	 * with normal font style for all base text.
	 * Resets blockquote italics to prevent inherited global italic bug.
	 */
	const renderChapterBody = (content: string) => {
		if (!content) return null;

		// If content already contains HTML tags like <p>, render HTML cleanly
		if (content.includes('<p>') || content.includes('<div>') || content.includes('<br')) {
			return (
				<div
					style={{ fontSize: `${fontSize}px`, lineHeight }}
					className='font-normal not-italic text-gray-900 font-serif leading-relaxed [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:font-normal [&_p]:not-italic [&_em]:italic [&_i]:italic [&_strong]:font-bold [&_b]:font-bold [&_blockquote]:border-l-3 [&_blockquote]:border-[#990000] [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:not-italic [&_blockquote]:font-normal [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_h4]:font-bold [&_a]:text-[#990000] [&_a]:underline'
					dangerouslySetInnerHTML={{ __html: content }}
				/>
			);
		}

		// Fallback for plain text: split by double newlines into clean paragraphs
		const paragraphs = content.split(/\n\n+/).filter(Boolean);
		return (
			<div style={{ fontSize: `${fontSize}px`, lineHeight }} className='space-y-4 font-normal not-italic'>
				{paragraphs.map((p, i) => (
					<p key={i} className='mb-4 leading-relaxed font-normal not-italic text-gray-900'>
						{p.trim()}
					</p>
				))}
			</div>
		);
	};

	return (
		<div className={`flex-1 flex flex-col h-full ${themeCls.bg} ${themeCls.text} font-sans overflow-hidden`}>
			{/* Reader Top Navbar (Clean light aesthetic, zero dark buttons) */}
			<header
				className={`flex items-center justify-between px-4 md:px-8 py-2.5 border-b ${themeCls.headerBg} z-20 text-xs shadow-xs`}
			>
				<div className='flex items-center space-x-3 overflow-hidden'>
					<button
						onClick={onBack}
						className='flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded font-bold cursor-pointer transition-colors shadow-xs shrink-0'
					>
						<ArrowLeft className='w-4 h-4' />
						<span className='hidden sm:inline'>Obras</span>
					</button>

					<div className='truncate'>
						<h2 className='font-bold text-sm truncate font-serif text-[#990000]'>{fic.title}</h2>
						<p className='text-[11px] text-gray-600 truncate'>
							por <span className='font-semibold text-gray-900'>{fic.author}</span>
						</p>
					</div>
				</div>

				<div className='flex items-center space-x-2 shrink-0'>
					{/* Chapter vs Entire Work Mode Switcher */}
					{chapters.length > 1 && (
						<button
							onClick={() => setViewMode(viewMode === 'chapters' ? 'entire' : 'chapters')}
							className='px-2.5 py-1.5 bg-white hover:bg-red-50 border border-gray-300 text-[#990000] rounded font-semibold text-xs cursor-pointer transition-colors shadow-xs hidden sm:inline-flex items-center space-x-1'
						>
							<BookOpen className='w-3.5 h-3.5 text-[#990000]' />
							<span>{viewMode === 'chapters' ? 'Toda la obra' : 'Por capítulos'}</span>
						</button>
					)}

					{/* View Details Modal Button */}
					<button
						onClick={() => setShowDetailsModal(true)}
						title='Ver detalles y resumen de la obra'
						className='flex items-center space-x-1 px-2.5 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:text-[#990000] hover:bg-gray-50 transition-colors cursor-pointer text-xs font-semibold shadow-xs'
					>
						<Info className='w-3.5 h-3.5 text-gray-500' />
						<span className='hidden md:inline'>Detalles</span>
					</button>

					{/* Display Settings Toggle */}
					<button
						onClick={() => setShowSettings(!showSettings)}
						title='Ajustes de visualización'
						className={`p-1.5 rounded border transition-colors cursor-pointer ${
							showSettings
								? 'bg-red-50 border-red-300 text-[#990000]'
								: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
						}`}
					>
						<Sliders className='w-4 h-4' />
					</button>

					{/* Favorite Toggle */}
					<button
						onClick={handleToggleFavorite}
						title={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
						className={`p-1.5 rounded border transition-colors cursor-pointer ${
							isFavorite
								? 'bg-red-50 border-red-300 text-red-600'
								: 'bg-white border-gray-300 text-gray-400 hover:text-red-600 hover:bg-gray-50'
						}`}
					>
						<Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-600 text-red-600' : ''}`} />
					</button>

					{/* Mark Read Toggle */}
					<button
						onClick={handleToggleRead}
						title={isRead ? 'Marcar como no leído' : 'Marcar como leído'}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
							isRead
								? 'bg-emerald-50 border-emerald-300 text-emerald-800'
								: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
						}`}
					>
						<CheckCircle
							className={`w-3.5 h-3.5 ${isRead ? 'fill-emerald-100 text-emerald-600' : 'text-gray-400'}`}
						/>
						<span className='hidden md:inline'>{isRead ? 'Leído' : 'Marcar leído'}</span>
					</button>
				</div>
			</header>

			{/* Display Settings Toolbar */}
			{showSettings && (
				<div
					className={`border-b ${themeCls.navBg} px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs z-10 shadow-inner`}
				>
					{/* Font Size */}
					<div className='flex items-center space-x-2'>
						<span className='font-bold text-gray-700'>Tamaño:</span>
						<button
							onClick={() => setFontSize((s) => Math.max(14, s - 1))}
							className='px-2.5 py-1 bg-white border border-gray-300 rounded font-bold text-gray-700 hover:bg-gray-50 cursor-pointer shadow-xs'
						>
							A-
						</button>
						<span className='font-mono w-6 text-center text-gray-800'>{fontSize}</span>
						<button
							onClick={() => setFontSize((s) => Math.min(26, s + 1))}
							className='px-2.5 py-1 bg-white border border-gray-300 rounded font-bold text-gray-700 hover:bg-gray-50 cursor-pointer shadow-xs'
						>
							A+
						</button>
					</div>

					{/* Font Family */}
					<div className='flex items-center space-x-1'>
						<span className='font-bold text-gray-700 mr-1'>Tipografía:</span>
						<button
							onClick={() => setFontFamily('serif')}
							className={`px-3 py-1 rounded border font-serif cursor-pointer transition-colors ${
								fontFamily === 'serif'
									? 'bg-[#990000] text-white border-[#990000] font-bold'
									: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
							}`}
						>
							Serif
						</button>
						<button
							onClick={() => setFontFamily('sans')}
							className={`px-3 py-1 rounded border font-sans cursor-pointer transition-colors ${
								fontFamily === 'sans'
									? 'bg-[#990000] text-white border-[#990000] font-bold'
									: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
							}`}
						>
							Sans
						</button>
						<button
							onClick={() => setFontFamily('mono')}
							className={`px-3 py-1 rounded border font-mono cursor-pointer transition-colors ${
								fontFamily === 'mono'
									? 'bg-[#990000] text-white border-[#990000] font-bold'
									: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
							}`}
						>
							Mono
						</button>
					</div>

					{/* Themes */}
					<div className='flex items-center space-x-2'>
						<span className='font-bold text-gray-700 mr-1'>Tema:</span>
						<button
							onClick={() => setTheme('default')}
							className={`px-2.5 py-1 rounded border text-xs cursor-pointer flex items-center space-x-1 ${
								theme === 'default'
									? 'bg-[#990000] text-white border-[#990000] font-bold'
									: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
							}`}
						>
							<Sun className='w-3.5 h-3.5' />
							<span>Blanco</span>
						</button>
						<button
							onClick={() => setTheme('sepia')}
							className={`px-2.5 py-1 rounded border text-xs cursor-pointer flex items-center space-x-1 ${
								theme === 'sepia'
									? 'bg-[#8b2500] text-white border-[#8b2500] font-bold'
									: 'bg-[#f4ebd9] border-[#e2d5bf] text-[#443525] hover:bg-[#eee4cf]'
							}`}
						>
							<Coffee className='w-3.5 h-3.5' />
							<span>Sepia</span>
						</button>
					</div>

					{/* Width */}
					<div className='flex items-center space-x-1'>
						<span className='font-bold text-gray-700 mr-1'>Ancho:</span>
						{(['compact', 'normal', 'wide', 'full'] as ReaderWidth[]).map((w) => (
							<button
								key={w}
								onClick={() => setContentWidth(w)}
								className={`px-2.5 py-1 rounded capitalize border cursor-pointer transition-colors ${
									contentWidth === w
										? 'bg-[#990000] text-white border-[#990000] font-bold'
										: 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
								}`}
							>
								{w === 'compact' ? 'Estrecho' : w === 'normal' ? 'Normal' : w === 'wide' ? 'Ancho' : 'Completo'}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Chapter Navigation Bar (In chapter mode) */}
			{viewMode === 'chapters' && chapters.length > 1 && (
				<div
					className={`border-b ${themeCls.navBg} px-4 md:px-8 py-2 flex justify-between items-center text-xs shrink-0`}
				>
					<button
						disabled={currentChapterIdx === 0}
						onClick={() => handleChapterChange(currentChapterIdx - 1)}
						className='flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30 cursor-pointer transition-colors shadow-xs'
					>
						<ChevronLeft className='w-3.5 h-3.5' />
						<span>Capítulo anterior</span>
					</button>

					<div className='flex items-center space-x-2'>
						<select
							value={currentChapterIdx}
							onChange={(e) => handleChapterChange(parseInt(e.target.value, 10))}
							className='bg-white border border-gray-300 rounded px-3 py-1 font-semibold text-xs cursor-pointer focus:outline-none focus:border-[#990000] text-gray-800'
						>
							{chapters.map((chap, idx) => (
								<option key={idx} value={idx}>
									{idx + 1}. {chap.title}
								</option>
							))}
						</select>
						<span className='text-gray-500 font-mono text-[11px] hidden sm:inline'>
							({currentChapterIdx + 1} de {chapters.length})
						</span>
					</div>

					<button
						disabled={currentChapterIdx === chapters.length - 1}
						onClick={() => handleChapterChange(currentChapterIdx + 1)}
						className='flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30 cursor-pointer transition-colors shadow-xs'
					>
						<span>Siguiente capítulo</span>
						<ChevronRight className='w-3.5 h-3.5' />
					</button>
				</div>
			)}

			{/* Reader Content Body (Pure book content without injected summary clutter) */}
			<div
				ref={scrollContainerRef}
				onScroll={handleContentScroll}
				className='flex-1 overflow-y-auto p-4 md:p-12'
			>
				{loading ? (
					<div className='flex justify-center items-center h-64 text-gray-500 font-medium'>
						Cargando texto de la obra...
					</div>
				) : (
					<div className={`${getWidthClass()} mx-auto space-y-8 ${getFontClass()} leading-relaxed`}>
						{/* Story Chapter Content (Clean typography, normal font style, preserved formatting) */}
						{viewMode === 'chapters' ? (
							<article className='space-y-6'>
								<h3 className={`text-center font-bold text-xl md:text-2xl mb-8 ${themeCls.accent} font-serif`}>
									{chapters[currentChapterIdx]?.title}
								</h3>
								{renderChapterBody(chapters[currentChapterIdx]?.content || '')}
							</article>
						) : (
							<div className='space-y-14'>
								{chapters.map((chap, idx) => (
									<article key={idx} className='border-t border-gray-300 pt-8 space-y-6'>
										<h3 className={`text-center font-bold text-xl md:text-2xl mb-6 ${themeCls.accent} font-serif`}>
											{chap.title}
										</h3>
										{renderChapterBody(chap.content)}
									</article>
								))}
							</div>
						)}

						{/* Bottom Chapter Navigation Bar (In chapter mode) */}
						{viewMode === 'chapters' && chapters.length > 1 && (
							<div className='pt-10 flex justify-between items-center text-xs font-sans'>
								<button
									disabled={currentChapterIdx === 0}
									onClick={() => handleChapterChange(currentChapterIdx - 1)}
									className='flex items-center space-x-1.5 px-4 py-2 bg-white border border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors'
								>
									<ChevronLeft className='w-4 h-4' />
									<span>Capítulo anterior</span>
								</button>

								<span className='font-semibold text-gray-500 font-mono'>
									Capítulo {currentChapterIdx + 1} de {chapters.length}
								</span>

								<button
									disabled={currentChapterIdx === chapters.length - 1}
									onClick={() => handleChapterChange(currentChapterIdx + 1)}
									className='flex items-center space-x-1.5 px-4 py-2 bg-white border border-gray-300 rounded font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors'
								>
									<span>Siguiente capítulo</span>
									<ChevronRight className='w-4 h-4' />
								</button>
							</div>
						)}

						{/* Bottom Mark as Read Card (NO DARK BUTTONS - uses clean AO3 red or emerald) */}
						<div className='mt-16 pt-8 border-t border-gray-300 flex flex-col items-center space-y-3 font-sans pb-12'>
							<p className='text-xs text-gray-600'>¿Terminaste de leer esta obra?</p>
							<button
								onClick={handleToggleRead}
								className={`px-6 py-2.5 rounded font-bold text-xs cursor-pointer transition-colors shadow-xs flex items-center space-x-2 ${
									isRead
										? 'bg-emerald-600 hover:bg-emerald-700 text-white'
										: 'bg-[#990000] hover:bg-[#800000] text-white'
								}`}
							>
								<CheckCircle className='w-4 h-4' />
								<span>{isRead ? 'Obra marcada como leída (Clic para desmarcar)' : 'Marcar obra como leída'}</span>
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Details Modal on Demand */}
			<FicDetailsModal
				fic={fic}
				isOpen={showDetailsModal}
				onClose={() => setShowDetailsModal(false)}
				onStartReading={(selected, chapterIdx) => {
					if (chapterIdx !== undefined) {
						handleChapterChange(chapterIdx);
					}
					setShowDetailsModal(false);
				}}
				onFicUpdated={(updated) => {
					setFic(updated);
					if (onFicUpdated) onFicUpdated(updated);
				}}
			/>
		</div>
	);
}
