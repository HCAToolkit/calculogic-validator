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

test('null is never inheritance, and complete entry decisions are skipped until supported', () => {
  withAddedRegistries(({ paths, builtinFile, customFile, template, update }) => {
    for (const file of [builtinFile, customFile]) {
      updateJson(file('naming/reportable-extensions'), (payload) => ({
        ...payload,
        reportableExtensions: [...payload.reportableExtensions, file === builtinFile ? '.py' : '.rb'],
      }));
    }
    updateJson(builtinFile('naming/reportable-root-files'), (payload) => ({
      ...payload,
      reportableRootFiles: [...payload.reportableRootFiles, 'NOTICE'],
    }));

    const document = template();
    const decidedEntries = document.registries.find((record) => record.registryId === 'naming/reportable-extensions');
    decidedEntries.entries.forEach((entry) => (entry.decision = 'keep-custom'));
    const before = snapshotTree(paths.lifecycleRoot);

    assert.deepEqual(update(document), {
      applied: [],
      skipped: [
        { registryId: 'naming/case-rules', reason: 'undecided' },
        { registryId: 'naming/reportable-extensions', reason: 'not-yet-supported' },
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
          steps: [{ target: 'custom/escape/registry-set.manifest.json', existed: true }],
          createdDirectories: [],
          // The outside file's bytes: a commit check that followed the link would report `committed`.
          commitSha256: createHash('sha256').update('outside bytes').digest('hex'),
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
