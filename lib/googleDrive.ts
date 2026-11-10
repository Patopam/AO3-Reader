/**
 * Google Drive V3 REST API Anonymous Client Service
 *
 * Direct download and public folder inspection using the Google Drive V3 REST API
 * for public files ("Anyone with the link").
 */

export interface DriveFileInfo {
	id: string;
	name: string;
	mimeType: string;
	size?: number;
	downloadUrl: string;
}

export interface DriveFolderResult {
	type: 'folder' | 'folder_requires_direct_links';
	folderId: string;
	totalFound?: number;
	compatibleFiles?: DriveFileInfo[];
	message?: string;
}

/**
 * Extracts the file or folder ID from various Google Drive URL formats.
 */
export function extractDriveId(url: string): { id: string; type: 'file' | 'folder' } | null {
	const trimmed = url.trim();

	// Check if already a pure ID
	if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
		return { id: trimmed, type: 'file' };
	}

	try {
		const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
		if (folderMatch && folderMatch[1]) {
			return { id: folderMatch[1], type: 'folder' };
		}

		const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
		if (fileMatch && fileMatch[1]) {
			return { id: fileMatch[1], type: 'file' };
		}

		const urlObj = new URL(trimmed);
		const idParam = urlObj.searchParams.get('id');
		if (idParam) {
			if (urlObj.pathname.includes('folders')) {
				return { id: idParam, type: 'folder' };
			}
			return { id: idParam, type: 'file' };
		}

		const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
		if (dMatch && dMatch[1]) {
			return { id: dMatch[1], type: 'file' };
		}
	} catch {
		// Not a standard URL
	}

	return null;
}

/**
 * Downloads a public Google Drive file through our server streaming proxy.
 */
export async function downloadPublicDriveFile(
	urlOrId: string,
	abortSignal?: AbortSignal
): Promise<{ blob: Blob; filename: string; format: 'epub' | 'pdf' }> {
	const res = await fetch(`/api/fetch-drive?url=${encodeURIComponent(urlOrId.trim())}`, {
		signal: abortSignal,
	});

	if (!res.ok) {
		const errData = await res.json().catch(() => ({}));
		throw new Error(errData.error || `Error al descargar de Google Drive (HTTP ${res.status})`);
	}

	// Extract filename from response header
	const rawFilename = res.headers.get('x-extracted-filename');
	let filename = rawFilename ? decodeURIComponent(rawFilename) : 'descarga.epub';

	const contentType = (res.headers.get('content-type') || '').toLowerCase();
	let format: 'epub' | 'pdf' = 'epub';
	if (contentType.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
		format = 'pdf';
		if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
	} else {
		if (!filename.toLowerCase().endsWith('.epub')) filename += '.epub';
	}

	const blob = await res.blob();
	return { blob, filename, format };
}

/**
 * Inspects a public Google Drive folder.
 */
export async function inspectPublicDriveFolder(
	urlOrId: string,
	abortSignal?: AbortSignal
): Promise<DriveFolderResult> {
	const res = await fetch(`/api/fetch-drive?url=${encodeURIComponent(urlOrId.trim())}&action=list_folder`, {
		signal: abortSignal,
	});

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data.error || `Error al inspeccionar la carpeta de Google Drive (HTTP ${res.status})`);
	}

	return data as DriveFolderResult;
}
