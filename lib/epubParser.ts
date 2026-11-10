import JSZip from 'jszip';
import type { Fic, FicChapter } from './db';

/**
 * Escapes regex special characters to prevent RegExp injection bugs.
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safely escapes HTML special characters in plain text strings.
 */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Cleans and sanitizes a paragraph element's inner HTML:
 * - Strips all inline styles (preventing inherited font-style: italic, font-size, etc.)
 * - Strips all classes and IDs
 * - Preserves intentional inline formatting: <em>, <i>, <strong>, <b>, <br>, <code>, <span>, <a>
 * - Normalizes spacing and returns sanitized HTML or null if empty
 */
function sanitizeParagraphInnerHtml(p: HTMLElement): string | null {
	const clone = p.cloneNode(true) as HTMLElement;

	// Remove all scripts, styles, images, iframes
	clone.querySelectorAll('script, style, link, meta, img, iframe, input, button, form').forEach((el) => el.remove());

	// Strip all attributes from all elements
	const allElements = clone.querySelectorAll('*');
	allElements.forEach((el) => {
		const tagName = el.tagName.toLowerCase();
		// Allow safe inline tags: em, i, strong, b, br, code, span, a, sub, sup, del, s
		const safeTags = ['em', 'i', 'strong', 'b', 'br', 'code', 'span', 'a', 'sub', 'sup', 'del', 's'];
		if (!safeTags.includes(tagName)) {
			// Replace element with its text content
			const doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
			if (doc) {
				const textNode = doc.createTextNode(el.textContent || '');
				el.parentNode?.replaceChild(textNode, el);
			}
		} else {
			// Remove all attributes except href for links
			const href = tagName === 'a' ? el.getAttribute('href') : null;
			while (el.attributes.length > 0) {
				el.removeAttribute(el.attributes[0].name);
			}
			if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
				el.setAttribute('href', href);
				el.setAttribute('target', '_blank');
				el.setAttribute('rel', 'noopener noreferrer');
			}
		}
	});

	let inner = clone.innerHTML.trim();
	// Normalize multiple whitespace
	inner = inner.replace(/[ \t]+/g, ' ');

	// Check if paragraph is effectively empty
	const textContent = (clone.textContent || '').replace(/\u00a0/g, ' ').trim();
	if (!textContent && !inner.includes('<img')) {
		return null;
	}

	return inner;
}

/**
 * Cleans and formats an AO3 or EPUB summary:
 * - Decodes HTML entities properly
 * - Preserves paragraph breaks (<p>)
 * - Preserves intentional line breaks (<br>)
 * - Preserves intentional bold (<strong>, <b>) and italic (<em>, <i>)
 * - Removes unnecessary wrapper tags (blockquote, div.userstuff, heading tags)
 * - Returns clean HTML string (<p>...</p>) or null if no valid summary exists
 */
export function cleanAndFormatSummary(raw: string | null | undefined): string | null {
	if (!raw) return null;
	let trimmed = raw.trim();
	if (!trimmed) return null;

	const domParser = new DOMParser();

	// Step 1: Detect and decode HTML-escaped markup (e.g. &lt;p&gt;...&lt;/p&gt; from OPF dc:description)
	if (trimmed.includes('&lt;') && trimmed.includes('&gt;')) {
		const tempDoc = domParser.parseFromString(trimmed, 'text/html');
		const decoded = tempDoc.body.textContent || '';
		if (decoded.includes('<') && decoded.includes('>')) {
			trimmed = decoded.trim();
		}
	}

	// Step 2: Parse as HTML Document
	const doc = domParser.parseFromString(trimmed, 'text/html');
	const body = doc.body;

	// Remove unwanted elements
	body.querySelectorAll('script, style, link, meta, form, input, button, iframe, noscript').forEach((el) =>
		el.remove()
	);

	// Remove redundant summary or notes headings if present
	body.querySelectorAll('h1, h2, h3, h4, h5, h6, .heading, .title').forEach((h) => {
		const headingText = (h.textContent || '').trim().toLowerCase();
		if (
			headingText === 'summary' ||
			headingText === 'summary:' ||
			headingText === 'resumen' ||
			headingText === 'resumen:' ||
			headingText === 'notes' ||
			headingText === 'notas'
		) {
			h.remove();
		}
	});

	// If the summary is nested inside a container like .userstuff, .summary, blockquote, focus on it
	const contentRoot =
		body.querySelector('blockquote.userstuff, div.userstuff, div.summary blockquote, div.summary, blockquote') ||
		body;

	const cleanedParagraphs: string[] = [];

	// Step 3: Extract paragraphs
	const pElements = contentRoot.querySelectorAll('p');
	if (pElements.length > 0) {
		pElements.forEach((p) => {
			const sanitizedInner = sanitizeParagraphInnerHtml(p as HTMLElement);
			if (sanitizedInner) {
				cleanedParagraphs.push(`<p>${sanitizedInner}</p>`);
			}
		});
	}

	// Step 4: If no <p> tags were found, split by double newlines or breaks
	if (cleanedParagraphs.length === 0) {
		const clone = contentRoot.cloneNode(true) as HTMLElement;
		clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
		clone.querySelectorAll('hr').forEach((hr) => hr.replaceWith('\n\n'));

		const rawText = clone.textContent || '';
		const lines = rawText
			.replace(/\r\n/g, '\n')
			.split(/\n\n+/)
			.map((l) => l.trim())
			.filter(Boolean);

		for (const line of lines) {
			if (line.length > 0) {
				cleanedParagraphs.push(`<p>${escapeHtml(line)}</p>`);
			}
		}
	}

	if (cleanedParagraphs.length === 0) {
		return null;
	}

	// Verify total text content is non-trivial (prevent accidental single dots or placeholders)
	const combinedText = cleanedParagraphs.join(' ').replace(/<[^>]+>/g, '').trim();
	if (combinedText.length < 3) {
		return null;
	}

	return cleanedParagraphs.join('\n');
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
	const titleElement = htmlDoc.querySelector('h2.title, h2.heading, h2, h1, .chapter-title, .title');
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
				const sanitizedInner = sanitizeParagraphInnerHtml(p as HTMLElement);
				if (sanitizedInner) {
					htmlParagraphs.push(`<p>${sanitizedInner}</p>`);
					textParagraphs.push(text);
				}
			}
		});

		cleanHtml = htmlParagraphs.join('\n');
		cleanText = textParagraphs.join('\n\n');
	} else {
		// Fallback for files without <p> tags
		const cloneText = clone.textContent || '';
		const textLines = cloneText
			.replace(/\r\n/g, '\n')
			.split(/\n\n+/)
			.map((s) => s.trim())
			.filter(Boolean);

		cleanText = textLines.join('\n\n');
		cleanHtml = textLines.map((para) => `<p>${escapeHtml(para)}</p>`).join('\n');
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

	// Extract dc:description from OPF metadata
	const rawOpfDescription =
		opfDoc.querySelector('description')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:description')?.textContent?.trim() ||
		null;

	let summary: string | null = cleanAndFormatSummary(rawOpfDescription);

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

		// Fallback for summary: if not found in OPF, inspect AO3 preface summary block
		if (!summary) {
			const summaryEl = htmlDoc.querySelector(
				'div.summary blockquote.userstuff, div.summary blockquote, .summary .userstuff, div.summary, #summary'
			);
			if (summaryEl) {
				const extracted = cleanAndFormatSummary(summaryEl.innerHTML || summaryEl.textContent);
				if (extracted) summary = extracted;
			}
		}

		// Look for notes block
		if (!notes) {
			const notesEl = htmlDoc.querySelector(
				'div.notes blockquote.userstuff, div.notes blockquote, .notes .userstuff, div.notes, #notes'
			);
			if (notesEl) {
				const extracted = cleanAndFormatSummary(notesEl.innerHTML || notesEl.textContent);
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
			const prefaceEl = htmlDoc.querySelector('div.preface, body');
			if (prefaceEl) {
				const clonePreface = prefaceEl.cloneNode(true) as HTMLElement;
				// Remove the metadata tag block and the summary block from the reading content
				clonePreface
					.querySelectorAll('dl.tags, dl.meta, div.stats, div.summary, h2.toc-heading')
					.forEach((e) => e.remove());
				const { text, html } = cleanChapterHtml(domParser.parseFromString(clonePreface.outerHTML, 'text/html'));
				if (text.length > 30) {
					chapters.push({
						title: 'Prefacio y Notas',
						content: html || text,
					});
					accumulatedStoryText += text + '\n\n';
				}
			}
		} else if (!isCoverOrTitlepage) {
			// Extract standard chapter
			const chapterResult = cleanChapterHtml(htmlDoc);
			if (chapterResult.text.length > 30) {
				const chapterTitle = chapterResult.title || `Capítulo ${chapters.length + 1}`;
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
			chapters.push({ title: 'Obra Completa', content: accumulatedStoryText.trim() });
		} else {
			chapters.push({ title: 'Capítulo 1', content: '<p>No se encontró texto legible en este archivo.</p>' });
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
