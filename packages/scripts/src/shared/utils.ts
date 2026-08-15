import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

// Cached for the process: scripts only ever run from one place per invocation
let cachedWorkspaceRoot: string | undefined;

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

export async function isPathPresent(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
