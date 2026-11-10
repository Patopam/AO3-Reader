import * as pdfjsLib from 'pdfjs-dist';
import type { Fic } from './db';

// Ensure worker is configured for the local worker file in public/
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
	pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

/**
 * Extracts metadata and text preview from a PDF file using pdfjs-dist.
 */
export async function parsePdfMetadata(
	file: File | Blob,
	fileName: string = 'document.pdf'
): Promise<Omit<Fic, 'id' | 'fileId'>> {
	const arrayBuffer = await file.arrayBuffer();

	if (!arrayBuffer || arrayBuffer.byteLength < 50) {
		throw new Error('The file is empty or too small to be a valid PDF.');
	}

	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(arrayBuffer),
		useSystemFonts: true,
	});

	const pdfDoc = await loadingTask.promise;
	const numPages = pdfDoc.numPages;

	let metadataInfo: Record<string, any> = {};
	try {
		const meta = await pdfDoc.getMetadata();
		if (meta?.info) {
			metadataInfo = meta.info as Record<string, any>;
		}
	} catch (e) {
		console.warn('Could not read PDF metadata info block:', e);
	}

	const fallbackTitle = fileName.replace(/\.[^/.]+$/, '');
	const title = (metadataInfo.Title && String(metadataInfo.Title).trim()) || fallbackTitle;
	const author = (metadataInfo.Author && String(metadataInfo.Author).trim()) || 'Unknown Author';
	const subject = metadataInfo.Subject && String(metadataInfo.Subject).trim();
	const keywords = metadataInfo.Keywords && String(metadataInfo.Keywords).trim();

	// Extract tags from keywords if present
	const additionalTags: string[] = [];
	if (keywords) {
		keywords.split(/[,;]/).forEach((k: string) => {
			const tag = k.trim();
			if (tag && !additionalTags.includes(tag)) additionalTags.push(tag);
		});
	}

	// Extract first 1-3 pages text for preview summary & word count estimation
	let previewText = '';
	let totalWordCount = 0;
	const pagesToSample = Math.min(numPages, 5);

	for (let i = 1; i <= pagesToSample; i++) {
		try {
			const page = await pdfDoc.getPage(i);
			const textContent = await page.getTextContent();
			const pageString = textContent.items
				.map((item: any) => ('str' in item ? item.str : ''))
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();

			if (pageString) {
				if (!previewText) {
					previewText = pageString;
				}
				const words = pageString.split(/\s+/).filter(Boolean).length;
				totalWordCount += words;
			}
		} catch (pageErr) {
			console.warn(`Error reading PDF page ${i}:`, pageErr);
		}
	}

	// Extrapolate total word count across all pages
	const estimatedWordCount =
		pagesToSample > 0 && totalWordCount > 0
			? Math.round((totalWordCount / pagesToSample) * numPages)
			: null;

	const summary =
		subject ||
		(previewText ? (previewText.length > 500 ? previewText.slice(0, 500).trim() + '...' : previewText) : null);

	return {
		title,
		author,
		summary,
		fandoms: [],
		fandom: 'Document / PDF',
		relationships: [],
		characters: [],
		additionalTags,
		tags: additionalTags,
		warnings: [],
		archiveWarnings: [],
		category: [],
		rating: null,
		wordCount: estimatedWordCount,
		chapterCount: numPages,
		publicationStatus: 'Completed',
		publishedAt: metadataInfo.CreationDate ? String(metadataInfo.CreationDate).slice(2, 10) : null,
		updatedAt: null,
		language: null,
		format: 'pdf',
		source: 'local',
		importedAt: Date.now(),
		isFavorite: false,
		isRead: false,
		lastReadAt: null,
		readingProgress: 0,
		currentPdfPage: 1,
		notes: null,
		fullTextContent: previewText,
	};
}
