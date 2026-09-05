#!/usr/bin/env tsx
import { backupComments } from '#comments/backup.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

await backupComments({
	isLocal: process.argv.includes('--local'),
	rootPath: findWorkspaceRoot(),
});
