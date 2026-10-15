import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { buildRegistryUpdateDecisionsTemplate } from '../src/core/registry-lifecycle/registry-lifecycle-decisions.logic.mjs';
import { buildRegistryLifecycleDiff } from '../src/core/registry-lifecycle/registry-lifecycle-diff.logic.mjs';
import { extractComparisonEntries } from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { applyRegistryUpdateDecisions } from '../src/core/registry-lifecycle/registry-lifecycle-update.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { LIFECYCLE_TRANSACTION_SIMULATED_CRASH } from '../src/core/registry-lifecycle/registry-lifecycle-transaction.logic.mjs';
import { LIFECYCLE_TRANSACTION_DIRNAME } from '../src/core/registry-lifecycle/registry-lifecycle.contracts.mjs';

const VALIDATOR_VERSION = '9.9.9-test';
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};
const updateJson = (filePath, update) => writeJson(filePath, update(readJson(filePath)));

// Every file under `root` with its bytes, so "nothing changed" is checked byte for byte.
const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      return [relativePath, fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });

// A target with a Custom set made by an older release that lacked `missingIds`: they are absent
// from Custom, its Baseline copy and its manifest, so the current Builtin reports them
// `registry-added`. These are real inventory registries, so the real slice validation applies.
// `mapSlices` adjusts the inventory `update` sees, for a capability no registry declares.
const withAddedRegistries = (run, { missingIds = ['naming/case-rules'], mapSlices = (slices) => slices } = {}) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-update-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const slices = mapSlices(
    REGISTRY_LIFECYCLE_SLICES.map((slice) => {
      const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
      fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
      return { ...slice, builtinRoot };
    }),
  );

  try {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-old', slices });
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const fileIn = (root) => (registryId) => {
      const [sliceId, name] = registryId.split('/');
      return path.join(root, sliceId, `${name}.registry.json`);
    };
    const builtinFile = fileIn(path.join(fixtureRoot, 'builtin'));
    const customFile = fileIn(paths.customRoot);
    const baselineFile = fileIn(paths.baselineRoot);
    for (const registryId of missingIds) {
      fs.rmSync(customFile(registryId));
      fs.rmSync(baselineFile(registryId));
    }
    updateJson(paths.manifestPath, (manifest) => {
      for (const registryId of missingIds) {
        delete manifest.basedOn.registries[registryId];
      }
      return manifest;
    });

    return run({
      targetRoot,
      paths,
      slices,
      builtinFile,
      customFile,
      baselineFile,
      template: () => buildRegistryUpdateDecisionsTemplate({ targetRoot, slices }),
      update: (document, options = {}) =>
        applyRegistryUpdateDecisions({ loadDocument: () => document, targetRoot, slices, validatorVersion: VALIDATOR_VERSION, ...options }),
      diff: () => buildRegistryLifecycleDiff({ targetRoot, slices }),
      status: () => buildRegistryLifecycleStatus({ targetRoot, slices }),
    });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const decide = (document, decisions) => {
  for (const record of document.registries) {
    if (Object.hasOwn(decisions, record.registryId)) {
      record.decision = decisions[record.registryId];
    }
  }
  return document;
};

const transactionRoot = (paths) => path.join(paths.lifecycleRoot, LIFECYCLE_TRANSACTION_DIRNAME);
const registryOf = (result, registryId) => result.registries.find((registry) => registry.registryId === registryId);

// ---- success ----------------------------------------------------------------------------------

test('inherit advances the Custom file, its Baseline copy and its manifest entry together, and nothing else', () => {
  withAddedRegistries(({ paths, builtinFile, customFile, baselineFile, template, update, diff, status }) => {
    fs.writeFileSync(paths.statePath, '{"schemaVersion":"1","activeSet":"builtin"}\n');
    const document = decide(template(), { 'naming/case-rules': 'inherit' });
    assert.equal(registryOf(diff(), 'naming/case-rules').class, 'registry-added');
    const builtinDigest = document.registries[0].basedOn.builtinDigest;
    const manifestBefore = readJson(paths.manifestPath);
    const stateBefore = fs.readFileSync(paths.statePath);
    const targets = new Set([
      path.relative(paths.lifecycleRoot, customFile('naming/case-rules')),
      path.relative(paths.lifecycleRoot, baselineFile('naming/case-rules')),
      path.relative(paths.lifecycleRoot, paths.manifestPath),
    ]);
    const othersBefore = snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !targets.has(relativePath));

    assert.deepEqual(update(document), { applied: ['naming/case-rules'], skipped: [] });

    const builtinBytes = fs.readFileSync(builtinFile('naming/case-rules'));
    assert.deepEqual(fs.readFileSync(customFile('naming/case-rules')), builtinBytes);
    assert.deepEqual(fs.readFileSync(baselineFile('naming/case-rules')), builtinBytes);
    const manifest = readJson(paths.manifestPath);
    assert.deepEqual(manifest.basedOn.registries['naming/case-rules'], {
      validatorVersion: VALIDATOR_VERSION,
      version: readJson(builtinFile('naming/case-rules')).version,
      digest: builtinDigest,
    });
    const { ['naming/case-rules']: added, ...others } = manifest.basedOn.registries;
    assert.ok(added);
    assert.deepEqual(others, manifestBefore.basedOn.registries);
    const ids = Object.keys(manifest.basedOn.registries);
    assert.deepEqual(ids, [...ids].sort((left, right) => (left < right ? -1 : 1)));

    assert.deepEqual(
      snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !targets.has(relativePath)),
      othersBefore,
      'no other file changed',
    );
    assert.deepEqual(fs.readFileSync(paths.statePath), stateBefore);
    assert.equal(fs.existsSync(transactionRoot(paths)), false);

    assert.equal(registryOf(diff(), 'naming/case-rules').class, 'unchanged');
    const after = status();
    assert.equal(registryOf(after, 'naming/case-rules').classification, 'unchanged');
    assert.equal(registryOf(after, 'naming/case-rules').baselineMismatch, false);
    assert.deepEqual(after.customIssues, []);
    assert.deepEqual(template().registries, [], 'nothing is left to decide');
  });
});

test('several registries are applied one transaction each, in id order', () => {
  withAddedRegistries(
    ({ template, update, status }) => {
      const document = decide(template(), { 'naming/special-cases': 'inherit', 'naming/case-rules': 'inherit' });
      document.registries.reverse();
      assert.deepEqual(update(document), { applied: ['naming/case-rules', 'naming/special-cases'], skipped: [] });
      assert.deepEqual(status().customIssues, []);
    },
    { missingIds: ['naming/case-rules', 'naming/special-cases'] },
  );
});

// ---- what is not applied ----------------------------------------------------------------------

test('null is never a decision: an undecided registry or entry is skipped, and nothing is written', () => {
  withAddedRegistries(({ paths, builtinFile, customFile, template, update }) => {
    for (const file of [builtinFile, customFile]) {
      updateJson(file('naming/reportable-extensions'), (payload) => ({
        ...payload,
        reportableExtensions: [...payload.reportableExtensions, file === builtinFile ? '.py' : '.rb'],
      }));
    }
    updateJson(builtinFile('naming/reportable-root-files'), (payload) => ({
      ...payload,
      reportableRootFiles: [...payload.reportableRootFiles, 'NOTICE', 'AUTHORS'],
    }));

    // One of the two root-file entries is decided; the other stays null, so the record is skipped.
    const document = template();
    const partly = document.registries.find((record) => record.registryId === 'naming/reportable-root-files');
    partly.entries[0].decision = 'take-builtin';
    const before = snapshotTree(paths.lifecycleRoot);

    assert.deepEqual(update(document), {
      applied: [],
      skipped: [
        { registryId: 'naming/case-rules', reason: 'undecided' },
        { registryId: 'naming/reportable-extensions', reason: 'undecided' },
        { registryId: 'naming/reportable-root-files', reason: 'undecided' },
      ],
    });
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('an invalid or stale document is refused before anything is written', () => {
  withAddedRegistries(({ paths, builtinFile, template, update }) => {
    const document = decide(template(), { 'naming/case-rules': 'inherit' });
    const before = snapshotTree(paths.lifecycleRoot);

    const unsupported = structuredClone(document);
    unsupported.registries[0].decision = 'take-builtin';
    assert.deepEqual(
      update(unsupported).problems.map((item) => item.problem),
      ['unsupported-decision'],
    );

    updateJson(builtinFile('naming/case-rules'), (payload) => ({ ...payload, semanticName: { ...payload.semanticName, note: 'later' } }));
    const stale = update(document);
    assert.deepEqual(stale.applied, []);
    assert.deepEqual(stale.problems.map((item) => [item.registryId, item.problem]), [['naming/case-rules', 'stale']]);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('a Builtin registry the slice rejects, or whose version this engine cannot read, is refused', () => {
  withAddedRegistries(({ paths, builtinFile, template, update }) => {
    const before = snapshotTree(paths.lifecycleRoot);
    updateJson(builtinFile('naming/case-rules'), (payload) => ({ ...payload, semanticName: { style: 'SHOUTING' } }));
    const invalid = update(decide(template(), { 'naming/case-rules': 'inherit' }));
    assert.deepEqual(invalid.applied, []);
    assert.deepEqual([invalid.failed.sliceId, invalid.failed.registryIds], ['naming', ['naming/case-rules']]);
    assert.match(invalid.failed.detail, /naming registry-set validation fails with the updated registries \(naming\/case-rules\)/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);

    updateJson(builtinFile('naming/case-rules'), (payload) => ({ ...payload, semanticName: { style: 'kebab-case' }, version: '99' }));
    const unreadable = update(decide(template(), { 'naming/case-rules': 'inherit' }));
    assert.match(unreadable.failed.detail, /Builtin version "99" is not readable/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('a failed slice advances none of its registries, however many of them are valid', () => {
  withAddedRegistries(
    ({ paths, builtinFile, template, update, status }) => {
      updateJson(builtinFile('naming/special-cases'), (payload) => ({ ...payload, specialCases: 'not-a-list' }));
      const before = snapshotTree(paths.lifecycleRoot);
      const result = update(decide(template(), { 'naming/special-cases': 'inherit', 'naming/case-rules': 'inherit' }));
      assert.deepEqual(result.applied, []);
      assert.deepEqual(result.failed.registryIds, ['naming/case-rules', 'naming/special-cases']);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
      assert.equal(registryOf(status(), 'naming/case-rules').classification, 'missing');
      assert.equal(registryOf(status(), 'naming/special-cases').classification, 'missing');
    },
    { missingIds: ['naming/case-rules', 'naming/special-cases'] },
  );
});

// ---- failure atomicity ------------------------------------------------------------------------

// Every step boundary of one registry's transaction (spec §4.6). A stray `.baseline/` copy makes the
// first target pre-exist, so its backup step occurs too; the manifest always pre-exists.
const STEP_BOUNDARIES = [
  'staged',
  'journaled',
  'directories-created',
  'step-0:backed-up',
  'step-0:applied',
  'step-1:applied',
  'step-2:backed-up',
];

test('an error at any step before the commit point leaves the registry exactly as it was', () => {
  for (const boundary of STEP_BOUNDARIES) {
    withAddedRegistries(({ paths, baselineFile, template, update, status }) => {
      writeJson(baselineFile('naming/case-rules'), { stray: true });
      const document = decide(template(), { 'naming/case-rules': 'inherit' });
      const before = snapshotTree(paths.lifecycleRoot);
      const statusBefore = status();

      const result = update(document, {
        onTransactionStep: (step) => {
          if (step === boundary) {
            throw new Error(`injected at ${step}`);
          }
        },
      });

      assert.deepEqual(result.applied, [], boundary);
      assert.equal(result.failed.detail, `injected at ${boundary}`, boundary);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before, boundary);
      assert.equal(fs.existsSync(transactionRoot(paths)), false, boundary);
      assert.deepEqual(status(), statusBefore, boundary);
    });
  }
});

test('a crash at any step leaves a recoverable state that is never trusted as advanced', () => {
  for (const boundary of [...STEP_BOUNDARIES, 'committed']) {
    withAddedRegistries(({ paths, baselineFile, customFile, template, update, status, diff }) => {
      writeJson(baselineFile('naming/case-rules'), { stray: true });
      const document = decide(template(), { 'naming/case-rules': 'inherit' });
      const before = snapshotTree(paths.lifecycleRoot);
      const crash = (step) => {
        if (step === boundary) {
          throw Object.assign(new Error(`crash at ${step}`), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
        }
      };

      assert.throws(() => update(document, { onTransactionStep: crash }), /crash at/u, boundary);
      assert.equal(fs.existsSync(transactionRoot(paths)), true, boundary);

      // Before the commit point, no partial state reads as an advanced registry.
      const crashed = registryOf(status(), 'naming/case-rules');
      if (boundary === 'committed') {
        assert.equal(crashed.classification, 'unchanged', boundary);
      } else {
        assert.notEqual(crashed.classification, 'unchanged', boundary);
        // The manifest is the commit point: before it, no Baseline entry trusts the new files.
        const manifestNow = fs.existsSync(paths.manifestPath) ? readJson(paths.manifestPath) : null;
        assert.equal(Object.hasOwn(manifestNow?.basedOn.registries ?? {}, 'naming/case-rules'), false, boundary);
        const partialIsVisible =
          snapshotTree(paths.lifecycleRoot).some(([relativePath]) => relativePath.startsWith(LIFECYCLE_TRANSACTION_DIRNAME)) &&
          (!fs.existsSync(customFile('naming/case-rules')) || status().customIssues.some((issue) => issue.condition === 'manifest-malformed'));
        assert.ok(partialIsVisible, boundary);
      }

      // The next update recovers first, then applies the same, still current, document.
      const rerun = update(document);
      assert.deepEqual(rerun.recovered, { outcome: boundary === 'committed' ? 'committed' : 'rolled-back' }, boundary);
      if (boundary === 'committed') {
        assert.deepEqual(rerun.problems.map((item) => item.problem), ['not-decidable'], boundary);
      } else {
        assert.deepEqual(rerun.applied, ['naming/case-rules'], boundary);
      }
      assert.equal(fs.existsSync(transactionRoot(paths)), false, boundary);
      assert.equal(registryOf(diff(), 'naming/case-rules').class, 'unchanged', boundary);
      assert.deepEqual(status().customIssues, [], boundary);
      assert.notDeepEqual(snapshotTree(paths.lifecycleRoot), before, boundary);
    });
  }
});

test('recovery alone restores the pre-command state after a crash before the commit point', () => {
  withAddedRegistries(({ paths, template, update }) => {
    const document = decide(template(), { 'naming/case-rules': 'inherit' });
    const before = snapshotTree(paths.lifecycleRoot);
    assert.throws(() =>
      update(document, {
        onTransactionStep: (step) => {
          if (step === 'step-2:backed-up') {
            throw Object.assign(new Error('crash'), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
          }
        },
      }),
    );
    assert.equal(fs.existsSync(paths.manifestPath), false, 'the manifest is in the backup at this point');

    // An invalid document still triggers recovery first, then is refused.
    const refused = update({ kind: 'nope' });
    assert.deepEqual(refused.recovered, { outcome: 'rolled-back' });
    assert.deepEqual(refused.applied, []);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('recovery runs before the document is read, even when it cannot be read', () => {
  withAddedRegistries(({ targetRoot, slices, paths, template, update }) => {
    const document = decide(template(), { 'naming/case-rules': 'inherit' });
    const before = snapshotTree(paths.lifecycleRoot);
    assert.throws(() =>
      update(document, {
        onTransactionStep: (step) => {
          if (step === 'step-1:applied') {
            throw Object.assign(new Error('crash'), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
          }
        },
      }),
    );

    assert.throws(
      () =>
        applyRegistryUpdateDecisions({
          targetRoot,
          slices,
          validatorVersion: VALIDATOR_VERSION,
          loadDocument: () => JSON.parse('{ broken'),
        }),
      /Cannot read the decisions document: .*An interrupted transaction was recovered first \(rolled-back\)\./u,
    );
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('a journal path that escapes through a symlink is refused before the commit target is read', () => {
  withAddedRegistries(({ paths, template, update }) => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-update-journal-')));
    try {
      const outsideManifest = path.join(outside, 'registry-set.manifest.json');
      fs.writeFileSync(outsideManifest, 'outside bytes');
      fs.symlinkSync(outside, path.join(paths.customRoot, 'escape'));
      fs.mkdirSync(transactionRoot(paths));
      fs.writeFileSync(
        path.join(transactionRoot(paths), 'journal.json'),
        JSON.stringify({
          schemaVersion: '1',
          steps: [
            {
              target: 'custom/escape/registry-set.manifest.json',
              original: { kind: 'file', sha256: '0'.repeat(64) },
              // The outside file's bytes: a commit check that followed the link would report `committed`.
              sha256: createHash('sha256').update('outside bytes').digest('hex'),
            },
          ],
          createdDirectories: [],
        }),
      );
      const before = snapshotTree(paths.lifecycleRoot);

      assert.throws(() => update(decide(template(), { 'naming/case-rules': 'inherit' })), /resolves outside the validation target/u);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before, 'the transaction evidence is kept');
      assert.equal(fs.readFileSync(outsideManifest, 'utf8'), 'outside bytes');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('a malformed journal is never guessed at', () => {
  withAddedRegistries(({ paths, template, update }) => {
    fs.mkdirSync(transactionRoot(paths));
    fs.writeFileSync(path.join(transactionRoot(paths), 'journal.json'), '{"schemaVersion":"1"}');
    const before = snapshotTree(paths.lifecycleRoot);
    assert.throws(() => update(decide(template(), { 'naming/case-rules': 'inherit' })), /journal is malformed/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('slice validation never reads a Custom file through a path that escapes the target', () => {
  withAddedRegistries(({ customFile, template, update }) => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-update-outside-')));
    const outsideFile = path.join(outside, 'roles.registry.json');
    fs.copyFileSync(customFile('naming/roles'), outsideFile);
    fs.rmSync(customFile('naming/roles'));
    fs.symlinkSync(outsideFile, customFile('naming/roles'));
    const document = decide(template(), { 'naming/case-rules': 'inherit' });

    // Records every read or copy that lands outside the target.
    const reads = [];
    const originals = { readFileSync: fs.readFileSync, copyFileSync: fs.copyFileSync, cpSync: fs.cpSync };
    const record = (candidate) => {
      try {
        if (typeof candidate === 'string' && fs.realpathSync(candidate).startsWith(outside)) {
          reads.push(candidate);
        }
      } catch {
        // Not a path that exists: not an escaping read.
      }
    };
    fs.readFileSync = (filePath, ...rest) => (record(filePath), originals.readFileSync(filePath, ...rest));
    fs.copyFileSync = (source, ...rest) => (record(source), originals.copyFileSync(source, ...rest));
    fs.cpSync = (source, ...rest) => (record(source), originals.cpSync(source, ...rest));
    let result;
    try {
      result = update(document);
    } finally {
      Object.assign(fs, originals);
      fs.rmSync(outside, { recursive: true, force: true });
    }

    assert.deepEqual(result.applied, ['naming/case-rules'], JSON.stringify(result));
    assert.deepEqual(reads, []);
  });
});

// ---- active set -------------------------------------------------------------------------------

test('update never reads or writes registry-state.json', () => {
  withAddedRegistries(({ targetRoot, slices, paths, template, update }) => {
    const document = decide(template(), { 'naming/case-rules': 'inherit' });
    fs.writeFileSync(paths.statePath, '{ not json');
    assert.deepEqual(update(document).applied, ['naming/case-rules']);
    assert.equal(fs.readFileSync(paths.statePath, 'utf8'), '{ not json');

    useRegistrySet({ targetRoot, activeSet: 'custom', slices });
    const state = fs.readFileSync(paths.statePath);
    assert.deepEqual(update(template()), { applied: [], skipped: [] });
    assert.deepEqual(fs.readFileSync(paths.statePath), state);
  });
});

test('update needs a Validator version and a Custom set', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-update-none-'));
  try {
    assert.throws(() => applyRegistryUpdateDecisions({ targetRoot, loadDocument: () => ({}) }), /needs the Validator version/u);
    assert.throws(
      () => applyRegistryUpdateDecisions({ targetRoot, loadDocument: () => ({}), validatorVersion: VALIDATOR_VERSION }),
      /No Custom registry set exists/u,
    );
    assert.equal(fs.existsSync(path.join(targetRoot, '.calculogic')), false);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

// ---- entry decisions (spec §12.5, §12.6) --------------------------------------------------------

// Decides every entry of `registryId`'s record with `choose(address, class)`.
const decideEntries = (document, registryId, choose) => {
  const record = document.registries.find((candidate) => candidate.registryId === registryId);
  record.entries.forEach((entry) => (entry.decision = choose(entry.address, entry.class)));
  return document;
};
const entryClasses = (diffResult, registryId) =>
  Object.fromEntries((registryOf(diffResult, registryId).entries ?? []).map((entry) => [entry.address, entry.class]));

// Builtin adds `.py` and drops `.js`; Custom independently adds `.rb`. Builtin also inserts an exit
// policy before `default-success`, which changes the ordered collection's order entry.
const withContentChanges = (run) =>
  withAddedRegistries(
    (fixture) => {
      const { builtinFile, customFile } = fixture;
      updateJson(builtinFile('naming/reportable-extensions'), (payload) => ({
        ...payload,
        reportableExtensions: [...payload.reportableExtensions.filter((extension) => extension !== '.js'), '.py'],
      }));
      updateJson(customFile('naming/reportable-extensions'), (payload) => ({
        ...payload,
        reportableExtensions: [...payload.reportableExtensions, '.rb'],
      }));
      updateJson(builtinFile('suite/exit-policy'), (payload) => ({
        ...payload,
        policies: [...payload.policies.slice(0, -1), { id: 'review', exitCode: 3, predicate: { strictMode: true } }, payload.policies.at(-1)],
      }));
      return run(fixture);
    },
    { missingIds: [] },
  );

test('entry decisions: take-builtin entries align, keep-custom entries become custom-only, and the Baseline advances whole', () => {
  withContentChanges(({ paths, builtinFile, customFile, baselineFile, template, update, diff, status }) => {
    assert.deepEqual(entryClasses(diff(), 'naming/reportable-extensions'), {
      'reportableExtensions[".js"]': 'builtin-removed',
      'reportableExtensions[".py"]': 'builtin-added',
      'reportableExtensions[".rb"]': 'custom-only',
    });
    assert.deepEqual(entryClasses(diff(), 'suite/exit-policy'), {
      'policies#order': 'builtin-changed',
      'policies[id="review"]': 'builtin-added',
    });

    const document = template();
    decideEntries(document, 'naming/reportable-extensions', (address) =>
      address === 'reportableExtensions[".py"]' ? 'take-builtin' : 'keep-custom',
    );
    decideEntries(document, 'suite/exit-policy', () => 'take-builtin');
    const stateBefore = fs.readFileSync(paths.statePath);
    const changedIds = ['naming/reportable-extensions', 'suite/exit-policy'];
    const targets = new Set([
      ...changedIds.flatMap((registryId) => [customFile(registryId), baselineFile(registryId)]),
      paths.manifestPath,
    ].map((target) => path.relative(paths.lifecycleRoot, target)));
    const othersBefore = snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !targets.has(relativePath));
    const manifestBefore = readJson(paths.manifestPath);

    assert.deepEqual(update(document), { applied: changedIds, skipped: [] });

    // Custom: `.py` taken, `.js` kept although Builtin removed it, `.rb` (custom-only) untouched.
    assert.deepEqual(readJson(customFile('naming/reportable-extensions')).reportableExtensions.slice(-2), ['.rb', '.py']);
    assert.ok(readJson(customFile('naming/reportable-extensions')).reportableExtensions.includes('.js'));
    assert.deepEqual(
      readJson(customFile('suite/exit-policy')).policies.map((policy) => policy.id),
      readJson(builtinFile('suite/exit-policy')).policies.map((policy) => policy.id),
    );
    // The Baseline is the whole current Builtin, keep-custom decisions included.
    for (const registryId of changedIds) {
      assert.deepEqual(fs.readFileSync(baselineFile(registryId)), fs.readFileSync(builtinFile(registryId)), registryId);
      const manifestEntry = readJson(paths.manifestPath).basedOn.registries[registryId];
      assert.equal(manifestEntry.validatorVersion, VALIDATOR_VERSION);
      assert.equal(manifestEntry.digest, document.registries.find((record) => record.registryId === registryId).basedOn.builtinDigest);
    }
    const { basedOn: { registries: after } } = readJson(paths.manifestPath);
    for (const registryId of Object.keys(manifestBefore.basedOn.registries).filter((id) => !changedIds.includes(id))) {
      assert.deepEqual(after[registryId], manifestBefore.basedOn.registries[registryId], registryId);
    }
    assert.deepEqual(snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !targets.has(relativePath)), othersBefore);
    assert.deepEqual(fs.readFileSync(paths.statePath), stateBefore);
    assert.equal(fs.existsSync(transactionRoot(paths)), false);

    // Against the new Baseline: the declined removal and the earlier Custom addition are custom-only;
    // the taken entries no longer differ.
    assert.deepEqual(entryClasses(diff(), 'naming/reportable-extensions'), {
      'reportableExtensions[".js"]': 'custom-only',
      'reportableExtensions[".rb"]': 'custom-only',
    });
    assert.equal(registryOf(diff(), 'suite/exit-policy').class, 'unchanged');
    assert.deepEqual(status().customIssues, []);
    assert.equal(registryOf(status(), 'naming/reportable-extensions').baselineMismatch, false);
    assert.deepEqual(template().registries, [], 'a declined change is not offered again');
  });
});

test('all keep-custom: Custom keeps its bytes, the Baseline still advances, and every Builtin change becomes custom-only', () => {
  withContentChanges(({ customFile, baselineFile, builtinFile, template, update, diff }) => {
    const document = template();
    const customBefore = fs.readFileSync(customFile('suite/exit-policy'));
    decideEntries(document, 'naming/reportable-extensions', () => 'keep-custom');
    decideEntries(document, 'suite/exit-policy', () => 'keep-custom');

    assert.deepEqual(update(document).applied, ['naming/reportable-extensions', 'suite/exit-policy']);
    assert.deepEqual(fs.readFileSync(customFile('suite/exit-policy')), customBefore, 'not rewritten');
    assert.deepEqual(fs.readFileSync(baselineFile('suite/exit-policy')), fs.readFileSync(builtinFile('suite/exit-policy')));
    assert.deepEqual(entryClasses(diff(), 'suite/exit-policy'), {
      'policies#order': 'custom-only',
      'policies[id="review"]': 'custom-only',
    });
  });
});

test('a differs record whose every Builtin change is aligned has nothing to decide and advances its Baseline', () => {
  withAddedRegistries(
    ({ builtinFile, customFile, baselineFile, template, update, diff }) => {
      for (const file of [builtinFile, customFile]) {
        updateJson(file('naming/reportable-root-files'), (payload) => ({
          ...payload,
          reportableRootFiles: [...payload.reportableRootFiles, 'NOTICE'],
        }));
      }
      const document = template();
      assert.deepEqual(document.registries.map((record) => [record.registryId, record.entries]), [['naming/reportable-root-files', []]]);
      const customBefore = fs.readFileSync(customFile('naming/reportable-root-files'));

      assert.deepEqual(update(document), { applied: ['naming/reportable-root-files'], skipped: [] });
      assert.deepEqual(fs.readFileSync(customFile('naming/reportable-root-files')), customBefore);
      assert.deepEqual(fs.readFileSync(baselineFile('naming/reportable-root-files')), fs.readFileSync(builtinFile('naming/reportable-root-files')));
      assert.equal(registryOf(diff(), 'naming/reportable-root-files').class, 'unchanged');
    },
    { missingIds: [] },
  );
});

test('an inconsistent combination of entry decisions is refused before its transaction, naming the address', () => {
  withContentChanges(({ paths, template, update }) => {
    const document = template();
    decideEntries(document, 'naming/reportable-extensions', () => 'take-builtin');
    // The new policy is taken, but the order entry keeps Custom's sequence, which does not list it.
    decideEntries(document, 'suite/exit-policy', (address) => (address === 'policies#order' ? 'keep-custom' : 'take-builtin'));
    const exitPolicyFiles = ['custom', path.join('custom', '.baseline')].map((root) =>
      fs.readFileSync(path.join(paths.lifecycleRoot, root, 'suite', 'exit-policy.registry.json')),
    );

    const result = update(document);
    assert.deepEqual(result.applied, ['naming/reportable-extensions']);
    assert.deepEqual([result.failed.sliceId, result.failed.registryIds], ['suite', ['suite/exit-policy']]);
    assert.match(result.failed.detail, /inconsistent registry; refused at: policies#order\./u);
    assert.deepEqual(
      ['custom', path.join('custom', '.baseline')].map((root) =>
        fs.readFileSync(path.join(paths.lifecycleRoot, root, 'suite', 'exit-policy.registry.json')),
      ),
      exitPolicyFiles,
    );
    assert.equal(fs.existsSync(transactionRoot(paths)), false);
  });
});

test('individually valid entry decisions whose slice fails validation are refused before the transaction, for the whole slice', () => {
  withAddedRegistries(
    ({ paths, builtinFile, template, update, diff }) => {
      // Builtin adds a category and its (empty) group in the category-role perspective, which must
      // name declared categories only.
      updateJson(builtinFile('naming/categories'), (payload) => ({
        ...payload,
        categories: [...payload.categories, { category: 'new-family', status: 'active', definition: 'A new family.' }],
      }));
      updateJson(builtinFile('naming/category-role-perspective'), (payload) => ({
        ...payload,
        rolesByCategory: { ...payload.rolesByCategory, 'new-family': [] },
      }));
      const document = template();
      decideEntries(document, 'naming/categories', () => 'keep-custom');
      decideEntries(document, 'naming/category-role-perspective', () => 'take-builtin');
      const before = snapshotTree(paths.lifecycleRoot);

      const result = update(document);
      assert.deepEqual(result.applied, []);
      assert.deepEqual(result.failed.registryIds, ['naming/categories', 'naming/category-role-perspective']);
      assert.match(result.failed.detail, /registry-set validation fails with the updated registries .*not declared in categories: new-family/u);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
      assert.equal(registryOf(diff(), 'naming/category-role-perspective').entries[0].class, 'builtin-added');
      assert.equal(fs.existsSync(transactionRoot(paths)), false);
    },
    { missingIds: [] },
  );
});

test('a registry whose inputs change after the check is refused as stale, and one whose Baseline version moved as a migration', () => {
  for (const [label, alter, pattern] of [
    [
      'the Custom file changed',
      ({ customFile }) =>
        updateJson(customFile('suite/exit-policy'), (payload) => ({ ...payload, policies: payload.policies.slice(1) })),
      /the Custom file no longer has the digest the decisions document was made against/u,
    ],
    [
      'the Baseline copy changed',
      ({ baselineFile }) => updateJson(baselineFile('suite/exit-policy'), (payload) => ({ ...payload, policies: [] })),
      /the Baseline copy file no longer has the digest/u,
    ],
    [
      'the manifest Baseline digest changed',
      ({ paths }) =>
        updateJson(paths.manifestPath, (manifest) => {
          manifest.basedOn.registries['suite/exit-policy'].digest = '0'.repeat(64);
          return manifest;
        }),
      /the manifest Baseline entry is not the one the decisions document was made against/u,
    ],
    [
      'the manifest entry names another version',
      ({ paths }) =>
        updateJson(paths.manifestPath, (manifest) => {
          manifest.basedOn.registries['suite/exit-policy'].version = '0';
          return manifest;
        }),
      /the update applies within one version/u,
    ],
  ]) {
    withContentChanges((fixture) => {
      const document = fixture.template();
      decideEntries(document, 'naming/reportable-extensions', () => 'take-builtin');
      decideEntries(document, 'suite/exit-policy', () => 'take-builtin');
      const exitPolicyBefore = fs.readFileSync(fixture.customFile('suite/exit-policy'));
      // The first registry's transaction runs after the document was checked; altering the second
      // registry's inputs then is the window prepare re-binds.
      const result = fixture.update(document, {
        onTransactionStep: (step) => step === 'committed' && alter(fixture),
      });
      assert.deepEqual(result.applied, ['naming/reportable-extensions'], label);
      assert.deepEqual(result.failed.registryIds, ['suite/exit-policy'], label);
      assert.match(result.failed.detail, pattern, label);
      if (label !== 'the Custom file changed') {
        assert.deepEqual(fs.readFileSync(fixture.customFile('suite/exit-policy')), exitPolicyBefore, label);
      }
    });
  }
});

// ---- the slice is the unit of update (spec §12.5 items 3–5) -------------------------------------

const extractFor = (registryId, filePath) =>
  extractComparisonEntries(
    readJson(filePath),
    REGISTRY_LIFECYCLE_SLICES.flatMap((slice) => slice.inventory).find((entry) => entry.registryId === registryId),
  );

const dropCategory = (name) => (payload) => ({
  ...payload,
  categories: payload.categories.filter((record) => record.category !== name),
});
const dropGroup = (name) => (payload) => {
  const rolesByCategory = { ...payload.rolesByCategory };
  delete rolesByCategory[name];
  return { ...payload, rolesByCategory };
};
const takeAll = (document) => {
  for (const record of document.registries) {
    record.entries.forEach((entry) => (entry.decision = 'take-builtin'));
  }
  return document;
};

// Builtin removes the category `concern-style` and its perspective group. Removing the category
// alone is invalid (the old perspective still names it), so per-registry order cannot apply it.
const withCoordinatedRemoval = (run) =>
  withAddedRegistries(
    (fixture) => {
      updateJson(fixture.builtinFile('naming/categories'), dropCategory('concern-style'));
      updateJson(fixture.builtinFile('naming/category-role-perspective'), dropGroup('concern-style'));
      return run(fixture);
    },
    { missingIds: [] },
  );

test('a coordinated removal across two Naming registries applies as one slice', () => {
  withCoordinatedRemoval(({ paths, customFile, builtinFile, template, update, diff }) => {
    const ids = ['naming/categories', 'naming/category-role-perspective'];
    assert.deepEqual(update(takeAll(template())), { applied: ids, skipped: [] });
    for (const registryId of ids) {
      assert.deepEqual(
        Object.fromEntries(extractFor(registryId, customFile(registryId))),
        Object.fromEntries(extractFor(registryId, builtinFile(registryId))),
        registryId,
      );
      assert.equal(registryOf(diff(), registryId).class, 'unchanged', registryId);
    }
    assert.equal(fs.existsSync(transactionRoot(paths)), false);
    assert.deepEqual(template().registries, []);
  });
});

test('coordinated changes that are invalid one registry at a time apply together: a role added, a category renamed', () => {
  const rename = (from, to) => ({
    'naming/categories': (payload) => ({
      ...payload,
      categories: payload.categories.map((record) => (record.category === from ? { ...record, category: to } : record)),
    }),
    'naming/category-role-perspective': (payload) => ({
      ...payload,
      rolesByCategory: Object.fromEntries(Object.entries(payload.rolesByCategory).map(([key, value]) => [key === from ? to : key, value])),
    }),
  });
  // The perspective sorts before `naming/roles`, and a perspective role without a roles entry is
  // invalid, so the old per-registry order failed on the first registry.
  const addRole = {
    'naming/roles': (payload) => ({ ...payload, roles: [...payload.roles, { role: 'probe-role', status: 'active' }] }),
    'naming/category-role-perspective': (payload) => ({
      ...payload,
      rolesByCategory: {
        ...payload.rolesByCategory,
        'concern-core': [...payload.rolesByCategory['concern-core'], { role: 'probe-role', agnosticCoreMeanings: ['structure'] }],
      },
    }),
  };
  for (const [label, changes] of Object.entries({ 'a role added': addRole, 'a category renamed': rename('concern-style', 'concern-styling') })) {
    withAddedRegistries(
      ({ builtinFile, template, update, diff }) => {
        for (const [registryId, change] of Object.entries(changes)) {
          updateJson(builtinFile(registryId), change);
        }
        const ids = Object.keys(changes).sort();
        assert.deepEqual(update(takeAll(template())), { applied: ids, skipped: [] }, label);
        for (const registryId of ids) {
          assert.equal(registryOf(diff(), registryId).class, 'unchanged', `${label}: ${registryId}`);
        }
      },
      { missingIds: [] },
    );
  }
});

test('a coordinated change whose partner record is still null is refused for the whole slice, and the partner is never pulled in', () => {
  withCoordinatedRemoval(({ paths, template, update, diff }) => {
    const document = template();
    decideEntries(document, 'naming/categories', () => 'take-builtin');
    const before = snapshotTree(paths.lifecycleRoot);

    const result = update(document);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.skipped, [{ registryId: 'naming/category-role-perspective', reason: 'undecided' }]);
    assert.deepEqual([result.failed.sliceId, result.failed.registryIds], ['naming', ['naming/categories']]);
    assert.match(result.failed.detail, /naming registry-set validation fails with the updated registries \(naming\/categories\)/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
    assert.equal(registryOf(diff(), 'naming/category-role-perspective').class, 'differs');
  });
});

test('a failure at any step of a slice transaction advances neither registry of the slice', () => {
  // Two Baseline copies, two Custom files and the manifest, all pre-existing (spec §4.6).
  const boundaries = [
    'staged',
    'journaled',
    'directories-created',
    ...[0, 1, 2, 3].flatMap((index) => [`step-${index}:backed-up`, `step-${index}:applied`]),
    'step-4:backed-up',
  ];
  for (const boundary of boundaries) {
    withCoordinatedRemoval(({ paths, template, update }) => {
      const document = takeAll(template());
      const before = snapshotTree(paths.lifecycleRoot);
      const result = update(document, {
        onTransactionStep: (step) => {
          if (step === boundary) {
            throw new Error(`injected at ${boundary}`);
          }
        },
      });
      assert.deepEqual(result.applied, [], boundary);
      assert.deepEqual(result.failed.registryIds, ['naming/categories', 'naming/category-role-perspective'], boundary);
      assert.equal(result.failed.detail, `injected at ${boundary}`, boundary);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before, boundary);
    });
  }
});

test('across slices, a committed slice stays advanced when a later slice fails', () => {
  withContentChanges(({ paths, baselineFile, builtinFile, template, update, status }) => {
    const document = template();
    decideEntries(document, 'naming/reportable-extensions', () => 'take-builtin');
    decideEntries(document, 'suite/exit-policy', () => 'take-builtin');
    const suiteBefore = ['custom', path.join('custom', '.baseline')].map((root) =>
      fs.readFileSync(path.join(paths.lifecycleRoot, root, 'suite', 'exit-policy.registry.json')),
    );
    let transactions = 0;
    const result = update(document, {
      onTransactionStep: (step) => {
        transactions += step === 'staged' ? 1 : 0;
        if (transactions === 2 && step === 'step-1:applied') {
          throw new Error('injected in the suite slice');
        }
      },
    });

    assert.deepEqual(result.applied, ['naming/reportable-extensions']);
    assert.deepEqual([result.failed.sliceId, result.failed.registryIds], ['suite', ['suite/exit-policy']]);
    assert.deepEqual(fs.readFileSync(baselineFile('naming/reportable-extensions')), fs.readFileSync(builtinFile('naming/reportable-extensions')));
    assert.deepEqual(
      ['custom', path.join('custom', '.baseline')].map((root) =>
        fs.readFileSync(path.join(paths.lifecycleRoot, root, 'suite', 'exit-policy.registry.json')),
      ),
      suiteBefore,
    );
    assert.equal(registryOf(status(), 'suite/exit-policy').classification, 'builtin-changed');
  });
});

// ---- merge-fields (spec §12.6, §12.7) ------------------------------------------------------------

const diffEntryOf = (diffResult, registryId, address) =>
  (registryOf(diffResult, registryId).entries ?? []).find((entry) => entry.address === address);
const roleRecord = (filePath, role) => readJson(filePath).roles.find((entry) => entry.role === role);
const mergeFields = (...takeBuiltin) => ({ kind: 'merge-fields', takeBuiltin });

// naming/roles: Builtin changes the first role's status and definition (builtin-changed), and the
// second role's definition while Custom changes its status (both-changed); Builtin also drops the
// third role and adds one.
const withRoleMerges = (run, options = {}) =>
  withAddedRegistries(
    (fixture) => {
      const { builtinFile, customFile } = fixture;
      const [first, second, third] = readJson(builtinFile('naming/roles')).roles.map((entry) => entry.role);
      updateJson(builtinFile('naming/roles'), (payload) => ({
        ...payload,
        roles: [
          ...payload.roles
            .filter((entry) => entry.role !== third)
            .map((entry) =>
              entry.role === first
                ? { ...entry, status: 'deprecated', definition: 'Builtin first.' }
                : entry.role === second
                  ? { ...entry, definition: 'Builtin second.' }
                  : entry,
            ),
          { role: 'zz-new-role', status: 'active', definition: 'Added by Builtin.' },
        ],
      }));
      updateJson(customFile('naming/roles'), (payload) => ({
        ...payload,
        roles: payload.roles.map((entry) => (entry.role === second ? { ...entry, status: 'deprecated' } : entry)),
      }));
      return run({ ...fixture, first, second, third });
    },
    { missingIds: [], ...options },
  );

test('update applies merge-fields mixed with keep-custom and take-builtin, and the merged entries become custom-only', () => {
  withRoleMerges(({ paths, builtinFile, customFile, baselineFile, template, update, diff, first, second, third }) => {
    const address = (role) => `roles[role=${JSON.stringify(role)}]`;
    const customBefore = roleRecord(customFile('naming/roles'), first);
    const document = template();
    decideEntries(document, 'naming/roles', (entryAddress) =>
      ({
        [address(first)]: mergeFields('definition'),
        [address(second)]: mergeFields('definition'),
        [address(third)]: 'keep-custom',
      })[entryAddress] ?? 'take-builtin',
    );
    const stateBefore = fs.readFileSync(paths.statePath);

    assert.deepEqual(update(document), { applied: ['naming/roles'], skipped: [] });

    // builtin-changed: the Builtin definition, the Custom (Baseline) status.
    assert.deepEqual(roleRecord(customFile('naming/roles'), first), { ...customBefore, definition: 'Builtin first.' });
    // both-changed: the Builtin definition, the Custom status.
    assert.deepEqual(
      [roleRecord(customFile('naming/roles'), second).definition, roleRecord(customFile('naming/roles'), second).status],
      ['Builtin second.', 'deprecated'],
    );
    assert.ok(roleRecord(customFile('naming/roles'), third), 'keep-custom keeps the role Builtin removed');
    assert.ok(roleRecord(customFile('naming/roles'), 'zz-new-role'), 'take-builtin adds the new role');
    assert.deepEqual(fs.readFileSync(baselineFile('naming/roles')), fs.readFileSync(builtinFile('naming/roles')));
    assert.deepEqual(fs.readFileSync(paths.statePath), stateBefore);

    // Against the new Baseline: each merged entry is custom-only and differs only in the field
    // group kept from Custom (status); the taken group (definition) no longer differs.
    const after = diff();
    for (const role of [first, second]) {
      const entry = diffEntryOf(after, 'naming/roles', address(role));
      assert.equal(entry.class, 'custom-only', role);
      const differing = Object.keys({ ...entry.builtin, ...entry.custom }).filter(
        (field) => JSON.stringify(entry.builtin[field]) !== JSON.stringify(entry.custom[field]),
      );
      assert.deepEqual(differing, ['status'], role);
    }
    assert.equal(diffEntryOf(after, 'naming/roles', address(third)).class, 'custom-only');
    assert.equal(diffEntryOf(after, 'naming/roles', address('zz-new-role')), undefined);
    assert.deepEqual(template().registries, [], 'the merged Builtin changes are not offered again');
  });
});

test('update applies merge-fields to an object value of a real value map (naming/finding-policy outcomes)', () => {
  withAddedRegistries(
    ({ builtinFile, customFile, template, update, diff }) => {
      const outcome = Object.keys(readJson(builtinFile('naming/finding-policy')).outcomes)[0];
      const before = readJson(customFile('naming/finding-policy')).outcomes[outcome];
      updateJson(builtinFile('naming/finding-policy'), (payload) => ({
        ...payload,
        outcomes: { ...payload.outcomes, [outcome]: { ...payload.outcomes[outcome], severity: 'error', message: 'Builtin message.' } },
      }));
      const document = template();
      decideEntries(document, 'naming/finding-policy', () => mergeFields('message'));

      assert.deepEqual(update(document), { applied: ['naming/finding-policy'], skipped: [] });
      assert.deepEqual(readJson(customFile('naming/finding-policy')).outcomes[outcome], { ...before, message: 'Builtin message.' });
      assert.equal(diffEntryOf(diff(), 'naming/finding-policy', `outcomes[${JSON.stringify(outcome)}]`).class, 'custom-only');
    },
    { missingIds: [] },
  );
});

test('a merge-fields registry and another selected registry of its slice validate and commit in one transaction', () => {
  withRoleMerges(({ paths, builtinFile, template, update, diff, first, third }) => {
    updateJson(builtinFile('naming/categories'), (payload) => ({
      ...payload,
      categories: payload.categories.map((record, index) => (index === 0 ? { ...record, definition: 'Builtin category.' } : record)),
    }));
    const document = template();
    // The third role stays: the category-role perspective still refers to it.
    decideEntries(document, 'naming/roles', (address) =>
      address === `roles[role=${JSON.stringify(first)}]`
        ? mergeFields('definition')
        : address === `roles[role=${JSON.stringify(third)}]`
          ? 'keep-custom'
          : 'take-builtin',
    );
    decideEntries(document, 'naming/categories', () => 'take-builtin');
    const manifestBefore = readJson(paths.manifestPath);
    let transactions = 0;

    const result = update(document, { onTransactionStep: (step) => (transactions += step === 'staged' ? 1 : 0) });
    assert.deepEqual(result, { applied: ['naming/categories', 'naming/roles'], skipped: [] });
    assert.equal(transactions, 1, 'one transaction for the slice');
    const manifest = readJson(paths.manifestPath);
    for (const registryId of ['naming/categories', 'naming/roles']) {
      assert.notDeepEqual(manifest.basedOn.registries[registryId], manifestBefore.basedOn.registries[registryId], registryId);
    }
    assert.equal(registryOf(diff(), 'naming/categories').class, 'unchanged');
  });
});

// add-alongside as a test-only capability on naming/roles: its record is never applied, even in part.
const withAlongsideRoles = (slices) =>
  slices.map((slice) =>
    slice.sliceId === 'naming'
      ? {
          ...slice,
          inventory: slice.inventory.map((entry) =>
            entry.registryId === 'naming/roles'
              ? { ...entry, reconciliation: entry.reconciliation.map((declaration) => ({ ...declaration, addAlongside: true })) }
              : entry,
          ),
        }
      : slice,
  );

test('a record with a valid add-alongside decision is skipped whole, while other registries still apply', () => {
  withRoleMerges(
    ({ paths, builtinFile, customFile, template, update, first, second }) => {
      updateJson(builtinFile('naming/categories'), (payload) => ({
        ...payload,
        categories: payload.categories.map((record, index) => (index === 0 ? { ...record, definition: 'Builtin category.' } : record)),
      }));
      const document = template();
      decideEntries(document, 'naming/roles', (address) =>
        address === `roles[role=${JSON.stringify(first)}]`
          ? { kind: 'add-alongside', key: 'zz-first-builtin' }
          : address === `roles[role=${JSON.stringify(second)}]`
            ? mergeFields('definition')
            : 'take-builtin',
      );
      decideEntries(document, 'naming/categories', () => 'take-builtin');
      const rolesFiles = [customFile('naming/roles'), path.join(paths.baselineRoot, 'naming', 'roles.registry.json')].map((file) =>
        fs.readFileSync(file),
      );

      assert.deepEqual(update(document), {
        applied: ['naming/categories'],
        skipped: [{ registryId: 'naming/roles', reason: 'not-yet-supported' }],
      });
      assert.deepEqual(
        [customFile('naming/roles'), path.join(paths.baselineRoot, 'naming', 'roles.registry.json')].map((file) => fs.readFileSync(file)),
        rolesFiles,
        'neither the merge nor the take-builtin entries of the record were applied',
      );
    },
    { mapSlices: withAlongsideRoles },
  );
});
