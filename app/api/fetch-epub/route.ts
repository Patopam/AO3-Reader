import { NextResponse } from 'next/server';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	let targetUrl = searchParams.get('url');

	if (!targetUrl) {
		return NextResponse.json({ error: 'URL is required' }, { status: 400 });
	}

	try {
		// Transformar enlaces compartidos de Google Drive a descarga directa
		if (targetUrl.includes('drive.google.com')) {
			const fileIdMatch = targetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || targetUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
			if (fileIdMatch && fileIdMatch[1]) {
				targetUrl = `https://docs.google.com/uc?export=download&id=${fileIdMatch[1]}`;
			}
		}

		const response = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch target URL: ${response.statusText}`);
		}

		const arrayBuffer = await response.arrayBuffer();

		return new NextResponse(arrayBuffer, {
			headers: {
				'Content-Type': 'application/epub+zip',
				'Access-Control-Allow-Origin': '*',
			},
		});
	} catch (error) {
		console.error('API Proxy Error:', error);
		return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
	}
}
