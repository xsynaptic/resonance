import { openGraphImageFormat, openGraphManifestFile } from '@xsynaptic/shared/constants';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Bump when element.tsx changes, to regenerate every card
const templateVersion = '4';

/**
 * A stable `{id}.jpg` filename keeps the public URL fixed, so freshness lives in a manifest beside
 * the cards rather than in their names. Loaded once and written once: a few hundred string pairs do
 * not justify a key-value store, which is what spectralcodex reaches for at its scale.
 */
export async function createOutputCache(directory: string) {
	const manifestPath = path.join(directory, openGraphManifestFile);

	const keys = new Map<string, string>(
		existsSync(manifestPath)
			? Object.entries(
					JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, string>,
				)
			: [],
	);

	function filePath(id: string): string {
		return path.join(directory, `${id}.${openGraphImageFormat}`);
	}

	return {
		filePath,

		// The file itself is checked too: a cleared output directory must not read as fresh
		isFresh(id: string, key: string): boolean {
			return keys.get(id) === key && existsSync(filePath(id));
		},

		async save(): Promise<void> {
			const sorted = [...keys].sort(([first], [second]) => first.localeCompare(second));

			await fs.writeFile(
				manifestPath,
				`${JSON.stringify(Object.fromEntries(sorted), undefined, 2)}\n`,
			);
		},

		async write(id: string, key: string, data: Uint8Array): Promise<void> {
			await fs.writeFile(filePath(id), data);
			keys.set(id, key);
		},
	};
}

// A card goes stale when its content or its cover changes; the template version invalidates the lot
export function getCacheKey({
	coverModifiedTime,
	digest,
	imageFeaturedId,
}: {
	coverModifiedTime: number | undefined;
	digest: string;
	imageFeaturedId: string | undefined;
}): string {
	return [templateVersion, digest, imageFeaturedId ?? '', coverModifiedTime ?? ''].join(':');
}
