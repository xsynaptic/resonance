#!/usr/bin/env tsx
import { findWorkspaceRoot } from '../shared/utils.js';
import { validateAudio } from './validate.js';

await validateAudio({ rootPath: findWorkspaceRoot() });
