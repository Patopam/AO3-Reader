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
	CheckCircle,
	Heart,
	ArrowLeft,
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
					throw new Error('No se encontró el archivo binario del PDF en el almacenamiento local.');
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
				console.error('Error al cargar PDF:', err);
				if (isMounted) {
					setError(err.message || 'No se pudo abrir el documento PDF.');
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

	// Render current page
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
		if (!loading && pdfDoc) {
			renderPage(currentPage);
		}
	}, [currentPage, scale, rotation, loading, pdfDoc, renderPage]);

	const handlePageChange = (newPage: number) => {
		if (newPage < 1 || newPage > numPages) return;
		setCurrentPage(newPage);
		setPageInput(String(newPage));

		if (fic.id && numPages > 0) {
			const progressPercent = Math.round((newPage / numPages) * 100);
			updateReadingProgress(fic.id, progressPercent, undefined, newPage);
		}
	};

	const handleZoomIn = () => setScale((prev) => Math.min(2.5, prev + 0.2));
	const handleZoomOut = () => setScale((prev) => Math.max(0.6, prev - 0.2));
	const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

	const handleFitWidth = () => {
		if (!containerRef.current || !pdfDoc) return;
		const containerWidth = containerRef.current.clientWidth - 64;
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
			className='flex-1 flex flex-col h-full bg-[#f4f5f7] text-gray-800 font-sans overflow-hidden select-none'
		>
			{/* Shared Light Header Bar */}
			<header className='flex items-center justify-between px-4 md:px-8 py-2.5 bg-white border-b border-gray-200 shadow-xs z-20 text-xs'>
				<div className='flex items-center space-x-3 overflow-hidden'>
					<button
						onClick={onBack}
						className='flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 rounded font-bold cursor-pointer transition-colors shadow-xs shrink-0'
					>
						<ArrowLeft className='w-4 h-4' />
						<span className='hidden sm:inline'>Obras</span>
					</button>

					<div className='truncate'>
						<h2 className='font-bold text-sm text-gray-900 truncate font-serif'>{fic.title}</h2>
						<p className='text-[11px] text-gray-500 truncate'>
							por {fic.author} · <span className='text-rose-600 font-semibold uppercase'>PDF</span>
						</p>
					</div>
				</div>

				<div className='flex items-center space-x-2 shrink-0'>
					<button
						onClick={onToggleFavorite}
						title={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
						className={`p-1.5 rounded border text-xs cursor-pointer transition-colors ${
							isFavorite
								? 'bg-red-50 border-red-300 text-red-600'
								: 'bg-white hover:bg-gray-50 border-gray-300 text-gray-400 hover:text-red-600'
						}`}
					>
						<Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-600' : ''}`} />
					</button>

					<button
						onClick={onToggleRead}
						title={isRead ? 'Marcar como no leído' : 'Marcar como leído'}
						className={`flex items-center space-x-1 px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
							isRead
								? 'bg-emerald-50 border-emerald-300 text-emerald-800'
								: 'bg-white hover:bg-gray-50 border-gray-300 text-gray-700 hover:text-emerald-700'
						}`}
					>
						<CheckCircle
							className={`w-3.5 h-3.5 ${isRead ? 'fill-emerald-100 text-emerald-600' : 'text-gray-400'}`}
						/>
						<span className='hidden sm:inline'>{isRead ? 'Leído' : 'Marcar leído'}</span>
					</button>
				</div>
			</header>

			{/* PDF Secondary Controls Toolbar (Clean light styling, zero dark buttons) */}
			<div className='flex flex-wrap items-center justify-between px-4 md:px-8 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-700 gap-2 z-10'>
				{/* Pagination Controls */}
				<div className='flex items-center space-x-1.5'>
					<button
						disabled={currentPage <= 1 || loading}
						onClick={() => handlePageChange(currentPage - 1)}
						className='p-1.5 rounded bg-white hover:bg-gray-100 border border-gray-300 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors text-gray-700 shadow-xs'
						title='Página anterior'
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
							className='w-12 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-center text-xs text-gray-800 focus:outline-none focus:border-[#990000]'
						/>
						<span className='text-gray-500 font-mono'>/ {numPages || '–'}</span>
					</div>

					<button
						disabled={currentPage >= numPages || loading}
						onClick={() => handlePageChange(currentPage + 1)}
						className='p-1.5 rounded bg-white hover:bg-gray-100 border border-gray-300 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors text-gray-700 shadow-xs'
						title='Página siguiente'
					>
						<ChevronRight className='w-4 h-4' />
					</button>
				</div>

				{/* Zoom & View Controls (All clean light buttons) */}
				<div className='flex items-center space-x-2'>
					<button
						onClick={handleZoomOut}
						className='p-1.5 rounded bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 cursor-pointer transition-colors shadow-xs'
						title='Reducir zoom'
					>
						<ZoomOut className='w-3.5 h-3.5' />
					</button>

					<span className='text-[11px] font-mono text-gray-700 w-12 text-center'>
						{Math.round(scale * 100)}%
					</span>

					<button
						onClick={handleZoomIn}
						className='p-1.5 rounded bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 cursor-pointer transition-colors shadow-xs'
						title='Aumentar zoom'
					>
						<ZoomIn className='w-3.5 h-3.5' />
					</button>

					<button
						onClick={handleFitWidth}
						className='px-2.5 py-1 rounded bg-white hover:bg-gray-100 border border-gray-300 text-[11px] font-semibold text-gray-700 cursor-pointer transition-colors shadow-xs hidden sm:block'
						title='Ajustar al ancho'
					>
						Ajustar ancho
					</button>

					<button
						onClick={handleRotate}
						className='p-1.5 rounded bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 cursor-pointer transition-colors shadow-xs hidden sm:block'
						title='Girar página'
					>
						<RotateCw className='w-3.5 h-3.5' />
					</button>

					<button
						onClick={toggleFullscreen}
						className='p-1.5 rounded bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 cursor-pointer transition-colors shadow-xs'
						title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
					>
						{isFullscreen ? <Minimize2 className='w-3.5 h-3.5' /> : <Maximize2 className='w-3.5 h-3.5' />}
					</button>
				</div>
			</div>

			{/* Main Canvas Container (Soft light neutral canvas background) */}
			<div className='flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start'>
				{loading ? (
					<div className='flex flex-col items-center justify-center h-64 space-y-3 text-gray-500'>
						<div className='w-8 h-8 border-3 border-gray-300 border-t-[#990000] rounded-full animate-spin' />
						<p className='text-sm font-medium'>Cargando documento PDF...</p>
					</div>
				) : error ? (
					<div className='max-w-md bg-white border border-red-200 p-6 rounded-lg text-center space-y-3 mt-12 shadow-md'>
						<p className='text-red-700 font-bold text-sm'>No se pudo abrir el PDF</p>
						<p className='text-xs text-gray-600'>{error}</p>
						<button
							onClick={onBack}
							className='px-4 py-2 bg-[#990000] hover:bg-[#800000] text-white rounded font-bold text-xs cursor-pointer'
						>
							Volver a la biblioteca
						</button>
					</div>
				) : (
					<div className='shadow-lg rounded-xs bg-white flex justify-center overflow-hidden border border-gray-300'>
						<canvas ref={canvasRef} className='max-w-none block' />
					</div>
				)}
			</div>
		</div>
	);
}
