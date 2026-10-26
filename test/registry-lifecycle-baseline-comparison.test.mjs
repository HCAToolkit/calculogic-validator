import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { digestRegistryPayload } from '../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { walkComparisonEntries } from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import { compareResolvedRegistryWithBaseline } from '../src/core/registry-lifecycle/registry-lifecycle-baseline-comparison.logic.mjs';
import { resolveCandidateRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-candidate.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { descriptorForPayload, deepFreeze } from '../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import { exportPortableSet } from '../src/core/registry-lifecycle/registry-lifecycle-portable-set.logic.mjs';
import { resolveActiveRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { RegistryLifecycleError, resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';

// The lifecycle spec §11.4 Baseline entry comparison, on the real inventories. The keyed
// `tree/semantic-home-policy` registry carries the cases: one record per parameter and lane, and a
// declared version "1" without parameters.
const REGISTRY_ID = 'tree/semantic-home-policy';
const FILE_NAME = 'semantic-home-policy.registry.json';
const VERSION = '0.0.0-test';
const V1_FIXTURE = new URL('../tree/test/fixtures/registry-migrations/semantic-home-policy.v1.registry.json', import.meta.url);
const treeEntry = REGISTRY_LIFECYCLE_SLICES.find((slice) => slice.sliceId === 'tree').inventory.find(
  (entry) => entry.registryId === REGISTRY_ID,
);

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, payload) => fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
const sha256 = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const parameterAddress = (parameterId) => `semanticHomeParameters[parameterId=${JSON.stringify(parameterId)}]`;
const statesOf = (result) => Object.fromEntries(result.entries.map((entry) => [entry.address, entry.baselineComparison]));
const distinct = (result, field) => [...new Set(result.entries.map((entry) => entry[field]))];

const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      return [relativePath, fs.lstatSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });

// A target with a Custom set of the current Builtin. `prepare` edits it before the run resolves it.
const withCustomRun = (prepare, run) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-baseline-comparison-'));
  try {
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
    const resolution = resolveActiveRegistrySet({ targetRoot });
    const compare = (payload = readJson(files.custom)) =>
      compareResolvedRegistryWithBaseline({ resolution, registryId: REGISTRY_ID, payload });
    return run({ ...files, targetRoot, resolution, compare });
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

const editCoverage = (payload) => {
  payload.semanticHomeParameters.find((record) => record.parameterId === 'coverage').value = 0.6;
  return payload;
};

test('a Builtin run gives every entry not-applicable, and the resolution carries no Baseline reference', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-baseline-comparison-'));
  try {
    // An existing, edited Custom set is never read by a Builtin run.
    initCustomRegistrySet({ targetRoot, validatorVersion: VERSION });
    const customFile = path.join(resolveRegistryLifecyclePaths({ targetRoot }).customRoot, 'tree', FILE_NAME);
    writeJson(customFile, editCoverage(readJson(customFile)));

    const resolution = resolveActiveRegistrySet({ targetRoot });
    assert.equal(resolution.activeSet, 'builtin');
    assert.equal(Object.hasOwn(resolution, 'baselineReference'), false);
    const payload = readJson(path.join(resolution.registryRoots.tree, FILE_NAME));
    const result = compareResolvedRegistryWithBaseline({ resolution, registryId: REGISTRY_ID, payload });

    assert.equal(result.source, 'builtin');
    assert.deepEqual(distinct(result, 'baselineComparison'), ['not-applicable']);
    assert.deepEqual(distinct(result, 'reason'), [undefined]);
    assert.deepEqual(
      result.entries.map((entry) => entry.address),
      walkComparisonEntries(payload, treeEntry).map((entry) => entry.address),
    );
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test('a verified Baseline gives matches and differs per entry, in the declaration\'s address order', () => {
  withCustomRun(
    ({ custom }) => writeJson(custom, editCoverage(readJson(custom))),
    ({ resolution, compare, custom }) => {
      assert.equal(resolution.activeSet, 'custom');
      const result = compare();
      const states = statesOf(result);
      assert.equal(result.registryId, REGISTRY_ID);
      assert.equal(result.source, 'custom');
      assert.equal(states[parameterAddress('coverage')], 'differs');
      for (const parameterId of ['minimum-support', 'not-eligible-share', 'eligible-share']) {
        assert.equal(states[parameterAddress(parameterId)], 'matches');
      }
      assert.deepEqual(
        Object.entries(states).filter(([address]) => address.startsWith('semanticHomePolicy')).map(([, state]) => state),
        Array(6).fill('matches'),
      );
      assert.deepEqual(
        result.entries.map((entry) => entry.address),
        walkComparisonEntries(readJson(custom), treeEntry).map((entry) => entry.address),
      );
    },
  );
});

test('equality is the canonical form the declarations define: record and key order do not differ', () => {
  withCustomRun(
    ({ custom }) => {
      const payload = readJson(custom);
      const reordered = {
        semanticHomeParameters: [...payload.semanticHomeParameters].reverse().map((record) =>
          Object.fromEntries(Object.entries(record).reverse()),
        ),
        semanticHomePolicy: [...payload.semanticHomePolicy].reverse(),
        version: payload.version,
      };
      assert.notEqual(JSON.stringify(reordered), JSON.stringify(payload));
      writeJson(custom, reordered);
    },
    ({ compare }) => assert.deepEqual(distinct(compare(), 'baselineComparison'), ['matches']),
  );
});

test('a verified version 1 Baseline has no parameter records: each is absent, never unverifiable', () => {
  // A Custom set initialized from the version "1" Builtin, whose Custom file the consumer then
  // replaced with the version "2" form without migrating. The Baseline stays the verified version 1 copy.
  withCustomRun(
    ({ custom, baseline, setManifestEntry }) => {
      const v2 = readJson(custom);
      const v1 = readJson(V1_FIXTURE);
      writeJson(baseline, v1);
      setManifestEntry((entry) => {
        entry.version = '1';
        entry.digest = digestRegistryPayload(v1, descriptorForPayload(treeEntry, v1));
      });
      writeJson(custom, v2);
    },
    ({ resolution, compare, baseline }) => {
      assert.equal(readJson(baseline).version, '1');
      assert.deepEqual(resolution.registrySet.customIssues, []);
      const result = compare();
      const states = statesOf(result);
      const v1Lanes = new Map(readJson(V1_FIXTURE).semanticHomePolicy.map((lane) => [lane.policyId, JSON.stringify(lane)]));

      for (const parameterId of ['coverage', 'minimum-support', 'not-eligible-share', 'eligible-share']) {
        assert.equal(states[parameterAddress(parameterId)], 'absent');
      }
      for (const lane of readJson(path.join(resolution.registryRoots.tree, FILE_NAME)).semanticHomePolicy) {
        const sameKeys = Object.fromEntries(Object.entries(JSON.parse(v1Lanes.get(lane.policyId))).sort());
        const expected = JSON.stringify(Object.fromEntries(Object.entries(lane).sort())) === JSON.stringify(sameKeys) ? 'matches' : 'differs';
        assert.equal(states[`semanticHomePolicy[policyId=${JSON.stringify(lane.policyId)}]`], expected);
      }
      assert.deepEqual(distinct(result, 'reason'), [undefined]);
    },
  );
});

test('an unverifiable Baseline keeps its diagnostic reason for every entry and is never compared', async (t) => {
  const cases = [
    {
      name: 'a copy whose digest differs from the manifest',
      reason: 'baseline-mismatch',
      prepare: ({ baseline }) => writeJson(baseline, editCoverage(readJson(baseline))),
    },
    { name: 'a missing copy', reason: 'baseline-mismatch', prepare: ({ baseline }) => fs.rmSync(baseline) },
    {
      name: 'a manifest version this release has no descriptor for',
      reason: 'baseline-version-undescribed',
      prepare: ({ setManifestEntry }) => setManifestEntry((entry) => {
        entry.version = '0';
      }),
    },
    {
      name: 'a verified copy the current declaration cannot address',
      reason: 'baseline-not-comparable',
      // A version "1" copy with a field no current collection covers, as if a later version removed it.
      prepare: ({ baseline, setManifestEntry }) => {
        const v1 = { ...readJson(V1_FIXTURE), retiredNotes: ['a field version 2 removed'] };
        writeJson(baseline, v1);
        setManifestEntry((entry) => {
          entry.version = '1';
          entry.digest = digestRegistryPayload(v1, descriptorForPayload(treeEntry, v1));
        });
      },
    },
  ];

  for (const { name, reason, prepare } of cases) {
    await t.test(name, () => {
      withCustomRun(
        (files) => {
          writeJson(files.custom, editCoverage(readJson(files.custom)));
          prepare(files);
        },
        ({ resolution, compare }) => {
          // None of these blocks a run (spec §7.1, §11.4).
          assert.equal(resolution.activeSet, 'custom');
          const result = compare();
          assert.equal(result.entries.length, 10);
          assert.deepEqual(distinct(result, 'baselineComparison'), ['unverifiable']);
          assert.deepEqual(distinct(result, 'reason'), [reason]);
        },
      );
    });
  }
});

test('a candidate is compared with its artifact\'s own Baseline, never the repository\'s Custom set', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-baseline-comparison-'));
  const resolutions = [];
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

    // The repository's own Custom set is active with an unverifiable Baseline for the registry.
    const targetPaths = resolveRegistryLifecyclePaths({ targetRoot: target });
    fs.rmSync(path.join(targetPaths.baselineRoot, 'tree', FILE_NAME));
    useRegistrySet({ targetRoot: target, activeSet: 'custom' });
    const targetSnapshot = snapshotTree(targetPaths.lifecycleRoot);

    const candidateOf = (document) => {
      const resolution = resolveCandidateRegistrySet({ artifactBytes: Buffer.from(JSON.stringify(document)) });
      resolutions.push(resolution);
      return resolution;
    };
    const compareCandidate = (resolution) =>
      compareResolvedRegistryWithBaseline({
        resolution,
        registryId: REGISTRY_ID,
        payload: readJson(path.join(resolution.registryRoots.tree, FILE_NAME)),
      });

    const candidate = compareCandidate(candidateOf(artifact));
    assert.equal(candidate.source, 'candidate');
    assert.equal(statesOf(candidate)[parameterAddress('coverage')], 'differs');
    assert.deepEqual(
      Object.values(statesOf(candidate)).filter((state) => state !== 'matches'),
      ['differs'],
    );

    // The artifact's own tampered copy is what makes a candidate unverifiable.
    const baselinePath = `.baseline/tree/${FILE_NAME}`;
    const tampered = {
      ...artifact,
      files: artifact.files.map((file) => {
        if (file.path !== baselinePath) {
          return file;
        }
        const text = `${JSON.stringify(editCoverage(JSON.parse(file.text)), null, 2)}\n`;
        return { path: file.path, text, sha256: sha256(text) };
      }),
    };
    const unverified = compareCandidate(candidateOf(tampered));
    assert.deepEqual(distinct(unverified, 'reason'), ['baseline-mismatch']);

    // The repository's active Custom resolution is unverifiable for its own reason; nothing was written.
    const repository = resolveActiveRegistrySet({ targetRoot: target });
    const repositoryResult = compareResolvedRegistryWithBaseline({
      resolution: repository,
      registryId: REGISTRY_ID,
      payload: readJson(path.join(repository.registryRoots.tree, FILE_NAME)),
    });
    assert.deepEqual(distinct(repositoryResult, 'reason'), ['baseline-mismatch']);
    assert.deepEqual(snapshotTree(targetPaths.lifecycleRoot), targetSnapshot);
  } finally {
    for (const resolution of resolutions) {
      resolution.dispose();
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('the comparison is read-only and deterministic, and returns only comparison facts', () => {
  withCustomRun(
    ({ custom }) => writeJson(custom, editCoverage(readJson(custom))),
    ({ paths, compare, custom }) => {
      const before = snapshotTree(paths.lifecycleRoot);
      const payload = deepFreeze(readJson(custom));
      const first = compare(payload);
      const second = compare(payload);

      assert.deepEqual(first, second);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
      assert.ok(Object.isFrozen(first) && Object.isFrozen(first.entries) && first.entries.every(Object.isFrozen));
      assert.deepEqual(Object.keys(first).sort(), ['entries', 'registryId', 'source']);
      for (const entry of first.entries) {
        assert.deepEqual(Object.keys(entry).sort(), ['address', 'baselineComparison']);
      }
    },
  );
});

test('a manifest that changed after resolution, or a misused resolution, is an error, never a state', () => {
  withCustomRun(
    () => {},
    ({ resolution, compare, paths, setManifestEntry, custom }) => {
      setManifestEntry((entry) => {
        entry.digest = 'not-a-digest';
      });
      assert.throws(() => compare(), RegistryLifecycleError);
      fs.rmSync(paths.manifestPath);
      assert.throws(() => compare(), RegistryLifecycleError);

      const payload = readJson(custom);
      const { baselineReference, ...withoutReference } = resolution;
      assert.ok(baselineReference);
      assert.throws(
        () => compareResolvedRegistryWithBaseline({ resolution: withoutReference, registryId: REGISTRY_ID, payload }),
        /must carry its Baseline reference/u,
      );
      assert.throws(
        () => compareResolvedRegistryWithBaseline({ resolution, registryId: 'tree/unknown', payload }),
        /not in the run's resolved set/u,
      );
    },
  );
});
