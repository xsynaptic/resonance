#!/usr/bin/env node
import { writeDiscogsTracklists } from '#discogs/discogs-tracklists.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'discogs-tracklists',
	options: {
		'dry-run': {
			default: false,
			description: 'Fetch and report, but write no files',
			type: 'boolean',
		},
	},
	async run({ rootPath, values }) {
		await writeDiscogsTracklists(rootPath, values['dry-run']);
	},
	summary: 'Fill the tracks of every Review that names a discogsReleaseId and has none yet',
	title: 'Discogs tracklists',
});
