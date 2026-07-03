#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNamingHealthCheck } from '../naming/src/health/naming-health-check.logic.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  runNamingHealthCheck(packageRoot);
  console.log('Validator package health check passed');
  console.log('OK: naming validator deterministic for repo|app|docs|validator|system');
  console.log('OK: docs match app scope roots');
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Validator health check failed: ${message}`);
  process.exit(1);
}
