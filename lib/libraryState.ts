/**
 * Library state persistence across navigation, page reloads, and multi-tab flows.
 * Uses sessionStorage so the state survives navigating back and forth between / and /fic/[id],
 * but allows independent state across completely different browser sessions or windows.
 */

export interface LibraryState {
	searchQuery: string;
	quickTab: 'all' | 'favorites' | 'read' | 'unread';
	sortBy: string;
	selectedFormat: 'all' | 'epub' | 'pdf';
	selectedStatus: string;
	selectedRatings: string[];
	selectedWarnings: string[];
	selectedCategories: string[];
	selectedFandoms: string[];
	selectedRelationships: string[];
	selectedCharacters: string[];
	selectedTags: string[];
	selectedLanguage: string;
	minWords: string;
	maxWords: string;
	minChapters: string;
	maxChapters: string;
	currentPage: number;
	pageSize: number;
	scrollY: number;
}

const STORAGE_KEY = 'ao3_reader_library_state_v1';

export const defaultLibraryState: LibraryState = {
	searchQuery: '',
	quickTab: 'all',
	sortBy: 'dateAddedDesc',
	selectedFormat: 'all',
	selectedStatus: 'all',
	selectedRatings: [],
	selectedWarnings: [],
	selectedCategories: [],
	selectedFandoms: [],
	selectedRelationships: [],
	selectedCharacters: [],
	selectedTags: [],
	selectedLanguage: 'all',
	minWords: '',
	maxWords: '',
	minChapters: '',
	maxChapters: '',
	currentPage: 1,
	pageSize: 20,
	scrollY: 0,
};

/**
 * Loads the saved library state from sessionStorage.
 */
export function loadSavedLibraryState(): LibraryState {
	if (typeof window === 'undefined') return defaultLibraryState;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return defaultLibraryState;
		const parsed = JSON.parse(raw);
		return {
			...defaultLibraryState,
			...parsed,
		};
	} catch (e) {
		console.warn('Could not read library state from sessionStorage:', e);
		return defaultLibraryState;
	}
}

/**
 * Saves the current library state to sessionStorage.
 */
export function saveLibraryState(state: Partial<LibraryState>): void {
	if (typeof window === 'undefined') return;
	try {
		const current = loadSavedLibraryState();
		const merged = { ...current, ...state };
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
	} catch (e) {
		console.warn('Could not save library state to sessionStorage:', e);
	}
}

/**
 * Saves just the scroll position of the library.
 */
export function saveLibraryScroll(scrollY: number): void {
	saveLibraryState({ scrollY });
}

/**
 * Clears the saved library state.
 */
export function clearLibraryState(): void {
	if (typeof window === 'undefined') return;
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch (e) {
		console.warn('Could not clear library state:', e);
	}
}
