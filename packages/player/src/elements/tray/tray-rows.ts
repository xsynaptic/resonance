import type { PlayerLabels, QueuedItem } from '#types.ts';

import { cloneIcon } from '#lib/icons.ts';
import { keyedChildren } from '#lib/keyed-children.ts';
import { requireChild, requireChildren, template } from '#lib/render.ts';

interface RowEntry {
	isCurrent: boolean;
	isMovable: boolean;
	item: QueuedItem;
}

interface RowPress {
	button: HTMLButtonElement;
	control: 'handle' | 'pick' | 'remove';
	queueId: string;
}

interface TrayChild {
	node: HTMLLIElement;
	update: (entry: RowEntry) => void;
}

interface TrayListView {
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
	const reconcile = keyedChildren<RowEntry, TrayChild>(list, {
		create: (entry) => createRow(entry.item.queueId, labels),
		key: (entry) => entry.item.queueId,
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
	const [handle, pick, remove] = requireChildren(node, 'button', 3, HTMLButtonElement);
	const title = requireChild(node, '.player-tray-title', HTMLElement);
	const name = requireChild(node, '.player-tray-name', HTMLElement);
	const artist = requireChild(node, '.player-tray-artist', HTMLElement);

	const playing = cloneIcon('playing');

	playing.classList.add('player-row-playing');
	title.append(playing);
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
			node.toggleAttribute(rowAttributes.isCurrent, entry.isCurrent);
			handle.disabled = !entry.isMovable;
			name.textContent = entry.item.title;
			artist.textContent = entry.item.artistLine;
		},
	};
}

function trayEntries({ currentIndex, queue }: TrayListView): Array<RowEntry> {
	return queue.map((item, index) => ({
		isCurrent: index === currentIndex,
		isMovable: queue.length > 1,
		item,
	}));
}
