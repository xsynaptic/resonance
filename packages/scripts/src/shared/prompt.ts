import { once } from 'node:events';

// Raw mode swallows SIGINT, so ctrl-c arrives as a keystroke
const interrupt = '\u{3}';

// Resolves undefined on ctrl-c, which every caller reads as quit
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
