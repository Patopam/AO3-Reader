'use client';

import React from 'react';

interface FicSummaryProps {
	summary: string | null | undefined;
	isExpanded?: boolean;
	clampLines?: number;
	className?: string;
}

/**
 * Renders an AO3 fic summary with:
 * - Proper paragraph breaks
 * - Clean entity decoding
 * - Intentional bold and italic preserved (<em>, <strong>, <i>, <b>)
 * - Normal font style for all base text (NO forced italics)
 * - Consistent, comfortable paragraph margins without excessive vertical spacing
 */
export function FicSummary({
	summary,
	isExpanded = true,
	clampLines = 3,
	className = '',
}: FicSummaryProps) {
	if (!summary || !summary.trim()) {
		return (
			<p className='text-gray-400 italic text-[11px] font-sans'>
				Sin resumen disponible.
			</p>
		);
	}

	const trimmed = summary.trim();

	// If the summary is formatted as HTML paragraphs (<p>...</p>)
	if (trimmed.includes('<p>') || trimmed.includes('<div>') || trimmed.includes('<br')) {
		return (
			<div
				className={`font-normal not-italic text-gray-800 text-xs font-sans leading-relaxed space-y-2 [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_p]:font-normal [&_p]:not-italic [&_em]:italic [&_i]:italic [&_strong]:font-bold [&_b]:font-bold [&_blockquote]:not-italic [&_blockquote]:font-normal [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:my-2 ${
					!isExpanded && clampLines ? `line-clamp-${clampLines}` : ''
				} ${className}`}
				dangerouslySetInnerHTML={{ __html: trimmed }}
			/>
		);
	}

	// If the summary is stored as plain text with double newlines
	const paragraphs = trimmed
		.replace(/\r\n/g, '\n')
		.split(/\n\n+/)
		.map((p) => p.trim())
		.filter(Boolean);

	return (
		<div
			className={`font-normal not-italic text-gray-800 text-xs font-sans leading-relaxed space-y-2 ${
				!isExpanded && clampLines ? `line-clamp-${clampLines}` : ''
			} ${className}`}
		>
			{paragraphs.map((para, idx) => (
				<p key={idx} className='mb-2.5 last:mb-0 font-normal not-italic text-gray-800 leading-relaxed'>
					{para}
				</p>
			))}
		</div>
	);
}
