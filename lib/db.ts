import Dexie, { type Table, type Transaction } from 'dexie';

export interface FicFile {
	id?: number;
	ficId?: number;
	blob: Blob;
	filename: string;
	mimeType: string;
	format: 'epub' | 'pdf';
	fileSize: number;
	importedAt: number;
}

export interface FicChapter {
	title: string;
	content: string;
}

export interface ReadingProgressRecord {
	id?: number;
	ficId: number;
	cloudFicId?: string;
	progress: number; // 0 - 100 percentage
	chapterIdx: number;
	pdfPage?: number;
	scrollPosition?: number;
	scrollRatio?: number;
	updatedAt: number;
}

export interface Fic {
	id?: number;
	title: string;
	author: string;
	summary: string | null;
	fandoms: string[];
	fandom: string; // compatibility string for search & legacy views
	relationships: string[];
	characters: string[];
	additionalTags: string[];
	tags?: string[]; // compatibility
	warnings: string[];
	archiveWarnings?: string[]; // compatibility
	category: string[];
	rating: string | null;
	wordCount: number | null;
	chapterCount: number;
	publicationStatus: 'Completed' | 'Work in Progress' | 'Unknown' | null;
	publishedAt: string | null;
	updatedAt: string | null;
	language: string | null;
	format: 'epub' | 'pdf';
	source: 'local' | 'gdrive' | 'url';
	importedAt: number;
	isFavorite: boolean;
	isRead: boolean;
	lastReadAt: number | null;
	readingProgress: number; // 0 - 100 percentage
	currentChapterIdx?: number; // for EPUB
	currentPdfPage?: number; // for PDF
	currentScrollPosition?: number; // scroll offset in pixels
	currentScrollRatio?: number; // scroll ratio (0.0 - 1.0)
	fileId?: number; // foreign key to files table
	notes?: string | null;
	chapters?: FicChapter[]; // cached for instant reading
	fullTextContent?: string;
	status?: 'unread' | 'reading' | 'completed' | 'favorite';
	// Cloud sync tracking:
	cloudId?: string;
	syncedAt?: number | null;
	storagePath?: string | null;
	// Legacy property during migration:
	fileData?: Blob | File;
}

export class FicDatabase extends Dexie {
	fics!: Table<Fic, number>;
	files!: Table<FicFile, number>;
	reading_progress!: Table<ReadingProgressRecord, number>;

	constructor() {
		super('FicReaderDatabase');

		// Version 1 (legacy schema maintained for safe migration)
		this.version(1).stores({
			fics: '++id, title, author, rating, fandom, status',
		});

		// Version 2 (schema with tables 'fics' and 'files' including indices for title, author, fandoms, tags, status, isFavorite, isRead, etc.)
		this.version(2)
			.stores({
				fics: '++id, title, author, rating, fandom, *fandoms, *tags, *additionalTags, status, isFavorite, isRead, format, wordCount, chapterCount, importedAt, lastReadAt',
				files: '++id, ficId, format, importedAt',
			})
			.upgrade(async (tx: Transaction) => {
				const ficsTable = tx.table('fics');
				const filesTable = tx.table('files');

				const allFics = await ficsTable.toArray();
				for (const fic of allFics) {
					let newFileId = fic.fileId;

					// If legacy fic had binary fileData attached directly, move it to files table
					if (fic.fileData && !fic.fileId) {
						const fileBlob: Blob = fic.fileData;
						const fileRecord: FicFile = {
							ficId: fic.id,
							blob: fileBlob,
							filename: `${fic.title || 'work'}.epub`,
							mimeType: 'application/epub+zip',
							format: 'epub',
							fileSize: fileBlob.size || 0,
							importedAt: fic.importedAt || Date.now(),
						};
						newFileId = await filesTable.add(fileRecord);
					}

					await ficsTable.update(fic.id, {
						format: fic.format || 'epub',
						fandoms: fic.fandoms && fic.fandoms.length > 0 ? fic.fandoms : fic.fandom ? [fic.fandom] : [],
						fandom: fic.fandom || (fic.fandoms ? fic.fandoms.join(', ') : 'General Fandom'),
						relationships: fic.relationships || [],
						characters: fic.characters || [],
						additionalTags: fic.additionalTags || fic.tags || [],
						tags: fic.additionalTags || fic.tags || [],
						warnings: fic.warnings || fic.archiveWarnings || [],
						archiveWarnings: fic.warnings || fic.archiveWarnings || [],
						category: fic.category || [],
						rating: fic.rating || null,
						isFavorite: Boolean(fic.isFavorite),
						isRead: Boolean(fic.isRead),
						readingProgress: fic.readingProgress ?? (fic.progress || 0),
						lastReadAt: fic.lastReadAt || null,
						chapterCount: fic.chapterCount || fic.chapters?.length || 1,
						publicationStatus: fic.publicationStatus || 'Unknown',
						source: fic.source || 'local',
						importedAt: fic.importedAt || Date.now(),
						summary: fic.summary || null,
						fileId: newFileId,
						fileData: undefined,
					});
				}
			});

		// Version 3 (adds dedicated reading_progress table for scroll position and chapter synchronization)
		this.version(3).stores({
			fics: '++id, title, author, rating, fandom, *fandoms, *tags, *additionalTags, status, isFavorite, isRead, format, wordCount, chapterCount, importedAt, lastReadAt',
			files: '++id, ficId, format, importedAt',
			reading_progress: '++id, ficId, chapterIdx, updatedAt',
		});
	}
}

export const db = new FicDatabase();

/**
 * Saves a book and stores its binary file in the dedicated `files` table.
 */
export async function saveBookWithFile(
	ficData: Omit<Fic, 'id' | 'fileId'>,
	fileBlob: Blob,
	filename: string
): Promise<number> {
	return await db.transaction('rw', db.fics, db.files, async () => {
		// 1. Save file in files table first
		const fileRecord: FicFile = {
			blob: fileBlob,
			filename,
			mimeType: ficData.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
			format: ficData.format,
			fileSize: fileBlob.size,
			importedAt: Date.now(),
		};
		const fileId = await db.files.add(fileRecord);

		// 2. Save Fic metadata referencing fileId
		const ficToSave: Fic = {
			...ficData,
			fileId,
			fandom: ficData.fandom || (ficData.fandoms?.length ? ficData.fandoms.join(', ') : ''),
			tags: ficData.additionalTags || [],
			archiveWarnings: ficData.warnings || [],
			importedAt: ficData.importedAt || Date.now(),
		};
		const ficId = await db.fics.add(ficToSave);

		// Link back ficId to file record
		await db.files.update(fileId, { ficId });

		return ficId;
	});
}

/**
 * Retrieves the binary Blob of a book from the `files` table.
 */
export async function getBookBlob(fileId: number): Promise<Blob | null> {
	if (!fileId) return null;
	const fileRecord = await db.files.get(fileId);
	return fileRecord?.blob ?? null;
}

/**
 * Deletes a fic and cleans up its associated binary file.
 */
export async function deleteBookAndFile(ficId: number): Promise<void> {
	await db.transaction('rw', db.fics, db.files, db.reading_progress, async () => {
		const fic = await db.fics.get(ficId);
		if (fic?.fileId) {
			await db.files.delete(fic.fileId);
		}
		await db.reading_progress.where('ficId').equals(ficId).delete();
		await db.fics.delete(ficId);
	});
}

/**
 * Deletes multiple fics and their associated binary files and reading progress
 * in a single atomic Dexie transaction.
 */
export async function deleteMultipleBooksAndFiles(ficIds: number[]): Promise<void> {
	if (!ficIds || ficIds.length === 0) return;
	await db.transaction('rw', db.fics, db.files, db.reading_progress, async () => {
		const ficsToDelete = await db.fics.where('id').anyOf(ficIds).toArray();
		const fileIds = ficsToDelete
			.map((f) => f.fileId)
			.filter((id): id is number => typeof id === 'number');

		if (fileIds.length > 0) {
			await db.files.where('id').anyOf(fileIds).delete();
		}
		await db.reading_progress.where('ficId').anyOf(ficIds).delete();
		await db.fics.where('id').anyOf(ficIds).delete();
	});
}

/**
 * Debounced background sync of reading progress to Supabase.
 */
let progressSyncTimer: any = null;

export async function syncReadingProgressToSupabase(
	ficId: number,
	progress: number,
	currentChapterIdx?: number,
	currentPdfPage?: number,
	scrollPosition?: number,
	scrollRatio?: number
): Promise<void> {
	if (typeof window === 'undefined') return;

	if (progressSyncTimer) {
		clearTimeout(progressSyncTimer);
	}

	progressSyncTimer = setTimeout(async () => {
		try {
			const { supabase, isSupabaseConfigured, getCurrentUser } = await import('./supabase');
			if (!isSupabaseConfigured || !supabase) return;

			const user = await getCurrentUser();
			if (!user) return;

			const fic = await db.fics.get(ficId);
			if (!fic) return;

			const now = Date.now();
			const finalProgress = Math.min(100, Math.max(0, Math.round(progress)));
			const chapIdx = currentChapterIdx ?? fic.currentChapterIdx ?? 0;
			const pdfPage = currentPdfPage ?? fic.currentPdfPage ?? 1;
			const scrollPos = scrollPosition !== undefined ? Math.round(scrollPosition) : (fic.currentScrollPosition || 0);
			const scrollRat = scrollRatio !== undefined ? Math.round(scrollRatio * 10000) / 10000 : (fic.currentScrollRatio || 0);

			// 1. Upsert reading_progress record in Supabase
			await supabase.from('reading_progress').upsert(
				{
					user_id: user.id,
					fic_id: fic.cloudId || null,
					local_id: ficId,
					progress: finalProgress,
					chapter_idx: chapIdx,
					pdf_page: pdfPage,
					scroll_position: scrollPos,
					scroll_ratio: scrollRat,
					updated_at: now,
				},
				{ onConflict: 'user_id,local_id' }
			);

			// 2. Also update reading progress on the fics table
			await supabase
				.from('fics')
				.update({
					reading_progress: finalProgress,
					current_chapter_idx: chapIdx,
					current_pdf_page: pdfPage,
					current_scroll_position: scrollPos,
					current_scroll_ratio: scrollRat,
					last_read_at: now,
					updated_at: now,
				})
				.eq('user_id', user.id)
				.eq('local_id', ficId);
		} catch (err) {
			console.warn('Background reading progress sync to Supabase skipped or failed:', err);
		}
	}, 600);
}

/**
 * Updates reading progress, chapter index, and scroll position in both
 * Dexie (IndexedDB tables fics and reading_progress) and Supabase cloud.
 */
export async function updateReadingProgress(
	ficId: number,
	progress: number,
	currentChapterIdx?: number,
	currentPdfPage?: number,
	scrollPosition?: number,
	scrollRatio?: number
): Promise<void> {
	const now = Date.now();
	const cleanProgress = Math.min(100, Math.max(0, Math.round(progress)));

	const updates: Partial<Fic> = {
		readingProgress: cleanProgress,
		lastReadAt: now,
	};
	if (currentChapterIdx !== undefined) {
		updates.currentChapterIdx = currentChapterIdx;
	}
	if (currentPdfPage !== undefined) {
		updates.currentPdfPage = currentPdfPage;
	}
	if (scrollPosition !== undefined) {
		updates.currentScrollPosition = Math.round(scrollPosition);
	}
	if (scrollRatio !== undefined) {
		updates.currentScrollRatio = Math.round(scrollRatio * 10000) / 10000;
	}

	// 1. Update Dexie fics table
	await db.fics.update(ficId, updates);

	// 2. Update or insert in Dexie reading_progress table
	try {
		const existing = await db.reading_progress.where('ficId').equals(ficId).first();
		if (existing?.id) {
			await db.reading_progress.update(existing.id, {
				progress: cleanProgress,
				chapterIdx: currentChapterIdx ?? existing.chapterIdx ?? 0,
				pdfPage: currentPdfPage ?? existing.pdfPage ?? 1,
				scrollPosition: scrollPosition !== undefined ? Math.round(scrollPosition) : existing.scrollPosition,
				scrollRatio: scrollRatio !== undefined ? Math.round(scrollRatio * 10000) / 10000 : existing.scrollRatio,
				updatedAt: now,
			});
		} else {
			await db.reading_progress.add({
				ficId,
				progress: cleanProgress,
				chapterIdx: currentChapterIdx ?? 0,
				pdfPage: currentPdfPage ?? 1,
				scrollPosition: scrollPosition !== undefined ? Math.round(scrollPosition) : 0,
				scrollRatio: scrollRatio !== undefined ? Math.round(scrollRatio * 10000) / 10000 : 0,
				updatedAt: now,
			});
		}
	} catch (e) {
		console.warn('Could not update Dexie reading_progress table:', e);
	}

	// 3. Synchronize to Supabase in background
	syncReadingProgressToSupabase(
		ficId,
		cleanProgress,
		currentChapterIdx,
		currentPdfPage,
		scrollPosition,
		scrollRatio
	).catch(() => {});
}

/**
 * Retrieves the latest saved reading progress for a fic from Dexie.
 */
export async function getReadingProgress(ficId: number): Promise<ReadingProgressRecord | null> {
	if (!ficId) return null;
	try {
		const record = await db.reading_progress.where('ficId').equals(ficId).first();
		return record || null;
	} catch {
		return null;
	}
}

/**
 * Safely re-extracts summary and metadata from the stored EPUB binary blob
 * without altering reading status, favorites, or user notes.
 */
export async function reprocessFicFromBlob(ficId: number): Promise<Fic | null> {
	const fic = await db.fics.get(ficId);
	if (!fic || fic.format !== 'epub') return null;

	let blob: Blob | null = null;
	let filename = `${fic.title}.epub`;

	if (fic.fileId) {
		const fileRecord = await db.files.get(fic.fileId);
		if (fileRecord) {
			blob = fileRecord.blob;
			filename = fileRecord.filename || filename;
		}
	} else if (fic.fileData) {
		blob = fic.fileData;
	}

	if (!blob) return null;

	const { parseEpubMetadata } = await import('./epubParser');
	const fresh = await parseEpubMetadata(blob, filename);

	const updates: Partial<Fic> = {
		summary: fresh.summary,
		notes: fresh.notes || fic.notes,
		chapters: fresh.chapters || fic.chapters,
		wordCount: fresh.wordCount || fic.wordCount,
		chapterCount: fresh.chapterCount || fic.chapterCount,
		publicationStatus: fresh.publicationStatus || fic.publicationStatus,
		rating: fresh.rating || fic.rating,
		fandoms: fresh.fandoms.length > 0 ? fresh.fandoms : fic.fandoms,
		fandom: fresh.fandom || fic.fandom,
		relationships: fresh.relationships.length > 0 ? fresh.relationships : fic.relationships,
		characters: fresh.characters.length > 0 ? fresh.characters : fic.characters,
		additionalTags: fresh.additionalTags.length > 0 ? fresh.additionalTags : fic.additionalTags,
		warnings: fresh.warnings.length > 0 ? fresh.warnings : fic.warnings,
	};

	await db.fics.update(ficId, updates);
	return (await db.fics.get(ficId)) || null;
}

/**
 * Reprocesses all stored EPUB fics in IndexedDB to repair summaries safely.
 */
export async function reprocessAllFicsFromBlobs(): Promise<{ updated: number; errors: number }> {
	const allFics = await db.fics.toArray();
	let updated = 0;
	let errors = 0;

	for (const fic of allFics) {
		if (fic.id && fic.format === 'epub' && (fic.fileId || fic.fileData)) {
			try {
				const res = await reprocessFicFromBlob(fic.id);
				if (res) updated++;
			} catch (err) {
				console.warn(`Could not reprocess fic #${fic.id}:`, err);
				errors++;
			}
		}
	}

	return { updated, errors };
}

