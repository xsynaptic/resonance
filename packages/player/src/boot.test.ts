import { afterEach, describe, expect, test } from 'vitest';

import { holdPresses } from '#boot.ts';
import { heldPressSelector } from '#constants.ts';

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
