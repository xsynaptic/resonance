import type { PlayerTracklist } from '#elements/overlay/tracklist.ts';
import type { PlayerPanelZoom } from '#elements/panel/panel-zoom.ts';
import type { PlayerTray } from '#elements/tray/tray.ts';

import { PlayerArtistLine } from '#elements/artist-line.ts';
import { PlayerArtwork } from '#elements/artwork.ts';
import { PlayerMuteButton } from '#elements/mute-button.ts';
import { PlayerOverlayToggle } from '#elements/overlay-toggle.ts';
import { PlayerOverlayContent } from '#elements/overlay/overlay-content.ts';
import { PlayerOverlay } from '#elements/overlay/overlay.ts';
import { PlayerPanelToggle } from '#elements/panel-toggle.ts';
import { PlayerPanel } from '#elements/panel/panel.ts';
import { PlayerPlayButton } from '#elements/play-button.ts';
import { PlayerBar } from '#elements/player-bar.ts';
import { PlayerRoot } from '#elements/player-root.ts';
import { PlayerQueueButton } from '#elements/queue-button.ts';
import { PlayerScope } from '#elements/scope.ts';
import { PlayerSeekButton } from '#elements/seek-button.ts';
import { PlayerStatusRegion } from '#elements/status.ts';
import { PlayerStepButton } from '#elements/step-button.ts';
import { PlayerTimeSlider } from '#elements/time-slider/time-slider.ts';
import { PlayerTime } from '#elements/time.ts';
import { PlayerTitle } from '#elements/title.ts';
import { PlayerVolumePopover } from '#elements/volume-popover.ts';
import { PlayerVolumeSlider } from '#elements/volume-slider.ts';

export { bindMediaSession } from '#engine/media-session.ts';
export { bindPageControls } from '#lib/page-controls.ts';
export { playerStore } from '#store/player-store.ts';

declare global {
	interface HTMLElementTagNameMap {
		'player-artist-line': PlayerArtistLine;
		'player-artwork': PlayerArtwork;
		'player-bar': PlayerBar;
		'player-mute-button': InstanceType<typeof PlayerMuteButton>;
		'player-overlay': PlayerOverlay;
		'player-overlay-content': PlayerOverlayContent;
		'player-overlay-toggle': InstanceType<typeof PlayerOverlayToggle>;
		'player-panel': PlayerPanel;
		'player-panel-toggle': InstanceType<typeof PlayerPanelToggle>;
		'player-panel-zoom': PlayerPanelZoom;
		'player-play-button': InstanceType<typeof PlayerPlayButton>;
		'player-queue-button': PlayerQueueButton;
		'player-root': PlayerRoot;
		'player-scope': PlayerScope;
		'player-seek-button': PlayerSeekButton;
		'player-status': PlayerStatusRegion;
		'player-step-button': PlayerStepButton;
		'player-time': PlayerTime;
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
	['player-queue-button', PlayerQueueButton],
	['player-mute-button', PlayerMuteButton],
	['player-volume-slider', PlayerVolumeSlider],
	['player-volume-popover', PlayerVolumePopover],
	['player-scope', PlayerScope],
	['player-time-slider', PlayerTimeSlider],
	['player-panel', PlayerPanel],
	['player-overlay', PlayerOverlay],
	['player-overlay-content', PlayerOverlayContent],
	['player-bar', PlayerBar],
] as const;

export function definePlayerElements(): void {
	for (const [tag, element] of playerElements) {
		if (!customElements.get(tag)) customElements.define(tag, element);
	}
}
