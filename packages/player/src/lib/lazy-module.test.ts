import { describe, expect, test, vi } from 'vitest';

import { lazyModule } from '#lib/lazy-module.ts';

describe('lazyModule', () => {
	test('asks again after a rejected import, and once for every caller while it is pending', async () => {
		const importModule = vi
			.fn<() => Promise<{ isReady: boolean }>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ isReady: true });
		const module = lazyModule(importModule);

		await expect(module.load()).rejects.toThrow('offline');

		const first = module.load();

		expect(module.load()).toBe(first);
		await expect(first).resolves.toStrictEqual({ isReady: true });
		expect(importModule).toHaveBeenCalledTimes(2);
	});
});
