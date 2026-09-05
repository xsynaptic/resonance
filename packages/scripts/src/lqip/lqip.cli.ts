#!/usr/bin/env tsx
import { generateLqip } from '#lqip/lqip.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

await generateLqip(findWorkspaceRoot());
