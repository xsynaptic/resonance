#!/usr/bin/env tsx
import { findWorkspaceRoot } from '#shared/utils.ts';
import { pullListens } from '#stats/listens-pull.ts';

await pullListens({ rootPath: findWorkspaceRoot() });
