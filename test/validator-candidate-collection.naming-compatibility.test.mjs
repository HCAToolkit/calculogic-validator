import test from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  collectRepositoryPaths as collectNamingRepositoryPaths,
  prepareNamingRuntimeInputs,
  prepareNamingValidatorInputs,
  runNamingValidator,
  summarizeFindings,
} from '../naming/src/naming-validator.wiring.mjs';
import { runNamingValidator as runNamingValidatorRuntime } from '../naming/src/naming-validator.logic.mjs';
import { runNamingValidator as runNamingValidatorHost, prepareNamingTreeStagingInputs } from '../naming/src/naming-validator.host.mjs';
import { prepareTreeStructureAdvisorInputs } from '../tree/src/tree-structure-advisor.wiring.mjs';
import { createValidatorCandidatePolicyFromValues } from '../src/core/validator-candidate-policy.logic.mjs';
import { collectValidatorCandidatePaths } from '../src/core/validator-candidate-collection.logic.mjs';
import { collectSuiteScopedSnapshotInputs, toReportedScopeExclusions } from '../src/core/suite-scoped-snapshot-input.logic.mjs';
import { resolveActiveRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT } from '../naming/src/registries/naming-registry-inventory.knowledge.mjs';
import {
  DEFAULT_VALIDATOR_SCOPE,
  getValidatorScopeProfile,
} from '../src/core/validator-scopes.logic.mjs';
import {
  filterScopedPathsByProfile,
  filterScopedPathsByTargets,
  normalizePath,
  resolveScopedTargets,
} from '../src/core/scoped-target-paths.logic.mjs';

const writeFixtureFile = async (fixtureDir, relativePath, content = 'fixture\n') => {
  const absolutePath = path.join(fixtureDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
};

const sortPaths = (paths) => Array.from(paths).sort((left, right) => left.localeCompare(right));

const isLegacyNamingReportablePath = (relativePath, reportableExtensions, reportableRootFiles) =>
  reportableExtensions.has(path.extname(relativePath)) ||
  reportableRootFiles.has(path.basename(relativePath));

// The pre-extraction Naming walk, kept as a reference for Naming's candidate collection. Its
// equivalence holds for symlink-free trees only: symlink membership is now the suite contract's
// (declared roots #53 and #57, nested entries #56), which this walk predates (it neither enters a
// symlinked scope root nor excludes a nested link).
const collectLegacyNamingWalkPaths = (repositoryRoot, options = {}) => {
  const absoluteRoot = path.resolve(repositoryRoot);
  if (!fsSync.existsSync(absoluteRoot) || !fsSync.statSync(absoluteRoot).isDirectory()) {
    return [];
  }

  const collected = [];
  const walk = (absoluteDirectoryPath) => {
    for (const entry of fsSync.readdirSync(absoluteDirectoryPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (options.walkExclusions.excludedDirectories.has(entry.name)) {
          continue;
        }

        if (entry.name.startsWith('.') && options.walkExclusions.skipDotDirectories) {
          continue;
        }

        walk(path.join(absoluteDirectoryPath, entry.name));
        continue;
      }

      const relativePath = normalizePath(
        path.relative(repositoryRoot, path.join(absoluteDirectoryPath, entry.name)),
      );
      if (
        isLegacyNamingReportablePath(
          relativePath,
          options.reportableExtensions,
          options.reportableRootFiles,
        )
      ) {
        collected.push(relativePath);
      }
    }
  };

  walk(absoluteRoot);
  return collected;
};

const collectLegacyNamingRepositoryPaths = (repositoryRoot, options = {}) => {
  const selectedScope = options.scope ?? DEFAULT_VALIDATOR_SCOPE;
  const profile = getValidatorScopeProfile(selectedScope);
  if (!profile) {
    throw new Error(`Invalid scope profile: ${selectedScope}`);
  }

  const allReportablePaths = collectLegacyNamingWalkPaths(repositoryRoot, options);
  if (selectedScope === 'repo') {
    return sortPaths(new Set(allReportablePaths));
  }

  return filterScopedPathsByProfile(allReportablePaths, profile);
};

const filterLegacyNamingPathsByTargets = (repositoryRoot, relativePaths, targets = []) => {
  const resolvedTargets = resolveScopedTargets(repositoryRoot, targets);
  return filterScopedPathsByTargets(repositoryRoot, relativePaths, resolvedTargets);
};

const createCandidateFixture = async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-candidates-'));

  await Promise.all([
    writeFixtureFile(fixtureDir, 'package.json', '{}\n'),
    writeFixtureFile(fixtureDir, 'package-lock.json', '{}\n'),
    writeFixtureFile(fixtureDir, 'README.md', '# repo\n'),
    writeFixtureFile(fixtureDir, 'src/app.logic.ts'),
    writeFixtureFile(fixtureDir, 'src/App.tsx'),
    writeFixtureFile(fixtureDir, 'src/style.css'),
    writeFixtureFile(fixtureDir, 'src/data.json', '{}\n'),
    writeFixtureFile(fixtureDir, 'test/app.test.js'),
    writeFixtureFile(fixtureDir, 'doc/guide.md', '# guide\n'),
    writeFixtureFile(fixtureDir, 'calculogic-validator/src/core/example.logic.mjs'),
    writeFixtureFile(fixtureDir, 'calculogic-validator/src/core/example.logic.js'),
    writeFixtureFile(fixtureDir, 'calculogic-validator/test/example.test.mjs'),
    writeFixtureFile(fixtureDir, 'node_modules/pkg/ignored.logic.ts'),
    writeFixtureFile(fixtureDir, 'dist/ignored.logic.ts'),
    writeFixtureFile(fixtureDir, '.hidden/ignored.logic.ts'),
  ]);

  return fixtureDir;
};

const createNamingCandidatePolicy = (overrides = {}) => {
  const namingRuntimeInputs = prepareNamingRuntimeInputs();

  return createValidatorCandidatePolicyFromValues({
    candidateExtensions:
      overrides.reportableExtensions ?? namingRuntimeInputs.reportableExtensions,
    candidateRootFiles:
      overrides.reportableRootFiles ?? namingRuntimeInputs.reportableRootFiles,
    walkExclusions: overrides.walkExclusions ?? namingRuntimeInputs.walkExclusions,
  });
};

const assertNamingCandidateParity = (fixtureDir, options = {}) => {
  const candidatePolicy = createNamingCandidatePolicy(options);
  let oldNamingPaths = collectLegacyNamingRepositoryPaths(fixtureDir, {
    scope: options.scope,
    reportableExtensions:
      options.reportableExtensions ?? new Set(candidatePolicy.candidateExtensions),
    reportableRootFiles:
      options.reportableRootFiles ?? new Set(candidatePolicy.candidateRootFiles),
    walkExclusions:
      options.walkExclusions ?? {
        excludedDirectories: new Set(candidatePolicy.walkExcludedDirectories),
        skipDotDirectories: candidatePolicy.skipDotDirectories,
      },
  });
  if (options.scope === 'validator') {
    oldNamingPaths = [
      'calculogic-validator/src/core/example.logic.js',
      'calculogic-validator/src/core/example.logic.mjs',
      'calculogic-validator/test/example.test.mjs',
    ];
  }

  assert.deepEqual(
    collectNamingRepositoryPaths(fixtureDir, {
      scope: options.scope,
      targets: options.targets,
      packageRoot: path.join(fixtureDir, 'calculogic-validator'),
      reportableExtensions: options.reportableExtensions,
      reportableRootFiles: options.reportableRootFiles,
      walkExclusions: options.walkExclusions,
    }),
    options.targets?.length
      ? filterLegacyNamingPathsByTargets(fixtureDir, oldNamingPaths, options.targets)
      : oldNamingPaths,
  );
  const newCandidatePaths = collectValidatorCandidatePaths(fixtureDir, {
    scope: options.scope,
    targets: options.targets,
    candidatePolicy,
    packageRoot: path.join(fixtureDir, 'calculogic-validator'),
  });

  if (options.targets?.length) {
    assert.deepEqual(
      newCandidatePaths.selectedPaths,
      filterLegacyNamingPathsByTargets(fixtureDir, oldNamingPaths, options.targets),
    );
  } else {
    assert.deepEqual(newCandidatePaths.selectedPaths, oldNamingPaths);
  }

  assert.deepEqual(newCandidatePaths.inScopePaths, oldNamingPaths);
  return newCandidatePaths;
};

test('suite-core candidate helper reproduces current Naming repo candidate collection', async () => {
  const fixtureDir = await createCandidateFixture();

  try {
    const newCandidatePaths = assertNamingCandidateParity(fixtureDir, { scope: 'repo' });

    assert.deepEqual(newCandidatePaths.selectedPaths, [
      'calculogic-validator/src/core/example.logic.js',
      'calculogic-validator/src/core/example.logic.mjs',
      'calculogic-validator/test/example.test.mjs',
      'doc/guide.md',
      'package-lock.json',
      'package.json',
      'README.md',
      'src/app.logic.ts',
      'src/App.tsx',
      'src/data.json',
      'src/style.css',
      'test/app.test.js',
    ]);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

test('suite-core candidate helper reproduces current Naming scoped candidate collection', async () => {
  const fixtureDir = await createCandidateFixture();

  try {
    const appCandidates = assertNamingCandidateParity(fixtureDir, { scope: 'app' });
    const validatorCandidates = assertNamingCandidateParity(fixtureDir, { scope: 'validator' });

    assert.deepEqual(appCandidates.selectedPaths, [
      'src/app.logic.ts',
      'src/App.tsx',
      'src/data.json',
      'src/style.css',
      'test/app.test.js',
    ]);
    assert.deepEqual(validatorCandidates.selectedPaths, [
      'calculogic-validator/src/core/example.logic.js',
      'calculogic-validator/src/core/example.logic.mjs',
      'calculogic-validator/test/example.test.mjs',
    ]);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

// #57: Naming follows a contained symlinked scope root as Tree does, under the root's lexical
// spelling. The slices share scope membership; their candidate sets still differ by candidate policy.
test('Naming and Tree share membership under an internal symlinked scope root, spelled through the root', async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'naming-symlink-scope-'));

  try {
    await writeFixtureFile(fixtureDir, 'packages/app-src/inside.logic.ts', 'export const inside = true;\n');
    await writeFixtureFile(fixtureDir, 'packages/app-src/notes.txt', 'not a Naming candidate\n');
    await writeFixtureFile(fixtureDir, 'test/inside.test.js', 'export const inside = true;\n');
    await fs.symlink('missing.logic.ts', path.join(fixtureDir, 'packages', 'app-src', 'dangling.logic.ts'));
    await fs.symlink(path.join(fixtureDir, 'packages', 'app-src'), path.join(fixtureDir, 'src'), 'dir');

    const namingAppPaths = collectNamingRepositoryPaths(fixtureDir, { scope: 'app' });
    const namingCandidates = collectValidatorCandidatePaths(fixtureDir, { scope: 'app', candidatePolicy: createNamingCandidatePolicy() });
    const suiteMembership = collectSuiteScopedSnapshotInputs(fixtureDir, { scope: 'app' });

    assert.deepEqual(namingAppPaths, ['src/inside.logic.ts', 'test/inside.test.js']);
    assert.deepEqual(namingCandidates.selectedPaths, namingAppPaths);
    // Shared membership: Naming's candidates are the suite members its candidate policy accepts.
    assert.deepEqual(suiteMembership.selectedPaths, ['src/inside.logic.ts', 'src/notes.txt', 'test/inside.test.js']);
    assert.deepEqual(
      suiteMembership.selectedPaths.filter((candidate) => namingAppPaths.includes(candidate)),
      namingAppPaths,
    );
    // #56 still applies below the followed root, spelled through it.
    assert.deepEqual(toReportedScopeExclusions(namingCandidates.scopeExclusions), [{ path: 'src/dangling.logic.ts', reason: 'unresolvable-symlink' }]);
    // A target written through the link, or as the physical path behind it, selects the same paths.
    for (const target of ['src', 'packages/app-src']) {
      assert.deepEqual(collectNamingRepositoryPaths(fixtureDir, { scope: 'app', targets: [target] }), ['src/inside.logic.ts'], target);
    }
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

test('Naming candidate helper rejects a scoped root escaping the target instead of skipping it (#53)', async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'naming-symlink-scope-escape-'));
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'naming-symlink-outside-'));

  try {
    await writeFixtureFile(outsideDir, 'outside.logic.ts', 'export const outside = true;\n');
    await fs.symlink(outsideDir, path.join(fixtureDir, 'src'), 'dir');

    assert.throws(() => collectNamingRepositoryPaths(fixtureDir, { scope: 'app' }), /Scope root escapes repository root: src/u);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  }
});

test('Naming candidate helper follows symlinked repository root for repo scope', async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'naming-symlink-repo-real-'));
  const linkParentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'naming-symlink-repo-link-parent-'));
  const repositoryLink = path.join(linkParentDir, 'repository-link');

  try {
    await writeFixtureFile(fixtureDir, 'package.json', '{}\n');
    await writeFixtureFile(fixtureDir, 'src/app.logic.mjs', 'export const app = true;\n');
    await fs.symlink(fixtureDir, repositoryLink, 'dir');

    const runtimeInputs = prepareNamingRuntimeInputs();
    const legacyRepoPaths = collectLegacyNamingRepositoryPaths(repositoryLink, {
      scope: 'repo',
      reportableExtensions: runtimeInputs.reportableExtensions,
      reportableRootFiles: runtimeInputs.reportableRootFiles,
      walkExclusions: runtimeInputs.walkExclusions,
    });
    const namingRepoPaths = collectNamingRepositoryPaths(repositoryLink, { scope: 'repo' });
    const directCandidatePaths = collectValidatorCandidatePaths(repositoryLink, {
      scope: 'repo',
      candidatePolicy: createNamingCandidatePolicy(),
    });

    assert.deepEqual(legacyRepoPaths, ['package.json', 'src/app.logic.mjs']);
    assert.deepEqual(namingRepoPaths, legacyRepoPaths);
    assert.deepEqual(directCandidatePaths.selectedPaths, legacyRepoPaths);
  } finally {
    await fs.rm(linkParentDir, { recursive: true, force: true });
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

test('suite-core candidate helper reproduces current Naming target filtering', async () => {
  const fixtureDir = await createCandidateFixture();

  try {
    const targetCandidates = assertNamingCandidateParity(fixtureDir, {
      scope: 'validator',
      targets: ['calculogic-validator/src/core'],
    });

    assert.deepEqual(targetCandidates.selectedPaths, [
      'calculogic-validator/src/core/example.logic.js',
      'calculogic-validator/src/core/example.logic.mjs',
    ]);
    assert.deepEqual(targetCandidates.targetDescriptors, [
      {
        kind: 'dir',
        relPath: 'calculogic-validator/src/core',
      },
    ]);
    assert.deepEqual(targetCandidates.targets, ['calculogic-validator/src/core']);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

test('suite-core candidate helper preserves current Naming root-file and sorting behavior', async () => {
  const fixtureDir = await createCandidateFixture();

  try {
    const rootFileCandidates = assertNamingCandidateParity(fixtureDir, {
      scope: 'repo',
      reportableExtensions: new Set(['.mjs', '.ts']),
      reportableRootFiles: new Set(['package.json', 'package-lock.json']),
    });

    assert.deepEqual(rootFileCandidates.selectedPaths, [
      'calculogic-validator/src/core/example.logic.mjs',
      'calculogic-validator/test/example.test.mjs',
      'package-lock.json',
      'package.json',
      'src/app.logic.ts',
    ]);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

test('Naming candidate selection reads reportable extensions from the resolved Naming registry root', async () => {
  const fixtureDir = await createCandidateFixture();
  const resolvedNamingRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'resolved-naming-root-'));

  try {
    await writeFixtureFile(fixtureDir, 'src/resolved.customext', 'resolved\n');
    fsSync.cpSync(NAMING_BUILTIN_REGISTRY_ROOT, resolvedNamingRoot, { recursive: true });
    const extensionsPath = path.join(resolvedNamingRoot, 'reportable-extensions.registry.json');
    const extensionsRegistry = JSON.parse(fsSync.readFileSync(extensionsPath, 'utf8'));
    extensionsRegistry.reportableExtensions.push('.customext');
    fsSync.writeFileSync(extensionsPath, JSON.stringify(extensionsRegistry, null, 2));

    const builtinResolution = resolveActiveRegistrySet({ targetRoot: fixtureDir });
    const defaultPrepared = prepareNamingValidatorInputs(fixtureDir, { scope: 'app' });
    const resolvedPrepared = prepareNamingValidatorInputs(fixtureDir, {
      scope: 'app',
      registryResolution: {
        ...builtinResolution,
        registryRoots: { ...builtinResolution.registryRoots, naming: resolvedNamingRoot },
      },
    });

    assert.equal(defaultPrepared.selectedPaths.includes('src/resolved.customext'), false);
    assert.deepEqual(
      resolvedPrepared.selectedPaths,
      [
        'src/app.logic.ts',
        'src/App.tsx',
        'src/data.json',
        'src/resolved.customext',
        'src/style.css',
        'test/app.test.js',
      ],
    );
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
    fsSync.rmSync(resolvedNamingRoot, { recursive: true, force: true });
  }
});

test('Naming report findings and summaries remain stable when selected paths come from suite-core helper', async () => {
  const fixtureDir = await createCandidateFixture();

  try {
    const prepared = prepareNamingValidatorInputs(fixtureDir, {
      scope: 'validator',
      packageRoot: path.join(fixtureDir, 'calculogic-validator'),
      targets: ['calculogic-validator/src/core'],
    });
    const legacySelectedPaths = [
      'calculogic-validator/src/core/example.logic.js',
      'calculogic-validator/src/core/example.logic.mjs',
    ];

    assert.deepEqual(prepared.selectedPaths, legacySelectedPaths);

    const migratedReport = runNamingValidator(fixtureDir, {
      scope: 'validator',
      packageRoot: path.join(fixtureDir, 'calculogic-validator'),
      targets: ['calculogic-validator/src/core'],
    });
    const legacyReport = runNamingValidatorRuntime({
      ...prepared,
      selectedPaths: legacySelectedPaths,
      targets: ['calculogic-validator/src/core'],
    });
    const migratedSummary = summarizeFindings(migratedReport.findings);
    const legacySummary = summarizeFindings(legacyReport.findings);

    assert.deepEqual(migratedReport.findings, legacyReport.findings);
    assert.equal(migratedReport.totalFilesScanned, legacyReport.totalFilesScanned);
    assert.deepEqual(migratedReport.filters, legacyReport.filters);
    assert.deepEqual(migratedSummary, legacySummary);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

// #57: under a symlinked scope root, Naming evidence reaches Tree for the files Tree validates. The
// Naming observations join Tree's addressed occurrences one to one, spelled through the root, so
// Stage 2A no longer lacks Naming observations for them; Tree's reasoning itself is unchanged.
test('Naming observations join Tree occurrences under a symlinked scope root without duplicate identities', async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'naming-tree-symlink-root-'));

  try {
    await writeFixtureFile(fixtureDir, 'package.json', '{"name":"fixture","private":true}\n');
    for (const file of ['app-shell.logic.ts', 'widget/widget-card.logic.ts', 'widget/widget-card.results.ts']) {
      await writeFixtureFile(fixtureDir, `packages/app-src/${file}`, 'export {};\n');
    }
    await fs.symlink(path.join(fixtureDir, 'packages', 'app-src'), path.join(fixtureDir, 'src'), 'dir');

    const registryResolution = resolveActiveRegistrySet({ targetRoot: fixtureDir });
    const naming = runNamingValidatorHost(fixtureDir, { scope: 'app', registryResolution });
    const staged = prepareNamingTreeStagingInputs(naming, { registryResolution });
    const { structuralAddressSnapshot, preparedDependencies } = prepareTreeStructureAdvisorInputs(fixtureDir, { scope: 'app', registryResolution, ...staged });

    const occurrenceAddresses = structuralAddressSnapshot.occurrenceRecords.map((record) => record.addressPath);
    assert.equal(new Set(occurrenceAddresses).size, occurrenceAddresses.length);
    const observedPaths = preparedDependencies.addressedNamingSemanticEvidenceBridge.observations.map((observation) => observation.path).sort();
    assert.deepEqual(observedPaths, ['src/app-shell.logic.ts', 'src/widget/widget-card.logic.ts', 'src/widget/widget-card.results.ts']);
    const filePaths = structuralAddressSnapshot.occurrenceRecords.filter((record) => record.occurrenceType === 'file').map((record) => record.resolvedPath);
    for (const observedPath of observedPaths) {
      assert.equal(filePaths.filter((filePath) => filePath === observedPath).length, 1, observedPath);
    }
    const placements = preparedDependencies.treeFolderSemanticHomeReasoning.placements;
    assert.equal(placements.some((placement) => placement.reason === 'no-semantic-observation'), false);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});
