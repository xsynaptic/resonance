import { SonicWaveform } from '@xsynaptic/sonic-ui';

import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore, PlayerStoreApi } from '#store/player-store.ts';
import type { QueueItem, QueueItemDetail } from '#types.ts';
import type { WaveformArchive } from '#waveform/panel/waveform-archive.ts';

import { defineOnce } from '#elements/define-once.ts';
import { PlayerPanelZoom } from '#elements/panel/panel-zoom.ts';
import { formatSpokenPosition } from '#elements/time-slider/spoken-time.ts';
import { bind } from '#lib/bind.ts';
import { formatClock, parseClock } from '#lib/format.ts';
import { requireChild, template } from '#lib/render.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { loadedDetail, loadedItem } from '#store/selectors.ts';
import { describePosition, toPanelMarkers } from '#waveform/cue-markers.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

interface PanelSource {
	detail: QueueItemDetail | undefined;
	item: QueueItem | undefined;
}

const archiveFullScale = 128;

const renderSurface = template(
	/* HTML */ `
		<div>
			<sonic-waveform
				key-step="1"
				pending-delay="400"
				readout
				reduced-motion="scroll"
				spoken-step="1"
				step="0"
			></sonic-waveform>
			<p class="player-panel-now"></p>
			<player-panel-zoom></player-panel-zoom>
		</div>
	`,
	HTMLDivElement,
);

export function connectPanelSurface(
	panel: HTMLElement,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	defineOnce('player-panel-zoom', PlayerPanelZoom);
	defineOnce('sonic-waveform', SonicWaveform);

	panel.removeAttribute('aria-hidden');
	panel.setAttribute('aria-label', labels.waveformPanel);
	panel.setAttribute('role', 'group');
	panel.replaceChildren(...renderSurface().children);

	const waveform = requireChild(panel, 'sonic-waveform', SonicWaveform);
	const now = requireChild(panel, '.player-panel-now', HTMLParagraphElement);
	let archiveSeconds: number | undefined;

	const showDuration = (): void => {
		const state = store.getState();
		const durationSeconds =
			state.durationSeconds ?? archiveSeconds ?? toDurationSeconds(loadedItem(state));

		waveform.max = durationSeconds ?? 0;
		waveform.formatSpokenValue = (seconds) =>
			formatSpokenPosition(labels.seekPosition, seconds, durationSeconds);
	};

	waveform.setAttribute('aria-label', labels.waveformSeek);
	waveform.formatEntry = formatClock;
	waveform.parseValue = parseClock;
	waveform.readTime = store.getState().getCurrentTime;
	waveform.addEventListener(
		'change',
		() => {
			store.getState().seek(waveform.value);
		},
		{ signal },
	);
	waveform.addEventListener(
		'sonic-marker',
		() => {
			now.textContent = waveform.currentMarker?.label ?? '';
		},
		{ signal },
	);

	bind(
		store,
		selectPanelSource,
		(source) => {
			const archive = feedArchive(waveform, source);

			archiveSeconds = archive && archive.pairsTotal / archive.pairsPerSecond;
			showItem(waveform, source, labels.timestampsPartial);
			showDuration();
		},
		signal,
	);
	bind(store, selectDuration, showDuration, signal);
	bindPlayback(waveform, store, signal);
}

function bindPlayback(waveform: SonicWaveform, store: PlayerStoreApi, signal: AbortSignal): void {
	bind(
		store,
		(state) => state.currentTimeSeconds,
		(seconds) => {
			waveform.value = seconds;
		},
		signal,
	);
	bind(
		store,
		(state) => state.status === 'playing',
		(isPlaying) => {
			waveform.playing = isPlaying;
		},
		signal,
	);
	bind(
		store,
		(state) => state.panelPxPerSecond,
		(pxPerSecond) => {
			waveform.zoom = pxPerSecond;
		},
		signal,
	);
}

function feedArchive(
	waveform: SonicWaveform,
	{ detail }: PanelSource,
): undefined | WaveformArchive {
	waveform.peaks = undefined;
	waveform.pending = undefined;
	waveform.requestPeaks = undefined;
	if (!detail?.archive) return undefined;

	const archive = openArchive(detail.archive);

	requestFromArchive(waveform, archive);

	return archive;
}

function requestFromArchive(waveform: SonicWaveform, archive: WaveformArchive): void {
	const { pairsPerSecond } = archive;
	let shownChunks = '';

	const showPending = (fromPair: number, toPair: number): void => {
		const missing = archive.missing(fromPair, toPair);
		const chunks = missing.map(({ chunk }) => chunk).join(',');

		// `requestPeaks` runs inside a paint and writing `pending` asks for another, so an unchanged list would repaint forever
		if (chunks === shownChunks) return;

		shownChunks = chunks;
		waveform.pending = missing.map((chunk) => [
			chunk.fromPair / pairsPerSecond,
			chunk.toPair / pairsPerSecond,
		]);
	};

	waveform.peaks = { fullScale: archiveFullScale, pairsPerSecond, samples: archive.samples };
	waveform.requestPeaks = (fromSeconds, toSeconds) => {
		const fromPair = fromSeconds * pairsPerSecond;
		const toPair = toSeconds * pairsPerSecond;
		const changed = archive.want(fromPair, toPair);

		showPending(fromPair, toPair);

		return changed;
	};
}

function selectDuration(state: PlayerStore): number | undefined {
	return state.durationSeconds ?? toDurationSeconds(loadedItem(state));
}

function selectPanelSource(state: PlayerStore): PanelSource {
	return { detail: loadedDetail(state), item: loadedItem(state) };
}

function showItem(
	waveform: SonicWaveform,
	{ detail, item }: PanelSource,
	partialNote: string,
): void {
	const cuePoints = detail?.cuePoints ?? [];

	waveform.disabled = item === undefined;
	waveform.formatValue = (seconds) => describePosition(cuePoints, seconds);
	waveform.markers = toPanelMarkers(cuePoints, detail?.trackCount ?? cuePoints.length, partialNote);
}
