'use client';

import React, { useState } from 'react';
import {
	sendMagicLink,
	signInWithPassword,
	signUpWithPassword,
	signOutUser,
	isSupabaseConfigured,
} from '../lib/supabase';
import { useSyncEngine } from '../lib/syncEngine';
import {
	X,
	Cloud,
	CloudCheck,
	RefreshCw,
	Mail,
	Lock,
	CheckCircle,
	AlertCircle,
	ArrowUpCircle,
	LogOut,
	ShieldCheck,
} from 'lucide-react';

interface AuthModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
	const { user, status, lastSyncTime, syncNow, migrateLocalToCloud, isConfigured } = useSyncEngine();

	const [mode, setMode] = useState<'magic-link' | 'password' | 'signup'>('magic-link');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
	const [migrationResult, setMigrationResult] = useState<string | null>(null);

	if (!isOpen) return null;

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email.trim()) return;

		setLoading(true);
		setMessage(null);
		try {
			await sendMagicLink(email.trim());
			setMessage({
				text: '¡Enlace mágico enviado! Revisa tu bandeja de entrada para iniciar sesión automáticamente.',
				type: 'success',
			});
		} catch (err: any) {
			setMessage({
				text: err.message || 'Error al enviar el enlace de inicio de sesión.',
				type: 'error',
			});
		} finally {
			setLoading(false);
		}
	};

	const handlePasswordAuth = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email.trim() || !password) return;

		setLoading(true);
		setMessage(null);
		try {
			if (mode === 'signup') {
				await signUpWithPassword(email.trim(), password);
				setMessage({
					text: 'Cuenta creada. Revisa tu correo electrónico para confirmar el registro.',
					type: 'success',
				});
			} else {
				await signInWithPassword(email.trim(), password);
				setMessage({
					text: 'Sesión iniciada con éxito.',
					type: 'success',
				});
				await syncNow();
			}
		} catch (err: any) {
			setMessage({
				text: err.message || 'Error al procesar la autenticación.',
				type: 'error',
			});
		} finally {
			setLoading(false);
		}
	};

	const handleMigrate = async () => {
		setLoading(true);
		setMigrationResult(null);
		try {
			const res = await migrateLocalToCloud();
			setMigrationResult(
				`Migración completada: ${res.uploaded} de ${res.total} obras subidas a la nube con éxito.`
			);
		} catch (err: any) {
			setMessage({
				text: err.message || 'Error al migrar la biblioteca a la nube.',
				type: 'error',
			});
		} finally {
			setLoading(false);
		}
	};

	const handleSignOut = async () => {
		setLoading(true);
		try {
			await signOutUser();
			setMessage({ text: 'Sesión cerrada.', type: 'info' });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-sans'>
			<div
				onClick={(e) => e.stopPropagation()}
				className='bg-white rounded-lg border border-gray-300 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150'
			>
				{/* Modal Header */}
				<div className='flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-[#fafafa]'>
					<div className='flex items-center space-x-2'>
						<Cloud className='w-5 h-5 text-[#990000]' />
						<h3 className='font-bold font-serif text-gray-900 text-base'>
							Sincronización en la Nube
						</h3>
					</div>
					<button
						onClick={onClose}
						className='text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-200 cursor-pointer'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				<div className='p-6 space-y-5 text-xs text-gray-700'>
					{/* Supabase status warning if unconfigured */}
					{!isConfigured && (
						<div className='p-3.5 bg-amber-50 border border-amber-200 rounded-md text-amber-800 space-y-1.5'>
							<p className='font-bold flex items-center space-x-1.5'>
								<AlertCircle className='w-4 h-4 text-amber-600 shrink-0' />
								<span>Modo Local Activo (IndexedDB)</span>
							</p>
							<p className='text-[11px] leading-relaxed'>
								Tus libros, notas y progreso de lectura se almacenan de forma local y segura en este navegador. Para sincronizar entre múltiples dispositivos, añade tus claves de Supabase en <code className='bg-amber-100 px-1 py-0.5 rounded text-amber-900'>.env</code>.
							</p>
						</div>
					)}

					{/* Notification alert */}
					{message && (
						<div
							className={`p-3 rounded-md text-xs border ${
								message.type === 'success'
									? 'bg-emerald-50 border-emerald-200 text-emerald-800'
									: message.type === 'error'
									? 'bg-red-50 border-red-200 text-red-800'
									: 'bg-blue-50 border-blue-200 text-blue-800'
							}`}
						>
							{message.text}
						</div>
					)}

					{/* Logged in state */}
					{user ? (
						<div className='space-y-4'>
							<div className='p-3.5 bg-gray-50 border border-gray-200 rounded-md space-y-2'>
								<div className='flex items-center justify-between'>
									<span className='font-semibold text-gray-600'>Sesión iniciada como:</span>
									<span className='inline-flex items-center space-x-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]'>
										<ShieldCheck className='w-3 h-3 text-emerald-600' />
										<span>Conectado</span>
									</span>
								</div>
								<p className='font-bold text-gray-900 text-sm break-all'>{user.email}</p>
								{lastSyncTime && (
									<p className='text-[11px] text-gray-500'>
										Última sincronización:{' '}
										<span className='font-medium text-gray-700'>
											{new Date(lastSyncTime).toLocaleDateString()} a las{' '}
											{new Date(lastSyncTime).toLocaleTimeString([], {
												hour: '2-digit',
												minute: '2-digit',
											})}
										</span>
									</p>
								)}
							</div>

							{migrationResult && (
								<div className='p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-[11px] font-medium'>
									{migrationResult}
								</div>
							)}

							<div className='space-y-2.5 pt-2'>
								<button
									onClick={async () => {
										setLoading(true);
										await syncNow();
										setLoading(false);
									}}
									disabled={loading}
									className='w-full py-2 bg-[#990000] hover:bg-[#800000] disabled:opacity-50 text-white font-bold rounded shadow-xs cursor-pointer transition-colors flex items-center justify-center space-x-2'
								>
									<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
									<span>Sincronizar ahora</span>
								</button>

								<button
									onClick={handleMigrate}
									disabled={loading}
									className='w-full py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 font-semibold rounded shadow-xs cursor-pointer transition-colors flex items-center justify-center space-x-2'
								>
									<ArrowUpCircle className='w-3.5 h-3.5 text-[#990000]' />
									<span>Migrar toda la biblioteca local a la nube</span>
								</button>

								<button
									onClick={handleSignOut}
									disabled={loading}
									className='w-full py-1.5 text-gray-500 hover:text-red-700 text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center space-x-1.5'
								>
									<LogOut className='w-3.5 h-3.5' />
									<span>Cerrar sesión</span>
								</button>
							</div>
						</div>
					) : (
						/* Not logged in: Show Auth Forms */
						<div className='space-y-4'>
							<div className='flex border-b border-gray-200'>
								<button
									type='button'
									onClick={() => setMode('magic-link')}
									className={`flex-1 py-2 font-bold text-center border-b-2 cursor-pointer transition-colors ${
										mode === 'magic-link'
											? 'border-[#990000] text-[#990000]'
											: 'border-transparent text-gray-500 hover:text-gray-800'
									}`}
								>
									Enlace Mágico (Sin contraseña)
								</button>
								<button
									type='button'
									onClick={() => setMode('password')}
									className={`flex-1 py-2 font-bold text-center border-b-2 cursor-pointer transition-colors ${
										mode === 'password' || mode === 'signup'
											? 'border-[#990000] text-[#990000]'
											: 'border-transparent text-gray-500 hover:text-gray-800'
									}`}
								>
									Contraseña
								</button>
							</div>

							{mode === 'magic-link' ? (
								<form onSubmit={handleMagicLink} className='space-y-3.5'>
									<p className='text-gray-600 text-[11px] leading-relaxed'>
										Introduce tu correo electrónico. Te enviaremos un enlace seguro para iniciar sesión al instante sin necesidad de recordar contraseñas.
									</p>
									<div>
										<label className='block font-semibold text-gray-700 mb-1'>Correo electrónico</label>
										<div className='relative'>
											<Mail className='w-4 h-4 text-gray-400 absolute left-3 top-2.5' />
											<input
												type='email'
												required
												value={email}
												onChange={(e) => setEmail(e.target.value)}
												placeholder='tu@correo.com'
												className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-[#990000] text-xs'
											/>
										</div>
									</div>

									<button
										type='submit'
										disabled={loading || !isConfigured}
										className='w-full py-2 bg-[#990000] hover:bg-[#800000] disabled:opacity-50 text-white font-bold rounded shadow-xs cursor-pointer transition-colors flex items-center justify-center space-x-2'
									>
										{loading ? <RefreshCw className='w-3.5 h-3.5 animate-spin' /> : <Mail className='w-3.5 h-3.5' />}
										<span>Enviar enlace de acceso</span>
									</button>
								</form>
							) : (
								<form onSubmit={handlePasswordAuth} className='space-y-3.5'>
									<div>
										<label className='block font-semibold text-gray-700 mb-1'>Correo electrónico</label>
										<div className='relative'>
											<Mail className='w-4 h-4 text-gray-400 absolute left-3 top-2.5' />
											<input
												type='email'
												required
												value={email}
												onChange={(e) => setEmail(e.target.value)}
												placeholder='tu@correo.com'
												className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-[#990000] text-xs'
											/>
										</div>
									</div>

									<div>
										<label className='block font-semibold text-gray-700 mb-1'>Contraseña</label>
										<div className='relative'>
											<Lock className='w-4 h-4 text-gray-400 absolute left-3 top-2.5' />
											<input
												type='password'
												required
												minLength={6}
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												placeholder='Mínimo 6 caracteres'
												className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-[#990000] text-xs'
											/>
										</div>
									</div>

									<div className='flex justify-between items-center pt-1 text-[11px]'>
										{mode === 'signup' ? (
											<button
												type='button'
												onClick={() => setMode('password')}
												className='text-[#990000] hover:underline cursor-pointer'
											>
												¿Ya tienes cuenta? Inicia sesión
											</button>
										) : (
											<button
												type='button'
												onClick={() => setMode('signup')}
												className='text-[#990000] hover:underline cursor-pointer'
											>
												¿No tienes cuenta? Regístrate
											</button>
										)}
									</div>

									<button
										type='submit'
										disabled={loading || !isConfigured}
										className='w-full py-2 bg-[#990000] hover:bg-[#800000] disabled:opacity-50 text-white font-bold rounded shadow-xs cursor-pointer transition-colors flex items-center justify-center space-x-2'
									>
										{loading && <RefreshCw className='w-3.5 h-3.5 animate-spin' />}
										<span>{mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}</span>
									</button>
								</form>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
