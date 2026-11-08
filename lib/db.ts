import Dexie, { type Table } from 'dexie';

export interface Fic {
	id?: number;
	title: string;
	author: string;
	rating?: string;
	archiveWarnings?: string[];
	category?: string[];
	fandom: string;
	relationships?: string[];
	characters?: string[];
	tags?: string[];
	summary?: string;
	notes?: string;
	wordCount?: number;
	progress: number;
	status: 'unread' | 'reading' | 'completed' | 'favorite';
	fileData?: File;
	chapters?: { title: string; content: string }[];
	fullTextContent?: string;
	isRead?: boolean;
	isFavorite?: boolean;
	language?: string;
}

export class FicDatabase extends Dexie {
	fics!: Table<Fic, number>;

	constructor() {
		super('FicReaderDatabase');
		this.version(1).stores({
			fics: '++id, title, author, rating, fandom, status',
		});
	}
}

export const db = new FicDatabase();
