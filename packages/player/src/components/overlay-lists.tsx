import type { ComponentProps, ReactNode } from 'react';

import { OverlayTracklist } from '#components/overlay-tracklist.tsx';
import { QueueTrayPanel } from '#components/queue-tray.tsx';
import { usePlayer } from '#store/context.tsx';
import { displayedItem } from '#store/selectors.ts';

export type OverlayList = 'playlist' | 'tracklist';

const withTracklist: ReadonlyArray<OverlayList> = ['tracklist', 'playlist'];
const playlistOnly: ReadonlyArray<OverlayList> = ['playlist'];

export function OverlayListContent({
	actions,
	labels,
	list,
}: {
	actions?: ReactNode;
	labels: ComponentProps<typeof QueueTrayPanel>['labels'];
	list: OverlayList;
}) {
	if (list === 'tracklist') return <OverlayTracklist />;

	return <QueueTrayPanel actions={actions} labels={labels} />;
}

export function useOverlayLists(): ReadonlyArray<OverlayList> {
	const hasCuePoints = usePlayer((state) => (displayedItem(state)?.cuePoints?.length ?? 0) > 0);

	return hasCuePoints ? withTracklist : playlistOnly;
}
