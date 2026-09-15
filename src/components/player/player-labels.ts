import type { PlayerLabels } from '@xsynaptic/player';

import { t } from '#lib/i18n/i18n-strings.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

export const seekSeconds = 30;

// Serialized into the bar's JSON script rather than imported by the host script, which would ship the whole strings table
export function getPlayerLabels(): PlayerLabels {
	return {
		capped: t('player.capped'),
		clearQueue: t('player.clearQueue'),
		close: t('player.close'),
		empty: t('player.empty'),
		error: t('player.error'),
		expand: t('player.expand'),
		loading: t('player.loading'),
		moved: t('player.moved'),
		mute: t('player.mute'),
		next: t('player.next'),
		nowPlaying: t('player.nowPlaying'),
		pause: t('player.pause'),
		play: t('player.play'),
		playlist: t('player.playlist'),
		previous: t('player.previous'),
		queue: t('player.queue'),
		removeFromQueue: t('player.removeFromQueue'),
		reorder: t('player.reorder'),
		seek: t('player.seek'),
		seekBack: formatStringTemplate(t('player.seekBack'), { seconds: seekSeconds }),
		seekForward: formatStringTemplate(t('player.seekForward'), { seconds: seekSeconds }),
		seekPosition: t('player.seekPosition'),
		shuffle: t('player.shuffle'),
		timestampsPartial: t('player.timestampsPartial'),
		toggleTimeMode: t('player.toggleTimeMode'),
		tracklist: t('player.tracklist'),
		unmute: t('player.unmute'),
		unplayable: t('player.unplayable'),
		volume: t('player.volume'),
		waveformPanel: t('player.waveformPanel'),
		zoomIn: t('player.zoomIn'),
		zoomOut: t('player.zoomOut'),
	};
}
