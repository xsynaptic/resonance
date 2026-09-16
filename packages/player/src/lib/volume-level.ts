import type { IconName } from '#lib/icons.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels } from '#types.ts';

import { audibleVolume } from '#store/selectors.ts';

export interface LevelView {
	icon: IconName;
	isSilent: boolean;
}

const lowVolume = 0.5;

export function muteLabel(view: LevelView, labels: Pick<PlayerLabels, 'mute' | 'unmute'>): string {
	return view.isSilent ? labels.unmute : labels.mute;
}

export function selectLevel(state: PlayerStore): LevelView {
	const volume = audibleVolume(state);

	return { icon: levelIcon(volume), isSilent: volume === 0 };
}

function levelIcon(volume: number): IconName {
	if (volume === 0) return 'volumeMuted';
	if (volume < lowVolume) return 'volumeLow';

	return 'volume';
}
