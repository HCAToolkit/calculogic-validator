import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import {
  buildRegistryUpdateDecisionsTemplate,
  checkRegistryUpdateDecisions,
} from '../src/core/registry-lifecycle/registry-lifecycle-decisions.logic.mjs';
import { buildRegistryLifecycleDiff } from '../src/core/registry-lifecycle/registry-lifecycle-diff.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import {
  ENTRY_DECISIONS_BY_CLASS,
  ENTRY_CLASSES,
  REGISTRY_DECISIONS_BY_CLASS,
  UPDATE_DECISIONS_KIND,
  UPDATE_DECISIONS_PROBLEMS,
  UPDATE_DECISIONS_SCHEMA_VERSION,
} from '../src/core/registry-lifecycle/registry-lifecycle.contracts.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};
const updateJson = (filePath, update) => writeJson(filePath, update(readJson(filePath)));
const clone = (value) => structuredClone(value);

const NEW_REGISTRY = Object.freeze({
  sliceId: 'naming',
  entry: Object.freeze({
    registryId: 'naming/new-thing',
    name: 'new-thing',
    fileName: 'new-thing.registry.json',
    readableVersions: ['1'],
    descriptor: { setLike: [{ path: 'items' }] },
    comparison: [{ kind: 'members', path: 'items' }],
  }),
});

// A target root with an initialized Custom set and private copies of every Builtin root, so a test
// can change "Builtin" as a later release would. With `withNewRegistry`, the later Builtin also adds
// `naming/new-thing`.
const withDecisionsFixture = (run, { withNewRegistry = false } = {}) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-decisions-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const initialSlices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return { ...slice, builtinRoot };
  });

  try {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test', slices: initialSlices });
    const slices = withNewRegistry
      ? initialSlices.map((slice) =>
          slice.sliceId === NEW_REGISTRY.sliceId ? { ...slice, inventory: [...slice.inventory, NEW_REGISTRY.entry] } : slice,
        )
      : initialSlices;
    if (withNewRegistry) {
      writeJson(path.join(fixtureRoot, 'builtin', 'naming', NEW_REGISTRY.entry.fileName), { version: '1', items: ['a'] });
    }

    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const fileIn = (root) => (registryId) => {
      const [sliceId, name] = registryId.split('/');
      return path.join(root, sliceId, `${name}.registry.json`);
    };
    return run({
      targetRoot,
      paths,
      slices,
      builtinFile: fileIn(path.join(fixtureRoot, 'builtin')),
      customFile: fileIn(paths.customRoot),
      template: (options = {}) => buildRegistryUpdateDecisionsTemplate({ targetRoot, slices, ...options }),
      check: (document) => checkRegistryUpdateDecisions({ document, targetRoot, slices }),
      status: () => buildRegistryLifecycleStatus({ targetRoot, slices }),
    });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      return [relativePath, fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });

// naming/roles in Builtin: the first role changed, the third removed, a role added, the fourth
// changed identically in Custom, the fifth changed differently in Custom; Custom also changes the
// second. Every §8.2 entry class then occurs once.
const changeRolesEverywhere = ({ builtinFile, customFile }) => {
  const roleIds = readJson(builtinFile('naming/roles')).roles.map((entry) => entry.role);
  const [first, second, third, fourth, fifth] = roleIds;
  updateJson(builtinFile('naming/roles'), (payload) => ({
    ...payload,
    roles: [
      ...payload.roles
        .filter((entry) => entry.role !== third)
        .map((entry) =>
          entry.role === first
            ? { ...entry, definition: 'Builtin wording.' }
            : entry.role === fourth || entry.role === fifth
              ? { ...entry, definition: 'Shared wording.' }
              : entry,
        ),
      { role: 'zz-new-role', status: 'active', definition: 'Added by Builtin.' },
    ],
  }));
  updateJson(customFile('naming/roles'), (payload) => ({
    ...payload,
    roles: payload.roles.map((entry) =>
      entry.role === second
        ? { ...entry, definition: 'Custom wording.' }
        : entry.role === fourth
          ? { ...entry, definition: 'Shared wording.' }
          : entry.role === fifth
            ? { ...entry, definition: 'Other Custom wording.' }
            : entry,
    ),
  }));
  return { first, second, third, fourth, fifth };
};

const roleAddress = (role) => `roles[role=${JSON.stringify(role)}]`;
const recordOf = (document, registryId) => document.registries.find((record) => record.registryId === registryId);
const problemCodes = (result) =>
  result.problems.map((item) => [item.registryId, item.address ?? null, item.problem]);

// ---- vocabulary --------------------------------------------------------------------------------

test('decisions vocabulary: only registry-added takes a registry decision; custom-only and aligned take none', () => {
  assert.deepEqual(Object.keys(REGISTRY_DECISIONS_BY_CLASS), ['registry-added']);
  assert.deepEqual(REGISTRY_DECISIONS_BY_CLASS['registry-added'], ['inherit']);
  assert.deepEqual(Object.keys(ENTRY_DECISIONS_BY_CLASS).sort(), [
    ENTRY_CLASSES.bothChanged,
    ENTRY_CLASSES.builtinAdded,
    ENTRY_CLASSES.builtinChanged,
    ENTRY_CLASSES.builtinRemoved,
  ]);
  for (const decisions of Object.values(ENTRY_DECISIONS_BY_CLASS)) {
    assert.deepEqual(decisions, ['keep-custom', 'take-builtin']);
  }
});

// ---- template ----------------------------------------------------------------------------------

test('a fresh Custom set has nothing to decide, and template and check write nothing', () => {
  withDecisionsFixture(({ paths, template, check }) => {
    const before = snapshotTree(paths.lifecycleRoot);
    const document = template();

    assert.deepEqual(document, { kind: UPDATE_DECISIONS_KIND, schemaVersion: UPDATE_DECISIONS_SCHEMA_VERSION, registries: [] });
    assert.deepEqual(check(document), { valid: true, complete: true, problems: [], registries: [] });
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('the template lists decidable entries by address, every decision null, bound to the status digests', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, status }) => {
    const { first, third, fifth } = changeRolesEverywhere({ builtinFile, customFile });
    // Custom-only change elsewhere: nothing to decide for that registry.
    updateJson(customFile('naming/reportable-extensions'), (payload) => ({
      ...payload,
      reportableExtensions: [...payload.reportableExtensions, '.py'],
    }));

    const document = template();
    const rolesStatus = status().registries.find((entry) => entry.registryId === 'naming/roles');
    assert.deepEqual(document.registries, [
      {
        registryId: 'naming/roles',
        class: 'differs',
        basedOn: {
          baselineDigest: rolesStatus.baselineDigest,
          builtinDigest: rolesStatus.builtinDigest,
          customDigest: rolesStatus.customDigest,
        },
        // custom-only and aligned entries are not listed: they take no decision (spec §8.2).
        entries: [
          { address: roleAddress(first), class: 'builtin-changed', decision: null },
          { address: roleAddress(third), class: 'builtin-removed', decision: null },
          { address: roleAddress(fifth), class: 'both-changed', decision: null },
          { address: roleAddress('zz-new-role'), class: 'builtin-added', decision: null },
        ].sort((left, right) => (left.address < right.address ? -1 : 1)),
      },
    ]);
    assert.deepEqual(template(), document, 'deterministic');
    assert.deepEqual(template({ registryIds: ['naming/reportable-extensions'] }).registries, []);
    assert.throws(() => template({ registryIds: ['naming/nope'] }), /Unknown registry id\(s\): naming\/nope\./u);
  });
});

test('a registry whose only Builtin changes are aligned is listed with no entries, so its Baseline can advance', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    for (const file of [builtinFile, customFile]) {
      updateJson(file('naming/reportable-extensions'), (payload) => ({
        ...payload,
        reportableExtensions: [...payload.reportableExtensions, '.py'],
      }));
    }

    const record = recordOf(template(), 'naming/reportable-extensions');
    assert.deepEqual(record.entries, []);
    assert.deepEqual(check(template()).registries, [
      { registryId: 'naming/reportable-extensions', class: 'differs', decided: 0, undecided: 0, complete: true },
    ]);
  });
});

test('registry-added takes one registry-level decision, separate from entry decisions', () => {
  withDecisionsFixture(
    ({ template, check }) => {
      const document = template();
      const record = recordOf(document, 'naming/new-thing');
      assert.deepEqual(Object.keys(record).sort(), ['basedOn', 'class', 'decision', 'registryId']);
      assert.equal(record.class, 'registry-added');
      assert.equal(record.decision, null);
      assert.equal(record.basedOn.baselineDigest, null);
      assert.equal(record.basedOn.customDigest, null);
      assert.equal(typeof record.basedOn.builtinDigest, 'string');

      assert.deepEqual(check(document).registries, [
        { registryId: 'naming/new-thing', class: 'registry-added', decided: 0, undecided: 1, complete: false },
      ]);

      record.decision = 'inherit';
      assert.deepEqual(check(document), {
        valid: true,
        complete: true,
        problems: [],
        registries: [{ registryId: 'naming/new-thing', class: 'registry-added', decided: 1, undecided: 0, complete: true }],
      });

      record.decision = 'take-builtin';
      assert.deepEqual(problemCodes(check(document)), [['naming/new-thing', null, UPDATE_DECISIONS_PROBLEMS.unsupportedDecision]]);

      const withEntries = clone(document);
      recordOf(withEntries, 'naming/new-thing').decision = 'inherit';
      recordOf(withEntries, 'naming/new-thing').entries = [];
      assert.deepEqual(problemCodes(check(withEntries)), [['naming/new-thing', null, UPDATE_DECISIONS_PROBLEMS.malformed]]);
    },
    { withNewRegistry: true },
  );
});

// ---- decided, undecided and absent -------------------------------------------------------------

test('null is no decision, keep-custom is a decision, and an absent entry is a problem', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    changeRolesEverywhere({ builtinFile, customFile });
    const document = template();
    const roles = recordOf(document, 'naming/roles');

    assert.deepEqual(check(document).registries, [
      { registryId: 'naming/roles', class: 'differs', decided: 0, undecided: 4, complete: false },
    ]);

    roles.entries[0].decision = 'keep-custom';
    roles.entries[1].decision = 'take-builtin';
    const partial = check(document);
    assert.equal(partial.valid, true);
    assert.equal(partial.complete, false);
    assert.deepEqual(partial.registries[0], { registryId: 'naming/roles', class: 'differs', decided: 2, undecided: 2, complete: false });

    for (const entry of roles.entries) {
      entry.decision = 'keep-custom';
    }
    assert.deepEqual(check(document), {
      valid: true,
      complete: true,
      problems: [],
      registries: [{ registryId: 'naming/roles', class: 'differs', decided: 4, undecided: 0, complete: true }],
    });

    const removed = roles.entries.pop();
    const result = check(document);
    assert.equal(result.valid, false);
    assert.equal(result.complete, false);
    assert.deepEqual(problemCodes(result), [['naming/roles', removed.address, UPDATE_DECISIONS_PROBLEMS.missingEntry]]);
    assert.deepEqual(result.registries, [], 'a record with a problem is never summarized');
  });
});

// ---- binding to the compared inputs ------------------------------------------------------------

test('a document is stale once Builtin, Custom or the Baseline changes, per registry', () => {
  withDecisionsFixture(({ paths, builtinFile, customFile, template, check }) => {
    const { second } = changeRolesEverywhere({ builtinFile, customFile });
    for (const file of [builtinFile, customFile]) {
      updateJson(file('naming/reportable-extensions'), (payload) => ({
        ...payload,
        reportableExtensions: [...payload.reportableExtensions, '.py'],
      }));
    }
    const document = template();
    assert.equal(check(document).valid, true);

    // Custom changes an entry the document does not even decide: still stale.
    updateJson(customFile('naming/roles'), (payload) => ({
      ...payload,
      roles: payload.roles.map((entry) => (entry.role === second ? { ...entry, definition: 'Edited again.' } : entry)),
    }));
    const afterCustomEdit = check(document);
    assert.deepEqual(problemCodes(afterCustomEdit), [['naming/roles', null, UPDATE_DECISIONS_PROBLEMS.stale]]);
    assert.match(afterCustomEdit.problems[0].detail, /customDigest\.$/u);
    // The other registry's record stays current and is summarized.
    assert.deepEqual(afterCustomEdit.registries.map((registry) => registry.registryId), ['naming/reportable-extensions']);

    const fresh = template();
    updateJson(builtinFile('naming/roles'), (payload) => ({
      ...payload,
      roles: [...payload.roles, { role: 'zz-later-role', status: 'active', definition: 'Later.' }],
    }));
    assert.match(check(fresh).problems[0].detail, /builtinDigest\.$/u);

    // A changed version is a migration, not an update decision.
    const beforeVersion = template();
    updateJson(builtinFile('naming/reportable-extensions'), (payload) => ({ ...payload, version: '2' }));
    const afterVersion = check(beforeVersion);
    const versionProblem = afterVersion.problems.find((item) => item.registryId === 'naming/reportable-extensions');
    assert.equal(versionProblem.problem, UPDATE_DECISIONS_PROBLEMS.notDecidable);
    assert.match(versionProblem.detail, /version-changed/u);

    // Tampering with the Baseline copy leaves no trusted merge base.
    const beforeTamper = template({ registryIds: ['naming/roles'] });
    updateJson(path.join(paths.baselineRoot, 'naming', 'roles.registry.json'), (payload) => ({ ...payload, tampered: true }));
    const afterTamper = check(beforeTamper);
    assert.deepEqual(problemCodes(afterTamper), [['naming/roles', null, UPDATE_DECISIONS_PROBLEMS.notDecidable]]);
    assert.match(afterTamper.problems[0].detail, /not-comparable \(baseline-mismatch\)/u);
  });
});

test('a document made for one registry class is stale for another, and a hand-edited digest is stale', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    changeRolesEverywhere({ builtinFile, customFile });
    const document = template();
    const asAdded = clone(document);
    const record = recordOf(asAdded, 'naming/roles');
    delete record.entries;
    record.class = 'registry-added';
    record.decision = 'inherit';
    assert.deepEqual(problemCodes(check(asAdded)), [['naming/roles', null, UPDATE_DECISIONS_PROBLEMS.stale]]);

    const editedDigest = clone(document);
    recordOf(editedDigest, 'naming/roles').basedOn.baselineDigest = '0'.repeat(64);
    const result = check(editedDigest);
    assert.deepEqual(problemCodes(result), [['naming/roles', null, UPDATE_DECISIONS_PROBLEMS.stale]]);
    assert.match(result.problems[0].detail, /baselineDigest\.$/u);
  });
});

test('the document and its check are independent of the active set', () => {
  withDecisionsFixture(({ targetRoot, slices, builtinFile, customFile, template, check }) => {
    updateJson(builtinFile('naming/roles'), (payload) => ({
      ...payload,
      roles: [...payload.roles, { role: 'zz-new-role', status: 'active', definition: 'Added by Builtin.' }],
    }));
    const underBuiltin = template();
    const checkUnderBuiltin = check(underBuiltin);

    useRegistrySet({ targetRoot, activeSet: 'custom', slices });
    assert.equal(JSON.stringify(template()), JSON.stringify(underBuiltin));
    assert.deepEqual(check(underBuiltin), checkUnderBuiltin);
    assert.equal(JSON.stringify(underBuiltin).includes('activeSet'), false);
  });
});

test('a malformed registry-state.json does not stop the decisions commands; diff still reports it', () => {
  withDecisionsFixture(({ targetRoot, slices, paths, builtinFile, template, check }) => {
    updateJson(builtinFile('naming/roles'), (payload) => ({
      ...payload,
      roles: [...payload.roles, { role: 'zz-new-role', status: 'active', definition: 'Added by Builtin.' }],
    }));
    const document = template();
    const result = check(document);

    for (const contents of ['{ broken', '{"schemaVersion":"1","activeSet":"elsewhere"}']) {
      fs.writeFileSync(paths.statePath, contents);
      assert.equal(JSON.stringify(template()), JSON.stringify(document));
      assert.deepEqual(check(document), result);
      assert.throws(() => buildRegistryLifecycleDiff({ targetRoot, slices }), /Registry lifecycle state is (unreadable|malformed)/u);
    }
  });
});

// ---- problems ----------------------------------------------------------------------------------

test('unknown, duplicate, undecidable and unsupported decisions are all reported, in ordinal order', () => {
  withDecisionsFixture(({ paths, builtinFile, customFile, template, check }) => {
    const { first, second, fourth } = changeRolesEverywhere({ builtinFile, customFile });
    writeJson(path.join(paths.customRoot, 'naming', 'retired-thing.registry.json'), { version: '1' });
    const document = template();
    const roles = recordOf(document, 'naming/roles');
    const firstEntry = roles.entries.find((entry) => entry.address === roleAddress(first));
    firstEntry.decision = 'merge-fields';
    const secondEntry = roles.entries.find((entry) => entry.address !== roleAddress(first));
    secondEntry.class = 'builtin-removed' === secondEntry.class ? 'builtin-changed' : 'builtin-removed';
    roles.entries.push(
      { address: roleAddress(second), class: 'custom-only', decision: 'take-builtin' },
      { address: roleAddress(fourth), class: 'aligned', decision: null },
      { ...roles.entries.at(-1) },
    );
    document.registries.push(
      clone(roles),
      { registryId: 'naming/case-rules', class: 'differs', basedOn: roles.basedOn, entries: [] },
      { registryId: 'naming/retired-thing', class: 'differs', basedOn: roles.basedOn, entries: [] },
      { registryId: 'naming/nope', class: 'differs', basedOn: roles.basedOn, entries: [] },
      { class: 'differs' },
    );

    const result = check(document);
    assert.equal(result.valid, false);
    assert.equal(result.complete, false);
    const lastAddress = roles.entries.at(-1).address;
    assert.deepEqual(problemCodes(result), [
      [null, null, UPDATE_DECISIONS_PROBLEMS.malformed],
      ['naming/case-rules', null, UPDATE_DECISIONS_PROBLEMS.notDecidable],
      ['naming/nope', null, UPDATE_DECISIONS_PROBLEMS.unknownRegistry],
      ['naming/retired-thing', null, UPDATE_DECISIONS_PROBLEMS.notDecidable],
      ['naming/roles', null, UPDATE_DECISIONS_PROBLEMS.duplicateRegistry],
      ...[
        [roleAddress(first), UPDATE_DECISIONS_PROBLEMS.unsupportedDecision],
        [roleAddress(second), UPDATE_DECISIONS_PROBLEMS.unknownEntry],
        [roleAddress(fourth), UPDATE_DECISIONS_PROBLEMS.unknownEntry],
        [secondEntry.address, UPDATE_DECISIONS_PROBLEMS.entryClassMismatch],
        [lastAddress, UPDATE_DECISIONS_PROBLEMS.duplicateEntry],
      ]
        .sort(([leftAddress, leftCode], [rightAddress, rightCode]) =>
          leftAddress === rightAddress ? (leftCode < rightCode ? -1 : 1) : leftAddress < rightAddress ? -1 : 1,
        )
        .map(([address, code]) => ['naming/roles', address, code]),
    ]);
    assert.match(
      result.problems.find((item) => item.registryId === 'naming/retired-thing').detail,
      /current diff class is orphan/u,
    );
    assert.deepEqual(result.registries, []);
    assert.deepEqual(check(clone(document)), result, 'deterministic');
  });
});

test('the document shape is strict, so a typo never reads as no decision', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    changeRolesEverywhere({ builtinFile, customFile });
    const document = template();
    const malformed = (mutate) => {
      const candidate = clone(document);
      mutate(candidate);
      return problemCodes(check(candidate));
    };
    const documentLevel = [[null, null, UPDATE_DECISIONS_PROBLEMS.malformed]];
    const rolesLevel = [['naming/roles', null, UPDATE_DECISIONS_PROBLEMS.malformed]];

    assert.deepEqual(malformed((candidate) => (candidate.kind = 'something-else')), documentLevel);
    assert.deepEqual(malformed((candidate) => (candidate.schemaVersion = '2')), documentLevel);
    assert.deepEqual(malformed((candidate) => (candidate.activeSet = 'custom')), documentLevel);
    assert.deepEqual(malformed((candidate) => (candidate.registries = {})), documentLevel);
    assert.deepEqual(problemCodes(check(null)), documentLevel);
    assert.deepEqual(problemCodes(check([])), documentLevel);

    assert.deepEqual(malformed((candidate) => (candidate.registries[0].note = 'x')), rolesLevel);
    assert.deepEqual(malformed((candidate) => delete candidate.registries[0].basedOn), rolesLevel);
    assert.deepEqual(malformed((candidate) => (candidate.registries[0].basedOn.extra = null)), rolesLevel);
    assert.deepEqual(malformed((candidate) => (candidate.registries[0].basedOn.customDigest = 7)), rolesLevel);
    assert.deepEqual(malformed((candidate) => (candidate.registries[0].entries = {})), rolesLevel);
    assert.deepEqual(malformed((candidate) => (candidate.registries[0].class = 'unchanged')), rolesLevel);

    const firstAddress = document.registries[0].entries[0].address;
    const entryLevel = [['naming/roles', firstAddress, UPDATE_DECISIONS_PROBLEMS.malformed]];
    assert.deepEqual(malformed((candidate) => (candidate.registries[0].entries[0].decison = 'keep-custom')), entryLevel);
    assert.deepEqual(malformed((candidate) => delete candidate.registries[0].entries[0].decision), entryLevel);
    assert.deepEqual(malformed((candidate) => delete candidate.registries[0].entries[0].class), entryLevel);
    assert.deepEqual(
      malformed((candidate) => (candidate.registries[0].entries[0] = 'keep-custom')),
      [
        ['naming/roles', null, UPDATE_DECISIONS_PROBLEMS.malformed],
        ['naming/roles', firstAddress, UPDATE_DECISIONS_PROBLEMS.missingEntry],
      ],
    );
  });
});

test('template and check need a Custom set', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-decisions-none-'));
  try {
    assert.throws(() => buildRegistryUpdateDecisionsTemplate({ targetRoot }), /No Custom registry set exists/u);
    assert.throws(
      () => checkRegistryUpdateDecisions({ targetRoot, document: { kind: UPDATE_DECISIONS_KIND } }),
      /No Custom registry set exists/u,
    );
    assert.equal(fs.existsSync(path.join(targetRoot, '.calculogic')), false);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});
