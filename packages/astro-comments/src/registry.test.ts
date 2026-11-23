import { describe, expect, test, vi } from 'vitest';

import { createThreadResolver } from '#registry.ts';

describe('the thread resolver', () => {
	test('loads the registry once and answers each key, former keys included', async () => {
		const load = vi.fn(() =>
			Promise.resolve({ 'mixes/old-slug': '/mixes/voyager/', 'mixes/voyager': '/mixes/voyager/' }),
		);
		const resolve = createThreadResolver(load);

		await expect(resolve('mixes/voyager')).resolves.toBe('/mixes/voyager/');
		await expect(resolve('mixes/old-slug')).resolves.toBe('/mixes/voyager/');
		await expect(resolve('pages/about')).resolves.toBeUndefined();
		expect(load).toHaveBeenCalledOnce();
	});

	test("answers nothing for a key that names an object's own property", async () => {
		const resolve = createThreadResolver(() => Promise.resolve({}));

		await expect(resolve('constructor')).resolves.toBeUndefined();
	});

	test('tries the load again after a failure', async () => {
		const load = vi
			.fn<() => Promise<unknown>>()
			.mockRejectedValueOnce(new Error('unreachable'))
			.mockResolvedValue({ 'mixes/voyager': '/mixes/voyager/' });
		const resolve = createThreadResolver(load);

		await expect(resolve('mixes/voyager')).rejects.toThrow('unreachable');
		await expect(resolve('mixes/voyager')).resolves.toBe('/mixes/voyager/');
	});
});
