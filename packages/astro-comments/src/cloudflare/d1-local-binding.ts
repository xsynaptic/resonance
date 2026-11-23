import path from 'node:path';

import type { D1Binding } from '#cloudflare/d1-store.ts';

export interface D1LocalOptions {
	binding: string;
	configPath: string;
}

export interface D1LocalConnection {
	binding: D1Binding;
	dispose: () => Promise<void>;
}

// Remote off, so a `remote: true` in the config never reaches production
export async function openD1LocalBinding({
	binding,
	configPath,
}: D1LocalOptions): Promise<D1LocalConnection> {
	const { getPlatformProxy } = await import('wrangler');
	const resolvedConfigPath = path.resolve(configPath);
	const proxy = await getPlatformProxy({
		configPath: resolvedConfigPath,
		// Where `wrangler d1 execute --local` writes; the proxy's default follows the cwd
		persist: { path: path.join(path.dirname(resolvedConfigPath), '.wrangler/state/v3') },
		remoteBindings: false,
	});
	const candidate = proxy.env[binding];

	if (!isD1Binding(candidate)) {
		await proxy.dispose();

		throw new Error(`The wrangler config has no D1 binding named ${binding}`);
	}

	return { binding: candidate, dispose: proxy.dispose };
}

function isD1Binding(value: unknown): value is D1Binding {
	return (
		typeof value === 'object' &&
		value !== null &&
		'prepare' in value &&
		typeof value.prepare === 'function'
	);
}
