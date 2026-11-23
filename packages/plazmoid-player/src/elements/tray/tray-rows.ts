import type { QueuedTrack } from '@xsynaptic/plazmoid-core';

import type { PlayerLabels } from '#types.ts';

import { cloneIcon } from '#lib/icons.ts';
import { keyedChildren } from '#lib/keyed-children.ts';
import { requireChild, requireChildren, template } from '#lib/render.ts';
import { fillButton } from '#lib/sonic-button.ts';

interface RowEntry {
	isCurrent: boolean;
	isMovable: boolean;
	track: QueuedTrack;
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
	queue: ReadonlyArray<QueuedTrack>;
}

const renderRow = template(
	/* HTML */ `
		<li class="pzm-tray-track">
			<button class="pzm-tray-handle" type="button"></button
			><button class="pzm-tray-pick" type="button">
				<span class="pzm-tray-title"><span class="pzm-tray-name"></span></span
				><span class="pzm-tray-artist"></span></button
			><sonic-button class="pzm-button-small"></sonic-button>
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
	const control = button ? rowControls.get(button.closest('sonic-button') ?? button) : undefined;
	if (!button || !control) return undefined;

	return { ...control, button };
}

export function trayRows(list: HTMLElement, labels: PlayerLabels): (view: TrayListView) => void {
	const reconcile = keyedChildren<RowEntry, TrayChild>(list, {
		create: (entry) => createRow(entry.track.queueId, labels),
		key: (entry) => entry.track.queueId,
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
	const [handle, pick] = requireChildren(node, 'button', 2, HTMLButtonElement);
	const remove = requireChild(node, 'sonic-button', HTMLElement);
	const title = requireChild(node, '.pzm-tray-title', HTMLElement);
	const name = requireChild(node, '.pzm-tray-name', HTMLElement);
	const artist = requireChild(node, '.pzm-tray-artist', HTMLElement);

	const playing = cloneIcon('playing');

	playing.classList.add('pzm-row-playing');
	title.append(playing);
	node.dataset.queueId = queueId;
	handle.setAttribute('aria-label', labels.reorder);
	handle.append(cloneIcon('dragHandle'));
	remove.setAttribute('aria-label', labels.removeFromQueue);
	fillButton(remove, [cloneIcon('close')]);
	rowControls.set(handle, { control: 'handle', queueId });
	rowControls.set(pick, { control: 'pick', queueId });
	rowControls.set(remove, { control: 'remove', queueId });

	return {
		node,
		update: (entry) => {
			node.toggleAttribute(rowAttributes.isCurrent, entry.isCurrent);
			handle.disabled = !entry.isMovable;
			name.textContent = entry.track.title;
			artist.textContent = entry.track.artistLine;
		},
	};
}

function trayEntries({ currentIndex, queue }: TrayListView): Array<RowEntry> {
	return queue.map((track, index) => ({
		isCurrent: index === currentIndex,
		isMovable: queue.length > 1,
		track,
	}));
}
