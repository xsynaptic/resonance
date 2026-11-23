import type { PlayerLabels } from '@xsynaptic/plazmoid-player';

import { defaultLabels } from '@xsynaptic/plazmoid-player/labels';

export const seekSeconds = 15;

export function getPlayerLabels(): PlayerLabels {
	return { ...defaultLabels };
}
