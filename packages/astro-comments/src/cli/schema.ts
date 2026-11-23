import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const schemaUrl = new URL('../../schema.sql', import.meta.url);

// Named as `wrangler d1 migrations create` names one
export async function writeSchemaMigration(migrationsDirectory: string): Promise<string> {
	const existing = await readdir(migrationsDirectory);
	const highest = Math.max(0, ...existing.map((name) => Number(/^\d+/.exec(name)?.[0] ?? 0)));
	const filePath = path.join(
		migrationsDirectory,
		`${String(highest + 1).padStart(4, '0')}_astro_comments.sql`,
	);

	await writeFile(filePath, await readFile(schemaUrl, 'utf8'), { flag: 'wx' });

	return filePath;
}
