import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for downloading publicly accessible EPUB or PDF files
 * to bypass browser CORS restrictions when pasting direct links.
 *
 * NOTE: Google Drive private and shared drive files are imported directly
 * in the client via Google Identity Services (OAuth) and Google Picker API.
 */
export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const targetUrl = searchParams.get('url');

	if (!targetUrl) {
		return NextResponse.json({ error: 'Parameter "url" is required' }, { status: 400 });
	}

	try {
		const parsedUrl = new URL(targetUrl);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			return NextResponse.json({ error: 'Only HTTP and HTTPS URLs are allowed' }, { status: 400 });
		}

		// Security: prevent SSRF to local internal network
		const hostname = parsedUrl.hostname.toLowerCase();
		if (
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '0.0.0.0' ||
			hostname.startsWith('10.') ||
			hostname.startsWith('192.168.') ||
			hostname.startsWith('172.') ||
			hostname.endsWith('.internal') ||
			hostname.endsWith('.local')
		) {
			return NextResponse.json({ error: 'Access to private internal network addresses is blocked' }, { status: 403 });
		}

		const response = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; AO3Reader/1.0; +https://archiveofourown.org)',
				Accept: 'application/epub+zip, application/pdf, */*',
			},
			redirect: 'follow',
		});

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Remote server responded with status ${response.status} (${response.statusText})` },
				{ status: response.status }
			);
		}

		const contentType = response.headers.get('content-type') || 'application/octet-stream';
		const arrayBuffer = await response.arrayBuffer();

		return new NextResponse(arrayBuffer, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'no-store',
				'Access-Control-Allow-Origin': '*',
			},
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown network error';
		console.error('[API fetch-epub error]:', message);
		return NextResponse.json({ error: `Failed to download file: ${message}` }, { status: 500 });
	}
}
