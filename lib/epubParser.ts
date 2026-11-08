import JSZip from 'jszip';

export async function parseEpubMetadata(file: File) {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const zip = new JSZip();
		const zipContent = await zip.loadAsync(arrayBuffer);

		let extractedTitle = file.name.replace(/\.[^/.]+$/, '');
		let extractedAuthor = 'Desconocido';
		let extractedFandom = 'General Fandom';
		let extractedRating = 'Not Rated';
		let extractedWarnings: string[] = [];
		let extractedCategory: string[] = [];
		let extractedRelationships: string[] = [];
		let extractedCharacters: string[] = [];
		let extractedTags: string[] = [];
		let extractedSummary = '';
		let extractedNotes = '';

		const chapters: { title: string; content: string }[] = [];
		let fullText = '';
		const fileKeys = Object.keys(zipContent.files).sort();

		for (const filename of fileKeys) {
			if (filename.endsWith('.opf')) {
				const opfText = await zipContent.files[filename].async('text');
				const authorMatch = opfText.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
				if (authorMatch && authorMatch[1]) extractedAuthor = authorMatch[1].replace(/<[^>]*>?/gm, '').trim();

				const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
				if (titleMatch && titleMatch[1]) extractedTitle = titleMatch[1].replace(/<[^>]*>?/gm, '').trim();
			}
		}

		for (const filename of fileKeys) {
			if (filename.endsWith('.html') || filename.endsWith('.xhtml') || filename.endsWith('.htm')) {
				let htmlText = await zipContent.files[filename].async('text');

				if (!extractedSummary) {
					const summaryMatch =
						htmlText.match(/<div class="summary"[^>]*>([\s\S]*?)<\/div>/i) ||
						htmlText.match(/Summary:?<\/h[234]>[\s\S]*?<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
					if (summaryMatch && summaryMatch[1]) {
						extractedSummary = summaryMatch[1]
							.replace(/<br\s*[\/]?>/gi, '\n')
							.replace(/<\/p>/gi, '\n\n')
							.replace(/<[^>]*>?/gm, '')
							.trim();
					}
				}

				if (!extractedNotes) {
					const notesMatch =
						htmlText.match(/<div class="notes"[^>]*>([\s\S]*?)<\/div>/i) ||
						htmlText.match(/Notes:?<\/h[234]>[\s\S]*?<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
					if (notesMatch && notesMatch[1]) {
						extractedNotes = notesMatch[1]
							.replace(/<br\s*[\/]?>/gi, '\n')
							.replace(/<\/p>/gi, '\n\n')
							.replace(/<[^>]*>?/gm, '')
							.trim();
					}
				}

				if (htmlText.includes('Rating:') || htmlText.includes('Archive Warning:') || htmlText.includes('Stats:')) {
					const ratingMatch = htmlText.match(/Rating:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
					if (ratingMatch && ratingMatch[1]) extractedRating = ratingMatch[1].replace(/<[^>]*>?/gm, '').trim();

					const warningMatch = htmlText.match(/Archive Warning:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
					if (warningMatch && warningMatch[1]) {
						extractedWarnings = warningMatch[1]
							.replace(/<[^>]*>?/gm, '')
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
					}

					const catMatch = htmlText.match(/Category:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
					if (catMatch && catMatch[1]) {
						extractedCategory = catMatch[1]
							.replace(/<[^>]*>?/gm, '')
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
					}

					const fandomMatch = htmlText.match(/Fandoms?:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
					if (fandomMatch && fandomMatch[1]) {
						const rawFandoms = fandomMatch[1]
							.replace(/<[^>]*>?/gm, '')
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
						extractedFandom = Array.from(new Set(rawFandoms)).join(', ');
					}

					const relMatch = htmlText.match(/Relationship:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
					if (relMatch && relMatch[1]) {
						extractedRelationships = relMatch[1]
							.replace(/<[^>]*>?/gm, '')
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
					}

					const charMatch = htmlText.match(/Characters?:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
					if (charMatch && charMatch[1]) {
						extractedCharacters = charMatch[1]
							.replace(/<[^>]*>?/gm, '')
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
					}

					const tagsMatch = htmlText.match(/Additional Tags:<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
					if (tagsMatch && tagsMatch[1]) {
						extractedTags = tagsMatch[1]
							.replace(/<[^>]*>?/gm, '')
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
					}
				}

				const isCover =
					filename.toLowerCase().includes('cover') ||
					filename.toLowerCase().includes('titlepage') ||
					filename.toLowerCase().includes('toc');

				if (!isCover) {
					let cleanedHtml = htmlText
						.replace(/<div class="preface group">[\s\S]*?<\/div>/gi, '')
						.replace(/<div class="meta group">[\s\S]*?<\/div>/gi, '')
						.replace(/<div class="summary module">[\s\S]*?<\/div>/gi, '')
						.replace(/<div class="notes module">[\s\S]*?<\/div>/gi, '')
						.replace(/<div class="stats">[\s\S]*?<\/div>/gi, '')
						.replace(/<dl class="meta">[\s\S]*?<\/dl>/gi, '');

					let cleanText = cleanedHtml
						.replace(/<br\s*[\/]?>/gi, '\n')
						.replace(/<\/p>/gi, '\n\n')
						.replace(/<[^>]*>?/gm, '')
						.trim();

					const lines = cleanText.split('\n');
					let startIndex = 0;

					// Bucle inteligente para saltar todas las líneas iniciales que formen parte de la cabecera de AO3
					for (let i = 0; i < lines.length; i++) {
						const lower = lines[i].trim().toLowerCase();
						const isHeaderLine =
							lower.startsWith('preface') ||
							lower.startsWith('posted originally on') ||
							lower.startsWith('rating:') ||
							lower.startsWith('archive warning:') ||
							lower.startsWith('category:') ||
							lower.startsWith('fandoms:') ||
							lower.startsWith('relationship:') ||
							lower.startsWith('characters:') ||
							lower.startsWith('additional tags:') ||
							lower.startsWith('language:') ||
							lower.startsWith('stats:') ||
							lower.startsWith('published:') ||
							lower.startsWith('words:') ||
							lower.startsWith('chapters:') ||
							lower.startsWith('teen and up audiences') ||
							lower.startsWith('explicit') ||
							lower.startsWith('mature') ||
							lower.startsWith('general audiences') ||
							lower.startsWith('not rated') ||
							lower.startsWith('no archive warnings apply') ||
							lower.includes('archiveofourown.org') ||
							lower === 'summary:' ||
							lower === extractedTitle.toLowerCase() ||
							lower === extractedAuthor.toLowerCase();

						if (!isHeaderLine && lines[i].trim().length > 3) {
							// Encontramos el punto donde empieza la historia real
							startIndex = i;
							break;
						}
					}

					// Cortamos todo el contenido basura anterior
					const finalLines = lines.slice(startIndex);
					cleanText = finalLines
						.join('\n')
						.replace(/\n{3,}/g, '\n\n')
						.trim();

					if (cleanText.length > 30) {
						const titleMatch =
							htmlText.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || htmlText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
						let chapterTitle = `Chapter ${chapters.length + 1}`;
						if (titleMatch && titleMatch[1]) {
							const parsedTitle = titleMatch[1].replace(/<[^>]*>?/gm, '').trim();
							if (
								parsedTitle &&
								parsedTitle.length < 50 &&
								!parsedTitle.toLowerCase().includes('archive') &&
								!parsedTitle.toLowerCase().includes('preface')
							) {
								chapterTitle = parsedTitle;
							}
						}

						chapters.push({
							title: chapterTitle,
							content: cleanText,
						});
						fullText += cleanText + '\n\n';
					}
				}
			}
		}

		if (chapters.length === 0 && fullText.trim().length > 0) {
			chapters.push({ title: 'Full Work', content: fullText.trim() });
		}

		if (chapters.length === 0) {
			chapters.push({ title: 'Chapter 1', content: 'No readable content found.' });
		}

		if (!extractedSummary) {
			extractedSummary =
				chapters.length > 0 ? chapters[0].content.slice(0, 350).trim() + '...' : 'No summary provided.';
		}

		if (extractedWarnings.length === 0) extractedWarnings = ['No Archive Warnings Apply'];
		if (extractedCategory.length === 0) extractedCategory = ['M/M'];

		const wordCount = fullText.trim() ? fullText.split(/\s+/).length : 600;

		return {
			title: extractedTitle,
			author: extractedAuthor,
			rating: extractedRating,
			archiveWarnings: Array.from(new Set(extractedWarnings)),
			category: Array.from(new Set(extractedCategory)),
			fandom: extractedFandom,
			relationships: Array.from(new Set(extractedRelationships)),
			characters: Array.from(new Set(extractedCharacters)),
			tags: Array.from(new Set(extractedTags)),
			summary: extractedSummary,
			notes: extractedNotes,
			wordCount,
			chapters,
			fullTextContent: fullText.trim() || 'No content found.',
		};
	} catch (e) {
		console.error('Error parsing epub:', e);
		return {
			title: file.name.replace(/\.[^/.]+$/, ''),
			author: 'Desconocido',
			rating: 'Not Rated',
			archiveWarnings: ['Creator Chose Not To Use Archive Warnings'],
			category: ['Gen'],
			fandom: 'General Fandom',
			relationships: [],
			characters: [],
			tags: ['General'],
			summary: 'No summary available.',
			notes: '',
			wordCount: 5000,
			chapters: [{ title: 'Chapter 1', content: 'Error loading file.' }],
			fullTextContent: 'Error loading file content.',
		};
	}
}
