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
	fileId?: number; // foreign key to files table
	notes?: string | null;
	chapters?: FicChapter[]; // cached for instant reading
	fullTextContent?: string;
	status?: 'unread' | 'reading' | 'completed' | 'favorite';
	// Legacy property during migration:
	fileData?: Blob | File;
}

export class FicDatabase extends Dexie {
	fics!: Table<Fic, number>;
	files!: Table<FicFile, number>;

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
	await db.transaction('rw', db.fics, db.files, async () => {
		const fic = await db.fics.get(ficId);
		if (fic?.fileId) {
			await db.files.delete(fic.fileId);
		}
		await db.fics.delete(ficId);
	});
}

/**
 * Updates reading progress and sets lastReadAt timestamp.
 */
export async function updateReadingProgress(
	ficId: number,
	progress: number,
	currentChapterIdx?: number,
	currentPdfPage?: number
): Promise<void> {
	const updates: Partial<Fic> = {
		readingProgress: Math.min(100, Math.max(0, Math.round(progress))),
		lastReadAt: Date.now(),
	};
	if (currentChapterIdx !== undefined) {
		updates.currentChapterIdx = currentChapterIdx;
	}
	if (currentPdfPage !== undefined) {
		updates.currentPdfPage = currentPdfPage;
	}
	await db.fics.update(ficId, updates);
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

