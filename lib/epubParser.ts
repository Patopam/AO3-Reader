import JSZip from 'jszip';
import type { Fic, FicChapter } from './db';

/**
 * Escapes regex special characters to prevent RegExp injection bugs.
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts plain text from an HTML element, preserving paragraph breaks
 * and linebreaks, with automatic HTML entity decoding via DOMParser.
 * Does NOT force italic styling.
 */
function extractStructuredPlainText(element: Element | null): string {
	if (!element) return '';

	const clone = element.cloneNode(true) as HTMLElement;

	// Remove scripts, styles
	clone.querySelectorAll('script, style').forEach((el) => el.remove());

	// Replace <br> with single newline and <hr> with double
	clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
	clone.querySelectorAll('hr').forEach((hr) => hr.replaceWith('\n\n'));

	// Find all paragraphs or block elements
	const blocks = clone.querySelectorAll('p, div, blockquote, dd, li, h1, h2, h3, h4, h5, h6');
	if (blocks.length > 0) {
		const parts: string[] = [];
		const pTags = clone.querySelectorAll('p');
		if (pTags.length > 0) {
			pTags.forEach((p) => {
				const text = p.textContent?.trim();
				if (text) parts.push(text);
			});
			if (parts.length > 0) {
				return parts.join('\n\n');
			}
		}
	}

	const raw = clone.textContent || '';
	return raw
		.replace(/\r\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Cleans chapter HTML to keep safe, readable formatting:
 * Preserves <p>, <em>, <strong>, <i>, <b>, <blockquote>, <h3>, etc.
 * Strips rogue stylesheets, scripts, and duplicate header metadata.
 */
function cleanChapterHtml(htmlDoc: Document): { title: string; html: string; text: string } {
	// Look for story body container (AO3 standard: div.userstuff, or main, or body)
	const storyContainer =
		htmlDoc.querySelector('div.userstuff, div[role="main"], article, div.chapter, body') || htmlDoc.body;

	const clone = (storyContainer ? storyContainer.cloneNode(true) : htmlDoc.body.cloneNode(true)) as HTMLElement;

	// Remove scripts, stylesheets, and preface tags blocks if repeated
	clone.querySelectorAll('script, style, link, meta, dl.tags, dl.meta, div.stats').forEach((el) => el.remove());

	// Determine chapter title
	let chapterTitle = '';
	const titleElement = htmlDoc.querySelector('h2.title, h2, h1, .chapter-title, .title');
	if (titleElement) {
		const rawTitle = titleElement.textContent?.trim();
		if (
			rawTitle &&
			rawTitle.length < 120 &&
			!rawTitle.toLowerCase().includes('archive of our own') &&
			!rawTitle.toLowerCase().includes('table of contents')
		) {
			chapterTitle = rawTitle;
		}
	}

	// Remove the chapter heading from the inside body if we already captured it
	if (chapterTitle) {
		clone.querySelectorAll('h1, h2, h3').forEach((h) => {
			if (h.textContent?.trim() === chapterTitle) {
				h.remove();
			}
		});
	}

	// Clean paragraphs and format
	const pList = clone.querySelectorAll('p');
	let cleanHtml = '';
	let cleanText = '';

	if (pList.length > 0) {
		const htmlParagraphs: string[] = [];
		const textParagraphs: string[] = [];

		pList.forEach((p) => {
			const text = p.textContent?.trim();
			if (text) {
				// Clean inner HTML: keep <em>, <strong>, <i>, <b>, <span>, <a>
				const inner = p.innerHTML
					.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
					.replace(/style="[^"]*"/gi, '')
					.trim();
				htmlParagraphs.push(`<p class="mb-4 leading-relaxed">${inner}</p>`);
				textParagraphs.push(text);
			}
		});

		cleanHtml = htmlParagraphs.join('\n');
		cleanText = textParagraphs.join('\n\n');
	} else {
		// Fallback for files without <p> tags
		const text = extractStructuredPlainText(clone);
		cleanText = text;
		cleanHtml = text
			.split(/\n\n+/)
			.map((para) => `<p class="mb-4 leading-relaxed">${para.trim()}</p>`)
			.join('\n');
	}

	return {
		title: chapterTitle,
		html: cleanHtml,
		text: cleanText,
	};
}

/**
 * Robust EPUB Parser using DOMParser (XML/HTML) and JSZip.
 * Separates library summary from book chapters/preface cleanly,
 * and maintains proper typography without forced italics.
 */
export async function parseEpubMetadata(
	file: File | Blob,
	fileName: string = 'story.epub'
): Promise<Omit<Fic, 'id' | 'fileId'>> {
	const arrayBuffer = await file.arrayBuffer();

	if (!arrayBuffer || arrayBuffer.byteLength < 50) {
		throw new Error('El archivo está vacío o no es un EPUB válido.');
	}

	const zip = new JSZip();
	let zipContent: JSZip;
	try {
		zipContent = await zip.loadAsync(arrayBuffer);
	} catch {
		throw new Error('El archivo no pudo descomprimirse. Es posible que esté corrupto o no sea un EPUB válido.');
	}

	const domParser = new DOMParser();

	// 1. Locate root OPF file from META-INF/container.xml
	let opfPath = '';
	const containerFile = zipContent.file('META-INF/container.xml');
	if (containerFile) {
		const containerXml = await containerFile.async('text');
		const containerDoc = domParser.parseFromString(containerXml, 'application/xml');
		const rootfile = containerDoc.querySelector('rootfile');
		opfPath = rootfile?.getAttribute('full-path') || '';
	}

	if (!opfPath) {
		for (const filename of Object.keys(zipContent.files)) {
			if (filename.toLowerCase().endsWith('.opf')) {
				opfPath = filename;
				break;
			}
		}
	}

	if (!opfPath || !zipContent.file(opfPath)) {
		throw new Error('Archivo EPUB no válido: No se encontró el archivo de paquete (.opf).');
	}

	const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
	const opfText = await zipContent.file(opfPath)!.async('text');
	const opfDoc = domParser.parseFromString(opfText, 'application/xml');

	// Extract standard Dublin Core metadata
	const cleanTitle =
		opfDoc.querySelector('title')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:title')?.textContent?.trim() ||
		fileName.replace(/\.[^/.]+$/, '');

	const cleanAuthor =
		opfDoc.querySelector('creator')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:creator')?.textContent?.trim() ||
		'Unknown Author';

	const opfDescription =
		opfDoc.querySelector('description')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:description')?.textContent?.trim() ||
		null;

	const language =
		opfDoc.querySelector('language')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:language')?.textContent?.trim() ||
		null;

	const publishedDate =
		opfDoc.querySelector('date')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:date')?.textContent?.trim() ||
		null;

	const subjectTags: string[] = [];
	opfDoc.querySelectorAll('subject, dc\\:subject').forEach((s) => {
		const tag = s.textContent?.trim();
		if (tag && !subjectTags.includes(tag)) subjectTags.push(tag);
	});

	// Read Manifest & Spine for chapter order
	const manifestItems = new Map<string, { href: string; mediaType: string }>();
	opfDoc.querySelectorAll('manifest > item').forEach((item) => {
		const id = item.getAttribute('id');
		const href = item.getAttribute('href');
		const mediaType = item.getAttribute('media-type') || '';
		if (id && href) {
			manifestItems.set(id, { href, mediaType });
		}
	});

	const spineItemRefs: string[] = [];
	opfDoc.querySelectorAll('spine > itemref').forEach((itemref) => {
		const idref = itemref.getAttribute('idref');
		if (idref) spineItemRefs.push(idref);
	});

	// AO3 metadata accumulators
	let rating: string | null = null;
	const archiveWarnings: string[] = [];
	const categories: string[] = [];
	const fandoms: string[] = [];
	const relationships: string[] = [];
	const characters: string[] = [];
	const additionalTags: string[] = [...subjectTags];
	let summary: string | null = opfDescription ? extractStructuredPlainText(domParser.parseFromString(opfDescription, 'text/html').body) : null;
	let notes: string | null = null;
	let parsedWordCount: number | null = null;
	let publicationStatus: 'Completed' | 'Work in Progress' | 'Unknown' | null = null;
	let updatedAt: string | null = null;

	const chapters: FicChapter[] = [];
	let accumulatedStoryText = '';

	const fileHrefsToProcess: string[] = [];
	if (spineItemRefs.length > 0) {
		for (const idref of spineItemRefs) {
			const item = manifestItems.get(idref);
			if (item && (item.mediaType.includes('html') || item.href.endsWith('.html') || item.href.endsWith('.xhtml'))) {
				fileHrefsToProcess.push(item.href);
			}
		}
	} else {
		for (const filename of Object.keys(zipContent.files).sort()) {
			if (filename.endsWith('.html') || filename.endsWith('.xhtml') || filename.endsWith('.htm')) {
				fileHrefsToProcess.push(filename);
			}
		}
	}

	for (const rawHref of fileHrefsToProcess) {
		const resolvedPath = rawHref.startsWith('/') ? rawHref.slice(1) : opfDir + rawHref;
		const zipEntry = zipContent.file(resolvedPath) || zipContent.file(rawHref);
		if (!zipEntry) continue;

		const htmlText = await zipEntry.async('text');
		const htmlDoc = domParser.parseFromString(htmlText, 'text/html');

		// Look for AO3 tags dl (<dl class="tags"> or <dl class="meta">)
		const tagsDl = htmlDoc.querySelector('dl.tags, dl.meta, dl');
		if (tagsDl) {
			let currentKey = '';
			tagsDl.querySelectorAll('dt, dd').forEach((node) => {
				if (node.tagName.toLowerCase() === 'dt') {
					currentKey = (node.textContent || '').replace(/:$/, '').trim().toLowerCase();
				} else if (node.tagName.toLowerCase() === 'dd' && currentKey) {
					const values = (node.textContent || '')
						.split(',')
						.map((v) => v.trim())
						.filter(Boolean);

					if (currentKey.includes('rating')) {
						rating = node.textContent?.trim() || null;
					} else if (currentKey.includes('archive warning') || currentKey.includes('warning')) {
						values.forEach((w) => {
							if (!archiveWarnings.includes(w)) archiveWarnings.push(w);
						});
					} else if (currentKey.includes('category')) {
						values.forEach((c) => {
							if (!categories.includes(c)) categories.push(c);
						});
					} else if (currentKey.includes('fandom')) {
						values.forEach((f) => {
							if (!fandoms.includes(f)) fandoms.push(f);
						});
					} else if (currentKey.includes('relationship')) {
						values.forEach((r) => {
							if (!relationships.includes(r)) relationships.push(r);
						});
					} else if (currentKey.includes('character')) {
						values.forEach((ch) => {
							if (!characters.includes(ch)) characters.push(ch);
						});
					} else if (currentKey.includes('additional tag') || currentKey.includes('freeform')) {
						values.forEach((t) => {
							if (!additionalTags.includes(t)) additionalTags.push(t);
						});
					} else if (currentKey.includes('stats')) {
						const statsText = node.textContent || '';
						const wordsMatch = statsText.match(/Words:\s*([\d,.]+)/i);
						if (wordsMatch && wordsMatch[1]) {
							parsedWordCount = parseInt(wordsMatch[1].replace(/[,.]/g, ''), 10) || null;
						}
						const chaptersMatch = statsText.match(/Chapters:\s*(\d+)\/(\d+|\?)/i);
						if (chaptersMatch) {
							const current = parseInt(chaptersMatch[1], 10);
							const total = chaptersMatch[2];
							if (total !== '?' && current >= parseInt(total, 10)) {
								publicationStatus = 'Completed';
							} else if (total === '?' || current < parseInt(total, 10)) {
								publicationStatus = 'Work in Progress';
							}
						}
						const completedMatch = statsText.match(/Completed:\s*([\d-]+)/i);
						if (completedMatch && completedMatch[1]) {
							publicationStatus = 'Completed';
							updatedAt = completedMatch[1];
						}
						const updatedMatch = statsText.match(/Updated:\s*([\d-]+)/i);
						if (updatedMatch && updatedMatch[1]) {
							updatedAt = updatedMatch[1];
						}
					}
				}
			});
		}

		// Look for summary block for library card metadata
		if (!summary || summary.length < 20) {
			const summaryEl = htmlDoc.querySelector('.summary, #summary, [data-summary], div.summary > blockquote');
			if (summaryEl) {
				const extracted = extractStructuredPlainText(summaryEl);
				if (extracted) summary = extracted;
			}
		}

		// Look for notes block
		if (!notes) {
			const notesEl = htmlDoc.querySelector('.notes, #notes, div.notes > blockquote');
			if (notesEl) {
				const extracted = extractStructuredPlainText(notesEl);
				if (extracted) notes = extracted;
			}
		}

		const lowerHref = rawHref.toLowerCase();
		const isCoverOrTitlepage =
			lowerHref.includes('cover') ||
			lowerHref.includes('titlepage') ||
			lowerHref.includes('title_page') ||
			lowerHref.includes('toc');

		// Check if this file is a dedicated Preface or Foreword section
		const isPreface = lowerHref.includes('preface') || htmlDoc.querySelector('div.preface') !== null;

		if (isPreface && !isCoverOrTitlepage) {
			// Extract Preface as its own readable section if it contains notes/prologue
			const prefaceNotesEl = htmlDoc.querySelector('div.preface .notes, div.preface .userstuff, div.preface');
			if (prefaceNotesEl) {
				const cloneNotes = prefaceNotesEl.cloneNode(true) as HTMLElement;
				cloneNotes.querySelectorAll('dl.tags, dl.meta, div.stats, div.summary').forEach((e) => e.remove());
				const { text, html } = cleanChapterHtml(domParser.parseFromString(cloneNotes.outerHTML, 'text/html'));
				if (text.length > 40) {
					chapters.push({
						title: 'Preface & Notes',
						content: html || text,
					});
					accumulatedStoryText += text + '\n\n';
				}
			}
		} else if (!isCoverOrTitlepage) {
			// Extract standard chapter
			const chapterResult = cleanChapterHtml(htmlDoc);
			if (chapterResult.text.length > 40) {
				const chapterTitle = chapterResult.title || `Chapter ${chapters.length + 1}`;
				chapters.push({
					title: chapterTitle,
					content: chapterResult.html || chapterResult.text,
				});
				accumulatedStoryText += chapterResult.text + '\n\n';
			}
		}
	}

	if (chapters.length === 0) {
		if (accumulatedStoryText.trim().length > 0) {
			chapters.push({ title: 'Full Work', content: accumulatedStoryText.trim() });
		} else {
			chapters.push({ title: 'Chapter 1', content: '<p>No se encontró texto legible en este archivo.</p>' });
		}
	}

	const finalWordCount =
		parsedWordCount !== null
			? parsedWordCount
			: accumulatedStoryText.trim().length > 0
			? accumulatedStoryText.trim().split(/\s+/).filter(Boolean).length
			: null;

	const fandomString = fandoms.length > 0 ? fandoms.join(', ') : 'General Fandom';

	return {
		title: cleanTitle,
		author: cleanAuthor,
		summary,
		fandoms,
		fandom: fandomString,
		relationships,
		characters,
		additionalTags,
		tags: additionalTags,
		warnings: archiveWarnings,
		archiveWarnings,
		category: categories,
		rating,
		wordCount: finalWordCount,
		chapterCount: chapters.length,
		publicationStatus: publicationStatus || (chapters.length > 0 ? 'Completed' : 'Unknown'),
		publishedAt: publishedDate,
		updatedAt,
		language,
		format: 'epub',
		source: 'local',
		importedAt: Date.now(),
		isFavorite: false,
		isRead: false,
		lastReadAt: null,
		readingProgress: 0,
		currentChapterIdx: 0,
		notes,
		chapters,
		fullTextContent: accumulatedStoryText.trim(),
	};
}
