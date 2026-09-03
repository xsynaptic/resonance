#!/usr/bin/env tsx
import { findWorkspaceRoot } from '../shared/utils.js';
import { rebuildProjection } from './projection.js';

await rebuildProjection({
	isLocal: process.argv.includes('--local'),
	rootPath: findWorkspaceRoot(),
});
