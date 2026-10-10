import type { SonicWaveform } from '@xsynaptic/sonic-ui';

import type { PlayerStore, PlayerStoreApi } from '#store/player-types.ts';
import type { WaveformArchive } from '#waveform/waveform-archive.ts';

import { bind } from '#lib/bind.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { loadedDetail, loadedItem } from '#store/selectors.ts';
import { openArchive } from '#waveform/waveform-archive.ts';

interface LoadedWaveformOptions {
	isTinted: boolean;
	showsPending: boolean;
}

// eslint-disable-next-line max-params -- control, store and lifetime read left to right as `bind` does, then the options
export function bindLoadedWaveform(
	waveform: SonicWaveform,
	store: PlayerStoreApi,
	signal: AbortSignal,
	options: LoadedWaveformOptions,
): void {
	let archive: undefined | WaveformArchive;

	const showDuration = (): void => {
		const state = store.getState();

		waveform.max =
			state.durationSeconds ??
			archive?.durationSeconds ??
			toDurationSeconds(loadedItem(state)) ??
			0;
	};

	waveform.readTime = store.getState().getCurrentTime;
	bind(
		store,
		(state) => loadedDetail(state)?.archive,
		(source) => {
			archive = source && openArchive(source);
			feedArchive(waveform, archive, options);
			showDuration();
		},
		signal,
	);
	bind(store, selectDuration, showDuration, signal);
}

function feedArchive(
	waveform: SonicWaveform,
	archive: undefined | WaveformArchive,
	{ isTinted, showsPending }: LoadedWaveformOptions,
): void {
	waveform.bands = isTinted ? archive?.bands : undefined;
	waveform.peaks = archive?.peaks;
	waveform.pending = undefined;
	waveform.requestPeaks =
		archive &&
		((fromSeconds, toSeconds) => {
			const changed = archive.request(fromSeconds, toSeconds);

			if (showsPending) waveform.pending = archive.pending(fromSeconds, toSeconds);

			return changed;
		});
}

function selectDuration(state: PlayerStore): number | undefined {
	return state.durationSeconds ?? toDurationSeconds(loadedItem(state));
}
