import type { PlayerLabels, PlayerUrls, QueueItem } from '@xsynaptic/player';

import { AudioPlayer, createPlayerStore } from '@xsynaptic/player';
import { useEffect, useState } from 'react';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

interface PlayerSpecimenProps {
	items: Array<PlayerPayloadItem>;
	labels: PlayerLabels;
	specimen: 'empty' | 'error' | 'full' | 'mini' | 'toggle' | 'tray';
}

type SpecimenStore = ReturnType<typeof createPlayerStore>;

// Each specimen holds its own store, so the live bar keeps the singleton and playing here never hijacks it
export function PlayerSpecimen({ items, labels, specimen }: PlayerSpecimenProps) {
	const [store] = useState(createPlayerStore);
	const [urls] = useState(() => (specimen === 'error' ? failingUrls : queuedUrls(items)));
	const [isMini, setIsMini] = useState(false);

	useEffect(() => {
		seed(store, specimen, items);
	}, [items, specimen, store]);

	if (specimen === 'mini') {
		return <AudioPlayer labels={labels} store={store} urls={urls} variant="mini" />;
	}

	if (specimen === 'toggle') {
		return (
			<div>
				<button
					className="mb-3 rounded-xs border border-surface-400 px-3 py-1 font-mono text-xs text-ink-500"
					onClick={() => {
						setIsMini((mini) => !mini);
					}}
					type="button"
				>
					{isMini ? 'Switch to the full layout' : 'Switch to the mini layout'}
				</button>
				{isMini ? (
					<AudioPlayer labels={labels} store={store} urls={urls} variant="mini" />
				) : (
					<AudioPlayer labels={labels} store={store} urls={urls} variant="full" />
				)}
			</div>
		);
	}

	return <AudioPlayer labels={labels} store={store} urls={urls} variant="full" />;
}

const failingUrls: PlayerUrls = {
	stream: () => Promise.reject(new Error('Inventory specimen: no stream')),
	waveform: () => Promise.resolve(undefined),
};

// Astro cannot serialize a function across the island boundary, so the resolvers are built from the payload here
function queuedUrls(items: ReadonlyArray<PlayerPayloadItem>): PlayerUrls {
	return {
		stream: (trackId) => {
			const item = items.find((queued) => queued.trackId === trackId);
			if (!item) return Promise.reject(new Error(`No stream URL for ${trackId}`));

			return Promise.resolve({ status: 'ok', url: item.streamUrl });
		},
		waveform: () => Promise.resolve(undefined),
	};
}

// A queue carrying any heading cannot shuffle
function sectioned(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	return items.map((item) => ({
		...item,
		sectionLabel: item.waveformOverview ? 'Measured peaks' : 'No measured peaks',
	}));
}

function seed(
	store: SpecimenStore,
	specimen: PlayerSpecimenProps['specimen'],
	items: ReadonlyArray<PlayerPayloadItem>,
): void {
	if (specimen === 'empty') return;

	store.getState().loadQueue(specimen === 'tray' ? sectioned(items) : items);
	seedLoaded(store, items);

	if (specimen === 'tray') {
		store.setState({ isTrayOpen: true });
		return;
	}

	if (specimen === 'error') {
		store.setState({
			playbackError: { stage: 'resolve', trackId: items[0]?.trackId ?? '' },
			status: 'error',
		});
	}
}

// `playAt` would build the audio graph, which a browser refuses outside a gesture, so the loaded state is set directly
function seedLoaded(store: SpecimenStore, items: ReadonlyArray<PlayerPayloadItem>): void {
	const first = items[0];

	store.setState({
		currentIndex: 0,
		durationS: first?.durationMs === undefined ? undefined : first.durationMs / 1000,
	});
}
