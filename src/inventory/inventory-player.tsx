import type { PlayerLabels, PlayerUrls, QueueItem } from '@xsynaptic/player';

import { AudioPlayer, createPlayerStore, Player } from '@xsynaptic/player';
import { useEffect, useState } from 'react';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

export const skipSeconds = 30;

interface PlayerSpecimenProps {
	items: Array<PlayerPayloadItem>;
	labels: PlayerLabels;
	specimen: 'default' | 'empty' | 'error' | 'marquee' | 'remaining' | 'tray';
	variant?: 'compact' | 'expanded';
}

type SpecimenStore = ReturnType<typeof createPlayerStore>;

// Each specimen holds its own store, so the live bar keeps the singleton and playing here never hijacks it
export function PlayerSpecimen({ items, labels, specimen, variant }: PlayerSpecimenProps) {
	const [store] = useState(createPlayerStore);
	const [urls] = useState(() => (specimen === 'error' ? failingUrls : queuedUrls(items)));

	useEffect(() => {
		seed(store, specimen, items);
	}, [items, specimen, store]);

	return (
		<AudioPlayer
			labels={labels}
			skipSeconds={skipSeconds}
			store={store}
			urls={urls}
			variant={variant}
		/>
	);
}

// Each variation is nothing but tokens on the wrapper, which the renderer reads when it paints
const waveformVariations = [
	{ className: undefined, label: '2px bar, 1px gap, 1px radius (the default)' },
	{ className: 'inventory-waveform-square', label: '2px bar, 1px gap, no radius' },
	{ className: 'inventory-waveform-chunky', label: '3px bar, 1px gap, 1px radius' },
];

// The panel is `display: none` until it opens, so the specimen pins it open through a class of its own
export function VolumeSpecimen({ labels }: { labels: PlayerLabels }) {
	const [store] = useState(createPlayerStore);

	return (
		<Player.Root
			className="inventory-volume-open flex justify-center bg-surface-900 px-4 py-2.5"
			store={store}
			urls={undefined}
		>
			<Player.Volume labels={labels} />
		</Player.Root>
	);
}

// Seeded a third of the way in, so the played edge and both colours are on screen in every variation
export function WaveformComparison({
	items,
	labels,
}: {
	items: Array<PlayerPayloadItem>;
	labels: PlayerLabels;
}) {
	const [store] = useState(createPlayerStore);
	const [urls] = useState(() => queuedUrls(items));

	useEffect(() => {
		const durationS = items[0]?.durationMs === undefined ? undefined : items[0].durationMs / 1000;

		store.getState().loadQueue(items);
		store.setState({ currentIndex: 0, currentTimeS: (durationS ?? 0) / 3, durationS });
	}, [items, store]);

	return (
		<div className="flex flex-col gap-6">
			{waveformVariations.map((variation) => (
				<Player.Root
					className={variation.className}
					key={variation.label}
					store={store}
					urls={urls}
				>
					<p className="mb-2 font-mono text-xs text-ink-600">{variation.label}</p>
					<div className="bg-surface-900 px-4 py-2.5">
						<Player.Seek label={labels.seek} />
					</div>
					<div className="mt-2 max-w-96 bg-surface-900 px-4 py-2.5">
						<Player.Seek label={labels.seek} />
					</div>
				</Player.Root>
			))}
		</div>
	);
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

// Long enough to overflow the info window in either layout, so both lines are always marching
const marqueeArtist = 'Basilisk, with Nebula Drift, Forest Signal and the Ektoplazm Sound System';
const marqueeTitle = 'Deep Forest Transmissions From The Edge Of A Very Long Winter Night';

function marqueed(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	const [first, ...rest] = items;
	if (!first) return [...items];

	return [{ ...first, artistLine: marqueeArtist, title: marqueeTitle }, ...rest];
}

function queueFor(
	specimen: PlayerSpecimenProps['specimen'],
	items: ReadonlyArray<PlayerPayloadItem>,
): ReadonlyArray<QueueItem> {
	if (specimen === 'marquee') return marqueed(items);
	if (specimen === 'tray') return sectioned(items);

	return items;
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

	store.getState().loadQueue(queueFor(specimen, items));
	seedLoaded(store, items);

	if (specimen === 'tray') {
		store.setState({ isTrayOpen: true });
		return;
	}

	// A third of the way in, so the remaining clock reads a figure rather than the whole duration
	if (specimen === 'remaining') {
		store.setState({
			currentTimeS: (store.getState().durationS ?? 0) / 3,
			timeMode: 'remaining',
		});
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
