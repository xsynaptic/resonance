import type { WaveMarker } from '@xsynaptic/sonic-ui';

import { SonicWaveform } from '@xsynaptic/sonic-ui';

import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore, PlayerStoreApi } from '#store/player-store.ts';
import type { Track, TrackDetail } from '#types.ts';

import { defineOnce } from '#elements/define-once.ts';
import { PlayerPanelZoom } from '#elements/panel/panel-zoom.ts';
import { formatSpokenPosition } from '#elements/time-slider/spoken-time.ts';
import { bind } from '#lib/bind.ts';
import { requireChild, template } from '#lib/render.ts';
import { loadedDetail, loadedTrack } from '#store/selectors.ts';
import { panelZoomMax, panelZoomMin } from '#store/zoom-levels.ts';
import { bindLoadedWaveform } from '#waveform/bind-loaded-waveform.ts';
import { toPanelMarkers } from '#waveform/cue-markers.ts';

interface PanelSource {
	detail: TrackDetail | undefined;
	track: Track | undefined;
}

const renderSurface = template(
	/* HTML */ `
		<div>
			<sonic-waveform
				key-step="1"
				pending-delay="400"
				reduced-motion="scroll"
				spoken-step="1"
				step="0"
				zoomable
			></sonic-waveform>
			<p class="pzm-panel-now"></p>
			<pzm-panel-zoom></pzm-panel-zoom>
		</div>
	`,
	HTMLDivElement,
);

export function connectPanelSurface(
	panel: HTMLElement,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	defineOnce('pzm-panel-zoom', PlayerPanelZoom);
	defineOnce('sonic-waveform', SonicWaveform);

	panel.removeAttribute('aria-hidden');
	panel.setAttribute('aria-label', labels.waveformPanel);
	panel.setAttribute('role', 'group');
	panel.replaceChildren(...renderSurface().children);

	const waveform = requireChild(panel, 'sonic-waveform', SonicWaveform);
	const now = requireChild(panel, '.pzm-panel-now', HTMLParagraphElement);

	waveform.setAttribute('aria-label', labels.waveformSeek);
	// A `max` of 0 is a length nobody knows yet
	waveform.formatSpokenValue = (seconds) =>
		formatSpokenPosition(labels.seekPosition, seconds, waveform.max || undefined);
	waveform.renderLabel = renderLabel;
	waveform.zoomMax = panelZoomMax;
	waveform.zoomMin = panelZoomMin;
	waveform.addEventListener(
		'change',
		() => {
			store.getState().seek(waveform.value);
		},
		{ signal },
	);
	waveform.addEventListener(
		'sonic-zoom',
		() => {
			store.getState().setPanelZoom(waveform.zoom);
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
			showTrack(waveform, source, labels.timestampsPartial);
		},
		signal,
	);
	bindLoadedWaveform(waveform, store, signal, {
		hasBody: true,
		showsPending: true,
	});
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

function renderLabel({ artist, label = '', title }: WaveMarker, element: HTMLElement): void {
	if (typeof artist !== 'string' || typeof title !== 'string' || artist === '') {
		element.textContent = label;

		return;
	}

	const artistPart = document.createElement('span');

	artistPart.className = 'pzm-panel-label-artist';
	artistPart.textContent = artist;
	element.append(artistPart, ` - ${title}`);
}

function selectPanelSource(state: PlayerStore): PanelSource {
	return { detail: loadedDetail(state), track: loadedTrack(state) };
}

function showTrack(
	waveform: SonicWaveform,
	{ detail, track }: PanelSource,
	partialNote: string,
): void {
	const cuePoints = detail?.cuePoints ?? [];

	waveform.disabled = track === undefined;
	waveform.markers = toPanelMarkers(cuePoints, detail?.trackCount ?? cuePoints.length, partialNote);
}
