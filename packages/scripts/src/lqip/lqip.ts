import { mediaLqipPath } from '@xsynaptic/shared/constants';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import sharp from 'sharp';
import { glob } from 'zx';

const concurrency = 8;

const mediaDir = 'packages/content/media';

// Mirrors the glob in `src/lib/utils/media.ts`; the app never resolves the WordPress `-WxH` derivatives
const mediaPatterns = [
	'**/*.{avif,jpeg,jpg,png,webp}',
	'!**/*-[0-9][0-9]*x[0-9][0-9]*.{avif,jpeg,jpg,png,webp}',
];

// Pixel budget rather than an edge, so the grid tracks the aspect ratio; 1024 is 32x32 on a square cover
const lqipPixelCount = 1024;
const lqipQuality = 25;

// Saturation lift compensates for the desaturation heavy webp compression introduces
const lqipSaturation = 1.2;

// Blurring before the final downsample leaves the encoder no high frequencies to spend bytes on
// The placeholder is a background on the img, where a CSS filter would blur the loaded image too
const blurScale = 8;
const blurSigma = 3;

// Derived, so tuning any constant above invalidates the cache instead of serving stale placeholders
const settingsKey = `px${String(lqipPixelCount)}-q${String(lqipQuality)}-s${String(lqipSaturation)}-b${String(blurSigma)}x${String(blurScale)}`;

interface LqipCache {
	entries: Record<string, LqipEntry>;
	settings: string;
}

interface LqipEntry {
	lqip: string;
	mtime: number;
}

export async function generateLqip(rootPath: string): Promise<void> {
	const mediaPath = path.join(rootPath, mediaDir);
	const outputPath = path.resolve(rootPath, mediaLqipPath);

	const files = await glob(mediaPatterns, { cwd: mediaPath });
	const cached = await loadCache(outputPath);

	const entries: Record<string, LqipEntry> = {};
	const limit = pLimit(concurrency);
	let generated = 0;
	let reused = 0;
	let skipped = 0;

	await Promise.all(
		files.map((relativePath) =>
			limit(async () => {
				const { mtimeMs } = await fs.stat(path.join(mediaPath, relativePath));
				const mtime = Math.round(mtimeMs);
				const previous = cached[relativePath];

				if (previous?.mtime === mtime) {
					entries[relativePath] = previous;
					reused += 1;
					return;
				}

				const lqip = await renderLqip(path.join(mediaPath, relativePath));

				if (lqip === undefined) {
					skipped += 1;
					return;
				}

				entries[relativePath] = { lqip, mtime };
				generated += 1;
				console.log(chalk.green(`  ${relativePath}`));
			}),
		),
	);

	const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(
		outputPath,
		`${JSON.stringify({ entries: sorted, settings: settingsKey } satisfies LqipCache, undefined, '\t')}\n`,
	);

	console.log(
		chalk.blue(
			`LQIP: ${String(generated)} generated, ${String(reused)} cached, ${String(skipped)} skipped for transparency`,
		),
	);
}

function getPlaceholderDimensions(aspectRatio: number): { height: number; width: number } {
	const height = Math.sqrt(lqipPixelCount / aspectRatio);

	return { height: Math.round(height), width: Math.round(lqipPixelCount / height) };
}

async function loadCache(outputPath: string): Promise<Record<string, LqipEntry>> {
	try {
		const parsed = JSON.parse(await fs.readFile(outputPath, 'utf8')) as LqipCache;

		return parsed.settings === settingsKey ? parsed.entries : {};
	} catch {
		return {};
	}
}

// A blurred backdrop behind a transparent source reads as haze around the subject
async function renderLqip(filePath: string): Promise<string | undefined> {
	const image = sharp(filePath, { failOn: 'error' });
	const { hasAlpha, height, width } = await image.metadata();

	if (hasAlpha) return undefined;

	const grid = getPlaceholderDimensions(width / height);

	const buffer = await image
		.resize(grid.width * blurScale, grid.height * blurScale, { fit: 'fill' })
		.blur(blurSigma)
		.resize(grid.width, grid.height, { fit: 'fill' })
		.modulate({ saturation: lqipSaturation })
		.webp({ quality: lqipQuality })
		.toBuffer();

	return `data:image/webp;base64,${buffer.toString('base64')}`;
}
