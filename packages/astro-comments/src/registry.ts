import { z } from 'zod';

export const threadRegistrySchema = z.record(z.string(), z.string());

export type ThreadRegistry = z.infer<typeof threadRegistrySchema>;

export type ThreadResolver = (thread: string) => Promise<string | undefined>;

// A failed load is dropped so the next call retries
export function createThreadResolver(loadRegistry: () => Promise<unknown>): ThreadResolver {
	let registry: Promise<Map<string, string>> | undefined;

	async function load(): Promise<Map<string, string>> {
		return new Map(Object.entries(threadRegistrySchema.parse(await loadRegistry())));
	}

	return async (thread) => {
		registry = registry ?? load();

		try {
			const threads = await registry;

			return threads.get(thread);
		} catch (error) {
			registry = undefined;
			throw error;
		}
	};
}
