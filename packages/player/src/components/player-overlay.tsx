import { Suspense, useEffect, useRef } from 'react';

import type { PlayerOverlayProps } from '#components/overlay-content.tsx';

import { overlayContentPart } from '#components/lazy-parts.ts';
import { PartBoundary } from '#components/part-boundary.tsx';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

export function PlayerOverlay(props: PlayerOverlayProps) {
	// A host may hide an empty bar, which would hide the modal and leave the page inert
	const isOpen = usePlayer((state) => state.isOverlayOpen && state.queue.length > 0);
	const store = usePlayerStoreApi();
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog || dialog.open === isOpen) return;

		if (isOpen) {
			dialog.showModal();
			// Chrome otherwise focuses the scrollable body, which names nothing
			dialog.querySelector<HTMLElement>('.player-overlay-close')?.focus();
			return;
		}

		dialog.close();
	}, [isOpen]);

	const closeOverlay = (): void => {
		store.getState().setOverlayOpen(false);
	};

	return (
		<dialog
			aria-label={props.labels.nowPlaying}
			className="player-overlay"
			onClose={closeOverlay}
			ref={dialogRef}
		>
			{isOpen ? (
				<PartBoundary onError={closeOverlay} part={overlayContentPart}>
					<Suspense fallback={undefined}>
						<overlayContentPart.Component {...props} />
					</Suspense>
				</PartBoundary>
			) : undefined}
		</dialog>
	);
}
