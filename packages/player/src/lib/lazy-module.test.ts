import { afterEach, describe, expect, test, vi } from 'vitest';

import { lazyModule, LazyModuleError } from '#lib/lazy-module.ts';

describe('lazyModule', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('asks again after a rejected import, and once for every caller while it is pending', async () => {
		const importModule = vi
			.fn<() => Promise<{ isReady: boolean }>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ isReady: true });
		const module = lazyModule('tray', importModule);

		await expect(module.load()).rejects.toBeInstanceOf(LazyModuleError);

		const first = module.load();

		expect(module.load()).toBe(first);
		await expect(first).resolves.toStrictEqual({ isReady: true });
		expect(importModule).toHaveBeenCalledTimes(2);
	});

	test('asks for nothing while offline, then asks once the network returns', async () => {
		const importModule = vi
			.fn<() => Promise<{ isReady: boolean }>>()
			.mockResolvedValue({ isReady: true });
		const module = lazyModule('tray', importModule);
		const isOnline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

		await expect(module.load()).rejects.toThrow(/offline/i);
		module.preload();
		expect(importModule).not.toHaveBeenCalled();

		isOnline.mockReturnValue(true);

		await expect(module.load()).resolves.toStrictEqual({ isReady: true });
		expect(importModule).toHaveBeenCalledTimes(1);
	});

	test('opens a module that arrived before the network dropped', async () => {
		const importModule = vi
			.fn<() => Promise<{ isReady: boolean }>>()
			.mockResolvedValue({ isReady: true });
		const module = lazyModule('tray', importModule);

		await expect(module.load()).resolves.toStrictEqual({ isReady: true });

		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

		await expect(module.load()).resolves.toStrictEqual({ isReady: true });
		expect(importModule).toHaveBeenCalledTimes(1);
	});
});
