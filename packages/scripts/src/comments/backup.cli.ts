#!/usr/bin/env tsx
import { backupDatabase } from '#comments/backup.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

await backupDatabase({
	databaseName: 'resonance-comments',
	isLocal: process.argv.includes('--local'),
	rootPath: findWorkspaceRoot(),
});
