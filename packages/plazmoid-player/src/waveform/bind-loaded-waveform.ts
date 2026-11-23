import type { PlayerStore, PlayerStoreApi } from '@xsynaptic/plazmoid-core';
import type { SonicWaveform } from '@xsynaptic/sonic-ui';

import { bind, loadedDetail, loadedTrack, toDurationSeconds } from '@xsynaptic/plazmoid-core';

import type { PeaksReader } from '#waveform/waveform-peaks.ts';

import { knownPeaks } from '#waveform/known-peaks.ts';
import { applyTintCell } from '#waveform/tint-cell.ts';
import { openPeaks } from '#waveform/waveform-peaks.ts';

interface LoadedWaveformOptions {
	hasBody: boolean;
	showsPending: boolean;
}

// eslint-disable-next-line max-params -- control, store and lifetime read left to right as `bind` does, then the options
export function bindLoadedWaveform(
	waveform: SonicWaveform,
	store: PlayerStoreApi,
	signal: AbortSignal,
	options: LoadedWaveformOptions,
): void {
	let reader: PeaksReader | undefined;

	const showDuration = (): void => {
		const state = store.getState();

		waveform.max =
			state.durationSeconds ??
			reader?.durationSeconds ??
			toDurationSeconds(loadedTrack(state)) ??
			0;
	};

	applyTintCell(waveform);
	waveform.readTime = store.getState().getCurrentTime;
	bind(
		store,
		(state) => knownPeaks(loadedDetail(state)),
		(source) => {
			reader = source && openPeaks(source);
			feedReader(waveform, reader, options);
			showDuration();
		},
		signal,
	);
	bind(store, selectDuration, showDuration, signal);
}

function feedReader(
	waveform: SonicWaveform,
	reader: PeaksReader | undefined,
	{ hasBody, showsPending }: LoadedWaveformOptions,
): void {
	waveform.bands = reader?.bands;
	waveform.peaks = hasBody ? reader?.peaks : reader?.peaksWithoutBody;
	waveform.pending = undefined;
	waveform.requestPeaks =
		reader &&
		((fromSeconds, toSeconds) => {
			const changed = reader.request(fromSeconds, toSeconds);

			if (showsPending) waveform.pending = reader.pending(fromSeconds, toSeconds);

			return changed;
		});
}

function selectDuration(state: PlayerStore): number | undefined {
	return state.durationSeconds ?? toDurationSeconds(loadedTrack(state));
}
