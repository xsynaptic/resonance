import { describe, expect, test } from 'vitest';

import { jsonForScript } from '#lib/utils/json-script.ts';

describe('jsonForScript', () => {
	test('leaves no `<` for the HTML parser to end the script on', () => {
		const payload = [{ title: '</script><img onerror=alert(1) src=x>' }];

		expect(jsonForScript(payload)).not.toContain('<');
	});

	test('escapes without changing what JSON.parse reads back', () => {
		const payload = [{ streamUrl: 'https://x/a<b>c', title: '</script>' }];

		expect(JSON.parse(jsonForScript(payload))).toEqual(payload);
	});
});
