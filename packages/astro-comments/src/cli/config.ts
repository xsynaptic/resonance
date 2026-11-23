import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import type { CommentsConfig } from '#cli/define-config.ts';
import type { D1HttpOptions } from '#cloudflare/d1-http-binding.ts';
import type { SnapshotTarget } from '#snapshot/snapshot.ts';
import type { CommentModerationStore } from '#store.ts';

import { commentsConfigSchema } from '#cli/define-config.ts';
import { createD1HttpBinding } from '#cloudflare/d1-http-binding.ts';
import { openD1LocalBinding } from '#cloudflare/d1-local-binding.ts';
import { createD1CommentStore } from '#cloudflare/d1-store.ts';

export interface CommentStoreConnection {
	dispose: () => Promise<void>;
	store: CommentModerationStore;
}

const configFileName = 'astro-comments.config.ts';

// Paths resolve against the config's directory, wherever the command runs
export async function loadCommentsConfig(directory: string): Promise<CommentsConfig> {
	const configModule: unknown = await import(
		pathToFileURL(path.join(directory, configFileName)).href
	);
	const config = z.object({ default: commentsConfigSchema }).parse(configModule).default;

	return {
		...config,
		d1: {
			...config.d1,
			local: {
				...config.d1.local,
				configPath: path.resolve(directory, config.d1.local.configPath),
			},
		},
		snapshotDirectory: path.resolve(directory, config.snapshotDirectory),
		threadRegistry: path.resolve(directory, config.threadRegistry),
	};
}

export async function openCommentStore(
	config: CommentsConfig,
	target: SnapshotTarget,
): Promise<CommentStoreConnection> {
	if (target === 'local') {
		const connection = await openD1LocalBinding(config.d1.local);

		return { dispose: connection.dispose, store: createD1CommentStore(connection.binding) };
	}

	const binding = createD1HttpBinding(toHttpOptions(config.d1.remote));

	return { dispose: () => Promise.resolve(), store: createD1CommentStore(binding) };
}

function toHttpOptions({
	accountId,
	apiToken,
	databaseId,
}: CommentsConfig['d1']['remote']): D1HttpOptions {
	if (!accountId || !apiToken || !databaseId) {
		throw new Error(`Remote D1 needs an accountId, apiToken and databaseId in ${configFileName}`);
	}

	return { accountId, apiToken, databaseId };
}
