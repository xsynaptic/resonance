import type { QueueArtwork, QueueItem } from '@xsynaptic/player';
import type { CollectionEntry } from 'astro:content';

import { barArtworkSize } from '@xsynaptic/player/constants';
import { getContentPath } from '@xsynaptic/shared/routing';
import { getImage } from 'astro:assets';

import { getMixAudio } from '#lib/collections/mixes/mixes-audio.ts';
import { getMixCuePoints } from '#lib/collections/mixes/mixes-cue.ts';
import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { getMediaImage } from '#lib/utils/media.ts';
import { toFlatTracks } from '#lib/utils/track-groups.ts';

// The bar at 1x and 2x, then the lock screen and the overlay's larger slots
const artworkWidths = [barArtworkSize, barArtworkSize * 2, 512, 900, 1800];

// Both files are resolved at build time, so the island's resolvers read them off the queue
export interface PlayerPayloadItem extends QueueItem {
	archiveUrl: string;
	streamUrl: string;
}

export async function getMixQueueItem(
	entry: CollectionEntry<'mixes'>,
	artistLine: string,
): Promise<PlayerPayloadItem | undefined> {
	const audio = await getMixAudio(entry.data);
	if (!audio) return undefined;

	const artwork = await getArtwork(getImageFeaturedId(entry.data.imageFeatured));
	const cuePoints = await getMixCuePoints(entry);

	return {
		archiveUrl: audio.archiveUrl,
		artistLine,
		durationMs: audio.seconds * 1000,
		itemId: entry.id,
		releaseHref: getContentPath('mixes', entry.id),
		releaseTitle: entry.data.title,
		streamUrl: audio.streamUrl,
		title: entry.data.title,
		waveformOverview: audio.peaks.map((peak) => Math.round(peak * 100) / 100),
		...(artwork ? { artwork } : {}),
		// Only alongside the cue points it qualifies; on its own the count tells the panel nothing
		...(cuePoints.length > 0
			? { cuePoints, trackCount: toFlatTracks(entry.data.tracks).length || cuePoints.length }
			: {}),
	};
}

// Cropped square and capped at the source's short side, so every `w` descriptor is the rendition's true width
// The global `constrained` layout would emit a breakpoint `srcset` per call; `none` yields the one image asked for
async function getArtwork(mediaPath: string | undefined): Promise<Array<QueueArtwork> | undefined> {
	const image = mediaPath ? getMediaImage(mediaPath) : undefined;
	if (!image) return undefined;

	const sourceSize = Math.min(image.width, image.height);
	const widths = [...new Set(artworkWidths.map((width) => Math.min(width, sourceSize)))].toSorted(
		(first, second) => first - second,
	);

	return Promise.all(
		widths.map(async (width) => {
			const rendition = await getImage({
				fit: 'cover',
				height: width,
				layout: 'none',
				src: image,
				width,
			});

			const type = getMimeType(rendition.options.format);

			return { src: rendition.src, width, ...(type === undefined ? {} : { type }) };
		}),
	);
}

function getMimeType(format: string | undefined): string | undefined {
	if (format === undefined) return undefined;
	if (format === 'jpg') return 'image/jpeg';
	if (format === 'svg') return 'image/svg+xml';

	return `image/${format}`;
}
