#!/usr/bin/env tsx
import { validateAudio } from '#audio/validate.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

await validateAudio({ rootPath: findWorkspaceRoot() });
