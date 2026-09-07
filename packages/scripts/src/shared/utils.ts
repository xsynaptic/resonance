import crypto from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { $ } from 'zx';

// Cached for the process: scripts only ever run from one place per invocation
let cachedWorkspaceRoot: string | undefined;

// Interrupted work leaves tmp files behind; clear them so none masquerade as a complete output
export async function cleanStaleTmp(dir: string, extension: string): Promise<void> {
	let existing: Array<string>;

	try {
		existing = await fs.readdir(dir);
	} catch {
		return;
	}

	await Promise.all(
		existing
			.filter((name) => name.endsWith(extension))
			.map((name) => fs.rm(path.join(dir, name), { force: true })),
	);
}

export async function ensureSshKeychain(): Promise<void> {
	try {
		await $`ssh-add --apple-load-keychain 2>/dev/null`;
	} catch {
		// Ignore: not on macOS, or no keychain identities
	}
}

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
	if (cachedWorkspaceRoot) return cachedWorkspaceRoot;

	let current = path.resolve(startDir);

	while (current !== path.dirname(current)) {
		if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
			cachedWorkspaceRoot = current;
			return current;
		}

		current = path.dirname(current);
	}

	throw new Error(`Could not locate pnpm-workspace.yaml above ${startDir}`);
}

// 12 hex of a sha256 over a file's own bytes
export async function hashFile(file: string): Promise<string> {
	const hash = crypto.createHash('sha256');

	await pipeline(createReadStream(file), hash);

	return hash.digest('hex').slice(0, 12);
}

export async function isPathPresent(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
