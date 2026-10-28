#!/usr/bin/env node
import { backupDatabase, databaseNames } from '#backup/backup.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'backup',
	options: {
		local: {
			default: false,
			description: 'Export the local D1 rather than the remote one',
			type: 'boolean',
		},
	},
	async run({ rootPath, signal, values }) {
		for (const databaseName of databaseNames) {
			signal.throwIfAborted();
			await backupDatabase({ databaseName, isLocal: values.local, rootPath });
		}
	},
	summary: 'Export each D1 database to a dated, gzipped SQL dump under backups/',
	title: 'Backup',
});
