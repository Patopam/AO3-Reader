'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { db, type Fic } from '../../../lib/db';
import { ReaderView } from '../../../components/ReaderView';
import { ArrowLeft, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';

function FicPageContent() {
	const params = useParams();
	const router = useRouter();
	const idParam = params?.id as string | undefined;

	const [fic, setFic] = useState<Fic | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isCancelled = false;

		async function loadFic() {
			if (!idParam) {
				setError('Identificador de obra no válido.');
				setLoading(false);
				return;
			}

			const numericId = parseInt(idParam, 10);
			if (isNaN(numericId)) {
				setError('El ID de la obra debe ser un número.');
				setLoading(false);
				return;
			}

			try {
				setLoading(true);
				setError(null);

				// 1. Check local Dexie IndexedDB first (zero-latency instant load)
				const localFic = await db.fics.get(numericId);
				if (localFic && !isCancelled) {
					setFic(localFic);
					setLoading(false);
					return;
				}

				// 2. If not found locally, attempt cloud fallback via Supabase sync if configured
				try {
					const { fetchFicFromSupabase } = await import('../../../lib/syncEngine');
					const remoteFic = await fetchFicFromSupabase(numericId);
					if (remoteFic && !isCancelled) {
						setFic(remoteFic);
						setLoading(false);
						return;
					}
				} catch (syncErr) {
					console.warn('Cloud sync lookup skipped or failed:', syncErr);
				}

				if (!isCancelled) {
					setError(
						'No se encontró la obra solicitada. Es posible que haya sido eliminada o que pertenezca a otra sesión local.'
					);
					setLoading(false);
				}
			} catch (err: any) {
				if (!isCancelled) {
					console.error('Error loading fic:', err);
					setError(err.message || 'Error al cargar la obra desde la base de datos.');
					setLoading(false);
				}
			}
		}

		loadFic();

		return () => {
			isCancelled = true;
		};
	}, [idParam]);

	const handleBack = () => {
		if (window.history.length > 1) {
			router.back();
		} else {
			router.push('/');
		}
	};

	if (loading) {
		return (
			<div className='min-h-screen bg-white flex flex-col justify-center items-center p-6 text-center font-sans'>
				<div className='w-12 h-12 border-3 border-gray-200 border-t-[#990000] rounded-full animate-spin mb-4' />
				<h2 className='text-lg font-bold font-serif text-gray-900'>Cargando obra...</h2>
				<p className='text-xs text-gray-500 mt-1 max-w-sm'>
					Recuperando texto y metadatos desde el almacenamiento local...
				</p>
			</div>
		);
	}

	if (error || !fic) {
		return (
			<div className='min-h-screen bg-white flex flex-col justify-center items-center p-6 text-center font-sans'>
				<div className='bg-red-50 text-[#990000] p-4 rounded-full mb-4 border border-red-200'>
					<AlertCircle className='w-8 h-8' />
				</div>
				<h2 className='text-xl font-bold font-serif text-gray-900'>Obra no encontrada</h2>
				<p className='text-sm text-gray-600 mt-2 max-w-md'>{error || 'No se pudo encontrar la historia seleccionada.'}</p>
				<div className='mt-6 flex items-center space-x-3'>
					<Link
						href='/'
						className='px-4 py-2 bg-[#990000] hover:bg-[#800000] text-white font-bold rounded text-xs shadow-xs transition-colors flex items-center space-x-1.5'
					>
						<ArrowLeft className='w-3.5 h-3.5' />
						<span>Volver a la Biblioteca</span>
					</Link>
				</div>
			</div>
		);
	}

	return (
		<ReaderView
			fic={fic}
			onBack={handleBack}
			onFicUpdated={(updated) => setFic(updated)}
		/>
	);
}

export default function FicPage() {
	return (
		<Suspense
			fallback={
				<div className='min-h-screen bg-white flex flex-col justify-center items-center p-6 text-center font-sans'>
					<div className='w-12 h-12 border-3 border-gray-200 border-t-[#990000] rounded-full animate-spin mb-4' />
					<h2 className='text-lg font-bold font-serif text-gray-900'>Cargando obra...</h2>
				</div>
			}
		>
			<FicPageContent />
		</Suspense>
	);
}
