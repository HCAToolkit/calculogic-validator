#!/usr/bin/env node

import { resolveRepositoryRoot } from '../src/core/repository-root.logic.mjs';
import { runRegistryLifecycleCli } from '../src/core/registry-lifecycle/registry-lifecycle-cli.logic.mjs';

const { exitCode } = runRegistryLifecycleCli({
  argv: process.argv.slice(2),
  targetRoot: resolveRepositoryRoot(),
});
process.exitCode = exitCode;
