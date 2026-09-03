#!/usr/bin/env tsx
import { findWorkspaceRoot } from '../shared/utils.js';
import { backupComments } from './backup.js';

await backupComments({
	isLocal: process.argv.includes('--local'),
	rootPath: findWorkspaceRoot(),
});
