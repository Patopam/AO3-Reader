/**
 * Client-Side Google Drive & Google Picker Integration
 *
 * Utilizes:
 * - Google Identity Services (GIS) for OAuth 2.0 (scope: https://www.googleapis.com/auth/drive.readonly)
 * - Google Picker API for selecting EPUB / PDF files and folders (including Shared Drives)
 * - Google Drive API v3 for downloading files directly in the browser via OAuth Bearer token
 *
 * No backend proxying of huge base64 files, and no exposed server secrets.
 */

declare global {
	interface Window {
		gapi: any;
		google: any;
	}
}

export interface DriveFileItem {
	id: string;
	name: string;
	mimeType: string;
	size?: number;
}

let gsiScriptLoaded = false;
let gapiScriptLoaded = false;
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Loads the Google Identity Services script dynamically.
 */
export async function loadGsiScript(): Promise<void> {
	if (typeof window === 'undefined') return;
	if (window.google?.accounts?.oauth2) return;
	if (gsiScriptLoaded) return;

	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://accounts.google.com/gsi/client';
		script.async = true;
		script.defer = true;
		script.onload = () => {
			gsiScriptLoaded = true;
			resolve();
		};
		script.onerror = () => reject(new Error('Failed to load Google Identity Services library.'));
		document.head.appendChild(script);
	});
}

/**
 * Loads the Google API client script dynamically (required for Google Picker).
 */
export async function loadGapiScript(): Promise<void> {
	if (typeof window === 'undefined') return;
	if (window.gapi?.picker) return;
	if (gapiScriptLoaded) return;

	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://apis.google.com/js/api.js';
		script.async = true;
		script.defer = true;
		script.onload = () => {
			gapiScriptLoaded = true;
			window.gapi.load('picker', () => resolve());
		};
		script.onerror = () => reject(new Error('Failed to load Google API client library.'));
		document.head.appendChild(script);
	});
}

/**
 * Requests an OAuth 2.0 Access Token with drive.readonly scope using GIS token client.
 */
export async function getDriveAccessToken(clientId: string): Promise<string> {
	if (!clientId) {
		throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.');
	}

	// Reuse valid token if not expired (with 2 min buffer)
	if (cachedAccessToken && Date.now() < tokenExpiresAt - 120000) {
		return cachedAccessToken;
	}

	await loadGsiScript();

	return new Promise((resolve, reject) => {
		try {
			const tokenClient = window.google.accounts.oauth2.initTokenClient({
				client_id: clientId,
				scope: 'https://www.googleapis.com/auth/drive.readonly',
				callback: (response: any) => {
					if (response.error) {
						reject(new Error(response.error_description || response.error || 'Authentication failed'));
						return;
					}
					cachedAccessToken = response.access_token;
					const expiresInSeconds = parseInt(response.expires_in, 10) || 3600;
					tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
					resolve(response.access_token);
				},
				error_callback: (err: any) => {
					reject(new Error(err?.message || 'OAuth popup closed or blocked'));
				},
			});

			// Prompt user to authorize
			tokenClient.requestAccessToken({ prompt: cachedAccessToken ? '' : 'consent' });
		} catch (e: any) {
			reject(new Error(`Google Auth initialization error: ${e?.message || e}`));
		}
	});
}

export interface OpenPickerOptions {
	clientId: string;
	apiKey?: string; // Optional developer API key for Google Picker
	accessToken: string;
	onSelect: (selectedItems: DriveFileItem[]) => void;
	onCancel?: () => void;
}

/**
 * Opens Google Picker modal allowing users to select EPUB/PDF files or folders,
 * including from personal Drive and Shared Drives.
 */
export async function openGooglePicker(options: OpenPickerOptions): Promise<void> {
	await loadGapiScript();

	const { clientId, apiKey, accessToken, onSelect, onCancel } = options;

	if (!window.google?.picker) {
		throw new Error('Google Picker library could not be initialized.');
	}

	// View 1: EPUB and PDF files with Shared Drives support
	const filesView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
	filesView.setMimeTypes('application/epub+zip,application/pdf');
	filesView.setMode(window.google.picker.DocsViewMode.LIST);
	filesView.setIncludeFolders(true);
	filesView.setSelectFolderEnabled(false);

	// View 2: Folders view to allow selecting an entire folder of books
	const foldersView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS);
	foldersView.setIncludeFolders(true);
	foldersView.setSelectFolderEnabled(true);
	foldersView.setMimeTypes('application/vnd.google-apps.folder');

	const pickerBuilder = new window.google.picker.PickerBuilder()
		.setAppId(clientId.split('-')[0])
		.setOAuthToken(accessToken)
		.addView(filesView)
		.addView(foldersView)
		.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
		.enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
		.setTitle('Select EPUB/PDF files or a folder to import')
		.setCallback((data: any) => {
			if (data.action === window.google.picker.Action.PICKED) {
				const docs = data[window.google.picker.Response.DOCUMENTS] || [];
				const items: DriveFileItem[] = docs.map((doc: any) => ({
					id: doc[window.google.picker.Document.ID],
					name: doc[window.google.picker.Document.NAME],
					mimeType: doc[window.google.picker.Document.MIME_TYPE],
					size: doc[window.google.picker.Document.SIZE_BYTES],
				}));
				onSelect(items);
			} else if (data.action === window.google.picker.Action.CANCEL) {
				if (onCancel) onCancel();
			}
		});

	if (apiKey) {
		pickerBuilder.setDeveloperKey(apiKey);
	}

	const picker = pickerBuilder.build();
	picker.setVisible(true);
}

/**
 * Downloads a single file from Google Drive directly to a Blob in the browser
 * using the user's OAuth access token with Shared Drives support.
 */
export async function downloadDriveFile(
	fileId: string,
	accessToken: string,
	abortSignal?: AbortSignal
): Promise<{ blob: Blob; mimeType: string }> {
	const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;

	const response = await fetch(downloadUrl, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
		signal: abortSignal,
	});

	if (!response.ok) {
		if (response.status === 401) {
			cachedAccessToken = null; // Token expired
			throw new Error('Google authorization expired (401). Please re-authenticate.');
		}
		if (response.status === 403) {
			throw new Error('Access forbidden (403). Check that you have read permission for this file.');
		}
		if (response.status === 404) {
			throw new Error('File not found in Google Drive (404).');
		}
		throw new Error(`Google Drive download failed with HTTP ${response.status}: ${response.statusText}`);
	}

	const contentType = response.headers.get('content-type') || 'application/octet-stream';
	const blob = await response.blob();
	return { blob, mimeType: contentType };
}

/**
 * Recursively queries a Google Drive folder for EPUB and PDF files with pagination
 * and Shared Drives support.
 */
export async function listFilesInDriveFolder(
	folderId: string,
	accessToken: string,
	abortSignal?: AbortSignal
): Promise<DriveFileItem[]> {
	const foundFiles: DriveFileItem[] = [];
	let pageToken: string | null = null;

	do {
		let queryUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=100`;
		if (pageToken) {
			queryUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
		}

		const res = await fetch(queryUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
			signal: abortSignal,
		});

		if (!res.ok) {
			throw new Error(`Failed to list folder contents (HTTP ${res.status}).`);
		}

		const data = (await res.json()) as { nextPageToken?: string; files?: DriveFileItem[] };
		const files = data.files || [];

		for (const file of files) {
			const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
			const isEpubOrPdf =
				file.name.toLowerCase().endsWith('.epub') ||
				file.name.toLowerCase().endsWith('.pdf') ||
				file.mimeType === 'application/epub+zip' ||
				file.mimeType === 'application/pdf';

			if (isEpubOrPdf) {
				foundFiles.push(file);
			} else if (isFolder) {
				// Recurse into subfolders
				const subFiles = await listFilesInDriveFolder(file.id, accessToken, abortSignal);
				foundFiles.push(...subFiles);
			}
		}

		pageToken = data.nextPageToken || null;
	} while (pageToken);

	return foundFiles;
}
