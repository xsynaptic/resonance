import { once } from 'node:events';

const interrupt = '\u{3}';

// Raw mode swallows ctrl-c, so it resolves `undefined` instead of killing the process
export async function readKey(keys: ReadonlyArray<string>): Promise<string | undefined> {
	const { stdin } = process;

	if (!stdin.isTTY) throw new Error('This prompt needs an interactive terminal');

	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding('utf8');

	try {
		for (;;) {
			const [key] = (await once(stdin, 'data')) as [string];

			if (key === interrupt) return undefined;
			if (keys.includes(key)) return key;
		}
	} finally {
		stdin.setRawMode(false);
		stdin.pause();
	}
}
