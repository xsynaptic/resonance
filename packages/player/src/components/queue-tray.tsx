import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import { Fragment, useEffect, useRef, useState } from 'react';

import type { RowDrag } from '#queue/use-row-drag.ts';
import type { PlayerLabels, QueuedItem } from '#types.ts';

import { Button } from '#components/button.tsx';
import { CloseIcon, DragHandleIcon, PlayingIcon, ShuffleIcon } from '#components/icons.tsx';
import { formatTemplate } from '#lib/format.ts';
import { isSectioned } from '#queue/queue.ts';
import { canMove } from '#queue/reorder.ts';
import { useRowDrag } from '#queue/use-row-drag.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

interface QueueTrayProps {
	actions?: ReactNode;
	labels: Pick<
		PlayerLabels,
		'clearQueue' | 'empty' | 'moved' | 'removeFromQueue' | 'reorder' | 'shuffle'
	>;
}

interface QueueTrayRowProps {
	// `undefined` where the queue is sectioned and cannot reorder
	drag?: RowDrag;
	index: number;
	isCurrent: boolean;
	item: QueuedItem;
	labels: Pick<PlayerLabels, 'removeFromQueue' | 'reorder'>;
	onHandleKeyDown: (event: ReactKeyboardEvent<HTMLElement>, index: number) => void;
}

// Closed renders nothing, so an idle tray costs no layout and its subscriptions no renders
export function QueueTray({ actions, labels }: QueueTrayProps) {
	const isOpen = usePlayer((state) => state.isTrayOpen);

	if (!isOpen) return;

	return <QueueTrayPanel actions={actions} labels={labels} />;
}

function QueueTrayPanel({ actions, labels }: QueueTrayProps) {
	const queue = usePlayer((state) => state.queue);
	const currentIndex = usePlayer((state) => state.currentIndex);
	const isShuffling = usePlayer((state) => state.isShuffling);
	const store = usePlayerStoreApi();

	const listRef = useRef<HTMLUListElement>(null);
	const focusAfterMoveRef = useRef<string | undefined>(undefined);
	const [announcement, setAnnouncement] = useState('');

	const canReorder = !isSectioned(queue);

	function move(from: number, to: number): void {
		focusAfterMoveRef.current = queue[from]?.queueId;
		store.getState().moveItem(from, to);
		setAnnouncement(formatTemplate(labels.moved, { position: to + 1, total: queue.length }));
	}

	function onHandleKeyDown(event: ReactKeyboardEvent<HTMLElement>, index: number): void {
		if (!event.altKey) return;
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

		const to = event.key === 'ArrowUp' ? index - 1 : index + 1;
		if (!canMove(queue.length, index, to)) return;

		event.preventDefault();
		move(index, to);
	}

	const drag = useRowDrag({ listRef, onMove: move });

	// Moving a node in the DOM blurs it, whether the move came from the keyboard or from a drag
	useEffect(() => {
		const queueId = focusAfterMoveRef.current;
		if (queueId === undefined) return;

		focusAfterMoveRef.current = undefined;
		listRef.current
			?.querySelector<HTMLElement>(`[data-queue-id="${CSS.escape(queueId)}"] .player-tray-handle`)
			?.focus();
	}, [queue]);

	return (
		<div className="player-tray">
			<div className="player-tray-header">
				{canReorder ? (
					<button
						aria-label={labels.shuffle}
						aria-pressed={isShuffling}
						className="player-tray-action"
						onClick={() => {
							store.getState().toggleShuffle();
						}}
						type="button"
					>
						<ShuffleIcon />
						{labels.shuffle}
					</button>
				) : undefined}
				<button
					className="player-tray-action"
					onClick={() => {
						store.getState().clearQueue();
					}}
					type="button"
				>
					{labels.clearQueue}
				</button>
				{actions}
			</div>
			{queue.length === 0 ? (
				<p className="player-tray-empty">{labels.empty}</p>
			) : (
				<ul className="player-tray-list" ref={listRef}>
					{queue.map((item, index) => (
						<Fragment key={item.queueId}>
							{item.sectionLabel === undefined ? undefined : (
								<li className="player-tray-section">{item.sectionLabel}</li>
							)}
							<QueueTrayRow
								index={index}
								isCurrent={index === currentIndex}
								item={item}
								labels={labels}
								onHandleKeyDown={onHandleKeyDown}
								{...(canReorder ? { drag } : {})}
							/>
						</Fragment>
					))}
				</ul>
			)}
			<p aria-live="polite" className="player-tray-status" role="status">
				{announcement}
			</p>
		</div>
	);
}

function QueueTrayRow({
	drag,
	index,
	isCurrent,
	item,
	labels,
	onHandleKeyDown,
}: QueueTrayRowProps) {
	const store = usePlayerStoreApi();

	return (
		<li
			className="player-tray-item"
			data-current={isCurrent ? '' : undefined}
			data-queue-id={item.queueId}
		>
			{drag ? (
				<button
					aria-label={labels.reorder}
					className="player-tray-handle"
					onKeyDown={(event) => {
						onHandleKeyDown(event, index);
					}}
					onPointerCancel={drag.onPointerCancel}
					onPointerDown={(event) => {
						drag.onPointerDown(event, index);
					}}
					onPointerMove={drag.onPointerMove}
					onPointerUp={drag.onPointerUp}
					type="button"
				>
					<DragHandleIcon />
				</button>
			) : undefined}
			<button
				className="player-tray-pick"
				onClick={() => {
					store.getState().playAt(index);
				}}
				type="button"
			>
				<span className="player-tray-title">
					<span className="player-tray-name">{item.title}</span>
					{isCurrent ? <PlayingIcon /> : undefined}
				</span>
				<span className="player-tray-artist">{item.artistLine}</span>
			</button>
			<Button
				aria-label={labels.removeFromQueue}
				className="player-button-small"
				onClick={() => {
					store.getState().removeAt(index);
				}}
			>
				<CloseIcon />
			</Button>
		</li>
	);
}
