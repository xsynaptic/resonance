#!/usr/bin/env tsx
import { findWorkspaceRoot } from '../shared/utils.js';
import { pullComments } from './pull.js';

await pullComments({
	isLocal: process.argv.includes('--local'),
	rootPath: findWorkspaceRoot(),
});
