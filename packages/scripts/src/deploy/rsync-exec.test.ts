import { describe, expect, test } from 'vitest';

import { buildRsyncArgs } from '#deploy/rsync-exec.ts';

function makeConfig(sshKeyPath?: string) {
	return {
		remoteHost: 'deploy@host',
		...(sshKeyPath === undefined ? {} : { sshKeyPath }),
	};
}

describe('buildRsyncArgs', () => {
	test('places the ssh key flag directly after progress', () => {
		expect(buildRsyncArgs('dist/', 'host:/path', { config: makeConfig('/k') })).toEqual([
			'-avz',
			'--progress',
			'-e',
			'ssh -i /k',
			'dist/',
			'host:/path',
		]);
	});

	test('drops verbosity and progress when quiet, keeping compression', () => {
		expect(
			buildRsyncArgs('host:/path/', 'backups/', { config: makeConfig(), quiet: true }),
		).toEqual(['-az', 'host:/path/', 'backups/']);
	});

	test('keeps a destructive flag ahead of dry-run, and dry-run ahead of the source', () => {
		const args = buildRsyncArgs('dist/', 'host:/path', {
			config: makeConfig(),
			dryRun: true,
			extraFlags: ['--delete-after'],
		});

		expect(args).toEqual([
			'-avz',
			'--progress',
			'--delete-after',
			'--dry-run',
			'dist/',
			'host:/path',
		]);
	});
});
