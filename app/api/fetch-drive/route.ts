import { NextRequest, NextResponse } from 'next/server';

/**
 * Extracts the file or folder ID from various Google Drive URL formats.
 */
function parseGoogleDriveUrl(urlStr: string): { id: string; type: 'file' | 'folder' } | null {
	const trimmed = urlStr.trim();

	// Check if already just a Drive ID (alphanumeric with underscores and dashes)
	if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
		return { id: trimmed, type: 'file' };
	}

	try {
		// 1. Folder match: /folders/ID
		const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
		if (folderMatch && folderMatch[1]) {
			return { id: folderMatch[1], type: 'folder' };
		}

		// 2. File match: /file/d/ID
		const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
		if (fileMatch && fileMatch[1]) {
			return { id: fileMatch[1], type: 'file' };
		}

		// 3. Query param id=ID in open / uc / download
		const urlObj = new URL(trimmed);
		const idParam = urlObj.searchParams.get('id');
		if (idParam) {
			if (urlObj.pathname.includes('folders')) {
				return { id: idParam, type: 'folder' };
			}
			return { id: idParam, type: 'file' };
		}

		// 4. Fallback match for any /d/ID/
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
 * Google Drive V3 REST API Anonymous Proxy
 *
 * Interacts with public Google Drive files and folders using the Drive V3 REST API
 * and direct public download streams anonymously without user credentials or session popups.
 */
export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const inputUrl = searchParams.get('url');
	const action = searchParams.get('action') || 'download'; // 'download' | 'info' | 'list_folder'

	if (!inputUrl) {
		return NextResponse.json({ error: 'Parámetro "url" es requerido.' }, { status: 400 });
	}

	const parsed = parseGoogleDriveUrl(inputUrl);
	if (!parsed) {
		return NextResponse.json(
			{
				error:
					'No se pudo reconocer el enlace de Google Drive. Asegúrate de copiar el enlace compartido (ej: https://drive.google.com/file/d/... o https://drive.google.com/drive/folders/...).',
			},
			{ status: 400 }
		);
	}

	const { id, type } = parsed;
	const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

	// Case 1: The user provided a folder URL or requested to list a folder
	if (type === 'folder' || action === 'list_folder') {
		if (apiKey) {
			try {
				const driveApiUrl = `https://www.googleapis.com/drive/v3/files?q='${id}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${apiKey}`;
				const res = await fetch(driveApiUrl);

				if (!res.ok) {
					const errJson = await res.json().catch(() => ({}));
					throw new Error(errJson.error?.message || `HTTP ${res.status}`);
				}

				const data = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string; size?: string }> };
				const allFiles = data.files || [];

				const validFiles = allFiles
					.filter(
						(f) =>
							f.name.toLowerCase().endsWith('.epub') ||
							f.name.toLowerCase().endsWith('.pdf') ||
							f.mimeType === 'application/epub+zip' ||
							f.mimeType === 'application/pdf'
					)
					.map((f) => ({
						id: f.id,
						name: f.name,
						mimeType: f.mimeType,
						size: f.size ? parseInt(f.size, 10) : undefined,
						downloadUrl: `/api/fetch-drive?url=${encodeURIComponent(`https://drive.google.com/file/d/${f.id}`)}`,
					}));

				return NextResponse.json({
					type: 'folder',
					folderId: id,
					totalFound: allFiles.length,
					compatibleFiles: validFiles,
				});
			} catch (err: any) {
				return NextResponse.json(
					{
						error: `Error al consultar la carpeta en Google Drive V3 REST API: ${err.message}. Verifica que la carpeta tenga permisos de "Cualquier persona con el enlace".`,
					},
					{ status: 403 }
				);
			}
		}

		// When no server API key is set, inform the user clearly
		return NextResponse.json(
			{
				type: 'folder_requires_direct_links',
				folderId: id,
				message:
					'Google Drive V3 REST API requiere una clave de API pública en el servidor para listar carpetas públicas anónimamente. Puedes importar los archivos individualmente pegando sus enlaces directos ("Cualquier persona con el enlace").',
			},
			{ status: 200 }
		);
	}

	// Case 2: Individual public file - Fetch via Google Drive V3 REST API & public download stream
	try {
		let v3Metadata: { name?: string; mimeType?: string; size?: string } | null = null;

		// 1. If an API key is configured, query Drive V3 REST API for exact metadata
		if (apiKey) {
			try {
				const metaUrl = `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,size,description&supportsAllDrives=true&key=${apiKey}`;
				const metaRes = await fetch(metaUrl);
				if (metaRes.ok) {
					v3Metadata = await metaRes.json();
				}
			} catch {
				// Fallback to stream extraction
			}
		}

		// If caller only wanted info
		if (action === 'info' && v3Metadata) {
			return NextResponse.json(v3Metadata);
		}

		// 2. Download media stream: try Drive V3 media endpoint first if API key exists, then public web download
		const downloadUrls: string[] = [];
		if (apiKey) {
			downloadUrls.push(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${apiKey}`);
		}
		downloadUrls.push(
			`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
			`https://drive.google.com/uc?export=download&id=${id}&confirm=t`
		);

		let fileResponse: Response | null = null;
		let lastStatus = 0;

		for (const targetUrl of downloadUrls) {
			const res = await fetch(targetUrl, {
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					Accept: 'application/epub+zip, application/pdf, */*',
				},
				redirect: 'follow',
			});

			lastStatus = res.status;
			if (res.ok) {
				const contentType = (res.headers.get('content-type') || '').toLowerCase();
				// If Google returned an HTML notice page (virus warning or login) instead of the file
				if (contentType.includes('text/html')) {
					const textSample = await res.text();
					// Check if there is a download confirmation token for large files
					const confirmMatch =
						textSample.match(/href="(\/uc\?export=download[^"]+)"/) ||
						textSample.match(/action="https:\/\/drive\.usercontent\.google\.com\/download([^"]+)"/);

					if (confirmMatch && confirmMatch[1]) {
						const confirmUrl = confirmMatch[1].startsWith('http')
							? confirmMatch[1]
							: `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, '&')}`;
						const retryRes = await fetch(confirmUrl, {
							headers: {
								'User-Agent':
									'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
							},
							redirect: 'follow',
						});
						if (retryRes.ok) {
							fileResponse = retryRes;
							break;
						}
					}

					if (
						textSample.includes('No tienes permiso') ||
						textSample.includes('Sign in') ||
						textSample.includes('Inicia sesión')
					) {
						return NextResponse.json(
							{
								error:
									'El archivo no es público. Asegúrate de configurar el archivo en Google Drive como "Cualquier persona con el enlace puede ver".',
							},
							{ status: 403 }
						);
					}
				} else {
					fileResponse = res;
					break;
				}
			}
		}

		if (!fileResponse || !fileResponse.ok) {
			return NextResponse.json(
				{
					error: `Google Drive denegó la descarga del archivo (HTTP ${lastStatus || 404}). Asegúrate de que el enlace sea público ("Cualquier persona con el enlace").`,
				},
				{ status: 404 }
			);
		}

		// Determine filename: prefer V3 metadata, then Content-Disposition header, then fallback
		let fileName = v3Metadata?.name || '';
		if (!fileName) {
			const contentDisposition = fileResponse.headers.get('content-disposition') || '';
			const filenameMatch =
				contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) ||
				contentDisposition.match(/filename="?([^";]+)"?/i);
			if (filenameMatch && filenameMatch[1]) {
				fileName = decodeURIComponent(filenameMatch[1].trim());
			} else {
				const ct = fileResponse.headers.get('content-type') || '';
				fileName = ct.includes('pdf') ? 'documento.pdf' : 'obra.epub';
			}
		}

		const contentType =
			v3Metadata?.mimeType || fileResponse.headers.get('content-type') || 'application/octet-stream';
		const arrayBuffer = await fileResponse.arrayBuffer();

		return new NextResponse(arrayBuffer, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
				'X-Extracted-Filename': encodeURIComponent(fileName),
				'Cache-Control': 'no-store',
			},
		});
	} catch (error: any) {
		console.error('[Google Drive Fetch Error]:', error);
		return NextResponse.json(
			{ error: `Error al procesar la descarga de Google Drive V3: ${error.message || 'Error desconocido'}` },
			{ status: 500 }
		);
	}
}
