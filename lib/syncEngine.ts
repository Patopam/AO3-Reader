import { useState, useEffect, useCallback } from 'react';
import { db, type Fic, type FicChapter, type FicFile, saveBookWithFile, getBookBlob } from './db';
import { supabase, isSupabaseConfigured, getCurrentUser } from './supabase';
import type { User } from '@supabase/supabase-js';

export type SyncStatusType = 'synced' | 'syncing' | 'local' | 'error' | 'offline';

export interface SyncEngineState {
	status: SyncStatusType;
	lastSyncTime: number | null;
	errorMessage: string | null;
	pendingCount: number;
	user: User | null;
}

const STORAGE_BUCKET = 'fics-files';
const LAST_SYNC_KEY = 'ao3_last_sync_timestamp';

// Global listeners for reactive UI
let listeners: Array<(state: SyncEngineState) => void> = [];

let currentState: SyncEngineState = {
	status: isSupabaseConfigured ? 'local' : 'local',
	lastSyncTime: typeof window !== 'undefined' ? parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10) || null : null,
	errorMessage: null,
	pendingCount: 0,
	user: null,
};

function notifyListeners() {
	listeners.forEach((l) => l({ ...currentState }));
}

function updateSyncState(updates: Partial<SyncEngineState>) {
	currentState = { ...currentState, ...updates };
	notifyListeners();
}

/**
 * Maps a local Fic to a Supabase database row.
 */
function mapFicToSupabaseRow(fic: Fic, userId: string, storagePath: string | null) {
	return {
		user_id: userId,
		local_id: fic.id,
		title: fic.title,
		author: fic.author,
		summary: fic.summary || null,
		fandom: fic.fandom || (fic.fandoms?.length ? fic.fandoms.join(', ') : ''),
		fandoms: fic.fandoms || [],
		relationships: fic.relationships || [],
		characters: fic.characters || [],
		additional_tags: fic.additionalTags || fic.tags || [],
		warnings: fic.warnings || fic.archiveWarnings || [],
		category: fic.category || [],
		rating: fic.rating || null,
		word_count: fic.wordCount || null,
		chapter_count: fic.chapterCount || 1,
		publication_status: fic.publicationStatus || 'Unknown',
		published_at: fic.publishedAt || null,
		language: fic.language || null,
		format: fic.format,
		source: fic.source || 'local',
		is_favorite: Boolean(fic.isFavorite),
		is_read: Boolean(fic.isRead),
		last_read_at: fic.lastReadAt || null,
		reading_progress: fic.readingProgress || 0,
		current_chapter_idx: fic.currentChapterIdx ?? 0,
		current_pdf_page: fic.currentPdfPage ?? 1,
		current_scroll_position: fic.currentScrollPosition ?? 0,
		current_scroll_ratio: fic.currentScrollRatio ?? 0,
		notes: fic.notes || null,
		chapters_json: fic.chapters || [],
		full_text_content: fic.fullTextContent || null,
		storage_path: storagePath || fic.storagePath || null,
		imported_at: fic.importedAt || Date.now(),
		updated_at: Date.now(),
	};
}

/**
 * Maps a Supabase row to a local Fic object.
 */
function mapSupabaseRowToFic(row: any): Omit<Fic, 'id' | 'fileId'> & { cloudId: string; storagePath: string | null } {
	return {
		cloudId: row.id,
		title: row.title,
		author: row.author,
		summary: row.summary,
		fandom: row.fandom,
		fandoms: row.fandoms || [],
		relationships: row.relationships || [],
		characters: row.characters || [],
		additionalTags: row.additional_tags || [],
		tags: row.additional_tags || [],
		warnings: row.warnings || [],
		archiveWarnings: row.warnings || [],
		category: row.category || [],
		rating: row.rating,
		wordCount: row.word_count,
		chapterCount: row.chapter_count || 1,
		publicationStatus: row.publication_status,
		publishedAt: row.published_at,
		language: row.language,
		format: row.format,
		source: row.source || 'local',
		isFavorite: Boolean(row.is_favorite),
		isRead: Boolean(row.is_read),
		lastReadAt: row.last_read_at ? Number(row.last_read_at) : null,
		readingProgress: row.reading_progress || 0,
		currentChapterIdx: row.current_chapter_idx ?? 0,
		currentPdfPage: row.current_pdf_page ?? 1,
		currentScrollPosition: row.current_scroll_position ?? 0,
		currentScrollRatio: row.current_scroll_ratio ?? 0,
		notes: row.notes,
		chapters: row.chapters_json || [],
		fullTextContent: row.full_text_content || '',
		storagePath: row.storage_path || null,
		importedAt: row.imported_at ? Number(row.imported_at) : Date.now(),
		updatedAt: row.updated_at ? String(row.updated_at) : null,
	};
}

/**
 * Main bidirectional sync routine:
 * - Checks online & auth status
 * - Uploads local changes to Supabase (PostgreSQL + Storage)
 * - Downloads remote changes to Dexie IndexedDB
 * - Resolves progress conflicts with Last-Write-Wins (LWW)
 */
export async function syncNow(): Promise<{ uploaded: number; downloaded: number; errors: number }> {
	if (!isSupabaseConfigured || !supabase) {
		updateSyncState({ status: 'local', errorMessage: null });
		return { uploaded: 0, downloaded: 0, errors: 0 };
	}

	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		updateSyncState({ status: 'offline', errorMessage: 'Sin conexión a Internet' });
		return { uploaded: 0, downloaded: 0, errors: 0 };
	}

	const user = await getCurrentUser();
	if (!user) {
		updateSyncState({ status: 'local', user: null, errorMessage: null });
		return { uploaded: 0, downloaded: 0, errors: 0 };
	}

	updateSyncState({ status: 'syncing', user, errorMessage: null });

	let uploaded = 0;
	let downloaded = 0;
	let errors = 0;

	try {
		// 1. Get all local fics
		const localFics = await db.fics.toArray();
		const lastSync = currentState.lastSyncTime || 0;

		// 2. Upload unsynced or updated local fics
		for (const fic of localFics) {
			try {
				const isUnsynced = !fic.syncedAt || (fic.lastReadAt && fic.lastReadAt > fic.syncedAt);
				if (!isUnsynced) continue;

				let storagePath = fic.storagePath || null;

				// If the binary file hasn't been uploaded to Supabase Storage yet, upload it
				if (!storagePath && fic.fileId) {
					const blob = await getBookBlob(fic.fileId);
					if (blob) {
						const safeExt = fic.format === 'pdf' ? 'pdf' : 'epub';
						const filename = `${user.id}/${fic.id}_${Date.now()}.${safeExt}`;
						const { data: uploadData, error: uploadErr } = await supabase.storage
							.from(STORAGE_BUCKET)
							.upload(filename, blob, {
								contentType: fic.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
								upsert: true,
							});

						if (!uploadErr && uploadData?.path) {
							storagePath = uploadData.path;
						}
					}
				}

				// Upsert metadata row in Supabase
				const row = mapFicToSupabaseRow(fic, user.id, storagePath);
				const { data: inserted, error: upsertErr } = await supabase
					.from('fics')
					.upsert(row, { onConflict: 'user_id,local_id' })
					.select('id')
					.single();

				if (upsertErr) {
					console.warn(`Error syncing local fic #${fic.id}:`, upsertErr);
					errors++;
				} else {
					// Mark local fic as synced
					await db.fics.update(fic.id!, {
						syncedAt: Date.now(),
						cloudId: inserted?.id || fic.cloudId,
						storagePath: storagePath || fic.storagePath,
					});
					uploaded++;
				}
			} catch (ficErr) {
				console.error('Error syncing individual fic:', ficErr);
				errors++;
			}
		}

		// 3. Download remote fics from Supabase
		const { data: remoteRows, error: fetchErr } = await supabase
			.from('fics')
			.select('*')
			.eq('user_id', user.id);

		if (fetchErr) {
			console.warn('Error fetching remote fics:', fetchErr);
			errors++;
		} else if (remoteRows && remoteRows.length > 0) {
			const localMap = new Map<number, Fic>();
			localFics.forEach((f) => {
				if (f.id) localMap.set(f.id, f);
			});

			for (const row of remoteRows) {
				const remoteLocalId = row.local_id ? Number(row.local_id) : null;
				const existingLocal = remoteLocalId ? localMap.get(remoteLocalId) : null;

				if (existingLocal) {
					// LWW Conflict Resolution for reading progress and status
					const remoteUpdated = Number(row.updated_at || row.last_read_at || 0);
					const localUpdated = Number(existingLocal.lastReadAt || existingLocal.syncedAt || 0);

					if (remoteUpdated > localUpdated) {
						const scrollPos = row.current_scroll_position ?? existingLocal.currentScrollPosition ?? 0;
						const scrollRat = row.current_scroll_ratio ?? existingLocal.currentScrollRatio ?? 0;
						const chapIdx = row.current_chapter_idx ?? existingLocal.currentChapterIdx ?? 0;
						const pdfPage = row.current_pdf_page ?? existingLocal.currentPdfPage ?? 1;
						const prog = row.reading_progress ?? existingLocal.readingProgress;

						await db.fics.update(existingLocal.id!, {
							readingProgress: prog,
							currentChapterIdx: chapIdx,
							currentPdfPage: pdfPage,
							currentScrollPosition: scrollPos,
							currentScrollRatio: scrollRat,
							isRead: Boolean(row.is_read),
							isFavorite: Boolean(row.is_favorite),
							lastReadAt: row.last_read_at ? Number(row.last_read_at) : existingLocal.lastReadAt,
							syncedAt: Date.now(),
							cloudId: row.id,
							storagePath: row.storage_path || existingLocal.storagePath,
						});

						try {
							const existingProg = await db.reading_progress.where('ficId').equals(existingLocal.id!).first();
							if (existingProg?.id) {
								await db.reading_progress.update(existingProg.id, {
									progress: prog,
									chapterIdx: chapIdx,
									pdfPage: pdfPage,
									scrollPosition: scrollPos,
									scrollRatio: scrollRat,
									updatedAt: remoteUpdated,
								});
							} else {
								await db.reading_progress.add({
									ficId: existingLocal.id!,
									progress: prog,
									chapterIdx: chapIdx,
									pdfPage: pdfPage,
									scrollPosition: scrollPos,
									scrollRatio: scrollRat,
									updatedAt: remoteUpdated,
								});
							}
						} catch {}

						downloaded++;
					}
				} else {
					// Fic exists in Supabase but not in this local device: Download metadata
					const mappedFic = mapSupabaseRowToFic(row);

					// If file is in storage, download blob
					let blob: Blob | null = null;
					if (row.storage_path) {
						try {
							const { data: fileData, error: fileErr } = await supabase.storage
								.from(STORAGE_BUCKET)
								.download(row.storage_path);
							if (!fileErr && fileData) {
								blob = fileData;
							}
						} catch (downloadErr) {
							console.warn('Could not download binary blob from storage:', downloadErr);
						}
					}

					// Fallback empty blob if offline or deferred
					const finalBlob = blob || new Blob([''], { type: row.format === 'pdf' ? 'application/pdf' : 'application/epub+zip' });
					await saveBookWithFile(mappedFic, finalBlob, `${row.title}.${row.format}`);
					downloaded++;
				}
			}
		}

		const now = Date.now();
		if (typeof window !== 'undefined') {
			localStorage.setItem(LAST_SYNC_KEY, String(now));
		}

		updateSyncState({
			status: 'synced',
			lastSyncTime: now,
			errorMessage: null,
			pendingCount: 0,
		});

		return { uploaded, downloaded, errors };
	} catch (err: any) {
		console.error('Fatal sync error:', err);
		updateSyncState({
			status: 'error',
			errorMessage: err.message || 'Error de sincronización con la nube.',
		});
		return { uploaded, downloaded, errors: errors + 1 };
	}
}

/**
 * One-click migration of the entire local library (all books, blobs, notes, and progress) to Supabase.
 */
export async function migrateLocalToCloud(): Promise<{ total: number; uploaded: number; errors: number }> {
	if (!isSupabaseConfigured || !supabase) {
		throw new Error('Supabase no está configurado en las variables de entorno.');
	}

	const user = await getCurrentUser();
	if (!user) {
		throw new Error('Debes iniciar sesión para migrar tu biblioteca a la nube.');
	}

	updateSyncState({ status: 'syncing' });

	const allLocal = await db.fics.toArray();
	let uploaded = 0;
	let errors = 0;

	for (const fic of allLocal) {
		try {
			let storagePath = fic.storagePath || null;

			// Upload blob to Supabase Storage
			if (fic.fileId) {
				const blob = await getBookBlob(fic.fileId);
				if (blob && blob.size > 0) {
					const ext = fic.format === 'pdf' ? 'pdf' : 'epub';
					const filename = `${user.id}/${fic.id}_${Date.now()}.${ext}`;
					const { data: uploadData, error: uploadErr } = await supabase.storage
						.from(STORAGE_BUCKET)
						.upload(filename, blob, {
							contentType: fic.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
							upsert: true,
						});

					if (!uploadErr && uploadData?.path) {
						storagePath = uploadData.path;
					}
				}
			}

			// Upsert row in Supabase
			const row = mapFicToSupabaseRow(fic, user.id, storagePath);
			const { data: inserted, error: upsertErr } = await supabase
				.from('fics')
				.upsert(row, { onConflict: 'user_id,local_id' })
				.select('id')
				.single();

			if (!upsertErr) {
				await db.fics.update(fic.id!, {
					syncedAt: Date.now(),
					cloudId: inserted?.id || fic.cloudId,
					storagePath: storagePath || fic.storagePath,
				});
				uploaded++;
			} else {
				errors++;
			}
		} catch (e) {
			console.error(`Error migrating fic #${fic.id}:`, e);
			errors++;
		}
	}

	const now = Date.now();
	if (typeof window !== 'undefined') {
		localStorage.setItem(LAST_SYNC_KEY, String(now));
	}

	updateSyncState({
		status: 'synced',
		lastSyncTime: now,
		errorMessage: null,
	});

	return { total: allLocal.length, uploaded, errors };
}

/**
 * Fetches a single fic from Supabase by ID or local_id when accessed directly from a URL.
 */
export async function fetchFicFromSupabase(localOrCloudId: number | string): Promise<Fic | null> {
	if (!isSupabaseConfigured || !supabase) return null;

	try {
		const user = await getCurrentUser();
		let query = supabase.from('fics').select('*');

		if (typeof localOrCloudId === 'number' || !isNaN(Number(localOrCloudId))) {
			query = query.eq('local_id', Number(localOrCloudId));
		} else {
			query = query.eq('id', localOrCloudId);
		}

		if (user) {
			query = query.eq('user_id', user.id);
		}

		const { data, error } = await query.maybeSingle();
		if (error || !data) return null;

		const mapped = mapSupabaseRowToFic(data);

		// Attempt to download blob if present
		let blob: Blob | null = null;
		if (data.storage_path) {
			const { data: fileData } = await supabase.storage
				.from(STORAGE_BUCKET)
				.download(data.storage_path);
			if (fileData) blob = fileData;
		}

		const finalBlob = blob || new Blob([''], { type: data.format === 'pdf' ? 'application/pdf' : 'application/epub+zip' });
		const newLocalId = await saveBookWithFile(mapped, finalBlob, `${data.title}.${data.format}`);

		return (await db.fics.get(newLocalId)) || null;
	} catch (e) {
		console.warn('Error fetching fic from Supabase:', e);
		return null;
	}
}

/**
 * React hook providing reactive sync state and methods.
 */
export function useSyncEngine() {
	const [state, setState] = useState<SyncEngineState>(currentState);

	useEffect(() => {
		const listener = (newState: SyncEngineState) => setState(newState);
		listeners.push(listener);

		// Initial check of current user
		if (isSupabaseConfigured) {
			getCurrentUser().then((u) => {
				updateSyncState({ user: u, status: u ? 'synced' : 'local' });
			});
		}

		return () => {
			listeners = listeners.filter((l) => l !== listener);
		};
	}, []);

	const triggerSync = useCallback(async () => {
		return await syncNow();
	}, []);

	const triggerMigration = useCallback(async () => {
		return await migrateLocalToCloud();
	}, []);

	return {
		...state,
		isConfigured: isSupabaseConfigured,
		syncNow: triggerSync,
		migrateLocalToCloud: triggerMigration,
	};
}
