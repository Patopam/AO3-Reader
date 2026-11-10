import JSZip from 'jszip';
import type { Fic, FicChapter } from './db';

/**
 * Escapes regex special characters to prevent RegExp injection bugs
 * when matching titles or summaries with brackets/parentheses.
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cleanly extracts text from an HTML element, preserving paragraph breaks
 * and linebreaks, with automatic HTML entity decoding via DOMParser.
 */
function extractStructuredText(element: Element | null): string {
	if (!element) return '';

	// Clone element so we can modify without side effects
	const clone = element.cloneNode(true) as HTMLElement;

	// Replace <br> and <hr> with newlines
	clone.querySelectorAll('br').forEach((br) => {
		br.replaceWith('\n');
	});
	clone.querySelectorAll('hr').forEach((hr) => {
		hr.replaceWith('\n\n');
	});

	// For block elements like <p>, <div>, <blockquote>, ensure separation
	const blocks = clone.querySelectorAll('p, div, blockquote, li, dt, dd, h1, h2, h3, h4, h5, h6');
	if (blocks.length > 0) {
		const parts: string[] = [];
		// If direct <p> tags exist, extract each
		const pTags = clone.querySelectorAll('p');
		if (pTags.length > 0) {
			pTags.forEach((p) => {
				const text = p.textContent?.trim();
				if (text) parts.push(text);
			});
			return parts.join('\n\n');
		}
	}

	const raw = clone.textContent || '';
	return raw
		.replace(/\r\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Robust EPUB Parser using standard DOMParser (XML/HTML) and JSZip.
 * Extracts rich AO3 metadata, OPF metadata, summaries, tags, and chapters
 * without inventing fake data.
 */
export async function parseEpubMetadata(
	file: File | Blob,
	fileName: string = 'story.epub'
): Promise<Omit<Fic, 'id' | 'fileId'>> {
	const arrayBuffer = await file.arrayBuffer();

	if (!arrayBuffer || arrayBuffer.byteLength < 50) {
		throw new Error('The file is empty or too small to be a valid EPUB.');
	}

	const zip = new JSZip();
	let zipContent: JSZip;
	try {
		zipContent = await zip.loadAsync(arrayBuffer);
	} catch {
		throw new Error('The file could not be unzipped. It may be corrupt or not a valid .epub archive.');
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

	// Fallback search if container.xml was missing or invalid
	if (!opfPath) {
		for (const filename of Object.keys(zipContent.files)) {
			if (filename.toLowerCase().endsWith('.opf')) {
				opfPath = filename;
				break;
			}
		}
	}

	if (!opfPath || !zipContent.file(opfPath)) {
		throw new Error('Invalid EPUB: No Package (.opf) file found inside archive.');
	}

	const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
	const opfText = await zipContent.file(opfPath)!.async('text');
	const opfDoc = domParser.parseFromString(opfText, 'application/xml');

	// Extract standard Dublin Core metadata
	const cleanTitle = opfDoc.querySelector('title')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:title')?.textContent?.trim() ||
		fileName.replace(/\.[^/.]+$/, '');

	const cleanAuthor = opfDoc.querySelector('creator')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:creator')?.textContent?.trim() ||
		'Unknown Author';

	const opfDescription = opfDoc.querySelector('description')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:description')?.textContent?.trim() ||
		null;

	const language = opfDoc.querySelector('language')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:language')?.textContent?.trim() ||
		null;

	const publishedDate = opfDoc.querySelector('date')?.textContent?.trim() ||
		opfDoc.querySelector('dc\\:date')?.textContent?.trim() ||
		null;

	// Subject tags from OPF
	const subjectTags: string[] = [];
	opfDoc.querySelectorAll('subject, dc\\:subject').forEach((s) => {
		const tag = s.textContent?.trim();
		if (tag && !subjectTags.includes(tag)) subjectTags.push(tag);
	});

	// 2. Read Manifest & Spine to load chapters in proper reading order
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

	// Variables for AO3 specific metadata
	let rating: string | null = null;
	const archiveWarnings: string[] = [];
	const categories: string[] = [];
	const fandoms: string[] = [];
	const relationships: string[] = [];
	const characters: string[] = [];
	const additionalTags: string[] = [...subjectTags];
	let summary: string | null = opfDescription;
	let notes: string | null = null;
	let parsedWordCount: number | null = null;
	let publicationStatus: 'Completed' | 'Work in Progress' | 'Unknown' | null = null;
	let updatedAt: string | null = null;

	const chapters: FicChapter[] = [];
	let accumulatedStoryText = '';

	// 3. Process spine files (or all HTML files if spine is empty)
	const fileHrefsToProcess: string[] = [];
	if (spineItemRefs.length > 0) {
		for (const idref of spineItemRefs) {
			const item = manifestItems.get(idref);
			if (item && (item.mediaType.includes('html') || item.href.endsWith('.html') || item.href.endsWith('.xhtml'))) {
				fileHrefsToProcess.push(item.href);
			}
		}
	} else {
		// Fallback: sort keys
		for (const filename of Object.keys(zipContent.files).sort()) {
			if (filename.endsWith('.html') || filename.endsWith('.xhtml') || filename.endsWith('.htm')) {
				fileHrefsToProcess.push(filename);
			}
		}
	}

	for (const rawHref of fileHrefsToProcess) {
		// Resolve relative path against OPF directory
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

		// Look for summary block
		if (!summary || summary.length < 20) {
			const summaryEl = htmlDoc.querySelector('.summary, #summary, [data-summary], div.preface > .summary');
			if (summaryEl) {
				const extracted = extractStructuredText(summaryEl);
				if (extracted) summary = extracted;
			}
		}

		// Look for notes block
		if (!notes) {
			const notesEl = htmlDoc.querySelector('.notes, #notes, div.preface > .notes');
			if (notesEl) {
				const extracted = extractStructuredText(notesEl);
				if (extracted) notes = extracted;
			}
		}

		// Is this purely a title page, cover, or preface metadata wrapper without story chapters?
		const lowerHref = rawHref.toLowerCase();
		const isCoverOrTitlepage =
			lowerHref.includes('cover') ||
			lowerHref.includes('titlepage') ||
			lowerHref.includes('title_page') ||
			lowerHref.includes('toc');

		// Check if there is actual chapter story text
		const storyContainer = htmlDoc.querySelector('div.userstuff, div.chapter, body');
		if (storyContainer && !isCoverOrTitlepage) {
			// Clone storyContainer to clean out preface metadata if repeated
			const cloned = storyContainer.cloneNode(true) as HTMLElement;
			cloned.querySelectorAll('div.preface, div.meta, dl.tags, dl.meta, div.stats').forEach((el) => el.remove());

			const chapterText = extractStructuredText(cloned);
			if (chapterText.length > 50) {
				// Determine chapter title
				let chapterTitle = `Chapter ${chapters.length + 1}`;
				const heading = htmlDoc.querySelector('h2, h1, h3, .chapter-title, .title');
				if (heading) {
					const headingText = heading.textContent?.trim();
					if (
						headingText &&
						headingText.length < 100 &&
						!headingText.toLowerCase().includes('archive of our own') &&
						!headingText.toLowerCase().includes('preface')
					) {
						chapterTitle = headingText;
					}
				}

				chapters.push({
					title: chapterTitle,
					content: chapterText,
				});
				accumulatedStoryText += chapterText + '\n\n';
			}
		}
	}

	// If no spine chapters were found, fall back to whatever text we have
	if (chapters.length === 0) {
		if (accumulatedStoryText.trim().length > 0) {
			chapters.push({ title: 'Full Work', content: accumulatedStoryText.trim() });
		} else {
			chapters.push({ title: 'Chapter 1', content: 'No readable text was found in this file.' });
		}
	}

	// Calculate word count from story chapters if not provided by AO3 stats
	const finalWordCount =
		parsedWordCount !== null
			? parsedWordCount
			: accumulatedStoryText.trim().length > 0
			? accumulatedStoryText
					.trim()
					.split(/\s+/)
					.filter(Boolean).length
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
