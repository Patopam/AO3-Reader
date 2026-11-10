'use client';

import React, { useState } from 'react';
import { LibraryView } from './LibraryView';
import { ReaderView } from './ReaderView';
import { ImportModal } from './ImportModal';
import { db, type Fic } from '../lib/db';

export default function AppShell() {
	const [selectedFic, setSelectedFic] = useState<Fic | null>(null);
	const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
	const [refreshKey, setRefreshKey] = useState<number>(0);

	const handleSelectFic = async (fic: Fic) => {
		// Fetch fresh copy from IndexedDB in case it was updated
		if (fic.id) {
			const fresh = await db.fics.get(fic.id);
			setSelectedFic(fresh || fic);
		} else {
			setSelectedFic(fic);
		}
	};

	const handleBackToLibrary = () => {
		setSelectedFic(null);
		setRefreshKey((prev) => prev + 1);
	};

	if (selectedFic) {
		return (
			<ReaderView
				fic={selectedFic}
				onBack={handleBackToLibrary}
				onFicUpdated={(updated) => setSelectedFic(updated)}
			/>
		);
	}

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
