import type { CreateAudioEngine, PlayerLabels, PlayerUrls, QueueItem } from '@xsynaptic/player';

import { AudioPlayer, createPlayerStore, Player } from '@xsynaptic/player';
import { useEffect, useState } from 'react';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

export const skipSeconds = 30;

const silentAnalyser: AnalyserNode | undefined = undefined;

// A browser refuses an audio graph outside a gesture, so the specimens stand at the engine seam instead
const createSilentEngine: CreateAudioEngine = (callbacks) => {
	let currentTimeS = 0;

	return {
		analyser: () => silentAnalyser,
		currentTime: () => currentTimeS,
		// A specimen lands loaded and paused, where a real engine would go on to play
		load: () => {
			callbacks.onStatus('paused');

			return Promise.resolve();
		},
		// No graph, so nothing stands between the clock and the sound
		outputDelay: () => 0,
		pause: () => {
			callbacks.onStatus('paused');
		},
		play: () => Promise.resolve(),
		prepare: () => {
			// No graph to build
		},
		reset: () => {
			currentTimeS = 0;
		},
		seek: (seconds) => {
			currentTimeS = seconds;
		},
		setVolume: () => {
			// No gain stage to drive
		},
	};
};

interface PlayerSpecimenProps {
	items: Array<PlayerPayloadItem>;
	labels: PlayerLabels;
	specimen: 'default' | 'empty' | 'error' | 'marquee' | 'remaining' | 'tray' | 'tray-sectioned';
	variant?: 'compact' | 'expanded';
}

type SpecimenStore = ReturnType<typeof createSpecimenStore>;

// Each specimen holds its own store, so the live bar keeps the singleton and playing here never hijacks it
export function PlayerSpecimen({ items, labels, specimen, variant }: PlayerSpecimenProps) {
	const [store] = useState(createSpecimenStore);
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

function createSpecimenStore() {
	return createPlayerStore({ createEngine: createSilentEngine });
}

// Each variation is nothing but tokens on the wrapper, which the renderer reads when it paints
const waveformVariations = [
	{ className: undefined, label: '2px bar, 1px gap, 1px radius (the default)' },
	{ className: 'inventory-waveform-square', label: '2px bar, 1px gap, no radius' },
	{ className: 'inventory-waveform-chunky', label: '3px bar, 1px gap, 1px radius' },
];

// The panel is `display: none` until it opens, so the specimen pins it open through a class of its own
export function VolumeSpecimen({ labels }: { labels: PlayerLabels }) {
	const [store] = useState(createSpecimenStore);

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
	const [store] = useState(createSpecimenStore);
	const [urls] = useState(() => queuedUrls(items));

	useEffect(() => {
		store.getState().loadQueue(items);
		store.getState().playAt(0);
		store.getState().seek((store.getState().durationS ?? 0) / 3);
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
};

// Astro cannot serialize a function across the island boundary, so the resolvers are built from the payload here
// Any id resolves: the tray specimen synthesizes its own to get distinct rows, and a specimen shows layout rather than resolution
function queuedUrls(items: ReadonlyArray<PlayerPayloadItem>): PlayerUrls {
	return {
		stream: (trackId) => {
			const item = items.find((queued) => queued.trackId === trackId) ?? items[0];
			if (!item) return Promise.reject(new Error(`No stream URL for ${trackId}`));

			return Promise.resolve({ status: 'ok', url: item.streamUrl });
		},
	};
}

// Long enough to overflow the info window in either layout, so both lines are always marching
const marqueeArtist = 'Basilisk, with Nebula Drift, Forest Signal and the Ektoplazm Sound System';
const marqueeTitle = 'Deep Forest Transmissions From The Edge Of A Very Long Winter Night';

function isTraySpecimen(specimen: PlayerSpecimenProps['specimen']): boolean {
	return specimen === 'tray' || specimen === 'tray-sectioned';
}

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
	if (specimen === 'tray') return trayQueue(items);
	if (specimen === 'tray-sectioned') return sectioned(items);

	return items;
}

// Enough rows to scroll, at title lengths that show both the two-line row and where it truncates
const trayTitles = [
	'Mountain Calling',
	'Nightfall Over The Northern Cordillera, An Extended Transmission For The Long Dark',
	'Drift',
	'Deep Forest Transmissions',
	'Signal Path',
	'The Ektoplazm Sound System Presents An Autumn Selection',
	'Reclaim',
];

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

	// The error specimen's resolver rejects, so its state comes from the failure rather than being written
	store.getState().playAt(0);

	if (isTraySpecimen(specimen)) {
		store.setState({ isTrayOpen: true });
		return;
	}

	// A third of the way in, so the remaining clock reads a figure rather than the whole duration
	if (specimen === 'remaining') {
		store.getState().seek((store.getState().durationS ?? 0) / 3);
		store.setState({ timeMode: 'remaining' });
	}
}

function trayQueue(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	const first = items[0];
	if (!first) return [];

	return trayTitles.map((title, index) => ({
		...(items[index % items.length] ?? first),
		title,
		trackId: `inventory-tray-${String(index)}`,
	}));
}
