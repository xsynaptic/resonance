import {
	SonicButton,
	SonicDial,
	SonicSlider,
	SonicTicker,
	SonicWavestrip,
} from '@xsynaptic/sonic-ui';

import type { PlayerButtonPart } from '#elements/button-part.ts';
import type { PlayerTracklist } from '#elements/overlay/tracklist.ts';
import type { PlayerPanelZoom } from '#elements/panel/panel-zoom.ts';
import type { PlayerQueueActions } from '#elements/tray/queue-actions.ts';
import type { PlayerTray } from '#elements/tray/tray.ts';

import { PlayerArtistLine } from '#elements/artist-line.ts';
import { PlayerArtwork } from '#elements/artwork.ts';
import { defineOnce } from '#elements/define-once.ts';
import { PlayerMuteButton } from '#elements/mute-button.ts';
import { PlayerOverlayToggle } from '#elements/overlay-toggle.ts';
import { PlayerOverlayContent } from '#elements/overlay/overlay-content.ts';
import { PlayerOverlay } from '#elements/overlay/overlay.ts';
import { PlayerPanelToggle } from '#elements/panel-toggle.ts';
import { PlayerPanel } from '#elements/panel/panel.ts';
import { PlayerPlayButton } from '#elements/play-button.ts';
import { PlayerBar } from '#elements/player-bar.ts';
import { PlayerRoot } from '#elements/player-root.ts';
import { PlayerProgress } from '#elements/progress.ts';
import { PlayerQueueButton } from '#elements/queue-button.ts';
import { PlayerScope } from '#elements/scope/scope.ts';
import { PlayerScrubReadout } from '#elements/scrub-readout.ts';
import { PlayerSeekButton } from '#elements/seek-button.ts';
import { PlayerStatusRegion } from '#elements/status.ts';
import { PlayerStepButton } from '#elements/step-button.ts';
import { PlayerTimeSlider } from '#elements/time-slider/time-slider.ts';
import { PlayerTime } from '#elements/time.ts';
import { PlayerTitle } from '#elements/title.ts';
import { PlayerVolume } from '#elements/volume.ts';

declare global {
	interface HTMLElementTagNameMap {
		'pzm-artist-line': PlayerArtistLine;
		'pzm-artwork': PlayerArtwork;
		'pzm-bar': PlayerBar;
		'pzm-cue-list': PlayerTracklist;
		'pzm-mute-button': PlayerButtonPart;
		'pzm-overlay': PlayerOverlay;
		'pzm-overlay-content': PlayerOverlayContent;
		'pzm-overlay-toggle': PlayerButtonPart;
		'pzm-panel': PlayerPanel;
		'pzm-panel-toggle': PlayerButtonPart;
		'pzm-panel-zoom': PlayerPanelZoom;
		'pzm-play-button': PlayerButtonPart;
		'pzm-progress': PlayerProgress;
		'pzm-queue-actions': PlayerQueueActions;
		'pzm-queue-button': PlayerQueueButton;
		'pzm-root': PlayerRoot;
		'pzm-scope': PlayerScope;
		'pzm-scrub-readout': PlayerScrubReadout;
		'pzm-seek-button': PlayerButtonPart;
		'pzm-status': PlayerStatusRegion;
		'pzm-step-button': PlayerButtonPart;
		'pzm-time': PlayerButtonPart;
		'pzm-time-slider': PlayerTimeSlider;
		'pzm-title': PlayerTitle;
		'pzm-tray': PlayerTray;
		'pzm-volume': PlayerVolume;
	}
}

// Registered before the parts, which need an upgraded control when they connect
const playerElements = [
	['sonic-button', SonicButton],
	['sonic-dial', SonicDial],
	['sonic-slider', SonicSlider],
	['sonic-ticker', SonicTicker],
	['sonic-wavestrip', SonicWavestrip],
	['pzm-root', PlayerRoot],
	['pzm-play-button', PlayerPlayButton],
	['pzm-time', PlayerTime],
	['pzm-step-button', PlayerStepButton],
	['pzm-seek-button', PlayerSeekButton],
	['pzm-title', PlayerTitle],
	['pzm-artist-line', PlayerArtistLine],
	['pzm-artwork', PlayerArtwork],
	['pzm-status', PlayerStatusRegion],
	['pzm-panel-toggle', PlayerPanelToggle],
	['pzm-overlay-toggle', PlayerOverlayToggle],
	['pzm-progress', PlayerProgress],
	['pzm-queue-button', PlayerQueueButton],
	['pzm-mute-button', PlayerMuteButton],
	['pzm-volume', PlayerVolume],
	['pzm-scope', PlayerScope],
	['pzm-scrub-readout', PlayerScrubReadout],
	['pzm-time-slider', PlayerTimeSlider],
	['pzm-panel', PlayerPanel],
	['pzm-overlay', PlayerOverlay],
	['pzm-overlay-content', PlayerOverlayContent],
	['pzm-bar', PlayerBar],
] as const;

export function definePlayerElements(): void {
	for (const [tag, elementClass] of playerElements) defineOnce(tag, elementClass);
}
