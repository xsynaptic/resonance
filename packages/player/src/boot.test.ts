import { afterEach, describe, expect, test } from 'vitest';

import { holdPresses, isPlayerActionable } from '#boot.ts';
import { heldPressSelector, queueStorageKey } from '#constants.ts';
import { createMemoryStorage } from '#lib/storage.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('holdPresses', () => {
	test('marks only the latest press, and none once released', async () => {
		document.body.innerHTML =
			'<button data-play-track="a"></button><button data-queue-track="b"></button><button data-queue-track="c"></button>';

		const [first, second, third] = document.querySelectorAll('button');
		const held = holdPresses(document);

		first?.click();
		await held.pressed;
		second?.click();

		expect([...document.querySelectorAll(heldPressSelector)]).toStrictEqual([second]);

		held.release();
		third?.click();

		expect([...document.querySelectorAll(heldPressSelector)]).toStrictEqual([second]);
	});
});

describe('isPlayerActionable', () => {
	test('a page with no player is actionable only while a queue is stored', () => {
		const storage = createMemoryStorage();

		expect(isPlayerActionable(document, storage)).toBe(false);

		storage.setItem(queueStorageKey, '{}');

		expect(isPlayerActionable(document, storage)).toBe(true);
	});
});
