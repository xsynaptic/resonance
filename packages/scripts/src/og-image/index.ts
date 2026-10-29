import type { RenderCounts, RenderFailure } from '@xsynaptic/astro-image-pipeline/node';
import type { Progress } from '@xsynaptic/astro-scripts';

import {
	getImageCachePaths,
	hashTemplateVersion,
	prepareCardRender,
} from '@xsynaptic/astro-image-pipeline/node';
import { createProgress, formatCount, log, UserError, withStep } from '@xsynaptic/astro-scripts';
import {
	imageCachePath,
	openGraphBasePath,
	openGraphImageHeight,
	openGraphImageWidth,
} from '@xsynaptic/shared/constants';
import { OpenGraphCardInputSchema } from '@xsynaptic/shared/open-graph';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createCardRenderer, decodeFeaturedImage } from '#og-image/generate.ts';

const templateVersion = hashTemplateVersion({
	files: ['element.tsx', 'fonts.ts', 'generate.ts'].map((file) => new URL(file, import.meta.url)),
	from: import.meta.url,
	packages: ['takumi-js'],
	parts: [openGraphImageWidth, openGraphImageHeight],
});

interface OpenGraphOptions {
	clearCache?: boolean;
	rootPath: string;
	signal?: AbortSignal;
}

interface PublishOptions {
	cards: Array<string>;
	directory: string;
	distPath: string;
}

export async function generateOpenGraphImages(options: OpenGraphOptions): Promise<void> {
	await withStep('Generating Open Graph images', () => drawOpenGraphImages(options));
}

async function drawOpenGraphImages({
	clearCache = false,
	rootPath,
	signal,
}: OpenGraphOptions): Promise<void> {
	const cachePath = path.resolve(rootPath, imageCachePath);

	if (clearCache) {
		const { cardsPath } = getImageCachePaths(cachePath);

		await fs.rm(cardsPath, { force: true, recursive: true });
		log.success(`Cleared ${cardsPath}`);
		return;
	}

	const distPath = path.resolve(rootPath, 'dist');
	const renderCard = await createCardRenderer();
	const render = await prepareCardRender({
		cachePath,
		decode: (source) => decodeFeaturedImage(source.filePath),
		distPath,
		missingImage: 'omit',
		render: (input, image) => renderCard(OpenGraphCardInputSchema.parse(input), image),
		templateVersion,
	});

	for (const { cards, path: imagePath } of render.missingImages) {
		log.warn(`Featured Image missing: ${imagePath} (${cards.join(', ')})`);
	}

	const progress = createProgress({ label: 'Cards', total: render.total });
	const counts = await render.run({
		onFailure: 'report',
		onProgress: () => {
			progress.tick();
		},
		...(signal ? { signal } : {}),
	});
	reportOutcomes(counts, { missingCount: render.missingImages.length, progress });

	await publish({ cards: render.cards, directory: render.directory, distPath });
}

function reportOutcomes(
	{ failures, fresh, rendered }: RenderCounts & { failures: Array<RenderFailure> },
	{ missingCount, progress }: { missingCount: number; progress: Progress },
): void {
	const tally = `${formatCount(rendered)} generated, ${formatCount(fresh)} cached`;

	if (failures.length > 0) {
		progress.fail(tally);
		for (const { message, name } of failures) log.error(`${name}: ${message}`);
		throw new UserError(`${String(failures.length)} Open Graph image(s) failed to render`);
	}

	if (missingCount > 0) {
		progress.warn(`${tally}, ${formatCount(missingCount)} Featured Image(s) missing`);
		return;
	}

	progress.succeed(tally);
}

// Only cards the build asks for publish; a renamed entry's old card URL is carried by a redirect rule
async function publish({ cards, directory, distPath }: PublishOptions): Promise<void> {
	const publishPath = path.join(distPath, openGraphBasePath);

	await fs.mkdir(publishPath, { recursive: true });

	for (const name of cards) {
		await fs.copyFile(path.join(directory, name), path.join(publishPath, name));
	}

	log.success(`Published ${formatCount(cards.length)} cards to ${publishPath}`);
}
