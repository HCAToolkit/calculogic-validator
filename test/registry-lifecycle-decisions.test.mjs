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
import { applyRegistryUpdateDecisions } from '../src/core/registry-lifecycle/registry-lifecycle-update.logic.mjs';
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
// `mapSlices` adjusts the inventory the commands see, for a capability no registry declares.
const withDecisionsFixture = (run, { withNewRegistry = false, mapSlices = (slices) => slices } = {}) => {
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
    const slices = mapSlices(
      withNewRegistry
        ? initialSlices.map((slice) =>
            slice.sliceId === NEW_REGISTRY.sliceId ? { ...slice, inventory: [...slice.inventory, NEW_REGISTRY.entry] } : slice,
          )
        : initialSlices,
    );
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
        // Only one merge group (`definition`) differs anywhere, so no entry offers merge-fields.
        entries: [
          { address: roleAddress(first), class: 'builtin-changed', choices: ['keep-custom', 'take-builtin'], decision: null },
          { address: roleAddress(third), class: 'builtin-removed', choices: ['keep-custom', 'take-builtin'], decision: null },
          { address: roleAddress(fifth), class: 'both-changed', choices: ['keep-custom', 'take-builtin'], decision: null },
          { address: roleAddress('zz-new-role'), class: 'builtin-added', choices: ['keep-custom', 'take-builtin'], decision: null },
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
    assert.deepEqual(malformed((candidate) => (candidate.schemaVersion = '3')), documentLevel);
    assert.deepEqual(malformed((candidate) => (candidate.schemaVersion = 2)), documentLevel);
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

// ---- structured decisions: merge-fields and add-alongside (spec §12.7) ---------------------------

// naming/roles in Builtin and Custom: the first role's status and definition both change in Builtin
// (two merge groups differ: builtin-changed); the second role's definition changes in Builtin and
// its status in Custom (both-changed); a role is added in Builtin.
const changeRoleGroups = ({ builtinFile, customFile }) => {
  const [first, second] = readJson(builtinFile('naming/roles')).roles.map((entry) => entry.role);
  updateJson(builtinFile('naming/roles'), (payload) => ({
    ...payload,
    roles: [
      ...payload.roles.map((entry) =>
        entry.role === first
          ? { ...entry, status: 'deprecated', definition: 'Builtin wording.' }
          : entry.role === second
            ? { ...entry, definition: 'Builtin wording.' }
            : entry,
      ),
      { role: 'zz-new-role', status: 'active', definition: 'Added by Builtin.' },
    ],
  }));
  updateJson(customFile('naming/roles'), (payload) => ({
    ...payload,
    roles: payload.roles.map((entry) => (entry.role === second ? { ...entry, status: 'deprecated' } : entry)),
  }));
  return { first, second };
};

const entryOf = (document, address) => recordOf(document, 'naming/roles').entries.find((entry) => entry.address === address);
const decideRoles = (document, decisionsByAddress) => {
  for (const entry of recordOf(document, 'naming/roles').entries) {
    entry.decision = Object.hasOwn(decisionsByAddress, entry.address) ? decisionsByAddress[entry.address] : 'keep-custom';
  }
  return document;
};

test('the template offers merge-fields only where the collection declares it and two field groups differ', () => {
  withDecisionsFixture(({ builtinFile, customFile, template }) => {
    const { first, second } = changeRoleGroups({ builtinFile, customFile });
    const document = template();
    assert.equal(document.schemaVersion, '2');
    assert.deepEqual(entryOf(document, roleAddress(first)).choices, [
      'keep-custom',
      'take-builtin',
      { kind: 'merge-fields', fieldGroups: [['status'], ['definition']] },
    ]);
    assert.deepEqual(entryOf(document, roleAddress(second)).choices, [
      'keep-custom',
      'take-builtin',
      { kind: 'merge-fields', fieldGroups: [['status'], ['definition']] },
    ]);
    assert.deepEqual(entryOf(document, roleAddress('zz-new-role')).choices, ['keep-custom', 'take-builtin'], 'builtin-added');
  });
});

test('a well-formed merge-fields decision is valid and complete, and update skips its record as not yet supported', () => {
  withDecisionsFixture(({ paths, builtinFile, customFile, slices, targetRoot, template, check }) => {
    const { first, second } = changeRoleGroups({ builtinFile, customFile });
    const document = decideRoles(template(), {
      [roleAddress(first)]: { kind: 'merge-fields', takeBuiltin: ['definition'] },
      [roleAddress(second)]: { kind: 'merge-fields', takeBuiltin: ['definition'] },
    });
    const result = check(document);
    assert.deepEqual(result.problems, []);
    assert.equal(result.complete, true);

    // A document without the informative `choices` is equally valid.
    const bare = clone(document);
    bare.registries.forEach((record) => record.entries.forEach((entry) => delete entry.choices));
    assert.deepEqual(check(bare).problems, []);

    const before = snapshotTree(paths.lifecycleRoot);
    const updated = applyRegistryUpdateDecisions({
      loadDocument: () => document,
      targetRoot,
      slices,
      validatorVersion: '9.9.9-test',
    });
    assert.deepEqual(updated, { applied: [], skipped: [{ registryId: 'naming/roles', reason: 'not-yet-supported' }] });
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('merge-fields data that does not fit the entry is invalid-decision, and each refusal says why', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    const { first, second } = changeRoleGroups({ builtinFile, customFile });
    const cases = {
      'takes nothing (that is keep-custom)': [first, [], /takes no field from Builtin; record keep-custom/u],
      'takes every differing group (that is take-builtin)': [first, ['definition', 'status'], /record take-builtin instead/u],
      'lists fields out of order': [first, ['status', 'definition'], /ordinal order without repetition/u],
      'repeats a field': [first, ['definition', 'definition'], /ordinal order without repetition/u],
      'names a field in no group': [first, ['category'], /in no declared merge group/u],
      'takes a group that does not differ': [second, ['notes'], /\[notes\] is the same in Builtin and Custom/u],
    };
    for (const [label, [role, takeBuiltin, pattern]] of Object.entries(cases)) {
      const result = check(decideRoles(template(), { [roleAddress(role)]: { kind: 'merge-fields', takeBuiltin } }));
      assert.deepEqual(problemCodes(result), [['naming/roles', roleAddress(role), 'invalid-decision']], label);
      assert.match(result.problems[0].detail, pattern, label);
    }
  });
});

test('a field group is taken whole, and a field outside every group blocks a merge', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    // finding-policy groups [classification, code, severity]; Builtin changes the message and the
    // severity of one outcome.
    const outcome = Object.keys(readJson(builtinFile('naming/finding-policy')).outcomes)[0];
    updateJson(builtinFile('naming/finding-policy'), (payload) => ({
      ...payload,
      outcomes: { ...payload.outcomes, [outcome]: { ...payload.outcomes[outcome], severity: 'error', message: 'Builtin message.' } },
    }));
    const address = `outcomes[${JSON.stringify(outcome)}]`;
    const decide = (decision) => {
      const document = template();
      recordOf(document, 'naming/finding-policy').entries.find((entry) => entry.address === address).decision = decision;
      return check(document);
    };
    assert.deepEqual(decide({ kind: 'merge-fields', takeBuiltin: ['message'] }).problems, []);
    const partial = decide({ kind: 'merge-fields', takeBuiltin: ['severity'] });
    assert.deepEqual(problemCodes(partial), [['naming/finding-policy', address, 'invalid-decision']]);
    assert.match(partial.problems[0].detail, /\[classification, code, severity\] is taken whole or not at all/u);
    assert.deepEqual(decide({ kind: 'merge-fields', takeBuiltin: ['classification', 'code', 'severity'] }).problems, []);

    // A field no declared group covers: the merge cannot decide it, so it is refused and not offered.
    updateJson(builtinFile('naming/finding-policy'), (payload) => ({
      ...payload,
      outcomes: { ...payload.outcomes, [outcome]: { ...payload.outcomes[outcome], extraNote: 'x' } },
    }));
    const uncovered = decide({ kind: 'merge-fields', takeBuiltin: ['message'] });
    assert.match(uncovered.problems[0].detail, /extraNote are in no declared merge group/u);
    assert.deepEqual(
      recordOf(template(), 'naming/finding-policy').entries.find((entry) => entry.address === address).choices,
      ['keep-custom', 'take-builtin'],
    );
  });
});

test('structured decisions where the class or collection does not declare them are unsupported-decision', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    const { first } = changeRoleGroups({ builtinFile, customFile });
    updateJson(builtinFile('suite/exit-policy'), (payload) => ({
      ...payload,
      policies: payload.policies.map((policy, index) => (index === 0 ? { ...policy, exitCode: 9 } : policy)),
    }));
    const cases = [
      ['naming/roles', roleAddress('zz-new-role'), { kind: 'merge-fields', takeBuiltin: ['definition'] }, /applies to builtin-changed and both-changed/u],
      ['naming/roles', roleAddress(first), { kind: 'add-alongside', key: 'zz-copy' }, /does not declare add-alongside/u],
    ];
    const exitAddress = recordOf(template(), 'suite/exit-policy').entries[0].address;
    cases.push(['suite/exit-policy', exitAddress, { kind: 'merge-fields', takeBuiltin: ['exitCode'] }, /does not declare merge-fields/u]);
    for (const [registryId, address, decision, pattern] of cases) {
      const document = template();
      recordOf(document, registryId).entries.find((entry) => entry.address === address).decision = decision;
      const result = check(document);
      assert.deepEqual(problemCodes(result), [[registryId, address, 'unsupported-decision']], address);
      assert.match(result.problems[0].detail, pattern, address);
    }
  });
});

test('a structured decision has exactly its fields and a known kind, and only schema 2 holds one', () => {
  withDecisionsFixture(({ builtinFile, customFile, template, check }) => {
    const { first } = changeRoleGroups({ builtinFile, customFile });
    const address = roleAddress(first);
    const malformed = [
      { kind: 'merge', takeBuiltin: ['definition'] },
      { kind: 'merge-fields', takeBuiltin: ['definition'], note: 'x' },
      { kind: 'merge-fields' },
      { kind: 'merge-fields', takeBuiltin: 'definition' },
      { kind: 'add-alongside' },
      {},
    ];
    for (const decision of malformed) {
      assert.deepEqual(problemCodes(check(decideRoles(template(), { [address]: decision }))), [['naming/roles', address, 'malformed']], JSON.stringify(decision));
    }

    // Schema "1" is still read: string decisions only, and entries without `choices`.
    const v1 = decideRoles(template(), {});
    v1.schemaVersion = '1';
    v1.registries.forEach((record) => record.entries.forEach((entry) => delete entry.choices));
    assert.deepEqual(check(v1).problems, []);
    const v1Structured = clone(v1);
    entryOf(v1Structured, address).decision = { kind: 'merge-fields', takeBuiltin: ['definition'] };
    assert.match(check(v1Structured).problems[0].detail, /Structured decisions need "schemaVersion": "2"/u);
    const v1Choices = clone(v1);
    entryOf(v1Choices, address).choices = ['keep-custom'];
    assert.deepEqual(problemCodes(check(v1Choices)), [['naming/roles', address, 'malformed']]);
  });
});

// A capability no current registry declares: roles here declares add-alongside.
const withAlongsideRoles = (slices) =>
  slices.map((slice) =>
    slice.sliceId === 'naming'
      ? {
          ...slice,
          inventory: slice.inventory.map((entry) =>
            entry.registryId === 'naming/roles' ? { ...entry, reconciliation: [...entry.reconciliation.map((declaration) => ({ ...declaration, addAlongside: true }))] } : entry,
          ),
        }
      : slice,
  );

test('add-alongside, where declared, needs a new key of the key type that no record or other decision uses', () => {
  withDecisionsFixture(
    ({ builtinFile, customFile, template, check }) => {
      const { first, second } = changeRoleGroups({ builtinFile, customFile });
      assert.deepEqual(entryOf(template(), roleAddress(first)).choices.at(-1), { kind: 'add-alongside' });
      const alongside = (key) => ({ kind: 'add-alongside', key });

      assert.deepEqual(check(decideRoles(template(), { [roleAddress(first)]: alongside('zz-first-builtin') })).problems, []);
      const cases = {
        'an empty key': ['', /must be a non-empty string/u],
        'a key of another type': [7, /must be a non-empty string/u],
        'a key the collection has': [second, /is already a "role" of the collection/u],
        'a key only Builtin has': ['zz-new-role', /is already a "role" of the collection/u],
      };
      for (const [label, [key, pattern]] of Object.entries(cases)) {
        const result = check(decideRoles(template(), { [roleAddress(first)]: alongside(key) }));
        assert.deepEqual(problemCodes(result), [['naming/roles', roleAddress(first), 'invalid-decision']], label);
        assert.match(result.problems[0].detail, pattern, label);
      }

      const twice = check(
        decideRoles(template(), { [roleAddress(first)]: alongside('zz-same'), [roleAddress(second)]: alongside('zz-same') }),
      );
      assert.deepEqual(problemCodes(twice), [['naming/roles', roleAddress(second), 'invalid-decision']]);
      assert.match(twice.problems[0].detail, /used by another add-alongside decision/u);
    },
    { mapSlices: withAlongsideRoles },
  );
});
