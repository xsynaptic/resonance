#!/usr/bin/env tsx
import { findWorkspaceRoot } from '../shared/utils.js';
import { importLegacyComments } from './import-legacy.js';

await importLegacyComments({ rootPath: findWorkspaceRoot() });
