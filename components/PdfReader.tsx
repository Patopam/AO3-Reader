'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Fic } from '../lib/db';
import { getBookBlob, updateReadingProgress } from '../lib/db';
import * as pdfjsLib from 'pdfjs-dist';
import {
	ChevronLeft,
	ChevronRight,
	ZoomIn,
	ZoomOut,
	Maximize2,
	Minimize2,
	RotateCw,
	Layers,
	FileText,
	CheckCircle,
	Heart,
	ArrowLeft,
	Sliders,
} from 'lucide-react';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
	pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PdfReaderProps {
	fic: Fic;
	onBack: () => void;
	isFavorite: boolean;
	isRead: boolean;
	onToggleFavorite: () => void;
	onToggleRead: () => void;
}

export function PdfReader({
	fic,
	onBack,
	isFavorite,
	isRead,
	onToggleFavorite,
	onToggleRead,
}: PdfReaderProps) {
	const [pdfDoc, setPdfDoc] = useState<any>(null);
	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState<number>(fic.currentPdfPage || 1);
	const [scale, setScale] = useState<number>(1.2);
	const [rotation, setRotation] = useState<number>(0);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
	const [pageInput, setPageInput] = useState<string>(String(fic.currentPdfPage || 1));
	const [viewMode, setViewMode] = useState<'single' | 'scroll'>('single');

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const renderTaskRef = useRef<any>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);

	// Load PDF document from IndexedDB
	useEffect(() => {
		let isMounted = true;

		async function loadPdf() {
			try {
				setLoading(true);
				setError(null);

				let blob: Blob | null = null;
				if (fic.fileId) {
					blob = await getBookBlob(fic.fileId);
				}
				if (!blob && (fic as any).fileData) {
					blob = (fic as any).fileData;
				}

				if (!blob) {
					throw new Error('PDF file binary could not be found in local storage.');
				}

				const arrayBuffer = await blob.arrayBuffer();
				const doc = await pdfjsLib.getDocument({
					data: new Uint8Array(arrayBuffer),
					useSystemFonts: true,
				}).promise;

				if (isMounted) {
					setPdfDoc(doc);
					setNumPages(doc.numPages);
					const initialPage = Math.min(Math.max(1, fic.currentPdfPage || 1), doc.numPages);
					setCurrentPage(initialPage);
					setPageInput(String(initialPage));
					setLoading(false);
				}
			} catch (err: any) {
				console.error('Error loading PDF:', err);
				if (isMounted) {
					setError(err.message || 'Failed to load PDF document.');
					setLoading(false);
				}
			}
		}

		loadPdf();

		return () => {
			isMounted = false;
			if (renderTaskRef.current) {
				try {
					renderTaskRef.current.cancel();
				} catch {}
			}
		};
	}, [fic]);

	// Render current page in single mode
	const renderPage = useCallback(
		async (pageNum: number) => {
			if (!pdfDoc || !canvasRef.current) return;

			try {
				if (renderTaskRef.current) {
					try {
						renderTaskRef.current.cancel();
					} catch {}
				}

				const page = await pdfDoc.getPage(pageNum);
				const canvas = canvasRef.current;
				if (!canvas) return;

				const context = canvas.getContext('2d');
				if (!context) return;

				const viewport = page.getViewport({ scale, rotation });

				// Support HiDPI / Retina screens
				const outputScale = window.devicePixelRatio || 1;
				canvas.width = Math.floor(viewport.width * outputScale);
				canvas.height = Math.floor(viewport.height * outputScale);
				canvas.style.width = Math.floor(viewport.width) + 'px';
				canvas.style.height = Math.floor(viewport.height) + 'px';

				const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

				const renderContext = {
					canvasContext: context,
					transform,
					viewport,
				};

				renderTaskRef.current = page.render(renderContext);
				await renderTaskRef.current.promise;
			} catch (err: any) {
				if (err?.name !== 'RenderingCancelledException') {
					console.warn('PDF render error:', err);
				}
			}
		},
		[pdfDoc, scale, rotation]
	);

	useEffect(() => {
		if (viewMode === 'single' && !loading && pdfDoc) {
			renderPage(currentPage);
		}
	}, [viewMode, currentPage, scale, rotation, loading, pdfDoc, renderPage]);

	// Persist reading progress
	const handlePageChange = (newPage: number) => {
		if (newPage < 1 || newPage > numPages) return;
		setCurrentPage(newPage);
		setPageInput(String(newPage));

		if (fic.id && numPages > 0) {
			const progressPercent = Math.round((newPage / numPages) * 100);
			updateReadingProgress(fic.id, progressPercent, undefined, newPage);
		}
	};

	const handleZoomIn = () => setScale((prev) => Math.min(3.0, prev + 0.2));
	const handleZoomOut = () => setScale((prev) => Math.max(0.5, prev - 0.2));
	const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

	const handleFitWidth = () => {
		if (!containerRef.current || !pdfDoc) return;
		const containerWidth = containerRef.current.clientWidth - 48;
		pdfDoc.getPage(currentPage).then((page: any) => {
			const viewport = page.getViewport({ scale: 1.0, rotation });
			const targetScale = Math.max(0.5, Math.min(2.5, containerWidth / viewport.width));
			setScale(targetScale);
		});
	};

	const toggleFullscreen = () => {
		if (!document.fullscreenElement) {
			containerRef.current?.requestFullscreen?.();
			setIsFullscreen(true);
		} else {
			document.exitFullscreen?.();
			setIsFullscreen(false);
		}
	};

	return (
		<div
			ref={containerRef}
			className='flex-1 flex flex-col h-full bg-[#323639] text-gray-100 font-sans overflow-hidden select-none'
		>
			{/* Shared Header */}
			<header className='flex items-center justify-between px-4 md:px-6 py-2.5 bg-[#202124] border-b border-gray-700 shadow-sm z-20 text-xs'>
				<div className='flex items-center space-x-3 overflow-hidden'>
					<button
						onClick={onBack}
						className='flex items-center space-x-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold cursor-pointer transition-colors shadow-xs shrink-0'
					>
						<ArrowLeft className='w-4 h-4' />
						<span className='hidden sm:inline'>Works</span>
					</button>

					<div className='truncate'>
						<h2 className='font-bold text-sm text-gray-100 truncate font-serif'>{fic.title}</h2>
						<p className='text-[11px] text-gray-400 truncate'>
							by {fic.author} · <span className='text-rose-400 font-semibold uppercase'>PDF</span>
						</p>
					</div>
				</div>

				<div className='flex items-center space-x-2 shrink-0'>
					<button
						onClick={onToggleFavorite}
						title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
						className={`p-1.5 rounded border text-xs cursor-pointer transition-colors ${
							isFavorite
								? 'bg-red-950 border-red-800 text-red-400'
								: 'bg-gray-800 border-gray-700 text-gray-300 hover:text-red-400'
						}`}
					>
						<Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500' : ''}`} />
					</button>

					<button
						onClick={onToggleRead}
						title={isRead ? 'Mark as unread' : 'Mark as read'}
						className={`flex items-center space-x-1 px-2.5 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
							isRead
								? 'bg-green-950 border-green-800 text-green-300'
								: 'bg-gray-800 border-gray-700 text-gray-300 hover:text-green-300'
						}`}
					>
						<CheckCircle className={`w-3.5 h-3.5 ${isRead ? 'fill-green-900 text-green-400' : ''}`} />
						<span className='hidden sm:inline'>{isRead ? 'Read' : 'Mark Read'}</span>
					</button>
				</div>
			</header>

			{/* PDF Secondary Controls Toolbar */}
			<div className='flex flex-wrap items-center justify-between px-4 py-2 bg-[#282a2d] border-b border-gray-700 text-xs text-gray-200 gap-2 z-10'>
				{/* Pagination Controls */}
				<div className='flex items-center space-x-1.5'>
					<button
						disabled={currentPage <= 1 || loading}
						onClick={() => handlePageChange(currentPage - 1)}
						className='p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors'
						title='Previous Page'
					>
						<ChevronLeft className='w-4 h-4' />
					</button>

					<div className='flex items-center space-x-1'>
						<input
							type='number'
							min={1}
							max={numPages || 1}
							value={pageInput}
							onChange={(e) => setPageInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									const p = parseInt(pageInput, 10);
									if (!isNaN(p)) handlePageChange(p);
								}
							}}
							onBlur={() => {
								const p = parseInt(pageInput, 10);
								if (!isNaN(p)) handlePageChange(p);
								else setPageInput(String(currentPage));
							}}
							className='w-12 bg-gray-900 border border-gray-600 rounded px-1.5 py-0.5 text-center text-xs text-white focus:outline-none focus:border-red-500'
						/>
						<span className='text-gray-400'>/ {numPages || '–'}</span>
					</div>

					<button
						disabled={currentPage >= numPages || loading}
						onClick={() => handlePageChange(currentPage + 1)}
						className='p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors'
						title='Next Page'
					>
						<ChevronRight className='w-4 h-4' />
					</button>
				</div>

				{/* Zoom & View Controls */}
				<div className='flex items-center space-x-2'>
					<button
						onClick={handleZoomOut}
						className='p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer transition-colors'
						title='Zoom Out'
					>
						<ZoomOut className='w-3.5 h-3.5' />
					</button>

					<span className='text-[11px] font-mono text-gray-300 w-12 text-center'>
						{Math.round(scale * 100)}%
					</span>

					<button
						onClick={handleZoomIn}
						className='p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer transition-colors'
						title='Zoom In'
					>
						<ZoomIn className='w-3.5 h-3.5' />
					</button>

					<button
						onClick={handleFitWidth}
						className='px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px] font-semibold text-gray-200 cursor-pointer transition-colors hidden sm:block'
						title='Fit to Width'
					>
						Fit Width
					</button>

					<button
						onClick={handleRotate}
						className='p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer transition-colors hidden sm:block'
						title='Rotate Clockwise'
					>
						<RotateCw className='w-3.5 h-3.5' />
					</button>

					<button
						onClick={toggleFullscreen}
						className='p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer transition-colors'
						title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
					>
						{isFullscreen ? <Minimize2 className='w-3.5 h-3.5' /> : <Maximize2 className='w-3.5 h-3.5' />}
					</button>
				</div>
			</div>

			{/* Main Reading Canvas Container */}
			<div className='flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start'>
				{loading ? (
					<div className='flex flex-col items-center justify-center h-64 space-y-3 text-gray-400'>
						<div className='w-8 h-8 border-3 border-gray-500 border-t-red-500 rounded-full animate-spin' />
						<p className='text-sm font-medium'>Loading PDF document...</p>
					</div>
				) : error ? (
					<div className='max-w-md bg-red-950/50 border border-red-700 p-6 rounded-lg text-center space-y-3 mt-12'>
						<p className='text-red-300 font-bold text-sm'>Could not open PDF</p>
						<p className='text-xs text-red-200'>{error}</p>
						<button
							onClick={onBack}
							className='px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded font-bold text-xs'
						>
							Return to Library
						</button>
					</div>
				) : (
					<div className='shadow-2xl rounded-xs bg-white flex justify-center overflow-hidden transition-all'>
						<canvas ref={canvasRef} className='max-w-none block' />
					</div>
				)}
			</div>
		</div>
	);
}
