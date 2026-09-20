import fs from 'node:fs/promises';
import path from 'node:path';

export async function collectHashedOutputs(
	directoryPath: string,
	pattern: RegExp,
	label: string,
): Promise<Map<string, string>> {
	let entries: Array<string>;

	try {
		entries = await fs.readdir(directoryPath);
	} catch {
		return new Map();
	}

	const outputs = new Map<string, string>();

	for (const entry of entries) {
		const base = pattern.exec(entry)?.groups?.base;

		if (base === undefined) continue;

		const existing = outputs.get(base);

		// An interrupted run leaves both hashed files; keeping either one silently ships a stale name
		if (existing !== undefined) {
			throw new Error(
				`Two ${label} for "${base}": ${existing} and ${entry}. Delete the stale one and re-run.`,
			);
		}

		outputs.set(base, entry);
	}

	return outputs;
}

// The previous hash is unreachable the moment this one lands; the deploy leg reaps its remote twin
export async function landHashedOutput(
	file: string,
	directoryPath: string,
	{ existing, name }: { existing: string | undefined; name: string },
): Promise<void> {
	await fs.rename(file, path.join(directoryPath, name));

	if (existing !== undefined && existing !== name) {
		await fs.rm(path.join(directoryPath, existing), { force: true });
	}
}
