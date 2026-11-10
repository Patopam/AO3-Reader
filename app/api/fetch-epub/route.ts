import { NextResponse } from 'next/server';

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY || 'AIzaSyAJRzJqsycSev2cFsC3cDFzFLNkYI9MfCA';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	let targetUrl = searchParams.get('url');

	if (!targetUrl) {
		return NextResponse.json({ error: 'URL is required' }, { status: 400 });
	}

	try {
		// 1. Detectar si es una carpeta de Google Drive (personal o de Unidad Compartida)
		const folderMatch = targetUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
		if (folderMatch && folderMatch[1]) {
			const folderId = folderMatch[1];

			// Añadimos supportsAllDrives=true e includeItemsFromAllDrives=true para soportar Unidades Compartidas
			const driveQueryUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&key=${API_KEY}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id, name, mimeType)`;

			const res = await fetch(driveQueryUrl);
			const data: any = await res.json();

			if (!data.files || data.files.length === 0) {
				return NextResponse.json(
					{ error: 'La carpeta está vacía, no es pública o requiere permisos de la organización.' },
					{ status: 400 },
				);
			}

			// Filtrar únicamente los archivos EPUB
			const epubFiles = data.files.filter(
				(f: any) => f.name.toLowerCase().endsWith('.epub') || f.mimeType === 'application/epub+zip',
			);

			if (epubFiles.length === 0) {
				return NextResponse.json(
					{ error: 'Se encontró la carpeta, pero no contiene archivos .epub en su raíz.' },
					{ status: 400 },
				);
			}

			// Descargar todos los EPUBs de la carpeta
			const downloadedFiles = [];
			for (const fileMeta of epubFiles) {
				const downloadRes = await fetch(
					`https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media&key=${API_KEY}&supportsAllDrives=true`,
				);
				if (downloadRes.ok) {
					const buffer = await downloadRes.arrayBuffer();
					downloadedFiles.push({
						name: fileMeta.name,
						data: Buffer.from(buffer).toString('base64'),
					});
				}
			}

			return NextResponse.json({ files: downloadedFiles });
		}

		// 2. Si es un archivo individual de Google Drive
		if (targetUrl.includes('drive.google.com')) {
			const fileIdMatch = targetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || targetUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
			if (fileIdMatch && fileIdMatch[1]) {
				targetUrl = `https://www.googleapis.com/drive/v3/files/${fileIdMatch[1]}?alt=media&key=${API_KEY}&supportsAllDrives=true`;
			}
		}

		const response = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
			},
			redirect: 'follow',
		});

		if (!response.ok) {
			return NextResponse.json({ error: `Failed to fetch: ${response.status}` }, { status: response.status });
		}

		const arrayBuffer = await response.arrayBuffer();

		return new NextResponse(arrayBuffer, {
			headers: {
				'Content-Type': 'application/epub+zip',
				'Access-Control-Allow-Origin': '*',
			},
		});
	} catch (error) {
		console.error('API Route Error:', error);
		return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
