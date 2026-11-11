'use client';

import React, { useState } from 'react';
import { useSyncEngine } from '../lib/syncEngine';
import { AuthModal } from './AuthModal';
import {
	Cloud,
	CloudCheck,
	RefreshCw,
	User as UserIcon,
	AlertCircle,
	WifiOff,
	HardDrive,
} from 'lucide-react';

export function SyncHeader() {
	const { status, user, lastSyncTime, syncNow, isConfigured } = useSyncEngine();
	const [isAuthOpen, setIsAuthOpen] = useState(false);
	const [isSyncingManual, setIsSyncingManual] = useState(false);

	const handleManualSync = async () => {
		setIsSyncingManual(true);
		try {
			await syncNow();
		} finally {
			setIsSyncingManual(false);
		}
	};

	const formatLastSync = (ts: number | null) => {
		if (!ts) return null;
		const date = new Date(ts);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();
		if (isToday) {
			return `Hoy a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		}
		return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
	};

	return (
		<>
			<div className='flex items-center space-x-2'>
				{/* Sync Status Badge */}
				<button
					type='button'
					onClick={() => setIsAuthOpen(true)}
					title={
						!isConfigured
							? 'Modo local (IndexedDB). Configura Supabase para sincronización multi-dispositivo.'
							: user
							? `Conectado como ${user.email}. ${lastSyncTime ? `Última sinc: ${formatLastSync(lastSyncTime)}` : ''}`
							: 'Haz clic para iniciar sesión y sincronizar entre dispositivos.'
					}
					className='flex items-center space-x-1.5 px-2.5 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer'
				>
					{status === 'syncing' || isSyncingManual ? (
						<>
							<RefreshCw className='w-3.5 h-3.5 text-blue-600 animate-spin' />
							<span className='hidden sm:inline text-blue-700'>Sincronizando...</span>
						</>
					) : status === 'synced' && user ? (
						<>
							<span className='w-2 h-2 rounded-full bg-emerald-500 shrink-0' />
							<span className='hidden sm:inline text-emerald-800 font-medium'>
								{lastSyncTime ? formatLastSync(lastSyncTime) : 'Sincronizado'}
							</span>
						</>
					) : status === 'offline' ? (
						<>
							<WifiOff className='w-3.5 h-3.5 text-gray-400' />
							<span className='hidden sm:inline text-gray-600'>Sin conexión</span>
						</>
					) : status === 'error' ? (
						<>
							<span className='w-2 h-2 rounded-full bg-red-500 shrink-0' />
							<span className='hidden sm:inline text-red-700'>Error de sinc</span>
						</>
					) : (
						<>
							<HardDrive className='w-3.5 h-3.5 text-gray-500' />
							<span className='hidden sm:inline text-gray-700'>Modo local</span>
						</>
					)}

					<span className='text-gray-400'>·</span>
					<Cloud className='w-3.5 h-3.5 text-[#990000]' />
					<span className='text-[#990000] font-bold hidden md:inline'>
						{user ? user.email?.split('@')[0] : 'Nube'}
					</span>
				</button>

				{/* Quick Sync Now Button (when logged in) */}
				{user && (
					<button
						type='button'
						onClick={handleManualSync}
						disabled={isSyncingManual || status === 'syncing'}
						title='Sincronizar ahora con la nube'
						className='p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 hover:text-[#990000] transition-colors cursor-pointer disabled:opacity-50'
					>
						<RefreshCw className={`w-3.5 h-3.5 ${isSyncingManual ? 'animate-spin text-[#990000]' : ''}`} />
					</button>
				)}
			</div>

			{/* Cloud & Auth Modal */}
			<AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
		</>
	);
}
