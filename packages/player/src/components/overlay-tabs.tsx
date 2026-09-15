import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';

import { useId, useLayoutEffect, useRef, useState } from 'react';

import type { OverlayList } from '#components/overlay-lists.tsx';
import type { PlayerLabels } from '#types.ts';

import { OverlayListContent, useOverlayLists } from '#components/overlay-lists.tsx';
import { usePlayer } from '#store/context.tsx';
import { displayedItem } from '#store/selectors.ts';

export function OverlayTabs({
	actions,
	labels,
}: {
	actions?: ReactNode;
	labels: Pick<
		PlayerLabels,
		| 'clearQueue'
		| 'empty'
		| 'moved'
		| 'playlist'
		| 'removeFromQueue'
		| 'reorder'
		| 'shuffle'
		| 'tracklist'
	>;
}) {
	const itemId = usePlayer((state) => displayedItem(state)?.queueId);
	const lists = useOverlayLists();
	const [chosenTab, setChosenTab] = useState<OverlayList>('tracklist');
	const id = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const focusWithinRef = useRef(false);

	const shownTab = lists.includes(chosenTab) ? chosenTab : 'playlist';

	// A focused tab or cue unmounts with the Tracklist it belonged to, which drops focus to the page
	useLayoutEffect(() => {
		if (!focusWithinRef.current) return;
		if (document.activeElement !== null && document.activeElement !== document.body) return;

		rootRef.current
			?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}-${CSS.escape(shownTab)}"]`)
			?.focus();
	}, [id, itemId, shownTab]);

	function onBlur(event: FocusEvent<HTMLDivElement>): void {
		// Focus leaving for nowhere is as likely a removal as a departure
		if (event.relatedTarget === null) return;

		focusWithinRef.current = rootRef.current?.contains(event.relatedTarget) ?? false;
	}

	function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
		const nextIndex = nextTabIndex(event.key, lists.indexOf(shownTab), lists.length);
		const next = nextIndex === undefined ? undefined : lists[nextIndex];
		if (next === undefined) return;

		event.preventDefault();
		setChosenTab(next);
		rootRef.current
			?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}-${CSS.escape(next)}"]`)
			?.focus();
	}

	return (
		<div
			className="player-overlay-tabs"
			onBlur={onBlur}
			onFocus={() => {
				focusWithinRef.current = true;
			}}
			ref={rootRef}
		>
			<div className="player-overlay-tablist" role="tablist">
				{lists.map((tab) => (
					<button
						aria-controls={`${id}-panel`}
						aria-selected={tab === shownTab}
						className="player-overlay-tab"
						id={`${id}-${tab}`}
						key={tab}
						onClick={() => {
							setChosenTab(tab);
						}}
						onKeyDown={onKeyDown}
						role="tab"
						tabIndex={tab === shownTab ? 0 : -1}
						type="button"
					>
						{labels[tab]}
					</button>
				))}
			</div>
			<div
				aria-labelledby={`${id}-${shownTab}`}
				className="player-overlay-list"
				id={`${id}-panel`}
				role="tabpanel"
			>
				<OverlayListContent actions={actions} labels={labels} list={shownTab} />
			</div>
		</div>
	);
}

function nextTabIndex(key: string, index: number, count: number): number | undefined {
	switch (key) {
		case 'ArrowLeft': {
			return (index - 1 + count) % count;
		}
		case 'ArrowRight': {
			return (index + 1) % count;
		}
		case 'End': {
			return count - 1;
		}
		case 'Home': {
			return 0;
		}
		default: {
			return undefined;
		}
	}
}
