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
		async prune(ids: Set<string>): Promise<number> {
			// An empty set means a stale or missing `dist/`, never "delete everything"
			if (ids.size === 0) return 0;

			const suffix = `.${openGraphImageFormat}`;
			const files = await fs.readdir(directory);
			let removed = 0;

			for (const file of files) {
				if (!file.endsWith(suffix) || ids.has(file.slice(0, -suffix.length))) continue;

				await fs.rm(path.join(directory, file));
				removed++;
			}

			for (const id of keys.keys()) {
				if (!ids.has(id)) keys.delete(id);
			}

			return removed;
		},
		async save(): Promise<void> {
			const sorted = [...keys].sort(([first], [second]) => first.localeCompare(second));

			await fs.writeFile(
				manifestPath,
				`${JSON.stringify(Object.fromEntries(sorted), undefined, 2)}\n`,
			);
		},
		async write(id: string, key: string, data: Uint8Array): Promise<void> {
			const target = filePath(id);

			if (await hasChanged(target, data)) await fs.writeFile(target, data);

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

// A template edit that leaves the pixels alone should not move the cached card's mtime
async function hasChanged(target: string, data: Uint8Array): Promise<boolean> {
	try {
		const existing = await fs.readFile(target);

		return !existing.equals(data);
	} catch {
		return true;
	}
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
