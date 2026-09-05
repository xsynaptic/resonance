#!/usr/bin/env tsx
import { pullComments } from '#comments/pull.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

await pullComments({
	isLocal: process.argv.includes('--local'),
	rootPath: findWorkspaceRoot(),
});
