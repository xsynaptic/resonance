import type { QueueItem } from '@xsynaptic/player';
import type { CollectionEntry } from 'astro:content';

import { getImage } from 'astro:assets';

import { getMixAudio } from '#lib/collections/mixes/mixes-audio.ts';
import { getMixCuePoints } from '#lib/collections/mixes/mixes-cue.ts';
import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { getMediaImage } from '#lib/utils/media.ts';
import { getContentPath } from '#lib/utils/routing.ts';
import { toFlatTracks } from '#lib/utils/track-groups.ts';

// Both files are resolved at build time, so the island's resolvers read them off the queue
export interface PlayerPayloadItem extends QueueItem {
	archiveUrl: string;
	streamUrl: string;
}

// A mix has no album above it, so the lock screen's album line repeats the mix title
export async function getMixQueueItem(
	entry: CollectionEntry<'mixes'>,
	artistLine: string,
): Promise<PlayerPayloadItem | undefined> {
	const audio = await getMixAudio(entry.data);
	if (!audio) return undefined;

	const artworkUrl = await getArtworkUrl(getImageFeaturedId(entry.data.imageFeatured));
	const cuePoints = await getMixCuePoints(entry);

	return {
		albumLoudness: {},
		archiveUrl: audio.archiveUrl,
		artistLine,
		durationMs: audio.seconds * 1000,
		loudness: {},
		releaseHref: getContentPath('mixes', entry.id),
		releaseTitle: entry.data.title,
		streamUrl: audio.streamUrl,
		title: entry.data.title,
		trackId: entry.id,
		waveformOverview: audio.peaks,
		...(artworkUrl ? { artworkUrl } : {}),
		// Only alongside the cue points it qualifies; on its own the count tells the panel nothing
		...(cuePoints.length > 0
			? { cuePoints, trackCount: toFlatTracks(entry.data.tracks).length || cuePoints.length }
			: {}),
	};
}

async function getArtworkUrl(mediaPath: string | undefined): Promise<string | undefined> {
	const image = mediaPath ? getMediaImage(mediaPath) : undefined;
	if (!image) return undefined;

	const artwork = await getImage({ height: 512, src: image, width: 512 });

	return artwork.src;
}
