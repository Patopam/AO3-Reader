// Declaración explícita para el entorno del navegador
declare const window: any;
declare const document: any;

declare global {
	interface Window {
		gapi: any;
		google: any;
	}
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY || 'AIzaSyAJRzJqsycSev2cFsC3cDFzFLNkYI9MfCA';

function extractDriveId(url: string): { id: string; type: 'file' | 'folder' } | null {
	try {
		const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
		if (fileMatch) {
			return { id: fileMatch[1], type: 'file' };
		}

		const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
		if (folderMatch) {
			return { id: folderMatch[1], type: 'folder' };
		}
	} catch (e) {
		console.error('Error al parsear la URL:', e);
	}
	return null;
}

export async function importFromDriveLink(url: string, onFileParsed: (fileObj: File, name: string) => Promise<void>) {
	const parsed = extractDriveId(url);
	if (!parsed) {
		throw new Error(
			'El enlace de Google Drive no es válido. Asegúrate de que sea un link directo de archivo o carpeta.',
		);
	}

	if (parsed.type === 'file') {
		await downloadAndProcessFile(parsed.id, onFileParsed);
	} else if (parsed.type === 'folder') {
		const res = await fetch(
			`https://www.googleapis.com/drive/v3/files?q='${parsed.id}'+in+parents+and+trashed=false&key=${API_KEY}&fields=files(id, name, mimeType)`,
		);
		const data = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string }> };

		if (!data.files || data.files.length === 0) {
			throw new Error("La carpeta está vacía o no es pública ('Cualquier persona con el enlace').");
		}

		const validFiles = data.files.filter(
			(f) =>
				f.name.endsWith('.epub') ||
				f.name.endsWith('.pdf') ||
				f.mimeType === 'application/epub+zip' ||
				f.mimeType === 'application/pdf',
		);

		if (validFiles.length === 0) {
			throw new Error('Se encontró la carpeta, pero no contiene archivos .epub o .pdf en su raíz.');
		}

		for (const fileMeta of validFiles) {
			await downloadAndProcessFile(fileMeta.id, onFileParsed);
		}
	}
}

async function downloadAndProcessFile(fileId: string, onFileParsed: (fileObj: File, name: string) => Promise<void>) {
	const metaRes = await fetch(
		`https://www.googleapis.com/drive/v3/files/${fileId}?key=${API_KEY}&fields=name,mimeType`,
	);
	if (!metaRes.ok) {
		throw new Error('No se pudieron obtener los metadatos del archivo. Comprueba que el enlace sea público.');
	}

	const meta = (await metaRes.json()) as { name?: string; mimeType?: string };
	const fileName = meta.name || 'fic_descargado.epub';
	const mimeType = meta.mimeType || 'application/epub+zip';

	// URL directa de Google Drive que queríamos descargar
	const targetDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${API_KEY}`;

	// Usamos nuestra API interna de Next.js para evitar el bloqueo de CORS del navegador
	const fileRes = await fetch(`/api/fetch-epub?url=${encodeURIComponent(targetDownloadUrl)}`);

	if (!fileRes.ok) {
		throw new Error(
			`Google Drive bloqueó la descarga. Asegúrate de que el archivo sea público ("Cualquier persona con el enlace").`,
		);
	}

	const blob = await fileRes.blob();
	const fileObj = new File([blob], fileName, { type: mimeType });
	await onFileParsed(fileObj, fileName);
}
