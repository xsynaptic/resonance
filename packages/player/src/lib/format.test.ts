import { describe, expect, test } from 'vitest';

import { formatTemplate } from '#lib/format.ts';

describe('formatTemplate', () => {
	test('empties a placeholder with no value', () => {
		expect(formatTemplate('{missing}!', {})).toBe('!');
	});
});
