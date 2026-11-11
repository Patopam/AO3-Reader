'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LibraryView } from './LibraryView';
import { ImportModal } from './ImportModal';
import { type Fic } from '../lib/db';

export default function AppShell() {
	const router = useRouter();
	const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
	const [refreshKey, setRefreshKey] = useState<number>(0);

	const handleSelectFic = (fic: Fic) => {
		if (fic.id) {
			router.push(`/fic/${fic.id}`);
		}
	};

	return (
		<div className='flex h-screen w-full bg-white text-gray-900 overflow-hidden relative'>
			<main className='flex-1 flex flex-col overflow-hidden'>
				<LibraryView
					key={refreshKey}
					onSelectFic={handleSelectFic}
					onOpenUpload={() => setIsImportModalOpen(true)}
				/>
			</main>

			{/* Comprehensive Import Modal */}
			<ImportModal
				isOpen={isImportModalOpen}
				onClose={() => setIsImportModalOpen(false)}
				onImportFinished={() => setRefreshKey((prev) => prev + 1)}
			/>
		</div>
	);
}
