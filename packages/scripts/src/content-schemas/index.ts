#!/usr/bin/env tsx
import chalk from 'chalk';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { findWorkspaceRoot } from '#shared/utils.ts';

// Written by `astro sync`, one JSON schema per collection
const schemaDir = '.astro/collections';

// The content package is edited by hand, so the schemas ride along with it for editor validation
const outputDir = 'packages/content/schemas';

const rootPath = findWorkspaceRoot();
const sourcePath = path.resolve(rootPath, schemaDir);
const targetPath = path.resolve(rootPath, outputDir);

const schemaFiles = readdirSync(sourcePath).filter((file) => file.endsWith('.schema.json'));

if (schemaFiles.length === 0) {
	console.error(chalk.red(`✗ no schemas in ${schemaDir}; run \`astro sync\` first`));
	process.exit(1);
}

mkdirSync(targetPath, { recursive: true });

for (const file of schemaFiles) {
	copyFileSync(path.join(sourcePath, file), path.join(targetPath, file));
}

console.log(chalk.green(`✓ ${schemaFiles.length.toString()} schemas → ${outputDir}`));
