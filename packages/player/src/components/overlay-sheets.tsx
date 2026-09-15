import type { ReactNode } from 'react';

import { useEffect, useId, useRef, useState } from 'react';

import type { OverlayList } from '#components/overlay-lists.tsx';
import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { CloseIcon, QueueIcon, TracklistIcon } from '#components/icons.tsx';
import { OverlayListContent, useOverlayLists } from '#components/overlay-lists.tsx';
import { PanelToggle } from '#components/panel-toggle.tsx';

type SheetLabels = Pick<
	PlayerLabels,
	| 'clearQueue'
	| 'close'
	| 'empty'
	| 'moved'
	| 'playlist'
	| 'removeFromQueue'
	| 'reorder'
	| 'shuffle'
	| 'tracklist'
	| 'waveformPanel'
>;

export function OverlaySheets({ actions, labels }: { actions?: ReactNode; labels: SheetLabels }) {
	const lists = useOverlayLists();
	const [chosenSheet, setChosenSheet] = useState<OverlayList | undefined>();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	const titleId = useId();

	// The Tracklist closes with its button when the next item has no cue points
	const shownSheet =
		chosenSheet !== undefined && lists.includes(chosenSheet) ? chosenSheet : undefined;

	useEffect(() => {
		const dialog = dialogRef.current;
		const isOpen = shownSheet !== undefined;
		if (!dialog || dialog.open === isOpen) return;

		if (isOpen) {
			dialog.showModal();
			return;
		}

		dialog.close();
	}, [shownSheet]);

	function openSheet(sheet: OverlayList, opener: HTMLButtonElement): void {
		openerRef.current = opener;
		setChosenSheet(sheet);
	}

	return (
		<div className="player-overlay-sheets">
			{lists.includes('tracklist') ? (
				<Button
					aria-haspopup="dialog"
					aria-label={labels.tracklist}
					className="player-button-icon"
					onClick={(event) => {
						openSheet('tracklist', event.currentTarget);
					}}
				>
					<TracklistIcon />
				</Button>
			) : undefined}
			<PanelToggle label={labels.waveformPanel} />
			<Button
				aria-haspopup="dialog"
				aria-label={labels.playlist}
				className="player-button-icon"
				onClick={(event) => {
					openSheet('playlist', event.currentTarget);
				}}
			>
				<QueueIcon />
			</Button>
			<dialog
				aria-labelledby={titleId}
				className="player-overlay-sheet"
				onClose={() => {
					setChosenSheet(undefined);

					if (openerRef.current?.isConnected) openerRef.current.focus();
				}}
				ref={dialogRef}
			>
				{shownSheet === undefined ? undefined : (
					<SheetContent
						actions={actions}
						labels={labels}
						onClose={() => {
							setChosenSheet(undefined);
						}}
						sheet={shownSheet}
						titleId={titleId}
					/>
				)}
			</dialog>
		</div>
	);
}

function SheetContent({
	actions,
	labels,
	onClose,
	sheet,
	titleId,
}: {
	actions: ReactNode;
	labels: SheetLabels;
	onClose: () => void;
	sheet: OverlayList;
	titleId: string;
}) {
	return (
		<>
			<div className="player-overlay-sheet-header">
				<p className="player-overlay-sheet-title" id={titleId}>
					{labels[sheet]}
				</p>
				<Button aria-label={labels.close} className="player-button-icon" onClick={onClose}>
					<CloseIcon size={16} />
				</Button>
			</div>
			<div className="player-overlay-list">
				<OverlayListContent actions={actions} labels={labels} list={sheet} />
			</div>
		</>
	);
}
