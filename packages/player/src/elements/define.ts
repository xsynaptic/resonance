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
import { PlayerVolumePopover } from '#elements/volume-popover.ts';
import { PlayerVolumeSlider } from '#elements/volume-slider.ts';

declare global {
	interface HTMLElementTagNameMap {
		'player-artist-line': PlayerArtistLine;
		'player-artwork': PlayerArtwork;
		'player-bar': PlayerBar;
		'player-mute-button': PlayerButtonPart;
		'player-overlay': PlayerOverlay;
		'player-overlay-content': PlayerOverlayContent;
		'player-overlay-toggle': PlayerButtonPart;
		'player-panel': PlayerPanel;
		'player-panel-toggle': PlayerButtonPart;
		'player-panel-zoom': PlayerPanelZoom;
		'player-play-button': PlayerButtonPart;
		'player-progress': PlayerProgress;
		'player-queue-actions': PlayerQueueActions;
		'player-queue-button': PlayerQueueButton;
		'player-root': PlayerRoot;
		'player-scope': PlayerScope;
		'player-scrub-readout': PlayerScrubReadout;
		'player-seek-button': PlayerButtonPart;
		'player-status': PlayerStatusRegion;
		'player-step-button': PlayerButtonPart;
		'player-time': PlayerButtonPart;
		'player-time-slider': PlayerTimeSlider;
		'player-title': PlayerTitle;
		'player-tracklist': PlayerTracklist;
		'player-tray': PlayerTray;
		'player-volume-popover': PlayerVolumePopover;
		'player-volume-slider': PlayerVolumeSlider;
	}
}

const playerElements = [
	['player-root', PlayerRoot],
	['player-play-button', PlayerPlayButton],
	['player-time', PlayerTime],
	['player-step-button', PlayerStepButton],
	['player-seek-button', PlayerSeekButton],
	['player-title', PlayerTitle],
	['player-artist-line', PlayerArtistLine],
	['player-artwork', PlayerArtwork],
	['player-status', PlayerStatusRegion],
	['player-panel-toggle', PlayerPanelToggle],
	['player-overlay-toggle', PlayerOverlayToggle],
	['player-progress', PlayerProgress],
	['player-queue-button', PlayerQueueButton],
	['player-mute-button', PlayerMuteButton],
	['player-volume-slider', PlayerVolumeSlider],
	['player-volume-popover', PlayerVolumePopover],
	['player-scope', PlayerScope],
	['player-scrub-readout', PlayerScrubReadout],
	['player-time-slider', PlayerTimeSlider],
	['player-panel', PlayerPanel],
	['player-overlay', PlayerOverlay],
	['player-overlay-content', PlayerOverlayContent],
	['player-bar', PlayerBar],
] as const;

export function definePlayerElements(): void {
	for (const [tag, elementClass] of playerElements) defineOnce(tag, elementClass);
}
