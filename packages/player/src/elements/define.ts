import { PlayerArtistLine } from '#elements/artist-line.ts';
import { PlayerArtwork } from '#elements/artwork.ts';
import { PlayerMuteButton } from '#elements/mute-button.ts';
import { PlayerOverlayToggle } from '#elements/overlay-toggle.ts';
import { PlayerPanelToggle } from '#elements/panel-toggle.ts';
import { PlayerPlayButton } from '#elements/play-button.ts';
import { PlayerRoot } from '#elements/player-root.ts';
import { PlayerQueueButton } from '#elements/queue-button.ts';
import { PlayerScope } from '#elements/scope.ts';
import { PlayerSeekButton } from '#elements/seek-button.ts';
import { PlayerStatusRegion } from '#elements/status.ts';
import { PlayerStepButton } from '#elements/step-button.ts';
import { PlayerTime } from '#elements/time.ts';
import { PlayerTitle } from '#elements/title.ts';
import { PlayerVolumePopover } from '#elements/volume-popover.ts';
import { PlayerVolumeSlider } from '#elements/volume-slider.ts';

declare global {
	interface HTMLElementTagNameMap {
		'player-artist-line': PlayerArtistLine;
		'player-artwork': PlayerArtwork;
		'player-mute-button': InstanceType<typeof PlayerMuteButton>;
		'player-overlay-toggle': InstanceType<typeof PlayerOverlayToggle>;
		'player-panel-toggle': InstanceType<typeof PlayerPanelToggle>;
		'player-play-button': InstanceType<typeof PlayerPlayButton>;
		'player-queue-button': InstanceType<typeof PlayerQueueButton>;
		'player-root': PlayerRoot;
		'player-scope': PlayerScope;
		'player-seek-button': PlayerSeekButton;
		'player-status': PlayerStatusRegion;
		'player-step-button': PlayerStepButton;
		'player-time': PlayerTime;
		'player-title': PlayerTitle;
		'player-volume-popover': PlayerVolumePopover;
		'player-volume-slider': PlayerVolumeSlider;
	}
}

// The root first, so a part already in the document never upgrades before its store is there to find
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
] as const;

export function definePlayerElements(): void {
	for (const [tag, element] of playerElements) {
		if (!customElements.get(tag)) customElements.define(tag, element);
	}
}
