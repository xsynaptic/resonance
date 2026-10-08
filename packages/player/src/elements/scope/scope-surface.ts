import { SonicWaveform } from '@xsynaptic/sonic-ui';

import type { PlayerStore, PlayerStoreApi } from '#store/player-types.ts';
import type { QueueArchive } from '#types.ts';

import { defineOnce } from '#elements/define-once.ts';
import { bind } from '#lib/bind.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { loadedDetail, loadedItem } from '#store/selectors.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

const windowSeconds = 1;

export interface ScopeSurface {
	trace: (isTracing: boolean) => void;
}

export function connectScopeSurface(
	box: HTMLElement,
	store: PlayerStoreApi,
	signal: AbortSignal,
): ScopeSurface {
	defineOnce('sonic-waveform', SonicWaveform);

	const waveform = document.createElement('sonic-waveform');
	let archiveSeconds: number | undefined;

	const showDuration = (): void => {
		waveform.max = selectDuration(store.getState()) ?? archiveSeconds ?? 0;
	};

	waveform.inert = true;
	waveform.readTime = store.getState().getCurrentTime;
	waveform.reducedMotion = 'scroll';
	box.replaceChildren(waveform);

	observeResize(
		box,
		() => {
			if (box.clientWidth > 0) waveform.zoom = box.clientWidth / windowSeconds;
		},
		signal,
	);
	bind(
		store,
		(state) => loadedDetail(state)?.archive,
		(archive) => {
			archiveSeconds = feedArchive(waveform, archive);
			showDuration();
		},
		signal,
	);
	bind(store, selectDuration, showDuration, signal);

	return {
		trace: (isTracing) => {
			waveform.playing = isTracing;
		},
	};
}

function feedArchive(
	waveform: SonicWaveform,
	source: QueueArchive | undefined,
): number | undefined {
	waveform.peaks = undefined;
	waveform.requestPeaks = undefined;
	if (!source) return undefined;

	const archive = openArchive(source);
	const { pairsPerSecond } = archive;

	waveform.peaks = { pairsPerSecond, samples: archive.samples };
	waveform.requestPeaks = (fromSeconds, toSeconds) =>
		archive.want(fromSeconds * pairsPerSecond, toSeconds * pairsPerSecond);

	return archive.pairsTotal / pairsPerSecond;
}

function selectDuration(state: PlayerStore): number | undefined {
	return state.durationSeconds ?? toDurationSeconds(loadedItem(state));
}
