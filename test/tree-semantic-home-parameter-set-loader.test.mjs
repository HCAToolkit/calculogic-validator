import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { digestRegistryPayload } from '../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { resolveCandidateRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-candidate.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { descriptorForPayload } from '../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import { exportPortableSet } from '../src/core/registry-lifecycle/registry-lifecycle-portable-set.logic.mjs';
import { getBuiltinRegistryRoots, resolveActiveRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { runValidatorRunner } from '../src/core/validator-runner.logic.mjs';
import {
  computeTreeSemanticHomeReasoningSourceDigest,
  getBuiltinTreeSemanticHomeParameterSet,
  loadTreeSemanticHomeParameterSet,
} from '../tree/src/registries/tree-semantic-home-parameter-set-loader.logic.mjs';
import { TREE_SEMANTIC_HOME_CONFORMANCE_BINDING } from '../tree/src/tree-semantic-home-conformance.knowledge.mjs';
import { prepareTreeStructureAdvisorInputs, runTreeStructureAdvisor } from '../tree/src/tree-structure-advisor.wiring.mjs';

// The Semantic Home parameter loader on the real lifecycle (Tree spec S2.9, S2.10 RR4): provenance
// from the run's resolution and the lifecycle Baseline entry comparison (lifecycle spec §11.4).
const REGISTRY_ID = 'tree/semantic-home-policy';
const FILE_NAME = 'semantic-home-policy.registry.json';
const VERSION = '0.0.0-test';
const NAMES = ['P_COVERAGE', 'P_MIN_SUPPORT', 'P_NOT_ELIGIBLE_SHARE', 'P_ELIGIBLE_SHARE'];
const V1_FIXTURE = new URL('../tree/test/fixtures/registry-migrations/semantic-home-policy.v1.registry.json', import.meta.url);
const treeEntry = REGISTRY_LIFECYCLE_SLICES.find((slice) => slice.sliceId === 'tree').inventory.find(
  (entry) => entry.registryId === REGISTRY_ID,
);

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, payload) => fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
const sha256 = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const field = (set, key) => NAMES.map((name) => set.parameters[name][key]);
const editParameter = (parameterId, update) => (payload) => {
  update(payload.semanticHomeParameters.find((record) => record.parameterId === parameterId));
  return payload;
};
const editCoverage = editParameter('coverage', (record) => {
  record.value = 0.6;
});

const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      return [relativePath, fs.lstatSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });

// A small target repository with a Custom set of the current Builtin. `prepare` edits it, then the
// run activates and resolves it.
const withCustomRun = (prepare, run) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-semantic-home-parameter-set-'));
  try {
    fs.mkdirSync(path.join(targetRoot, 'src'));
    fs.writeFileSync(path.join(targetRoot, 'package.json'), '{"name":"fixture","private":true}\n');
    fs.writeFileSync(path.join(targetRoot, 'src', 'app.logic.ts'), 'export {};\n');
    initCustomRegistrySet({ targetRoot, validatorVersion: VERSION });
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const files = {
      paths,
      custom: path.join(paths.customRoot, 'tree', FILE_NAME),
      baseline: path.join(paths.baselineRoot, 'tree', FILE_NAME),
      setManifestEntry: (update) => {
        const manifest = readJson(paths.manifestPath);
        update(manifest.basedOn.registries[REGISTRY_ID]);
        writeJson(paths.manifestPath, manifest);
      },
    };
    prepare(files);
    useRegistrySet({ targetRoot, activeSet: 'custom' });
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    return run({ ...files, targetRoot, registryResolution, load: () => loadTreeSemanticHomeParameterSet({ registryResolution }) });
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

test('Builtin: a Builtin resolution and a direct call give the same set, digest included', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-semantic-home-parameter-set-'));
  try {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const resolved = loadTreeSemanticHomeParameterSet({ registryResolution });
    const direct = getBuiltinTreeSemanticHomeParameterSet();
    const payload = readJson(path.join(registryResolution.registryRoots.tree, FILE_NAME));

    assert.deepEqual(resolved, direct);
    assert.deepEqual(resolved.registry, {
      registryId: REGISTRY_ID,
      version: '2',
      source: 'builtin',
      digest: registryResolution.registryProvenance.tree[REGISTRY_ID].digest,
    });
    assert.equal(direct.registry.digest, digestRegistryPayload(payload, descriptorForPayload(treeEntry, payload)));
    assert.equal(resolved.availability, 'available');
    // RR4 (2A-iii): the Builtin values with the installed reasoning modules carry the binding.
    assert.equal(resolved.conformance, 'passed');
    assert.deepEqual(resolved.conformanceBinding, {
      catalogue: { id: 'semantic-home-catalogue', version: '2', digest: TREE_SEMANTIC_HOME_CONFORMANCE_BINDING.catalogue.digest },
      reasoning: { version: '1', sourceDigest: computeTreeSemanticHomeReasoningSourceDigest() },
    });
    assert.deepEqual(field(resolved, 'origin'), Array(4).fill('builtin'));
    assert.deepEqual(field(resolved, 'baselineComparison'), Array(4).fill('not-applicable'));
    assert.deepEqual(field(resolved, 'value'), [0.5, 2, 0.25, 0.75]);

    // No root, and the Builtin root itself, are the cached Builtin set.
    assert.equal(loadTreeSemanticHomeParameterSet(), direct);
    assert.equal(loadTreeSemanticHomeParameterSet({ registryRoots: getBuiltinRegistryRoots() }), direct);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test('Custom: an edited value is override (differs), its values come from the Custom file', () => {
  withCustomRun(
    ({ custom }) => writeJson(custom, editCoverage(readJson(custom))),
    ({ load, registryResolution }) => {
      const set = load();
      assert.equal(set.registry.source, 'custom');
      assert.equal(set.registry.digest, registryResolution.registryProvenance.tree[REGISTRY_ID].digest);
      assert.deepEqual(field(set, 'origin'), ['override', 'baseline', 'baseline', 'baseline']);
      assert.deepEqual(field(set, 'baselineComparison'), ['differs', 'matches', 'matches', 'matches']);
      assert.deepEqual(field(set, 'value'), [0.6, 2, 0.25, 0.75]);
      // Different values are not the bound values: not-checked, never failed.
      assert.equal(set.conformance, 'not-checked');
      assert.equal(Object.hasOwn(set, 'conformanceBinding'), false);
    },
  );
});

test('Custom: a rationale-only edit keeps the value and is override (differs)', () => {
  withCustomRun(
    ({ custom }) => writeJson(custom, editParameter('minimum-support', (record) => {
      record.rationale = `${record.rationale} A consumer note.`;
    })(readJson(custom))),
    ({ load }) => {
      const set = load();
      assert.equal(set.parameters.P_MIN_SUPPORT.value, 2);
      assert.equal(set.parameters.P_MIN_SUPPORT.origin, 'override');
      assert.equal(set.parameters.P_MIN_SUPPORT.baselineComparison, 'differs');
      assert.equal(Object.hasOwn(set.parameters.P_MIN_SUPPORT, 'rationale'), false);
      assert.deepEqual(field(set, 'origin'), ['baseline', 'override', 'baseline', 'baseline']);
      // K6: rationale is not bound, and conformance never reads origin.
      assert.equal(set.conformance, 'passed');
    },
  );
});

test('Custom: a version 1 registry is configuration-unavailable, never Builtin values', () => {
  withCustomRun(
    ({ custom, baseline, setManifestEntry }) => {
      const v1 = readJson(V1_FIXTURE);
      writeJson(custom, v1);
      writeJson(baseline, v1);
      setManifestEntry((entry) => {
        entry.version = '1';
        entry.digest = digestRegistryPayload(v1, descriptorForPayload(treeEntry, v1));
      });
    },
    ({ load, registryResolution }) => {
      assert.deepEqual(registryResolution.registrySet.customIssues, []);
      assert.deepEqual(load(), {
        registry: {
          registryId: REGISTRY_ID,
          version: '1',
          source: 'custom',
          digest: registryResolution.registryProvenance.tree[REGISTRY_ID].digest,
        },
        availability: 'configuration-unavailable',
        reason: 'parameter-set-absent',
        conformance: 'not-checked',
      });
    },
  );
});

test('Custom: a verified version 1 Baseline under a version 2 Custom file makes every parameter override (absent)', () => {
  withCustomRun(
    ({ baseline, setManifestEntry }) => {
      const v1 = readJson(V1_FIXTURE);
      writeJson(baseline, v1);
      setManifestEntry((entry) => {
        entry.version = '1';
        entry.digest = digestRegistryPayload(v1, descriptorForPayload(treeEntry, v1));
      });
    },
    ({ load }) => {
      const set = load();
      assert.deepEqual(field(set, 'origin'), Array(4).fill('override'));
      assert.deepEqual(field(set, 'baselineComparison'), Array(4).fill('absent'));
    },
  );
});

test('Custom: an unverifiable Baseline makes every parameter unverified, with the lifecycle reason, and does not block', () => {
  withCustomRun(
    ({ custom, baseline }) => {
      writeJson(custom, editCoverage(readJson(custom)));
      fs.rmSync(baseline);
    },
    ({ load, registryResolution }) => {
      assert.equal(registryResolution.activeSet, 'custom');
      const set = load();
      assert.deepEqual(field(set, 'origin'), Array(4).fill('unverified'));
      assert.deepEqual(field(set, 'baselineComparisonReason'), Array(4).fill('baseline-mismatch'));
      assert.equal(set.parameters.P_COVERAGE.value, 0.6);
    },
  );
});

test('Candidate: provenance comes from the artifact and its own Baseline; the repository is untouched', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-semantic-home-parameter-set-'));
  let resolution;
  try {
    const source = path.join(fixtureRoot, 'source');
    const target = path.join(fixtureRoot, 'target');
    for (const root of [source, target]) {
      fs.mkdirSync(root);
      initCustomRegistrySet({ targetRoot: root, validatorVersion: VERSION });
    }
    const sourceCustom = path.join(resolveRegistryLifecyclePaths({ targetRoot: source }).customRoot, 'tree', FILE_NAME);
    writeJson(sourceCustom, editCoverage(readJson(sourceCustom)));
    const artifact = exportPortableSet({ targetRoot: source, validatorVersion: VERSION });
    const targetPaths = resolveRegistryLifecyclePaths({ targetRoot: target });
    fs.rmSync(path.join(targetPaths.baselineRoot, 'tree', FILE_NAME));
    const before = snapshotTree(targetPaths.lifecycleRoot);

    resolution = resolveCandidateRegistrySet({ artifactBytes: Buffer.from(JSON.stringify(artifact)) });
    const set = loadTreeSemanticHomeParameterSet({ registryResolution: resolution });
    assert.equal(set.registry.source, 'candidate');
    assert.deepEqual(field(set, 'origin'), ['override', 'baseline', 'baseline', 'baseline']);
    assert.deepEqual(field(set, 'baselineComparison'), ['differs', 'matches', 'matches', 'matches']);
    assert.deepEqual(snapshotTree(targetPaths.lifecycleRoot), before);
    assert.equal(sha256(JSON.stringify(set)), sha256(JSON.stringify(loadTreeSemanticHomeParameterSet({ registryResolution: resolution }))));
  } finally {
    resolution?.dispose();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('wiring prepares the set from the resolution; nothing reads it, so findings are unchanged', () => {
  withCustomRun(
    ({ custom }) => {
      writeJson(custom, ['coverage', 'minimum-support', 'not-eligible-share', 'eligible-share'].reduce(
        (payload, parameterId, index) => editParameter(parameterId, (record) => {
          record.value = [0.9, 7, 0.05, 0.95][index];
        })(payload),
        readJson(custom),
      ));
    },
    ({ targetRoot, registryResolution, load }) => {
      const prepared = prepareTreeStructureAdvisorInputs(targetRoot, { scope: 'repo', registryResolution });
      assert.deepEqual(prepared.preparedDependencies.treeSemanticHomeParameterSet, load());
      assert.deepEqual(field(prepared.preparedDependencies.treeSemanticHomeParameterSet, 'value'), [0.9, 7, 0.05, 0.95]);
      assert.equal(prepared.preparedDependencies.treeFolderSemanticHomeReasoning.status, 'evaluated');
      assert.equal(prepared.preparedDependencies.treeFolderSemanticHomeReasoning.parameterSet, prepared.preparedDependencies.treeSemanticHomeParameterSet);

      // Same findings as a Builtin run, through the wiring and through the suite runner.
      const customFindings = runTreeStructureAdvisor(targetRoot, { scope: 'repo', registryResolution }).findings;
      const builtinFindings = runTreeStructureAdvisor(targetRoot, { scope: 'repo' }).findings;
      assert.deepEqual(customFindings, builtinFindings);
      const report = runValidatorRunner(targetRoot, { validators: ['tree-structure-advisor'], scope: 'repo', registryResolution });
      assert.doesNotMatch(JSON.stringify(report), /treeSemanticHomeParameterSet|P_COVERAGE|baselineComparison/u);

      // Roots that are not the resolution's own are a wiring error.
      assert.throws(
        () => prepareTreeStructureAdvisorInputs(targetRoot, {
          scope: 'repo',
          registryResolution,
          registryRoots: getBuiltinRegistryRoots(),
        }),
        /not the registry resolution's own roots/u,
      );
    },
  );
});
