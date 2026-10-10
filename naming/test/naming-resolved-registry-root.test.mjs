import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runNamingValidator } from '../src/naming-validator.host.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT } from '../src/registries/naming-registry-inventory.knowledge.mjs';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { runValidatorRunner } from '../../src/core/validator-runner.logic.mjs';

// Runs with a registry resolution whose Naming root is a modified copy of Builtin, the way an
// active Custom set will resolve once activation is available (#41 slice 3).
const withResolvedNamingRoot = (updateSummaryBuckets, run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-resolved-root-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  const namingRoot = path.join(fixtureRoot, 'naming');

  try {
    fs.mkdirSync(path.join(targetRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(targetRoot, 'package.json'), '{"name":"fixture"}\n');
    fs.writeFileSync(path.join(targetRoot, 'src', 'app.logic.ts'), 'export {};\n');
    fs.cpSync(NAMING_BUILTIN_REGISTRY_ROOT, namingRoot, { recursive: true });
    const summaryBucketsPath = path.join(namingRoot, 'summary-buckets.registry.json');
    const summaryBuckets = JSON.parse(fs.readFileSync(summaryBucketsPath, 'utf8'));
    fs.writeFileSync(summaryBucketsPath, JSON.stringify(updateSummaryBuckets(summaryBuckets), null, 2));

    const builtinResolution = resolveActiveRegistrySet({ targetRoot });
    const registryResolution = {
      ...builtinResolution,
      registryRoots: { ...builtinResolution.registryRoots, naming: namingRoot },
    };

    return run({ targetRoot, registryResolution });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const addClassificationBucket = (summaryBuckets) => ({
  ...summaryBuckets,
  classificationBuckets: [...summaryBuckets.classificationBuckets, 'resolved-only-bucket'],
});

test('Naming summarizes findings with the resolved summary-bucket registry', () => {
  withResolvedNamingRoot(addClassificationBucket, ({ targetRoot, registryResolution }) => {
    const result = runNamingValidator(targetRoot, { scope: 'repo', registryResolution });

    assert.equal(result.summary.counts['resolved-only-bucket'], 0);
  });
});

test('the runner Naming entry uses the resolved summary-bucket registry', () => {
  withResolvedNamingRoot(addClassificationBucket, ({ targetRoot, registryResolution }) => {
    const report = runValidatorRunner(targetRoot, {
      scope: 'repo',
      validators: ['naming'],
      registryResolution,
    });

    assert.equal(report.validators[0].counts['resolved-only-bucket'], 0);
  });
});
