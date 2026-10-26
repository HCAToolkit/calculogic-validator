import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getBuiltinTreeRuntimeRegistries,
  loadTreeRuntimeRegistries,
} from '../src/registries/tree-runtime-registries.logic.mjs';
import { TREE_BUILTIN_REGISTRY_ROOT } from '../src/registries/tree-registry-inventory.knowledge.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT } from '../../naming/src/registries/naming-registry-inventory.knowledge.mjs';
import { getBuiltinRegistryRoots } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import {
  prepareTreeStructureAdvisorInputs,
  runTreeStructureAdvisor,
} from '../src/tree-structure-advisor.wiring.mjs';

const treeSourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

// Tree registries each run reads, and those with no runtime consumer yet (#41 lifecycle spec §14).
// `semantic-home-policy` is read through the parameter loader, from a resolution only (Tree spec S2.9).
const TREE_RUNTIME_REGISTRY_FILES = [
  'folder-kinds.registry.json',
  'repo-shape-policy.registry.json',
  'semantic-naming-folder-type-relationships.registry.json',
  'shim-detection-signals.registry.json',
  'structural-context-assessment-policies.registry.json',
  'structural-homes.registry.json',
  'structural-role-tokens.registry.json',
  'validator-owned-signals.registry.json',
];
const TREE_DATA_ONLY_REGISTRY_FILES = [
  'structural-home-signal-policy.registry.json',
  'surface-structural-home-perspective.registry.json',
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const updateJson = (filePath, update) => fs.writeFileSync(filePath, JSON.stringify(update(readJson(filePath)), null, 2));

// A target repository plus private copies of the Tree and Naming registry roots, as a resolved
// Custom set would supply them.
const withResolvedRootsFixture = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-runtime-registries-'));
  const repositoryRoot = path.join(fixtureRoot, 'repo');
  const treeRegistryRoot = path.join(fixtureRoot, 'registries', 'tree');
  const namingRegistryRoot = path.join(fixtureRoot, 'registries', 'naming');

  try {
    fs.mkdirSync(path.join(repositoryRoot, 'src', 'interop'), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, 'lib'));
    fs.writeFileSync(path.join(repositoryRoot, 'package.json'), '{"name":"fixture","private":true}\n');
    fs.writeFileSync(path.join(repositoryRoot, 'src', 'app.logic.ts'), 'export {};\n');
    fs.writeFileSync(path.join(repositoryRoot, 'src', 'interop', 'thing.logic.ts'), 'export const value = 1;\n');
    fs.writeFileSync(path.join(repositoryRoot, 'lib', 'release-notes.logic.ts'), 'export {};\n');
    fs.cpSync(TREE_BUILTIN_REGISTRY_ROOT, treeRegistryRoot, { recursive: true });
    fs.cpSync(NAMING_BUILTIN_REGISTRY_ROOT, namingRegistryRoot, { recursive: true });
    const registryRoots = { ...getBuiltinRegistryRoots(), tree: treeRegistryRoot, naming: namingRegistryRoot };

    return run({ repositoryRoot, treeRegistryRoot, namingRegistryRoot, registryRoots });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

test('the Builtin Tree root, or no root, gives the cached Builtin runtime registries', () => {
  assert.equal(loadTreeRuntimeRegistries(TREE_BUILTIN_REGISTRY_ROOT), getBuiltinTreeRuntimeRegistries());
  assert.equal(loadTreeRuntimeRegistries(undefined), getBuiltinTreeRuntimeRegistries());
  assert.ok(Object.isFrozen(getBuiltinTreeRuntimeRegistries()));
});

test('every runtime Tree registry, and the Naming folder-composition registry, is read from the resolved root', () => {
  for (const fileName of TREE_RUNTIME_REGISTRY_FILES) {
    withResolvedRootsFixture(({ repositoryRoot, treeRegistryRoot, registryRoots }) => {
      fs.writeFileSync(path.join(treeRegistryRoot, fileName), '{ broken');

      // Builtin is intact, so a run that read Builtin would not fail.
      assert.throws(() => loadTreeRuntimeRegistries(treeRegistryRoot), SyntaxError, fileName);
      assert.throws(() => prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo', registryRoots }), SyntaxError, fileName);
    });
  }

  withResolvedRootsFixture(({ repositoryRoot, namingRegistryRoot, registryRoots }) => {
    fs.writeFileSync(path.join(namingRegistryRoot, 'folder-composition-patterns.registry.json'), '{ broken');
    assert.throws(() => prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo', registryRoots }), SyntaxError);
  });
});

test('Tree registries without a runtime consumer are not read by a run', () => {
  withResolvedRootsFixture(({ repositoryRoot, treeRegistryRoot, registryRoots }) => {
    for (const fileName of TREE_DATA_ONLY_REGISTRY_FILES) {
      fs.writeFileSync(path.join(treeRegistryRoot, fileName), '{ broken');
    }

    assert.doesNotThrow(() => prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo', registryRoots }));
  });
});

test('an explicit Tree root without a resolution leaves the parameter set not prepared, never Builtin', () => {
  withResolvedRootsFixture(({ repositoryRoot, treeRegistryRoot, registryRoots }) => {
    // Not read: a broken copy neither throws nor is replaced by Builtin values.
    fs.writeFileSync(path.join(treeRegistryRoot, 'semantic-home-policy.registry.json'), '{ broken');
    const prepared = prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo', registryRoots });
    assert.deepEqual(prepared.preparedDependencies.treeSemanticHomeParameterSet, {
      availability: 'not-prepared',
      reason: 'registry-resolution-absent',
      conformance: 'not-checked',
    });
  });
});

test('resolved Tree registries reach prepared dependencies and findings', () => {
  withResolvedRootsFixture(({ repositoryRoot, treeRegistryRoot, registryRoots }) => {
    const builtinRun = runTreeStructureAdvisor(repositoryRoot, { scope: 'repo' });
    const builtinFindingKeys = builtinRun.findings.map((finding) => `${finding.code}:${finding.path}`);
    assert.ok(builtinFindingKeys.includes('TREE_UNEXPECTED_TOP_LEVEL_FOLDER:lib'));
    assert.ok(!builtinFindingKeys.some((key) => key.endsWith(':src/interop/thing.logic.ts')));

    updateJson(path.join(treeRegistryRoot, 'repo-shape-policy.registry.json'), (payload) => ({
      ...payload,
      allowedTopLevelDirectories: [...payload.allowedTopLevelDirectories, 'lib'],
    }));
    updateJson(path.join(treeRegistryRoot, 'shim-detection-signals.registry.json'), (payload) => ({
      ...payload,
      shimDetectionSignals: { ...payload.shimDetectionSignals, folderSignals: [...payload.shimDetectionSignals.folderSignals, 'interop'] },
    }));
    updateJson(path.join(treeRegistryRoot, 'validator-owned-signals.registry.json'), (payload) => ({
      ...payload,
      validatorOwnedBasenameSignals: [
        ...payload.validatorOwnedBasenameSignals,
        { signalClass: 'validator-module-surface', matchType: 'regex', pattern: '^release-notes\\.logic\\.ts$' },
      ],
    }));
    updateJson(path.join(treeRegistryRoot, 'structural-homes.registry.json'), (payload) => ({
      ...payload,
      structuralHomes: payload.structuralHomes.map((entry) =>
        entry.structuralHome === 'src' ? { ...entry, definition: 'Custom source home.' } : entry,
      ),
    }));

    const prepared = prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo', registryRoots });
    const { treeRepoShapePolicy, treeSignalPolicy } = prepared.preparedDependencies;
    assert.ok(treeRepoShapePolicy.allowedTopLevelDirectories.includes('lib'));
    assert.ok(treeSignalPolicy.shimFolderSignals.has('interop'));
    assert.ok(treeSignalPolicy.validatorOwnedBasenameSignalMatchers.some(({ matcher }) => matcher.test('release-notes.logic.ts')));
    const srcHomeEvidence = prepared.preparedDependencies.treeStructuralHomeEvidence.evidenceRecords.find(
      (record) => record.path === 'src',
    );
    assert.equal(srcHomeEvidence.structuralHomeDefinition, 'Custom source home.');

    const customRun = runTreeStructureAdvisor(repositoryRoot, { scope: 'repo', registryRoots });
    const customFindingKeys = customRun.findings.map((finding) => `${finding.code}:${finding.path}`);
    assert.ok(!customFindingKeys.includes('TREE_UNEXPECTED_TOP_LEVEL_FOLDER:lib'));
    assert.ok(customFindingKeys.some((key) => key.endsWith(':src/interop/thing.logic.ts')));
  });
});

// Standing rule (#41 lifecycle spec §6): Tree modules outside `registries/` get registry policy
// only through `tree-runtime-registries.logic.mjs`, apart from the Builtin fallbacks for direct
// runtime callers that pass no prepared policy. The Semantic Home parameter converter imports the
// registry's identifier table and ids, never its loader: the payload reaches it from its loader.
const ALLOWED_DIRECT_REGISTRY_IMPORTS = {
  'tree-semantic-home-parameter-set.logic.mjs': ['./registries/tree-semantic-home-policy-registry.logic.mjs'],
  'tree-shim-detection.logic.mjs': ['./registries/tree-signal-policy-registry.logic.mjs'],
  'tree-structure-advisor.logic.mjs': [
    './registries/tree-signal-policy-registry.logic.mjs',
    './registries/tree-repo-shape-policy-registry.logic.mjs',
  ],
};
const ALWAYS_ALLOWED_REGISTRY_MODULES = new Set([
  'tree-runtime-registries.logic.mjs',
  'tree-registry-inventory.knowledge.mjs',
]);

test('Tree runtime modules take registry policy from the resolved root, not Builtin loaders', () => {
  const sourceFiles = fs
    .readdirSync(treeSourceRoot, { recursive: true })
    .filter((relativePath) => relativePath.endsWith('.mjs') && !relativePath.startsWith(`registries${path.sep}`));

  for (const relativePath of sourceFiles) {
    const source = fs.readFileSync(path.join(treeSourceRoot, relativePath), 'utf8');
    const registryImports = [...source.matchAll(/from '([^']*registries\/[^']+)'/gu)].map((match) => match[1]);
    const allowed = ALLOWED_DIRECT_REGISTRY_IMPORTS[relativePath] ?? [];

    for (const specifier of registryImports) {
      const moduleName = path.posix.basename(specifier);
      const isTreeRegistryModule = specifier.includes('registries/tree-') || specifier.startsWith('./registries/');
      if (!isTreeRegistryModule) {
        // A Naming registry module: only its from-root loader and inventory are allowed.
        assert.doesNotMatch(source, /getBuiltinNaming/u, `${relativePath} reads a Naming registry from Builtin`);
        continue;
      }

      assert.ok(
        ALWAYS_ALLOWED_REGISTRY_MODULES.has(moduleName) || allowed.includes(specifier),
        `${relativePath} imports ${specifier} directly`,
      );
    }
  }
});
