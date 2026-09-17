import type { PlayerLabels, QueuedItem } from '#types.ts';

import { cloneIcon } from '#lib/icons.ts';
import { keyedChildren } from '#lib/keyed-children.ts';
import { placeWhen } from '#lib/place-when.ts';
import { template } from '#lib/render.ts';

interface RowEntry {
	canReorder: boolean;
	isCurrent: boolean;
	isMovable: boolean;
	item: QueuedItem;
	kind: 'row';
}

interface RowPress {
	button: HTMLButtonElement;
	control: 'handle' | 'pick' | 'remove';
	queueId: string;
}

interface SectionEntry {
	item: QueuedItem;
	kind: 'section';
}

interface TrayChild {
	node: HTMLLIElement;
	update: (entry: TrayEntry) => void;
}

type TrayEntry = RowEntry | SectionEntry;

interface TrayListView {
	canReorder: boolean;
	currentIndex: number | undefined;
	queue: ReadonlyArray<QueuedItem>;
}

const renderRow = template(
	/* HTML */ `
		<li class="player-tray-item">
			<button class="player-tray-handle" type="button"></button
			><button class="player-tray-pick" type="button">
				<span class="player-tray-title"><span class="player-tray-name"></span></span
				><span class="player-tray-artist"></span></button
			><button class="player-button player-button-small" type="button"></button>
		</li>
	`,
	HTMLLIElement,
);

const renderSection = template('<li class="player-tray-section"></li>', HTMLLIElement);

const rowAttributes = { isCurrent: 'data-current' } as const satisfies Partial<
	Record<keyof RowEntry, `data-${string}`>
>;

const rowControls = new WeakMap<Element, Omit<RowPress, 'button'>>();

export function rowPressAt(target: EventTarget | null): RowPress | undefined {
	if (!(target instanceof Element)) return undefined;

	const button = target.closest('button');
	const control = button ? rowControls.get(button) : undefined;
	if (!button || !control) return undefined;

	return { ...control, button };
}

export function trayRows(list: HTMLElement, labels: PlayerLabels): (view: TrayListView) => void {
	const reconcile = keyedChildren<TrayEntry, TrayChild>(list, {
		create: (entry) =>
			entry.kind === 'section' ? createSection() : createRow(entry.item.queueId, labels),
		key: (entry) =>
			entry.kind === 'section' ? `section:${entry.item.queueId}` : entry.item.queueId,
		update: (child, entry) => {
			child.update(entry);
		},
	});

	return (view) => {
		reconcile(trayEntries(view));
	};
}

function createRow(queueId: string, labels: PlayerLabels): TrayChild {
	const node = renderRow();
	const [handle, pick, remove] = [...node.querySelectorAll('button')];
	const title = node.querySelector('.player-tray-title');
	const name = node.querySelector('.player-tray-name');
	const artist = node.querySelector('.player-tray-artist');

	if (!handle || !pick || !remove || !title || !name || !artist) {
		throw new Error('The tray row template lost part of its markup');
	}

	const playing = cloneIcon('playing');

	node.dataset.queueId = queueId;
	handle.setAttribute('aria-label', labels.reorder);
	handle.append(cloneIcon('dragHandle'));
	remove.setAttribute('aria-label', labels.removeFromQueue);
	remove.append(cloneIcon('close'));
	rowControls.set(handle, { control: 'handle', queueId });
	rowControls.set(pick, { control: 'pick', queueId });
	rowControls.set(remove, { control: 'remove', queueId });

	return {
		node,
		update: (entry) => {
			if (entry.kind !== 'row') return;

			node.toggleAttribute(rowAttributes.isCurrent, entry.isCurrent);
			handle.disabled = !entry.isMovable;
			name.textContent = entry.item.title;
			artist.textContent = entry.item.artistLine;

			placeWhen({ isShown: entry.canReorder, node: handle, parent: node, position: 'prepend' });
			placeWhen({ isShown: entry.isCurrent, node: playing, parent: title, position: 'append' });
		},
	};
}

function createSection(): TrayChild {
	const node = renderSection();

	return {
		node,
		update: (entry) => {
			if (entry.kind === 'section') node.textContent = entry.item.sectionLabel ?? '';
		},
	};
}

function trayEntries({ canReorder, currentIndex, queue }: TrayListView): Array<TrayEntry> {
	const entries: Array<TrayEntry> = [];

	for (const [index, item] of queue.entries()) {
		if (item.sectionLabel !== undefined) entries.push({ item, kind: 'section' });

		entries.push({
			canReorder,
			isCurrent: index === currentIndex,
			isMovable: queue.length > 1,
			item,
			kind: 'row',
		});
	}

	return entries;
}
