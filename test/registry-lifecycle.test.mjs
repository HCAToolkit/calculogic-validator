import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalizeRegistryPayload,
  digestRegistryPayload,
  digestRegistrySet,
} from '../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { validateSliceRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-slice-validation.logic.mjs';
import {
  RegistryLifecycleError,
  readRegistryLifecycleState,
  resolveRegistryLifecyclePaths,
} from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import {
  assessCustomRegistrySet,
  digestBuiltinRegistrySet,
} from '../src/core/registry-lifecycle/registry-lifecycle-assessment.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import {
  getBuiltinRegistryRoots,
  resolveActiveRegistrySet,
} from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import {
  CUSTOM_ACTIVATION_AVAILABLE,
  REGISTRY_LIFECYCLE_ERROR_CODE,
  STATUS_CLASSIFICATIONS,
} from '../src/core/registry-lifecycle/registry-lifecycle.contracts.mjs';
import { prepareNamingRuntimeInputs } from '../naming/src/naming-validator.wiring.mjs';

const VALIDATOR_VERSION = '0.0.0-test';
const LEGACY_CUSTOM_FIXTURE_ROOT = path.resolve(
  'naming/test/fixtures/registry-lifecycle/legacy-in-package-custom-set',
);
const LEGACY_CUSTOM_SET_DIGEST = '8d5ccfbe4cc90cf86d4b03abcc68e003d7f6f05b7508eb241c9b8d49ac29dd8f';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

// A temporary validation target root. With `copyBuiltin`, it also gets private copies of every
// slice's Builtin root, so a test can change "Builtin" without touching the package.
const withLifecycleFixture = (run, { copyBuiltin = false } = {}) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);

  const slices = copyBuiltin
    ? REGISTRY_LIFECYCLE_SLICES.map((slice) => {
        const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
        fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
        return { ...slice, builtinRoot };
      })
    : REGISTRY_LIFECYCLE_SLICES;
  const paths = resolveRegistryLifecyclePaths({ targetRoot });

  try {
    return run({ targetRoot, paths, slices });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const initFixture = ({ targetRoot, slices }) =>
  initCustomRegistrySet({ targetRoot, validatorVersion: VALIDATOR_VERSION, slices });

const customFile = (paths, registryId) => {
  const [sliceId, name] = registryId.split('/');
  return path.join(paths.customRoot, sliceId, `${name}.registry.json`);
};

const builtinFile = (slices, registryId) => {
  const [sliceId, name] = registryId.split('/');
  return path.join(slices.find((slice) => slice.sliceId === sliceId).builtinRoot, `${name}.registry.json`);
};

const updateJson = (filePath, update) => writeJson(filePath, update(readJson(filePath)));

const classificationOf = (assessment, registryId) =>
  assessment.registries.find((entry) => entry.registryId === registryId)?.classification;

// ---- canonical digest -------------------------------------------------------------------------

test('canonicalization sorts object keys and declared set-like arrays, keeping ordered arrays', () => {
  const descriptor = {
    setLike: [{ path: 'items', key: 'id' }, { path: 'groups.*' }, { path: 'rows[].tags' }],
    omitEmpty: ['items[].notes'],
  };
  const payload = {
    z: 1,
    a: [3, 1, 2],
    items: [{ id: 'b', notes: '' }, { id: 'a', notes: 'kept' }],
    groups: { g: ['y', 'x'] },
    rows: [{ tags: ['2', '1'] }],
  };

  assert.deepEqual(canonicalizeRegistryPayload(payload, descriptor), {
    a: [3, 1, 2],
    groups: { g: ['x', 'y'] },
    items: [{ id: 'a', notes: 'kept' }, { id: 'b' }],
    rows: [{ tags: ['1', '2'] }],
    z: 1,
  });
});

test('digests ignore key order and set-like order but not ordered-array order', () => {
  const descriptor = { setLike: [{ path: 'values' }] };

  assert.equal(
    digestRegistryPayload({ version: '1', values: ['.b', '.a'] }, descriptor),
    digestRegistryPayload({ values: ['.a', '.b'], version: '1' }, descriptor),
  );
  assert.notEqual(
    digestRegistryPayload({ values: ['.b', '.a'] }, {}),
    digestRegistryPayload({ values: ['.a', '.b'] }, {}),
  );
});

test('identical members of a set-like array collapse to one; distinct keyed records stay', () => {
  const descriptor = { setLike: [{ path: 'values' }, { path: 'records', key: 'id' }] };

  assert.equal(
    digestRegistryPayload({ values: ['.js', '.ts', '.js'] }, descriptor),
    digestRegistryPayload({ values: ['.ts', '.js'] }, descriptor),
  );
  assert.deepEqual(
    canonicalizeRegistryPayload({ records: [{ id: 'a', v: 2 }, { id: 'a', v: 1 }, { id: 'a', v: 1 }] }, descriptor),
    { records: [{ id: 'a', v: 1 }, { id: 'a', v: 2 }] },
  );
  assert.notEqual(
    digestRegistryPayload({ ordered: ['.js', '.js'] }, descriptor),
    digestRegistryPayload({ ordered: ['.js'] }, descriptor),
  );
});

test('a JSON __proto__ key is part of the canonical form and the digest', () => {
  const withProtoKey = JSON.parse('{"x":{"__proto__":{"a":1}}}');

  assert.deepEqual(Object.keys(canonicalizeRegistryPayload(withProtoKey, {}).x), ['__proto__']);
  assert.notEqual(digestRegistryPayload(withProtoKey, {}), digestRegistryPayload({ x: {} }, {}));
});

test('set digests do not depend on input key order', () => {
  assert.equal(
    digestRegistrySet({ 'tree/a': 'x', 'naming/b': 'y' }),
    digestRegistrySet({ 'naming/b': 'y', 'tree/a': 'x' }),
  );
});

// ---- inventories ------------------------------------------------------------------------------

test('each slice inventory lists exactly the Builtin registry files of that slice', () => {
  assert.deepEqual(
    REGISTRY_LIFECYCLE_SLICES.map((slice) => slice.sliceId),
    ['naming', 'tree', 'suite'],
  );

  for (const slice of REGISTRY_LIFECYCLE_SLICES) {
    const builtinFiles = fs
      .readdirSync(slice.builtinRoot)
      .filter((fileName) => fileName.endsWith('.registry.json'))
      .sort();
    const inventoryFiles = slice.inventory.map((entry) => entry.fileName).sort();

    assert.deepEqual(inventoryFiles, builtinFiles, `inventory drift in slice ${slice.sliceId}`);
    for (const entry of slice.inventory) {
      assert.equal(entry.registryId, `${slice.sliceId}/${entry.fileName.replace(/\.registry\.json$/u, '')}`);
    }
  }
});

test('every Builtin registry declares a version its inventory can read', () => {
  for (const slice of REGISTRY_LIFECYCLE_SLICES) {
    for (const entry of slice.inventory) {
      const payload = readJson(path.join(slice.builtinRoot, entry.fileName));
      assert.ok(entry.readableVersions.includes(payload.version), `${entry.registryId} version`);
    }
  }
});

test('the Builtin set passes every slice registry-set validation entry point', () => {
  for (const slice of REGISTRY_LIFECYCLE_SLICES) {
    assert.deepEqual(validateSliceRegistrySet(slice.sliceId, slice.builtinRoot), [], slice.sliceId);
  }
});

test('every slice validation entry point rejects a bare payload for each of its registries', () => {
  for (const slice of REGISTRY_LIFECYCLE_SLICES) {
    for (const entry of slice.inventory) {
      const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-bare-'));
      try {
        fs.cpSync(slice.builtinRoot, registryRoot, { recursive: true });
        fs.writeFileSync(path.join(registryRoot, entry.fileName), '{"version":"1"}');

        const failingIds = validateSliceRegistrySet(slice.sliceId, registryRoot).map((failure) => failure.registryId);
        assert.ok(failingIds.includes(entry.registryId), `${entry.registryId} accepted a bare payload`);
      } finally {
        fs.rmSync(registryRoot, { recursive: true, force: true });
      }
    }
  }
});

const invalidIdsAfter = (sliceId, fileName, content) => {
  const slice = REGISTRY_LIFECYCLE_SLICES.find((candidate) => candidate.sliceId === sliceId);
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-invalid-'));
  try {
    fs.cpSync(slice.builtinRoot, registryRoot, { recursive: true });
    const filePath = path.join(registryRoot, fileName);
    fs.writeFileSync(filePath, JSON.stringify(typeof content === 'function' ? content(readJson(filePath)) : content));
    return validateSliceRegistrySet(sliceId, registryRoot).map((failure) => failure.registryId);
  } finally {
    fs.rmSync(registryRoot, { recursive: true, force: true });
  }
};

test('Naming validation rejects a malformed canonical roles registry and a dangling perspective role', () => {
  // Perspective roles take their status from canonical roles, so the dependent registry fails too.
  assert.deepEqual(invalidIdsAfter('naming', 'roles.registry.json', { version: '1', roles: 'bad' }), [
    'naming/category-role-perspective',
    'naming/roles',
  ]);
  assert.deepEqual(
    invalidIdsAfter('naming', 'roles.registry.json', (payload) => ({
      ...payload,
      roles: payload.roles.filter((entry) => entry.role !== 'host'),
    })),
    ['naming/category-role-perspective', 'naming/roles'],
  );
  assert.deepEqual(
    invalidIdsAfter('naming', 'agnostic-core-meanings.registry.json', (payload) => ({
      ...payload,
      meanings: [...payload.meanings, payload.meanings[0]],
    })),
    ['naming/agnostic-core-meanings'],
  );
});

test('suite validation rejects scope profiles outside the scope contract', () => {
  const withProfiles = (update) => (payload) => ({ ...payload, profiles: update(payload.profiles) });

  assert.deepEqual(invalidIdsAfter('suite', 'scope-profiles.registry.json', { version: '1', profiles: [] }), [
    'suite/scope-profiles',
  ]);
  assert.deepEqual(
    invalidIdsAfter(
      'suite',
      'scope-profiles.registry.json',
      withProfiles(({ repo, ...rest }) => rest),
    ),
    ['suite/scope-profiles'],
  );
  assert.deepEqual(
    invalidIdsAfter(
      'suite',
      'scope-profiles.registry.json',
      withProfiles((profiles) => ({ ...profiles, app: { includeRoots: 'src', includeRootFiles: [] } })),
    ),
    ['suite/scope-profiles'],
  );
  assert.deepEqual(
    invalidIdsAfter(
      'suite',
      'scope-profiles.registry.json',
      withProfiles((profiles) => ({ ...profiles, extra: { includeRoots: [], includeRootFiles: [] } })),
    ),
    ['suite/scope-profiles'],
  );
});

test('suite validation rejects scope roots that escape the target repository', () => {
  for (const escapingRoot of ['..', '../neighbor', 'src/../..', '/etc', 'C:/Windows', 'src\\lib', 'src//lib', './src']) {
    assert.deepEqual(
      invalidIdsAfter('suite', 'scope-profiles.registry.json', (payload) => ({
        ...payload,
        profiles: { ...payload.profiles, app: { ...payload.profiles.app, includeRoots: [escapingRoot] } },
      })),
      ['suite/scope-profiles'],
      `accepted includeRoots ${escapingRoot}`,
    );
  }

  for (const nonRootFile of ['../package.json', 'config/app.json', '..']) {
    assert.deepEqual(
      invalidIdsAfter('suite', 'scope-profiles.registry.json', (payload) => ({
        ...payload,
        profiles: { ...payload.profiles, docs: { ...payload.profiles.docs, includeRootFiles: [nonRootFile] } },
      })),
      ['suite/scope-profiles'],
      `accepted includeRootFiles ${nonRootFile}`,
    );
  }
});

test('membership-only lists compare as sets: special-case matches and shim vocabularies', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    updateJson(customFile(paths, 'naming/special-cases'), (payload) => ({
      ...payload,
      specialCases: payload.specialCases.map((entry) =>
        Array.isArray(entry.match?.suffixEquals)
          ? { ...entry, match: { ...entry.match, suffixEquals: [...entry.match.suffixEquals].reverse().concat(entry.match.suffixEquals[0]) } }
          : entry,
      ),
    }));
    updateJson(customFile(paths, 'tree/shim-detection-signals'), (payload) => ({
      ...payload,
      shimDetectionSignals: Object.fromEntries(
        Object.entries(payload.shimDetectionSignals).map(([key, values]) =>
          Array.isArray(values) ? [key, [...values].reverse()] : [key, values],
        ),
      ),
    }));

    const assessment = assessCustomRegistrySet({ paths, slices });
    assert.equal(classificationOf(assessment, 'naming/special-cases'), 'unchanged');
    assert.equal(classificationOf(assessment, 'tree/shim-detection-signals'), 'unchanged');
    assert.equal(assessment.customDiffers, false);
  }, { copyBuiltin: true });
});

test('Tree validation rejects malformed evidence-policy and perspective registries', () => {
  assert.deepEqual(
    invalidIdsAfter('tree', 'semantic-home-policy.registry.json', (payload) => ({
      ...payload,
      semanticHomePolicy: [{ ...payload.semanticHomePolicy[0], inputLane: 'unknown-lane' }],
    })),
    ['tree/semantic-home-policy'],
  );
  assert.deepEqual(
    invalidIdsAfter('tree', 'structural-home-signal-policy.registry.json', (payload) => ({
      ...payload,
      structuralHomeSignalPolicy: [...payload.structuralHomeSignalPolicy, payload.structuralHomeSignalPolicy[0]],
    })),
    ['tree/structural-home-signal-policy'],
  );
  assert.deepEqual(
    invalidIdsAfter('tree', 'surface-structural-home-perspective.registry.json', (payload) => ({
      ...payload,
      structuralHomesBySurface: { ...payload.structuralHomesBySurface, runtime: 'src' },
    })),
    ['tree/surface-structural-home-perspective'],
  );
});

test('Tree validation rejects malformed entries in its runtime registries', () => {
  const entryLists = {
    'folder-kinds': 'folderKinds',
    'structural-homes': 'structuralHomes',
    'structural-role-tokens': 'structuralRoleTokens',
    'semantic-naming-folder-type-relationships': 'semanticNamingFolderTypeRelationships',
  };

  // The perspective references structural homes, so it fails alongside a broken structural-homes.
  const expectedIds = (name) =>
    name === 'structural-homes' ? ['tree/structural-homes', 'tree/surface-structural-home-perspective'] : [`tree/${name}`];

  for (const [name, listField] of Object.entries(entryLists)) {
    const fileName = `${name}.registry.json`;
    assert.deepEqual(
      invalidIdsAfter('tree', fileName, (payload) => ({ ...payload, [listField]: [null] })),
      expectedIds(name),
      `${name} accepted a null entry`,
    );
    assert.deepEqual(
      invalidIdsAfter('tree', fileName, (payload) => ({
        ...payload,
        [listField]: [...payload[listField], payload[listField][0]],
      })),
      [`tree/${name}`],
      `${name} accepted a duplicated entry`,
    );
  }
});

test('reference edges: perspective homes must be declared; a role belongs to one category', () => {
  assert.deepEqual(
    invalidIdsAfter('tree', 'surface-structural-home-perspective.registry.json', (payload) => ({
      ...payload,
      structuralHomesBySurface: {
        ...payload.structuralHomesBySurface,
        runtime: [{ ...payload.structuralHomesBySurface.runtime[0], structuralHome: 'not-a-home' }],
      },
    })),
    ['tree/surface-structural-home-perspective'],
  );

  assert.deepEqual(
    invalidIdsAfter('naming', 'category-role-perspective.registry.json', (payload) => {
      const [firstCategory, secondCategory] = Object.keys(payload.rolesByCategory);
      const movedRole = payload.rolesByCategory[firstCategory][0];
      return {
        ...payload,
        rolesByCategory: {
          ...payload.rolesByCategory,
          [secondCategory]: [...payload.rolesByCategory[secondCategory], { role: movedRole.role }],
        },
      };
    }),
    ['naming/category-role-perspective'],
  );
});

test('Builtin drift includes registries the Baseline recorded but Builtin no longer has', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    updateJson(paths.manifestPath, (manifest) => {
      manifest.basedOn.registries['naming/retired-registry'] = { ...manifest.basedOn.registries['naming/roles'] };
      return manifest;
    });

    const assessment = assessCustomRegistrySet({ paths, slices });
    assert.equal(assessment.builtinDriftSinceBaseline, true);
    assert.ok(assessment.registries.every((entry) => entry.classification === 'unchanged'));
  }, { copyBuiltin: true });
});

test('reordering keyed Tree vocabularies does not make Custom differ', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    for (const [registryId, listField] of [
      ['tree/folder-kinds', 'folderKinds'],
      ['tree/structural-homes', 'structuralHomes'],
    ]) {
      updateJson(customFile(paths, registryId), (payload) => ({
        ...payload,
        [listField]: [...payload[listField]].reverse(),
      }));
    }

    const assessment = assessCustomRegistrySet({ paths, slices });
    assert.equal(assessment.customDiffers, false);
    assert.equal(classificationOf(assessment, 'tree/folder-kinds'), 'unchanged');
    assert.equal(classificationOf(assessment, 'tree/structural-homes'), 'unchanged');
  }, { copyBuiltin: true });
});

test('Naming validation rejects malformed folder-composition, category, special-case and perspective records', () => {
  assert.deepEqual(
    invalidIdsAfter('naming', 'folder-composition-patterns.registry.json', (payload) => ({
      ...payload,
      folderCompositionPatterns: [null],
    })),
    ['naming/folder-composition-patterns'],
  );
  assert.deepEqual(
    invalidIdsAfter('naming', 'folder-composition-patterns.registry.json', (payload) => ({
      ...payload,
      folderSemanticContextPatterns: 'naming',
    })),
    ['naming/folder-composition-patterns'],
  );
  assert.deepEqual(
    invalidIdsAfter('naming', 'categories.registry.json', (payload) => ({
      ...payload,
      categories: payload.categories.map((entry, index) => (index === 0 ? { ...entry, status: 42 } : entry)),
    })),
    ['naming/categories'],
  );
  assert.deepEqual(
    invalidIdsAfter('naming', 'special-cases.registry.json', (payload) => ({
      ...payload,
      specialCases: [{ ...payload.specialCases[0], match: { suffixEquals: [null] } }, ...payload.specialCases.slice(1)],
    })),
    ['naming/special-cases'],
  );

  const updateFirstPerspectiveRole = (update) => (payload) => {
    const [firstCategory] = Object.keys(payload.rolesByCategory);
    const [firstRole, ...otherRoles] = payload.rolesByCategory[firstCategory];
    return {
      ...payload,
      rolesByCategory: { ...payload.rolesByCategory, [firstCategory]: [update(firstRole), ...otherRoles] },
    };
  };
  assert.deepEqual(
    invalidIdsAfter(
      'naming',
      'category-role-perspective.registry.json',
      updateFirstPerspectiveRole((entry) => ({ ...entry, agnosticCoreMeanings: ['not-a-meaning'] })),
    ),
    ['naming/category-role-perspective'],
  );
  assert.deepEqual(
    invalidIdsAfter(
      'naming',
      'category-role-perspective.registry.json',
      updateFirstPerspectiveRole((entry) => ({ ...entry, inheritsFrom: { category: 'concern-core', role: 'nope' } })),
    ),
    ['naming/category-role-perspective'],
  );
});

test('an unreadable inactive Custom directory is reported, never blocking', (t) => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    const realReaddirSync = fs.readdirSync;
    t.mock.method(fs, 'readdirSync', (directoryPath, ...rest) => {
      if (String(directoryPath).startsWith(paths.customRoot)) {
        throw Object.assign(new Error(`EACCES: permission denied, scandir '${directoryPath}'`), { code: 'EACCES' });
      }

      return realReaddirSync(directoryPath, ...rest);
    });

    let resolution;
    try {
      resolution = resolveActiveRegistrySet({ targetRoot });
    } finally {
      t.mock.restoreAll();
    }

    assert.equal(resolution.activeSet, 'builtin');
    assert.equal(resolution.registrySet.customExists, true);
    assert.deepEqual(resolution.registrySet.orphanRegistries, []);
  });
});

test('Naming validation requires what its runtime can use: every outcome policy and a supported case style', () => {
  assert.deepEqual(
    invalidIdsAfter('naming', 'finding-policy.registry.json', (payload) => {
      const { canonical, ...otherOutcomes } = payload.outcomes;
      return { ...payload, outcomes: otherOutcomes };
    }),
    ['naming/finding-policy'],
  );
  assert.deepEqual(
    invalidIdsAfter('naming', 'case-rules.registry.json', (payload) => ({
      ...payload,
      semanticName: { style: 'snake_case' },
    })),
    ['naming/case-rules'],
  );
});

test('status reports a malformed Custom roles registry as invalid, not custom-modified', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    writeJson(customFile(paths, 'naming/roles'), { version: '1', roles: 'bad' });

    const assessment = assessCustomRegistrySet({ paths, slices });
    assert.equal(classificationOf(assessment, 'naming/roles'), 'invalid');
    assert.deepEqual(
      assessment.customIssues.map((issue) => `${issue.registryId}:${issue.condition}`),
      ['naming/category-role-perspective:invalid', 'naming/roles:invalid'],
    );
  });
});

// ---- state ------------------------------------------------------------------------------------

test('an absent state file means builtin', () => {
  withLifecycleFixture(({ paths }) => {
    assert.deepEqual(readRegistryLifecycleState(paths), { activeSet: 'builtin', stateFileExists: false });
  });
});

test('a malformed or unreadable state file is a lifecycle error', () => {
  withLifecycleFixture(({ paths }) => {
    for (const content of ['{ broken', '{"schemaVersion":"9","activeSet":"builtin"}', '{"schemaVersion":"1","activeSet":"other"}']) {
      fs.mkdirSync(paths.lifecycleRoot, { recursive: true });
      fs.writeFileSync(paths.statePath, content);
      assert.throws(
        () => readRegistryLifecycleState(paths),
        (error) => error instanceof RegistryLifecycleError && error.code === REGISTRY_LIFECYCLE_ERROR_CODE,
      );
    }
  });
});

// ---- init -------------------------------------------------------------------------------------

test('init-custom copies every inventory registry byte for byte, with Baseline and manifest', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    const result = initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    const expectedCount = REGISTRY_LIFECYCLE_SLICES.reduce((sum, slice) => sum + slice.inventory.length, 0);

    assert.equal(result.registryCount, expectedCount);
    assert.equal(result.stateFileCreated, true);
    assert.deepEqual(readJson(paths.statePath), { schemaVersion: '1', activeSet: 'builtin' });

    const manifest = readJson(paths.manifestPath);
    assert.equal(manifest.schemaVersion, '1');
    const manifestIds = Object.keys(manifest.basedOn.registries);
    assert.deepEqual(manifestIds, [...manifestIds].sort());
    assert.equal(manifestIds.length, expectedCount);

    for (const slice of REGISTRY_LIFECYCLE_SLICES) {
      for (const entry of slice.inventory) {
        const builtinBytes = fs.readFileSync(path.join(slice.builtinRoot, entry.fileName));
        assert.ok(builtinBytes.equals(fs.readFileSync(path.join(paths.customRoot, slice.sliceId, entry.fileName))));
        assert.ok(builtinBytes.equals(fs.readFileSync(path.join(paths.baselineRoot, slice.sliceId, entry.fileName))));
        assert.deepEqual(manifest.basedOn.registries[entry.registryId], {
          validatorVersion: VALIDATOR_VERSION,
          version: '1',
          digest: digestRegistryPayload(JSON.parse(builtinBytes.toString('utf8')), entry.descriptor),
        });
      }
    }

    const leftovers = fs.readdirSync(paths.lifecycleRoot).filter((name) => name.startsWith('.custom-init-'));
    assert.deepEqual(leftovers, []);
  });
});

test('init-custom refuses an existing Custom set and never changes an existing state file', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    fs.mkdirSync(paths.lifecycleRoot, { recursive: true });
    const stateBytes = '{"schemaVersion":"1","activeSet":"builtin"}';
    fs.writeFileSync(paths.statePath, stateBytes);

    const result = initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    assert.equal(result.stateFileCreated, false);
    assert.equal(fs.readFileSync(paths.statePath, 'utf8'), stateBytes);

    assert.throws(
      () => initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES }),
      (error) => error instanceof RegistryLifecycleError && /already exists/u.test(error.message),
    );
  });
});

test('init-custom also refuses an empty custom directory', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    fs.mkdirSync(paths.customRoot, { recursive: true });
    assert.throws(() => initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES }), RegistryLifecycleError);
  });
});

// ---- assessment and status ----------------------------------------------------------------------

test('a fresh Custom set is unchanged everywhere and does not differ', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    const assessment = assessCustomRegistrySet({ paths, slices });

    assert.equal(assessment.customExists, true);
    assert.equal(assessment.customDiffers, false);
    assert.deepEqual(assessment.customIssues, []);
    assert.deepEqual(assessment.orphanRegistries, []);
    assert.equal(assessment.builtinDriftSinceBaseline, false);
    assert.deepEqual(assessment.basedOn, {
      builtinSetDigest: digestRegistrySet(digestBuiltinRegistrySet({ slices })),
      validatorVersions: [VALIDATOR_VERSION],
    });
    assert.ok(assessment.registries.every((entry) => entry.classification === 'unchanged'));
    assert.ok(assessment.registries.every((entry) => entry.baselineMismatch === false));
  }, { copyBuiltin: true });
});

test('reordering a set-like array or reformatting a file does not make Custom differ', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    const filePath = customFile(paths, 'naming/reportable-extensions');
    const payload = readJson(filePath);
    fs.writeFileSync(
      filePath,
      JSON.stringify({ reportableExtensions: [...payload.reportableExtensions].reverse(), version: payload.version }),
    );

    const assessment = assessCustomRegistrySet({ paths, slices });
    assert.equal(assessment.customDiffers, false);
    assert.equal(classificationOf(assessment, 'naming/reportable-extensions'), 'unchanged');
  }, { copyBuiltin: true });
});

test('classifies custom-modified, builtin-changed, both-changed and aligned against the Baseline', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    const addExtension = (extension) => (payload) => ({
      ...payload,
      reportableExtensions: [...payload.reportableExtensions, extension],
    });
    const addRootFile = (fileName) => (payload) => ({
      ...payload,
      reportableRootFiles: [...payload.reportableRootFiles, fileName],
    });

    updateJson(customFile(paths, 'naming/reportable-extensions'), addExtension('.py'));
    updateJson(builtinFile(slices, 'naming/reportable-root-files'), addRootFile('builtin-only.json'));
    updateJson(customFile(paths, 'tree/repo-shape-policy'), (payload) => ({ ...payload, customOnly: true }));
    updateJson(builtinFile(slices, 'tree/repo-shape-policy'), (payload) => ({ ...payload, builtinOnly: true }));
    updateJson(customFile(paths, 'suite/exit-policy'), (payload) => ({ ...payload, both: true }));
    updateJson(builtinFile(slices, 'suite/exit-policy'), (payload) => ({ ...payload, both: true }));

    const assessment = assessCustomRegistrySet({ paths, slices });

    assert.equal(classificationOf(assessment, 'naming/reportable-extensions'), 'custom-modified');
    assert.equal(classificationOf(assessment, 'naming/reportable-root-files'), 'builtin-changed');
    assert.equal(classificationOf(assessment, 'tree/repo-shape-policy'), 'both-changed');
    assert.equal(classificationOf(assessment, 'suite/exit-policy'), 'aligned');
    assert.equal(classificationOf(assessment, 'naming/roles'), 'unchanged');
    assert.equal(assessment.customDiffers, true);
    assert.equal(assessment.builtinDriftSinceBaseline, true);
    assert.deepEqual(assessment.customIssues, []);
  }, { copyBuiltin: true });
});

test('missing, invalid, version-incompatible and orphan registries are classified and reported', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    fs.rmSync(customFile(paths, 'naming/case-rules'));
    fs.writeFileSync(customFile(paths, 'naming/categories'), '{ broken');
    updateJson(customFile(paths, 'naming/reportable-extensions'), (payload) => ({
      ...payload,
      reportableExtensions: ['no-dot'],
    }));
    updateJson(customFile(paths, 'naming/summary-buckets'), (payload) => ({ ...payload, version: '2' }));
    writeJson(path.join(paths.customRoot, 'naming', 'extra.registry.json'), { version: '1' });

    const assessment = assessCustomRegistrySet({ paths, slices });

    assert.equal(classificationOf(assessment, 'naming/case-rules'), 'missing');
    assert.equal(classificationOf(assessment, 'naming/categories'), 'invalid');
    assert.equal(classificationOf(assessment, 'naming/reportable-extensions'), 'invalid');
    assert.equal(classificationOf(assessment, 'naming/summary-buckets'), 'version-incompatible');
    assert.equal(classificationOf(assessment, 'naming/extra'), 'orphan');
    assert.deepEqual(assessment.orphanRegistries, ['naming/extra']);
    assert.equal(assessment.customDiffers, true);

    const caseRulesEntry = assessment.registries.find((entry) => entry.registryId === 'naming/case-rules');
    assert.equal(caseRulesEntry.customDigest, null);

    const orphanEntry = assessment.registries.find((entry) => entry.registryId === 'naming/extra');
    assert.equal(orphanEntry.builtinDigest, null);
    assert.equal(orphanEntry.baselineMismatch, null);

    const issueKeys = assessment.customIssues.map((issue) => `${issue.registryId}:${issue.condition}`);
    assert.ok(issueKeys.includes('naming/case-rules:missing'));
    assert.ok(issueKeys.includes('naming/categories:invalid'));
    assert.ok(issueKeys.includes('naming/reportable-extensions:invalid'));
    assert.ok(issueKeys.includes('naming/summary-buckets:version-incompatible'));
    assert.deepEqual(issueKeys, [...issueKeys].sort());

    for (const entry of assessment.registries) {
      assert.ok(STATUS_CLASSIFICATIONS.includes(entry.classification), entry.registryId);
    }
  }, { copyBuiltin: true });
});

test('a broken referenced registry also fails the registries validated against it', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    fs.writeFileSync(customFile(paths, 'naming/categories'), '{ broken');

    const invalidIds = assessCustomRegistrySet({ paths, slices })
      .customIssues.filter((issue) => issue.condition === 'invalid')
      .map((issue) => issue.registryId);
    assert.deepEqual(invalidIds, ['naming/categories', 'naming/category-role-perspective']);
  }, { copyBuiltin: true });
});

test('a malformed manifest makes Baseline comparison unavailable and sorts its issue first', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    fs.rmSync(customFile(paths, 'naming/case-rules'));
    fs.writeFileSync(paths.manifestPath, '{ broken');

    const assessment = assessCustomRegistrySet({ paths, slices });

    assert.equal(assessment.customIssues[0].registryId, null);
    assert.equal(assessment.customIssues[0].condition, 'manifest-malformed');
    assert.equal(assessment.basedOn, undefined);
    assert.equal(assessment.builtinDriftSinceBaseline, undefined);
    assert.equal(classificationOf(assessment, 'naming/roles'), 'baseline-unavailable');
    assert.equal(classificationOf(assessment, 'naming/case-rules'), 'missing');

    const rolesEntry = assessment.registries.find((entry) => entry.registryId === 'naming/roles');
    assert.equal(rolesEntry.baselineDigest, null);
    assert.equal(rolesEntry.baselineMismatch, null);
  }, { copyBuiltin: true });
});

test('a manifest without an entry for a present Custom registry is malformed', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    updateJson(paths.manifestPath, (manifest) => {
      delete manifest.basedOn.registries['naming/roles'];
      return manifest;
    });

    const assessment = assessCustomRegistrySet({ paths, slices });
    assert.equal(assessment.customIssues[0].condition, 'manifest-malformed');
    assert.match(assessment.customIssues[0].detail, /naming\/roles/u);
  }, { copyBuiltin: true });
});

test('a tampered or missing Baseline copy is a baseline-mismatch issue', () => {
  withLifecycleFixture(({ targetRoot, paths, slices }) => {
    initFixture({ targetRoot, slices });
    updateJson(path.join(paths.baselineRoot, 'naming', 'roles.registry.json'), (payload) => ({
      ...payload,
      tampered: true,
    }));
    fs.rmSync(path.join(paths.baselineRoot, 'suite', 'exit-policy.registry.json'));

    const assessment = assessCustomRegistrySet({ paths, slices });
    const mismatches = assessment.customIssues.filter((issue) => issue.condition === 'baseline-mismatch');

    assert.deepEqual(mismatches.map((issue) => issue.registryId), ['naming/roles', 'suite/exit-policy']);
    assert.equal(
      assessment.registries.find((entry) => entry.registryId === 'naming/roles').baselineMismatch,
      true,
    );
  }, { copyBuiltin: true });
});

test('status reports the state file active set with the assessment, deterministically', () => {
  withLifecycleFixture(({ targetRoot }) => {
    assert.deepEqual(buildRegistryLifecycleStatus({ targetRoot }), {
      activeSet: 'builtin',
      customExists: false,
      customDiffers: false,
      orphanRegistries: [],
      customIssues: [],
      registries: [],
    });

    initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    const first = buildRegistryLifecycleStatus({ targetRoot });
    const second = buildRegistryLifecycleStatus({ targetRoot });
    assert.deepEqual(first, second);
    assert.equal(first.customExists, true);
    assert.equal(first.registries.length, Object.keys(readJson(resolveRegistryLifecyclePaths({ targetRoot }).manifestPath).basedOn.registries).length);
  });
});

// ---- resolution -------------------------------------------------------------------------------

test('without a Custom set, resolution returns Builtin roots and builtin provenance and writes nothing', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    const resolution = resolveActiveRegistrySet({ targetRoot });

    assert.equal(resolution.activeSet, 'builtin');
    assert.deepEqual(resolution.registryRoots, getBuiltinRegistryRoots());
    assert.equal(resolution.customRegistryRoots, undefined);
    assert.deepEqual(resolution.registrySet, {
      activeSet: 'builtin',
      customExists: false,
      customDiffers: false,
      orphanRegistries: [],
      customIssues: [],
      resolvedSetDigest: digestRegistrySet(digestBuiltinRegistrySet()),
    });
    assert.deepEqual(Object.keys(resolution.registryProvenance), ['naming', 'tree', 'suite']);
    for (const sliceProvenance of Object.values(resolution.registryProvenance)) {
      for (const entry of Object.values(sliceProvenance)) {
        assert.equal(entry.source, 'builtin');
        assert.match(entry.digest, /^[a-f0-9]{64}$/u);
      }
    }
    assert.equal(fs.existsSync(paths.lifecycleRoot), false);
  });
});

test('an inactive Custom set is reported but never resolved or blocking', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    const withoutCustom = resolveActiveRegistrySet({ targetRoot });
    initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    fs.writeFileSync(customFile(paths, 'naming/finding-policy'), '{ broken');

    const resolution = resolveActiveRegistrySet({ targetRoot });

    assert.equal(resolution.activeSet, 'builtin');
    assert.deepEqual(resolution.registryRoots, getBuiltinRegistryRoots());
    assert.equal(resolution.registrySet.customExists, true);
    assert.equal(resolution.registrySet.customDiffers, true);
    assert.deepEqual(
      resolution.registrySet.customIssues.map((issue) => `${issue.registryId}:${issue.condition}`),
      ['naming/finding-policy:invalid'],
    );
    assert.equal(resolution.registrySet.resolvedSetDigest, withoutCustom.registrySet.resolvedSetDigest);
    assert.deepEqual(resolution.registryProvenance, withoutCustom.registryProvenance);
    // An invalid Custom set does not resolve validly, so no Custom roots are exposed (spec §11.3).
    assert.equal(resolution.customRegistryRoots, undefined);
  });
});

test('Custom roots are exposed only when the Custom set resolves validly; baseline-mismatch does not block', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    assert.equal(resolveActiveRegistrySet({ targetRoot }).customRegistryRoots.naming, path.join(paths.customRoot, 'naming'));

    updateJson(path.join(paths.baselineRoot, 'naming', 'roles.registry.json'), (payload) => ({ ...payload, tampered: true }));
    const withMismatch = resolveActiveRegistrySet({ targetRoot });
    assert.deepEqual(withMismatch.registrySet.customIssues.map((issue) => issue.condition), ['baseline-mismatch']);
    assert.equal(withMismatch.customRegistryRoots.naming, path.join(paths.customRoot, 'naming'));
  });
});

test('registryDigests.custom falls back to builtin when the Custom set is invalid outside the Naming payload', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    updateJson(customFile(paths, 'naming/reportable-extensions'), (payload) => ({
      ...payload,
      reportableExtensions: [...payload.reportableExtensions, '.py'],
    }));
    const validDigests = prepareNamingRuntimeInputs({ registryResolution: resolveActiveRegistrySet({ targetRoot }) })
      .registry.registryDigests;
    assert.notEqual(validDigests.custom, validDigests.builtin);

    fs.writeFileSync(customFile(paths, 'naming/special-cases'), '{ broken');
    const invalidDigests = prepareNamingRuntimeInputs({ registryResolution: resolveActiveRegistrySet({ targetRoot }) })
      .registry.registryDigests;
    assert.equal(invalidDigests.custom, invalidDigests.builtin);
  });
});

test('while the activation gate is closed, a state selecting custom is a lifecycle error', () => {
  assert.equal(CUSTOM_ACTIVATION_AVAILABLE, false);

  withLifecycleFixture(({ targetRoot, paths }) => {
    initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });
    writeJson(paths.statePath, { schemaVersion: '1', activeSet: 'custom' });

    assert.throws(
      () => resolveActiveRegistrySet({ targetRoot }),
      (error) =>
        error instanceof RegistryLifecycleError &&
        error.code === REGISTRY_LIFECYCLE_ERROR_CODE &&
        /Custom activation is not available yet/u.test(error.message),
    );
  });
});

test('a fixture Custom set equal to the legacy custom mode reproduces its Naming digest', () => {
  withLifecycleFixture(({ targetRoot, paths }) => {
    initFixture({ targetRoot, slices: REGISTRY_LIFECYCLE_SLICES });

    const legacyRoles = readJson(path.join(LEGACY_CUSTOM_FIXTURE_ROOT, 'roles.registry.custom.json'));
    const legacyExtensions = readJson(
      path.join(LEGACY_CUSTOM_FIXTURE_ROOT, 'reportable-extensions.registry.custom.json'),
    );
    const rolesByCategory = {};
    for (const { role, category, notes } of legacyRoles) {
      rolesByCategory[category] ??= [];
      rolesByCategory[category].push(notes === undefined ? { role } : { role, notes });
    }
    writeJson(customFile(paths, 'naming/category-role-perspective'), { version: '1', rolesByCategory });
    writeJson(customFile(paths, 'naming/roles'), {
      version: '1',
      roles: legacyRoles.map(({ role, status }) => ({ role, status })),
    });
    writeJson(customFile(paths, 'naming/reportable-extensions'), {
      version: '1',
      reportableExtensions: legacyExtensions,
    });

    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const runtimeInputs = prepareNamingRuntimeInputs({ registryResolution });

    assert.equal(runtimeInputs.registry.registryDigests.custom, LEGACY_CUSTOM_SET_DIGEST);
    assert.equal(runtimeInputs.registry.registryDigests.resolved, runtimeInputs.registry.registryDigests.builtin);
    assert.equal(runtimeInputs.registry.registrySource, 'builtin');
  });
});
