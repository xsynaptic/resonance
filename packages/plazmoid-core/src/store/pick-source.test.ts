import { describe, expect, test } from 'vitest';

import { pickSource } from '#store/pick-source.ts';

const opus = { type: 'audio/mp4; codecs="Opus"', url: 'https://api.test/a.opus.mp4' };
const aac = { type: 'audio/mp4; codecs="mp4a.40.2"', url: 'https://api.test/a.aac.mp4' };

function accepts(...types: ReadonlyArray<string>) {
	return (type: string) => types.includes(type);
}

describe('pickSource', () => {
	test('takes the first accepted source over an earlier refused one', () => {
		expect(pickSource([opus, aac], accepts(aac.type))).toStrictEqual({
			isTypeDeclined: false,
			source: aac,
		});
	});

	test('takes a source with no type without probing it', () => {
		const untyped = { url: 'https://api.test/a' };
		const probed: Array<string> = [];

		expect(
			pickSource([untyped, opus], (type) => {
				probed.push(type);
				return true;
			}),
		).toStrictEqual({ isTypeDeclined: false, source: untyped });
		expect(probed).toStrictEqual([]);
	});

	test('takes the first source, marked declined, when the probe refuses them all', () => {
		expect(pickSource([opus, aac], accepts())).toStrictEqual({
			isTypeDeclined: true,
			source: opus,
		});
	});

	test('yields nothing for an empty list', () => {
		expect(pickSource([], accepts(opus.type))).toBeUndefined();
	});
});
