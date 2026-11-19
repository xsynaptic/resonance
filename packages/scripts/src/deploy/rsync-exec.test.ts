import { describe, expect, test } from 'vitest';

import { buildRsyncArgs, describeRsyncSummary, parseRsyncChange } from '#deploy/rsync-exec.ts';

function makeConfig(sshKeyPath?: string) {
	return {
		remoteHost: 'deploy@host',
		...(sshKeyPath === undefined ? {} : { sshKeyPath }),
	};
}

const sshCommand: unknown = expect.stringMatching(/^ssh .*-o ControlMaster=auto /);

function getSshCommand(args: Array<string>) {
	return args[args.indexOf('-e') + 1];
}

describe('buildRsyncArgs', () => {
	test('itemizes an archive with stats over the shared ssh connection', () => {
		expect(buildRsyncArgs('dist/', 'host:/path', { config: makeConfig() })).toEqual([
			'-ai',
			'--stats',
			'-e',
			sshCommand,
			'dist/',
			'host:/path',
		]);
	});

	test('passes the ssh key through the one ssh command', () => {
		const args = buildRsyncArgs('dist/', 'host:/path', { config: makeConfig('/k') });

		expect(args.filter((arg) => arg === '-e')).toHaveLength(1);
		expect(getSshCommand(args)).toMatch(/ -i \/k$/);
	});

	test('treats an empty ssh key path as absent', () => {
		const args = buildRsyncArgs('dist/', 'host:/path', { config: makeConfig('') });

		expect(getSshCommand(args)).not.toContain('-i');
	});

	// rsync reads every option before it acts, so only the excludes' own order and the paths' place matter
	test('emits excludes in order, with every flag ahead of the paths', () => {
		const args = buildRsyncArgs('dist/', 'host:/path', {
			config: makeConfig(),
			excludes: ['.DS_Store', '*.tmp'],
			extraFlags: ['--partial'],
		});

		expect(args.filter((arg) => arg.startsWith('--exclude='))).toStrictEqual([
			'--exclude=.DS_Store',
			'--exclude=*.tmp',
		]);
		expect(args).toContain('--partial');
		expect(args.slice(-2)).toStrictEqual(['dist/', 'host:/path']);
	});

	test('rehearses the same transfer with dry-run added ahead of the paths', () => {
		const options = { config: makeConfig(), extraFlags: ['--delete'] };
		const live = buildRsyncArgs('dist/', 'host:/path', options);
		const rehearsal = buildRsyncArgs('dist/', 'host:/path', { ...options, dryRun: true });

		expect(live).not.toContain('--dry-run');
		expect(rehearsal).toContain('--dry-run');
		expect(rehearsal.filter((arg) => arg !== '--dry-run')).toStrictEqual(live);
		expect(rehearsal.slice(-2)).toStrictEqual(['dist/', 'host:/path']);
	});
});

describe('parseRsyncChange', () => {
	test('tells new files from updated ones, in either direction', () => {
		expect(parseRsyncChange('<f+++++++++ mixes/a.flac')).toEqual({
			kind: 'new',
			path: 'mixes/a.flac',
		});
		expect(parseRsyncChange('>f.st...... downloads.json')).toEqual({
			kind: 'updated',
			path: 'downloads.json',
		});
	});

	test('counts deleted files but not deleted directories', () => {
		expect(parseRsyncChange('*deleting   old/z.webm')).toEqual({
			kind: 'removed',
			path: 'old/z.webm',
		});
		expect(parseRsyncChange('*deleting   old/')).toBeUndefined();
	});

	test('ignores directory, attribute-only and stats lines', () => {
		expect(parseRsyncChange('cd+++++++++ a/')).toBeUndefined();
		expect(parseRsyncChange('.d..t...... ./')).toBeUndefined();
		expect(parseRsyncChange('.f...p..... a/x.mp4')).toBeUndefined();
		expect(parseRsyncChange('Total bytes sent: 7,116,637')).toBeUndefined();
	});

	test('keeps spaces inside a path', () => {
		expect(parseRsyncChange('<f.st...... mixes/a b.mp3')?.path).toBe('mixes/a b.mp3');
	});
});

describe('describeRsyncSummary', () => {
	test('reports nothing to do as no changes', () => {
		expect(describeRsyncSummary({ bytesSent: 121, changes: [] })).toBe('no changes');
	});

	test('orders counts new, updated, removed and skips empty kinds', () => {
		expect(
			describeRsyncSummary({
				bytesSent: 7_116_637,
				changes: [
					{ kind: 'removed', path: 'a' },
					{ kind: 'new', path: 'b' },
					{ kind: 'removed', path: 'c' },
				],
			}),
		).toBe('1 new, 2 removed · 7.1 MB sent');
	});
});
