import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTreeCodebaseAddressedSnapshot } from '../src/structural-addressing-tree-codebase.logic.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TREE_CODEBASE_ADDRESSING_PROFILE as PROFILE } from '../src/structural-addressing-profile.knowledge.mjs';

const buildFixtureInput = () => ({
  sourceNamespace: 'calculogic-validator',
  scope: 'validator',
  target: null,
  scopeRoots: [
    {
      name: 'calculogic-validator',
      path: 'calculogic-validator',
      occurrenceType: 'folder',
      children: [
        { name: 'LICENSE', path: 'calculogic-validator/LICENSE', occurrenceType: 'file' },
        { name: 'README.md', path: 'calculogic-validator/README.md', occurrenceType: 'file' },
        {
          name: 'doc',
          path: 'calculogic-validator/doc',
          occurrenceType: 'folder',
          children: [
            {
              name: 'ConventionRoutines',
              path: 'calculogic-validator/doc/ConventionRoutines',
              occurrenceType: 'folder',
              children: [],
            },
          ],
        },
      ],
    },
  ],
});

const getRecordByPath = (records, path) => records.find((record) => record.path === path);

test('returns addressedTreeSnapshot/tree-codebase/T and preserves source scope target', () => {
  const result = prepareTreeCodebaseAddressedSnapshot(buildFixtureInput());

  assert.equal(result.snapshotOutputId, 'addressedTreeSnapshot');
  assert.equal(result.profileId, 'tree-codebase');
  assert.equal(result.addressProfileId, 'tree-codebase@1');
  assert.deepEqual(result.compatibilityPolicy, { status: 'versioned', revision: '1' });
  assert.equal(result.domainPrefix, 'T');
  assert.equal(result.sourceNamespace, 'calculogic-validator');
  assert.equal(result.scope, 'validator');
  assert.equal(result.target, null);
});

test('addressed tree snapshot remains provider-owned structural evidence without tree policy fields', () => {
  const result = prepareTreeCodebaseAddressedSnapshot(buildFixtureInput());

  assert.equal(result.occurrenceRecords.some((record) => Object.hasOwn(record, 'code')), false);
  assert.equal(result.occurrenceRecords.some((record) => Object.hasOwn(record, 'severity')), false);
  assert.equal(result.occurrenceRecords.some((record) => Object.hasOwn(record, 'summary')), false);
  assert.equal(result.occurrenceRecords.some((record) => Object.hasOwn(record, 'placementConfidence')), false);
  assert.equal(result.occurrenceRecords.some((record) => Object.hasOwn(record, 'folderKind')), false);
  assert.equal(result.occurrenceRecords.some((record) => Object.hasOwn(record, 'structuralHome')), false);
  assert.equal(result.occurrenceRecords.some((record) => Object.hasOwn(record, 'semanticHome')), false);
});

test('scope root and descendants receive deterministic address paths', () => {
  const result = prepareTreeCodebaseAddressedSnapshot(buildFixtureInput());

  assert.equal(getRecordByPath(result.occurrenceRecords, 'calculogic-validator')?.addressPath, 'A');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'calculogic-validator/LICENSE')?.addressPath, 'A.1');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'calculogic-validator/README.md')?.addressPath, 'A.2');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'calculogic-validator/doc')?.addressPath, 'A.A');
  assert.equal(
    getRecordByPath(result.occurrenceRecords, 'calculogic-validator/doc/ConventionRoutines')?.addressPath,
    'A.A.A',
  );
});

test('counters reset per parent and split by occurrence type', () => {
  const input = {
    sourceNamespace: 'calculogic-validator',
    scope: 'validator',
    target: null,
    scopeRoots: [
      {
        name: 'root',
        path: 'root',
        occurrenceType: 'folder',
        children: [
          { name: 'file-1', path: 'root/file-1', occurrenceType: 'file' },
          { name: 'folder-1', path: 'root/folder-1', occurrenceType: 'folder', children: [] },
          {
            name: 'folder-2',
            path: 'root/folder-2',
            occurrenceType: 'folder',
            children: [
              { name: 'nested-file', path: 'root/folder-2/nested-file', occurrenceType: 'file' },
              { name: 'nested-folder', path: 'root/folder-2/nested-folder', occurrenceType: 'folder', children: [] },
            ],
          },
        ],
      },
    ],
  };

  const result = prepareTreeCodebaseAddressedSnapshot(input);

  assert.equal(getRecordByPath(result.occurrenceRecords, 'root/file-1')?.addressPath, 'A.1');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'root/folder-1')?.addressPath, 'A.A');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'root/folder-2')?.addressPath, 'A.B');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'root/folder-2/nested-file')?.addressPath, 'A.B.1');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'root/folder-2/nested-folder')?.addressPath, 'A.B.A');
});

test('multiple scope roots receive deterministic root folder markers', () => {
  const input = {
    sourceNamespace: 'calculogic-validator',
    scope: 'validator',
    target: null,
    scopeRoots: [
      { name: 'first-root', path: 'first-root', occurrenceType: 'folder', children: [] },
      { name: 'second-root', path: 'second-root', occurrenceType: 'folder', children: [] },
    ],
  };

  const result = prepareTreeCodebaseAddressedSnapshot(input);

  assert.equal(getRecordByPath(result.occurrenceRecords, 'first-root')?.addressPath, 'A');
  assert.equal(getRecordByPath(result.occurrenceRecords, 'second-root')?.addressPath, 'B');
});

test('occurrence records include required fields with deterministic parentAddressPath/depth/orderIndex', () => {
  const result = prepareTreeCodebaseAddressedSnapshot(buildFixtureInput());
  const root = getRecordByPath(result.occurrenceRecords, 'calculogic-validator');
  const childFile = getRecordByPath(result.occurrenceRecords, 'calculogic-validator/LICENSE');

  assert.deepEqual(Object.keys(root).sort(), [
    'address',
    'addressPath',
    'depth',
    'displayMarker',
    'name',
    'occurrenceType',
    'orderIndex',
    'parentAddressPath',
    'path',
  ]);

  assert.equal(root?.parentAddressPath, null);
  assert.equal(root?.depth, 0);
  assert.equal(root?.orderIndex, 0);

  assert.equal(childFile?.parentAddressPath, 'A');
  assert.equal(childFile?.depth, 1);
  assert.equal(childFile?.orderIndex, 1);
  assert.deepEqual(result.occurrenceRecords.map((record) => record.orderIndex), [0, 1, 2, 3, 4]);
});

test('fails deterministically for missing and invalid top-level input', () => {
  assert.throws(
    () => prepareTreeCodebaseAddressedSnapshot(undefined),
    /Tree-codebase addressed snapshot input is required\./u,
  );
  assert.throws(
    () => prepareTreeCodebaseAddressedSnapshot('invalid'),
    /Tree-codebase addressed snapshot input must be an object\./u,
  );
  assert.throws(
    () => prepareTreeCodebaseAddressedSnapshot({}),
    /Tree-codebase addressed snapshot input must include scopeRoots\./u,
  );
  assert.throws(
    () => prepareTreeCodebaseAddressedSnapshot({ scopeRoots: 'invalid' }),
    /Tree-codebase addressed snapshot scopeRoots must be an array\./u,
  );
});

test('fails deterministically for unsupported occurrenceType and missing required occurrence fields', () => {
  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [{ name: 'root', path: 'root', occurrenceType: 'unknown', children: [] }],
      }),
    /Tree-codebase occurrence type is unsupported: unknown\./u,
  );

  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [{ path: 'root', occurrenceType: 'folder', children: [] }],
      }),
    /Tree-codebase occurrence node name is required\./u,
  );

  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [{ name: 'root', occurrenceType: 'folder', children: [] }],
      }),
    /Tree-codebase occurrence node path is required\./u,
  );
});

test('fails deterministically for invalid children shape', () => {
  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [{ name: 'root', path: 'root', occurrenceType: 'folder', children: {} }],
      }),
    /Tree-codebase occurrence node children must be an array when provided\./u,
  );
});


test('sibling marker assignment stays stable across varied input sibling order including nested children', () => {
  const fixtureA = {
    sourceNamespace: 'calculogic-validator',
    scope: 'validator',
    target: null,
    scopeRoots: [
      {
        name: 'calculogic-validator',
        path: 'calculogic-validator',
        occurrenceType: 'folder',
        children: [
          { name: 'README.md', path: 'calculogic-validator/README.md', occurrenceType: 'file' },
          { name: 'LICENSE', path: 'calculogic-validator/LICENSE', occurrenceType: 'file' },
          {
            name: 'doc',
            path: 'calculogic-validator/doc',
            occurrenceType: 'folder',
            children: [
              { name: 'Zeta', path: 'calculogic-validator/doc/Zeta', occurrenceType: 'folder', children: [] },
              { name: 'Alpha', path: 'calculogic-validator/doc/Alpha', occurrenceType: 'folder', children: [] },
              { name: 'z-note.md', path: 'calculogic-validator/doc/z-note.md', occurrenceType: 'file' },
              { name: 'a-note.md', path: 'calculogic-validator/doc/a-note.md', occurrenceType: 'file' },
            ],
          },
        ],
      },
    ],
  };

  const fixtureB = {
    sourceNamespace: 'calculogic-validator',
    scope: 'validator',
    target: null,
    scopeRoots: [
      {
        name: 'calculogic-validator',
        path: 'calculogic-validator',
        occurrenceType: 'folder',
        children: [
          {
            name: 'doc',
            path: 'calculogic-validator/doc',
            occurrenceType: 'folder',
            children: [
              { name: 'a-note.md', path: 'calculogic-validator/doc/a-note.md', occurrenceType: 'file' },
              { name: 'Alpha', path: 'calculogic-validator/doc/Alpha', occurrenceType: 'folder', children: [] },
              { name: 'z-note.md', path: 'calculogic-validator/doc/z-note.md', occurrenceType: 'file' },
              { name: 'Zeta', path: 'calculogic-validator/doc/Zeta', occurrenceType: 'folder', children: [] },
            ],
          },
          { name: 'LICENSE', path: 'calculogic-validator/LICENSE', occurrenceType: 'file' },
          { name: 'README.md', path: 'calculogic-validator/README.md', occurrenceType: 'file' },
        ],
      },
    ],
  };

  const resultA = prepareTreeCodebaseAddressedSnapshot(fixtureA);
  const resultB = prepareTreeCodebaseAddressedSnapshot(fixtureB);

  const getAddressMap = (records) =>
    Object.fromEntries(records.map((record) => [record.path, record.addressPath]));

  const addressMapA = getAddressMap(resultA.occurrenceRecords);
  const addressMapB = getAddressMap(resultB.occurrenceRecords);

  assert.equal(addressMapA['calculogic-validator'], 'A');
  assert.equal(addressMapA['calculogic-validator/LICENSE'], 'A.1');
  assert.equal(addressMapA['calculogic-validator/README.md'], 'A.2');
  assert.equal(addressMapA['calculogic-validator/doc'], 'A.A');

  assert.equal(addressMapA['calculogic-validator/doc/a-note.md'], 'A.A.1');
  assert.equal(addressMapA['calculogic-validator/doc/z-note.md'], 'A.A.2');
  assert.equal(addressMapA['calculogic-validator/doc/Alpha'], 'A.A.A');
  assert.equal(addressMapA['calculogic-validator/doc/Zeta'], 'A.A.B');

  assert.deepEqual(addressMapB, addressMapA);
});

test('input child arrays are not mutated while assigning sorted markers', () => {
  const input = {
    sourceNamespace: 'calculogic-validator',
    scope: 'validator',
    target: null,
    scopeRoots: [
      {
        name: 'calculogic-validator',
        path: 'calculogic-validator',
        occurrenceType: 'folder',
        children: [
          { name: 'README.md', path: 'calculogic-validator/README.md', occurrenceType: 'file' },
          { name: 'LICENSE', path: 'calculogic-validator/LICENSE', occurrenceType: 'file' },
          {
            name: 'doc',
            path: 'calculogic-validator/doc',
            occurrenceType: 'folder',
            children: [
              { name: 'z-note.md', path: 'calculogic-validator/doc/z-note.md', occurrenceType: 'file' },
              { name: 'a-note.md', path: 'calculogic-validator/doc/a-note.md', occurrenceType: 'file' },
            ],
          },
        ],
      },
    ],
  };

  const topLevelOrderBefore = input.scopeRoots[0].children.map((child) => child.path);
  const nestedOrderBefore = input.scopeRoots[0].children[2].children.map((child) => child.path);

  prepareTreeCodebaseAddressedSnapshot(input);

  assert.deepEqual(input.scopeRoots[0].children.map((child) => child.path), topLevelOrderBefore);
  assert.deepEqual(input.scopeRoots[0].children[2].children.map((child) => child.path), nestedOrderBefore);
});


test('malformed sibling missing name fails deterministically before sort comparator execution', () => {
  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [
          {
            name: 'calculogic-validator',
            path: 'calculogic-validator',
            occurrenceType: 'folder',
            children: [
              { occurrenceType: 'file', path: 'calculogic-validator/B.md' },
              { name: 'A.md', path: 'calculogic-validator/A.md', occurrenceType: 'file' },
            ],
          },
        ],
      }),
    /Tree-codebase occurrence node name is required\./u,
  );
});

test('malformed sibling missing path fails deterministically before sort comparator execution', () => {
  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [
          {
            name: 'calculogic-validator',
            path: 'calculogic-validator',
            occurrenceType: 'folder',
            children: [
              { name: 'B.md', occurrenceType: 'file' },
              { name: 'A.md', path: 'calculogic-validator/A.md', occurrenceType: 'file' },
            ],
          },
        ],
      }),
    /Tree-codebase occurrence node path is required\./u,
  );
});

test('malformed sibling unsupported occurrenceType fails deterministically before sort comparator execution', () => {
  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [
          {
            name: 'calculogic-validator',
            path: 'calculogic-validator',
            occurrenceType: 'folder',
            children: [
              { name: 'B.md', path: 'calculogic-validator/B.md', occurrenceType: 'unsupported' },
              { name: 'A.md', path: 'calculogic-validator/A.md', occurrenceType: 'file' },
            ],
          },
        ],
      }),
    /Tree-codebase occurrence type is unsupported: unsupported\./u,
  );
});

test('malformed sibling invalid children shape fails deterministically before sort comparator execution', () => {
  assert.throws(
    () =>
      prepareTreeCodebaseAddressedSnapshot({
        scopeRoots: [
          {
            name: 'calculogic-validator',
            path: 'calculogic-validator',
            occurrenceType: 'folder',
            children: [
              {
                name: 'doc',
                path: 'calculogic-validator/doc',
                occurrenceType: 'folder',
                children: {},
              },
              { name: 'A.md', path: 'calculogic-validator/A.md', occurrenceType: 'file' },
            ],
          },
        ],
      }),
    /Tree-codebase occurrence node children must be an array when provided\./u,
  );
});

const c1Names = ['é', 'a_b', '2', '\uE000', 'a', '😀', 'e\u0301', 'A', '10', 'a-b'];
const c1Expected = ['10', '2', 'A', 'a', 'a-b', 'a_b', 'e\u0301', 'é', '😀', '\uE000'];
const c1Input = () => ({ scopeRoots: c1Names.map((name) => ({ name, path: `root/${name}`, occurrenceType: 'file' })) });

test('C1 ordering and revision 1 identity are emitted together, without normalizing Unicode or mutating input', () => {
  const input = c1Input(); const before = structuredClone(input);
  const result = prepareTreeCodebaseAddressedSnapshot(input);
  assert.equal(result.addressProfileId, 'tree-codebase@1');
  assert.deepEqual(result.compatibilityPolicy, { status: 'versioned', revision: '1' });
  assert.deepEqual(result.occurrenceRecords.map((r) => r.name), c1Expected);
  assert.deepEqual(result.occurrenceRecords.map((r) => r.orderIndex), c1Expected.map((_, i) => i));
  assert.deepEqual(result.occurrenceRecords.map((r) => r.addressPath), c1Expected.map((_, i) => String(i + 1)));
  assert.deepEqual(input, before);
  assert.deepEqual(prepareTreeCodebaseAddressedSnapshot({ scopeRoots: [...input.scopeRoots].reverse() }).occurrenceRecords, result.occurrenceRecords);
});

test('C1 keeps name then type then path precedence and independent type counters', () => {
  const result = prepareTreeCodebaseAddressedSnapshot({ scopeRoots: [
    { name: 'same', path: '0/same', occurrenceType: 'folder', children: [] },
    { name: 'same', path: 'a/same', occurrenceType: 'file' },
    { name: 'same', path: 'Z/same', occurrenceType: 'file' },
  ] });
  assert.deepEqual(result.occurrenceRecords.map((r) => [r.path, r.addressPath, r.orderIndex]), [
    ['Z/same', '1', 0], ['a/same', '2', 1], ['0/same', 'A', 2],
  ]);
});

test('C1 produces identical complete snapshots across controlled default locales', () => {
  const moduleUrl = new URL('../src/structural-addressing-tree-codebase.logic.mjs', import.meta.url).href;
  const code = 'const {prepareTreeCodebaseAddressedSnapshot: run} = await import(process.argv[1]); console.log(JSON.stringify(run(JSON.parse(process.argv[2]))));';
  const expected = prepareTreeCodebaseAddressedSnapshot(c1Input());
  for (const locale of ['en_US.UTF-8', 'lt_LT.UTF-8', 'sv_SE.UTF-8', 'tr_TR.UTF-8']) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, moduleUrl, JSON.stringify(c1Input())], {
      encoding: 'utf8', env: { ...process.env, LANG: locale, LC_ALL: locale },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), expected, locale);
  }
});

test('C1 rejects inconsistent descriptors before emitting records, using isolated module fixtures', () => {
  const original = structuredClone(PROFILE);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c1-policy-fixture-'));
  const profileText = fs.readFileSync(new URL('../src/structural-addressing-profile.knowledge.mjs', import.meta.url), 'utf8');
  const variants = [
    profileText.replace("{ status: 'versioned', revision: '1' }", "{ status: 'legacy-unqualified', revision: null }"),
    profileText.replace("revision: '1'", "revision: '2'"),
    profileText.replace('profileId: STRUCTURAL_ADDRESSING_PROFILE_IDS.TREE_CODEBASE,', "profileId: 'another-family',"),
    profileText.replace("  compatibilityPolicy:", "  legacyAddressProfileId: 'tree-structure-advisor-address-profile',\n  compatibilityPolicy:"),
  ];
  try {
    for (const [index, text] of variants.entries()) {
      assert.notEqual(text, profileText);
      const dir = path.join(root, String(index)); fs.mkdirSync(dir);
      for (const name of ['structural-addressing-tree-codebase.logic.mjs', 'structural-addressing-profile-compatibility.logic.mjs', 'structural-addressing-marker-strategies.logic.mjs']) {
        fs.copyFileSync(new URL(`../src/${name}`, import.meta.url), path.join(dir, name));
      }
      fs.writeFileSync(path.join(dir, 'structural-addressing-profile.knowledge.mjs'), text);
      const code = 'const {prepareTreeCodebaseAddressedSnapshot: run} = await import(process.argv[1]); console.log(JSON.stringify(run({scopeRoots:[]})));';
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, pathToFileURL(path.join(dir, 'structural-addressing-tree-codebase.logic.mjs')).href], { encoding: 'utf8' });
      assert.equal(child.status, 1);
      assert.equal(child.stdout, '');
      assert.match(child.stderr, /C1 producer requires tree-codebase versioned revision 1 without a legacy alias/u);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  assert.deepEqual(PROFILE, original);
});
