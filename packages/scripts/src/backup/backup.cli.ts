#!/usr/bin/env tsx
import { backupDatabase, databaseNames } from '#backup/backup.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const isLocal = process.argv.includes('--local');
const rootPath = findWorkspaceRoot();

for (const databaseName of databaseNames) {
	await backupDatabase({ databaseName, isLocal, rootPath });
}
