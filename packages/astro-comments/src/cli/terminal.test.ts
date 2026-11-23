import { expect, test } from 'vitest';

import { toPrintable } from '#cli/terminal.ts';

test('strips escape sequences, other control characters and bidi overrides, keeping line breaks', () => {
	expect(toPrintable('Nice\u{1B}[2J\u{1B}]52;c;aGk=\u{7} mix‮\nsecond\0 line')).toBe(
		'Nice[2J]52;c;aGk= mix\nsecond line',
	);
});
