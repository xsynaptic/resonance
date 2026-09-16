import { describe, expect, test, vi } from 'vitest';

import { supersede } from '#lib/supersede.ts';

describe('supersede', () => {
	test('starting the next lifetime ends the one before it', () => {
		const owner = new AbortController();
		const lifetimes = supersede(owner.signal);

		const first = lifetimes.next();
		const second = lifetimes.next();

		expect(first.aborted).toBe(true);
		expect(second.aborted).toBe(false);
	});

	test('cancel ends the current lifetime and starts nothing', () => {
		const owner = new AbortController();
		const lifetimes = supersede(owner.signal);
		const held = lifetimes.next();
		const onAbort = vi.fn();

		held.addEventListener('abort', onAbort);
		lifetimes.cancel();
		lifetimes.cancel();

		expect(held.aborted).toBe(true);
		expect(onAbort).toHaveBeenCalledOnce();
	});

	test('the owner aborting ends the lifetime it holds', () => {
		const owner = new AbortController();
		const lifetimes = supersede(owner.signal);
		const held = lifetimes.next();

		owner.abort();

		expect(held.aborted).toBe(true);
	});
});
