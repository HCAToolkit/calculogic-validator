import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NAMING_HEALTH_DOC_PATHS,
  NAMING_HEALTH_DOC_PHRASE,
  assertNamingHealthDocs,
  getNamingHealthDocPaths,
  getNamingHealthRequiredDocMentions,
  runNamingHealthCheck,
} from '../naming/src/health/naming-health-check.logic.mjs';
import {
  formatNamingHealthResult,
  resolveNamingHealthPackageRoot,
} from '../naming/src/health/naming-health-check.host.mjs';
import { resolveValidatorDevelopmentContext } from '../src/core/validator-development-context.logic.mjs';
import { getValidatorScopeProfile } from '../src/core/validator-scopes.logic.mjs';

const testFilePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(testFilePath), '..');

const VALID_DOC = `# Health doc\n\nThe app scope covers src/ and test/. The validator scope is the ${NAMING_HEALTH_DOC_PHRASE}.\n`;

const withFixtureRoot = async (prefix, callback) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fs.writeFile(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify({ name: prefix.replace(/-$/u, ''), version: '1.0.0' }, null, 2),
      'utf8',
    );
    return await callback(fixtureRoot);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
};

const writeHealthDocs = async (baseRoot, contentByDocPath = {}) => {
  for (const docPath of NAMING_HEALTH_DOC_PATHS) {
    const content = Object.hasOwn(contentByDocPath, docPath) ? contentByDocPath[docPath] : VALID_DOC;
    if (content === null) {
      continue;
    }
    const absoluteDocPath = path.join(baseRoot, docPath);
    await fs.mkdir(path.dirname(absoluteDocPath), { recursive: true });
    await fs.writeFile(absoluteDocPath, content, 'utf8');
  }
};

const standaloneContext = (fixtureRoot) =>
  resolveValidatorDevelopmentContext({ targetRepositoryRoot: fixtureRoot, packageRoot: fixtureRoot });

const embeddedContext = (fixtureRoot) =>
  resolveValidatorDevelopmentContext({
    targetRepositoryRoot: fixtureRoot,
    packageRoot: path.join(fixtureRoot, 'calculogic-validator'),
  });

test('standalone development health checks all five scopes and the Validator-owned docs', () => {
  assert.equal(resolveNamingHealthPackageRoot(), repositoryRoot);

  const result = spawnSync('npm', ['run', '-s', 'health:validator'], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(
    result.stdout,
    [
      'OK: naming validator deterministic for repo|app|docs|validator|system',
      `OK: docs sanity check passed (${NAMING_HEALTH_DOC_PATHS.join(', ')})`,
      '',
    ].join('\n'),
  );
});

test('required doc mentions are derived from the app scope registry roots plus the development-root phrase', () => {
  const appIncludeRoots = getValidatorScopeProfile('app').includeRoots;

  assert.deepEqual(getNamingHealthRequiredDocMentions(), [
    ...appIncludeRoots.map((includeRoot) => `${includeRoot}/`),
    NAMING_HEALTH_DOC_PHRASE,
  ]);
  assert.deepEqual(getNamingHealthRequiredDocMentions(), ['src/', 'test/', 'validator development root']);
});

test('development health fails when a required doc is missing, naming the path', async () => {
  await withFixtureRoot('naming-health-dev-missing-', async (fixtureRoot) => {
    await writeHealthDocs(fixtureRoot, { 'doc/ConventionRoutines/NamingValidatorSpec.md': null });

    assert.throws(
      () => runNamingHealthCheck(fixtureRoot, { packageRoot: fixtureRoot }),
      /Missing required health doc: doc\/ConventionRoutines\/NamingValidatorSpec\.md/u,
    );
  });
});

test('development health fails when a doc lacks an app scope root or the development-root phrase', async () => {
  const cfgDocPath = 'doc/ValidatorSpecs/nl-config/cfg-namingValidator.md';

  await withFixtureRoot('naming-health-dev-drift-', async (fixtureRoot) => {
    await writeHealthDocs(fixtureRoot, { [cfgDocPath]: VALID_DOC.replace('src/', 'source') });
    assert.throws(
      () => assertNamingHealthDocs(standaloneContext(fixtureRoot)),
      /Docs drift detected in doc\/ValidatorSpecs\/nl-config\/cfg-namingValidator\.md: missing "src\/" mention/u,
    );

    await writeHealthDocs(fixtureRoot, { [cfgDocPath]: VALID_DOC.replace(NAMING_HEALTH_DOC_PHRASE, 'development folder') });
    assert.throws(
      () => assertNamingHealthDocs(standaloneContext(fixtureRoot)),
      /missing "validator development root" mention/u,
    );
  });
});

test('development health passes and reports every scope it checked when both docs are valid', async () => {
  await withFixtureRoot('naming-health-dev-valid-', async (fixtureRoot) => {
    await writeHealthDocs(fixtureRoot);

    const healthResult = runNamingHealthCheck(fixtureRoot, { packageRoot: fixtureRoot });
    assert.equal(healthResult.contextKind, 'standalone-development');
    assert.deepEqual(healthResult.checkedScopes, ['repo', 'app', 'docs', 'validator', 'system']);
    assert.deepEqual(healthResult.unavailableScopes, []);
    assert.deepEqual(healthResult.docs, { status: 'checked', paths: NAMING_HEALTH_DOC_PATHS });
  });
});

test('limit: the docs check is a bounded sanity check and accepts outdated content that keeps the required mentions', async () => {
  // Documents the check's limits: both docs below misdescribe the implementation
  // (a nonexistent script and an embedded-only validator scope), yet they pass because
  // the check only proves the app scope roots and development-root concept are named.
  const outdatedDoc = [
    '# Outdated health doc',
    '',
    'The app scope covers src/ and test/. The validator development root is always `calculogic-validator/`,',
    'and presets run through `npm run validate:naming:validator:*`, which this repository does not define.',
    '',
  ].join('\n');

  await withFixtureRoot('naming-health-dev-outdated-', async (fixtureRoot) => {
    await writeHealthDocs(fixtureRoot, {
      'doc/ConventionRoutines/NamingValidatorSpec.md': outdatedDoc,
      'doc/ValidatorSpecs/nl-config/cfg-namingValidator.md': outdatedDoc,
    });

    assert.doesNotThrow(() => assertNamingHealthDocs(standaloneContext(fixtureRoot)));
  });
});

test('standalone development reads docs only from its own root, never from an embedded-layout location', async () => {
  await withFixtureRoot('naming-health-standalone-root-', async (fixtureRoot) => {
    // Valid docs exist only where an embedded tree would keep them.
    await writeHealthDocs(path.join(fixtureRoot, 'calculogic-validator'));

    const context = standaloneContext(fixtureRoot);
    assert.equal(context.kind, 'standalone-development');
    assert.deepEqual(
      getNamingHealthDocPaths(context),
      NAMING_HEALTH_DOC_PATHS.map((docPath) => path.join(context.validatorDevelopmentRoot, docPath)),
    );
    assert.throws(() => assertNamingHealthDocs(context), /Missing required health doc: doc\/ConventionRoutines\/NamingValidatorSpec\.md/u);
  });
});

test('embedded development reads docs only from the embedded root, never from the consumer repository', async () => {
  await withFixtureRoot('naming-health-embedded-root-', async (fixtureRoot) => {
    const embeddedRoot = path.join(fixtureRoot, 'calculogic-validator');
    await fs.mkdir(embeddedRoot, { recursive: true });

    // Valid docs exist only at the consumer repository root, including the pre-extraction
    // consumer note location.
    await writeHealthDocs(fixtureRoot);
    await fs.mkdir(path.join(fixtureRoot, 'doc', 'nl-config'), { recursive: true });
    await fs.writeFile(path.join(fixtureRoot, 'doc', 'nl-config', 'cfg-namingValidator.md'), VALID_DOC, 'utf8');

    const context = embeddedContext(fixtureRoot);
    assert.equal(context.kind, 'embedded-development');
    for (const docPath of getNamingHealthDocPaths(context)) {
      assert.equal(docPath.startsWith(`${context.validatorDevelopmentRoot}${path.sep}`), true, docPath);
    }
    assert.throws(() => assertNamingHealthDocs(context), /Missing required health doc: doc\/ConventionRoutines\/NamingValidatorSpec\.md/u);

    await writeHealthDocs(embeddedRoot);
    assert.doesNotThrow(() => assertNamingHealthDocs(context));
  });
});

test('installed consumer health reads no docs and reports the validator scope as not checked', async () => {
  await withFixtureRoot('naming-health-installed-', async (fixtureRoot) => {
    // Legacy consumer documents with the old required mentions are present but must be ignored.
    await fs.mkdir(path.join(fixtureRoot, 'calculogic-validator', 'doc', 'ConventionRoutines'), { recursive: true });
    await fs.writeFile(
      path.join(fixtureRoot, 'calculogic-validator', 'doc', 'ConventionRoutines', 'NamingValidatorSpec.md'),
      'src/ test/ calculogic-validator/\n',
      'utf8',
    );

    const packageRoot = path.join(fixtureRoot, 'node_modules', '@calculogic', 'validator');
    const context = resolveValidatorDevelopmentContext({ targetRepositoryRoot: fixtureRoot, packageRoot });
    assert.equal(context.kind, 'installed-consumer');
    assert.deepEqual(getNamingHealthDocPaths(context), []);

    const healthResult = runNamingHealthCheck(fixtureRoot, { packageRoot });
    assert.deepEqual(healthResult, {
      contextKind: 'installed-consumer',
      checkedScopes: ['repo', 'app', 'docs', 'system'],
      unavailableScopes: [{ scope: 'validator', reason: 'validator-development-root-unavailable' }],
      docs: { status: 'not-applicable', paths: [] },
    });
    assert.deepEqual(formatNamingHealthResult(healthResult), [
      'OK: naming validator deterministic for repo|app|docs|system',
      'SKIP: scope validator not checked (validator-development-root-unavailable)',
      'OK: docs sanity check not applicable (installed-consumer: no validator development root)',
    ]);
  });
});

test('a scope whose check fails aborts health and is never reported as checked', async () => {
  await withFixtureRoot('naming-health-scope-failure-', async (fixtureRoot) => {
    await writeHealthDocs(fixtureRoot);
    const attemptedScopes = [];
    const assertScope = (_root, scope) => {
      attemptedScopes.push(scope);
      if (scope === 'docs') {
        throw new Error(`Non-deterministic summary.counts for scope=${scope}`);
      }
    };

    assert.throws(
      () => runNamingHealthCheck(fixtureRoot, { packageRoot: fixtureRoot, assertScope }),
      /Non-deterministic summary\.counts for scope=docs/u,
    );
    // Scopes after the failure are not attempted, and no result (so no success line) exists.
    assert.deepEqual(attemptedScopes, ['repo', 'app', 'docs']);
  });
});
