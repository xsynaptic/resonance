import {
	openGraphImageFormat,
	openGraphImageHeight,
	openGraphImageWidth,
	openGraphManifestFile,
} from '@xsynaptic/shared/constants';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Everything that decides a card's pixels; hashed so an edit can never be forgotten
const templateFiles = ['element.tsx', 'fonts.ts', 'generate.ts'];

const templateVersion = hashTemplateFiles();

// A card's filename is its id alone, so nothing on disk records what it was drawn from; hashing the
// key into the name instead would leave a stale file behind on every edit
// Keys this run did not ask about are kept: no card file is ever deleted, so dropping one re-renders
// a returning entry over bytes already on disk
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

// A card goes stale when its content or its Featured Image changes; the template version invalidates the lot
export function getCacheKey({
	digest,
	imageFeaturedId,
	imageModifiedTime,
	style,
}: {
	digest: string;
	imageFeaturedId: string | undefined;
	imageModifiedTime: number | undefined;
	style: string | undefined;
}): string {
	return [
		templateVersion,
		digest,
		imageFeaturedId ?? '',
		imageModifiedTime ?? '',
		style ?? '',
	].join(':');
}

function hashTemplateFiles(): string {
	const hash = createHash('sha256').update(
		`${String(openGraphImageWidth)}x${String(openGraphImageHeight)}`,
	);

	for (const file of templateFiles) {
		hash.update(readFileSync(new URL(file, import.meta.url), 'utf8'));
	}

	return hash.digest('hex').slice(0, 8);
}
