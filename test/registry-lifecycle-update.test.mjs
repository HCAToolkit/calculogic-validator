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
const withAddedRegistries = (run, { missingIds = ['naming/case-rules'] } = {}) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-update-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const slices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return { ...slice, builtinRoot };
  });

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
    assert.equal(invalid.failed.registryId, 'naming/case-rules');
    assert.match(invalid.failed.detail, /naming registry-set validation fails with the inherited file/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);

    updateJson(builtinFile('naming/case-rules'), (payload) => ({ ...payload, semanticName: { style: 'kebab-case' }, version: '99' }));
    const unreadable = update(decide(template(), { 'naming/case-rules': 'inherit' }));
    assert.match(unreadable.failed.detail, /Builtin version "99" is not readable/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('a failure stops the command: earlier registries stay advanced, the failed one is untouched', () => {
  withAddedRegistries(
    ({ customFile, builtinFile, template, update, status }) => {
      updateJson(builtinFile('naming/special-cases'), (payload) => ({ ...payload, specialCases: 'not-a-list' }));
      const result = update(decide(template(), { 'naming/special-cases': 'inherit', 'naming/case-rules': 'inherit' }));
      assert.deepEqual(result.applied, ['naming/case-rules']);
      assert.equal(result.failed.registryId, 'naming/special-cases');
      assert.equal(fs.existsSync(customFile('naming/case-rules')), true);
      assert.equal(fs.existsSync(customFile('naming/special-cases')), false);
      assert.equal(registryOf(status(), 'naming/case-rules').classification, 'unchanged');
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
    assert.equal(result.failed.registryId, 'suite/exit-policy');
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

test('individually valid entry decisions whose registry fails slice validation are refused before the transaction', () => {
  withAddedRegistries(
    ({ paths, builtinFile, customFile, template, update, diff }) => {
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
      const perspectiveBefore = snapshotTree(path.dirname(customFile('naming/category-role-perspective')));

      const result = update(document);
      assert.deepEqual(result.applied, ['naming/categories']);
      assert.equal(result.failed.registryId, 'naming/category-role-perspective');
      assert.match(result.failed.detail, /registry-set validation fails with the candidate: .*not declared in categories: new-family/u);
      assert.deepEqual(snapshotTree(path.dirname(customFile('naming/category-role-perspective'))), perspectiveBefore);
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
      assert.equal(result.failed.registryId, 'suite/exit-policy', label);
      assert.match(result.failed.detail, pattern, label);
      if (label !== 'the Custom file changed') {
        assert.deepEqual(fs.readFileSync(fixture.customFile('suite/exit-policy')), exitPolicyBefore, label);
      }
    });
  }
});
