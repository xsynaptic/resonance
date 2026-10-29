#!/usr/bin/env -S node --import tsx
import { generateOpenGraphImages } from '#og-image/index.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'og-image',
	options: {
		'clear-cache': {
			default: false,
			description: 'Delete the rendered card cache and draw nothing',
			type: 'boolean',
		},
	},
	async run({ rootPath, signal, values }) {
		await generateOpenGraphImages({ clearCache: values['clear-cache'], rootPath, signal });
	},
	summary: 'Draw an Open Graph card for every page the build asks for, then publish them into dist',
	title: 'Open Graph images',
});
