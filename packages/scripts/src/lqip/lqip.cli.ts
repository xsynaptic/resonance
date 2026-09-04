#!/usr/bin/env tsx
import { findWorkspaceRoot } from '../shared/utils.js';
import { generateLqip } from './lqip.js';

await generateLqip(findWorkspaceRoot());
