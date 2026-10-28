#!/usr/bin/env node
import { log, UserError } from '@xsynaptic/astro-scripts';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { runCommand } from '#shared/command.ts';

// Written by `astro sync`, one JSON schema per collection
const schemaDir = '.astro/collections';

// The content package is edited by hand, so the schemas ride along with it for editor validation
const outputDir = 'packages/content/schemas';

await runCommand({
	name: 'content-schemas',
	run({ rootPath }) {
		const sourcePath = path.resolve(rootPath, schemaDir);
		const targetPath = path.resolve(rootPath, outputDir);

		const schemaFiles = readdirSync(sourcePath).filter((file) => file.endsWith('.schema.json'));

		if (schemaFiles.length === 0) {
			throw new UserError(`No schemas in ${schemaDir}; run \`astro sync\` first`);
		}

		mkdirSync(targetPath, { recursive: true });

		for (const file of schemaFiles) {
			copyFileSync(path.join(sourcePath, file), path.join(targetPath, file));
		}

		log.success(`${schemaFiles.length.toString()} schemas → ${outputDir}`);
	},
	summary: 'Copy the JSON schemas `astro sync` writes into the content repository',
	title: 'Content schemas',
});
