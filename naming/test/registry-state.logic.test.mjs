import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveNamingRegistryInputs,
  validateNamingRegistrySet,
} from '../src/registries/registry-state.logic.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT } from '../src/registries/naming-registry-inventory.knowledge.mjs';
import { toSummaryBucketsRuntime } from '../src/naming-runtime-converters.logic.mjs';
import { summarizeFindings } from '../src/naming-validator.logic.mjs';

const LEGACY_CUSTOM_FIXTURE_ROOT = path.resolve(
  'naming/test/fixtures/registry-lifecycle/legacy-in-package-custom-set',
);

// Digest the pre-#41 resolver produced for the in-package `_custom` set (`registryDigests.custom`).
// The lifecycle conversion of that set to a complete Naming root must reproduce it exactly.
const LEGACY_CUSTOM_SET_DIGEST = '8d5ccfbe4cc90cf86d4b03abcc68e003d7f6f05b7508eb241c9b8d49ac29dd8f';

const INTENDED_BUILTIN_REPORTABLE_EXTENSIONS = [
  '.cjs',
  '.css',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
];

const readBuiltinRegistry = (fileName) =>
  JSON.parse(fs.readFileSync(path.join(NAMING_BUILTIN_REGISTRY_ROOT, fileName), 'utf8'));

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

// Creates a complete Naming registry root (a copy of Builtin) and applies per-file overrides:
// an object is written as JSON, a string is written raw, `null` removes the file.
const withNamingRegistryRoot = (overrides, run) => {
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-registry-root-'));

  try {
    fs.cpSync(NAMING_BUILTIN_REGISTRY_ROOT, registryRoot, { recursive: true });
    for (const [fileName, value] of Object.entries(overrides)) {
      const filePath = path.join(registryRoot, fileName);
      if (value === null) {
        fs.rmSync(filePath, { force: true });
      } else if (typeof value === 'string') {
        fs.writeFileSync(filePath, value);
      } else {
        writeJson(filePath, value);
      }
    }

    return run(registryRoot);
  } finally {
    fs.rmSync(registryRoot, { recursive: true, force: true });
  }
};

const assertDigestShape = (digest) => {
  assert.equal(typeof digest, 'string');
  assert.match(digest, /^[a-f0-9]{64}$/u);
};

test('defaults to the Builtin root with transitional builtin fields and equal digests', () => {
  const result = resolveNamingRegistryInputs();

  assert.equal(result.registryState, 'builtin');
  assert.equal(result.registrySource, 'builtin');
  assertDigestShape(result.registryDigests.builtin);
  assert.equal(result.registryDigests.custom, result.registryDigests.builtin);
  assert.equal(result.registryDigests.resolved, result.registryDigests.builtin);
});

test('resolver contract shape remains stable', () => {
  const result = resolveNamingRegistryInputs();

  assert.deepEqual(Object.keys(result).sort((a, b) => a.localeCompare(b)), [
    'caseRules',
    'findingPolicy',
    'missingRolePatterns',
    'registryDigests',
    'registrySource',
    'registryState',
    'reportableExtensions',
    'reportableRootFiles',
    'roles',
    'summaryBuckets',
  ]);
  assert.deepEqual(Object.keys(result.registryDigests).sort((a, b) => a.localeCompare(b)), [
    'builtin',
    'custom',
    'resolved',
  ]);
});

test('digests stay stable across calls', () => {
  const first = resolveNamingRegistryInputs();
  const second = resolveNamingRegistryInputs();

  assert.deepEqual(first.registryDigests, second.registryDigests);
});

test('builtin resolution loads roles and reportable extensions from the Builtin JSON registries', () => {
  const result = resolveNamingRegistryInputs();

  const builtinRolesRegistry = readBuiltinRegistry('category-role-perspective.registry.json');
  const canonicalRolesRegistry = readBuiltinRegistry('roles.registry.json');
  const canonicalStatusByRole = new Map(
    canonicalRolesRegistry.roles.map((entry) => [entry.role.trim(), entry.status.trim()]),
  );

  const expectedRoles = Object.entries(builtinRolesRegistry.rolesByCategory)
    .flatMap(([category, entries]) =>
      entries.map((entry) => {
        const normalized = {
          role: entry.role.trim(),
          category,
          status:
            canonicalStatusByRole.get(entry.role.trim()) ??
            (typeof entry.status === 'string' ? entry.status.trim() : ''),
        };

        if (typeof entry.notes === 'string' && entry.notes.trim()) {
          normalized.notes = entry.notes.trim();
        }

        return normalized;
      }),
    )
    .sort((left, right) => left.role.localeCompare(right.role));

  const expectedExtensions = [
    ...new Set(readBuiltinRegistry('reportable-extensions.registry.json').reportableExtensions),
  ]
    .map((value) => value.trim())
    .sort((left, right) => left.localeCompare(right));
  const expectedRootFiles = [
    ...new Set(readBuiltinRegistry('reportable-root-files.registry.json').reportableRootFiles),
  ]
    .map((value) => value.trim())
    .sort((left, right) => left.localeCompare(right));

  assert.deepEqual(result.roles, expectedRoles);
  assert.deepEqual(result.reportableExtensions, expectedExtensions);
  assert.deepEqual(result.reportableRootFiles, expectedRootFiles);

  const builtinSummaryBucketsRegistry = readBuiltinRegistry('summary-buckets.registry.json');
  assert.deepEqual(result.summaryBuckets, {
    classificationBuckets: builtinSummaryBucketsRegistry.classificationBuckets,
    secondaryBucketFamilies: builtinSummaryBucketsRegistry.secondaryBucketFamilies,
  });

  assert.deepEqual(
    result.missingRolePatterns.length,
    readBuiltinRegistry('missing-role-patterns.registry.json').missingRolePatterns.length,
  );
  assert.deepEqual(
    Object.keys(result.findingPolicy),
    Object.keys(readBuiltinRegistry('finding-policy.registry.json').outcomes).sort((left, right) =>
      left.localeCompare(right),
    ),
  );
});

test('builtin resolved reportable extensions preserve intended parity, including .jsx and .cjs', () => {
  const result = resolveNamingRegistryInputs();

  assert.deepEqual(result.reportableExtensions, INTENDED_BUILTIN_REPORTABLE_EXTENSIONS);
});

test('registryRoot drives roles, extensions, categories and policy registries from one root', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': { categories: [{ category: 'from-temp-root' }] },
      'category-role-perspective.registry.json': {
        rolesByCategory: { 'from-temp-root': [{ role: 'temp-role' }] },
      },
      'roles.registry.json': { roles: [{ role: 'temp-role', status: 'active' }] },
      'reportable-extensions.registry.json': { reportableExtensions: ['.tmp', '.tmp', '.alt'] },
      'reportable-root-files.registry.json': {
        reportableRootFiles: ['root-b.json', 'root-a.json', 'root-b.json'],
      },
      'summary-buckets.registry.json': {
        classificationBuckets: ['bucket-a', 'bucket-b'],
        secondaryBucketFamilies: ['codeCounts'],
      },
      'missing-role-patterns.registry.json': {
        missingRolePatterns: [
          {
            patternId: 'single-extension',
            dotSegments: 2,
            semanticSegmentIndex: 0,
            extensionSegmentIndexes: [1],
          },
        ],
      },
      'finding-policy.registry.json': {
        version: '1',
        outcomes: {
          ...readBuiltinRegistry('finding-policy.registry.json').outcomes,
          canonical: {
            code: 'TEMP_CANONICAL',
            severity: 'info',
            classification: 'canonical',
            message: 'Temporary canonical policy.',
            ruleRef: 'temp-rule-ref',
          },
        },
      },
    },
    (registryRoot) => {
      const result = resolveNamingRegistryInputs({ registryRoot });

      assert.deepEqual(result.roles, [
        { role: 'temp-role', category: 'from-temp-root', status: 'active' },
      ]);
      assert.deepEqual(result.reportableExtensions, ['.alt', '.tmp']);
      assert.deepEqual(result.reportableRootFiles, ['root-a.json', 'root-b.json']);
      assert.deepEqual(result.summaryBuckets, {
        classificationBuckets: ['bucket-a', 'bucket-b'],
        secondaryBucketFamilies: ['codeCounts'],
      });
      assert.equal(result.missingRolePatterns.length, 1);
      assert.equal(result.findingPolicy.canonical.code, 'TEMP_CANONICAL');
      assert.notEqual(result.registryDigests.resolved, result.registryDigests.builtin);

      const summary = summarizeFindings([], toSummaryBucketsRuntime(result.summaryBuckets));
      assert.ok(Object.hasOwn(summary, 'counts'));
      assert.ok(Object.hasOwn(summary, 'codeCounts'));
    },
  );
});

test('an incomplete registry root throws; there is no per-file Builtin fallback', () => {
  withNamingRegistryRoot({ 'reportable-root-files.registry.json': null }, (registryRoot) => {
    assert.throws(() => resolveNamingRegistryInputs({ registryRoot }), /ENOENT/u);
  });
});

test('legacy grouped roles filename is accepted when category-role-perspective is absent', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': { categories: [{ category: 'from-temp-root' }] },
      'category-role-perspective.registry.json': null,
      'roles.registry.json': {
        rolesByCategory: { 'from-temp-root': [{ role: 'temp-legacy-role', status: 'active' }] },
      },
    },
    (registryRoot) => {
      const result = resolveNamingRegistryInputs({ registryRoot });
      assert.deepEqual(result.roles, [
        { role: 'temp-legacy-role', category: 'from-temp-root', status: 'active' },
      ]);
    },
  );
});

test('category-role-perspective wins over legacy grouped roles membership when both exist', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': { categories: [{ category: 'from-temp-root' }] },
      'category-role-perspective.registry.json': {
        rolesByCategory: { 'from-temp-root': [{ role: 'temp-new-role', status: 'active' }] },
      },
      'roles.registry.json': {
        rolesByCategory: { 'from-temp-root': [{ role: 'temp-legacy-role', status: 'active' }] },
      },
    },
    (registryRoot) => {
      const result = resolveNamingRegistryInputs({ registryRoot });
      assert.ok(result.roles.some((entry) => entry.role === 'temp-new-role'));
      assert.ok(!result.roles.some((entry) => entry.role === 'temp-legacy-role'));
    },
  );
});

const ARCHITECTURE_SUPPORT_CATEGORIES = { categories: [{ category: 'architecture-support' }] };

test('canonical roles.registry.json status wins over category-role perspective status', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': ARCHITECTURE_SUPPORT_CATEGORIES,
      'category-role-perspective.registry.json': {
        rolesByCategory: { 'architecture-support': [{ role: 'host', status: 'deprecated' }] },
      },
      'roles.registry.json': { roles: [{ role: 'host', status: 'active', definition: 'host role' }] },
    },
    (registryRoot) => {
      assert.deepEqual(resolveNamingRegistryInputs({ registryRoot }).roles, [
        { role: 'host', category: 'architecture-support', status: 'active' },
      ]);
    },
  );
});

test('legacy grouped roles keep their status when category-role perspective is absent', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': ARCHITECTURE_SUPPORT_CATEGORIES,
      'category-role-perspective.registry.json': null,
      'roles.registry.json': {
        rolesByCategory: { 'architecture-support': [{ role: 'host', status: 'deprecated' }] },
      },
    },
    (registryRoot) => {
      assert.deepEqual(resolveNamingRegistryInputs({ registryRoot }).roles, [
        { role: 'host', category: 'architecture-support', status: 'deprecated' },
      ]);
    },
  );
});

test('perspective membership stays authoritative when canonical roles registry is malformed', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': ARCHITECTURE_SUPPORT_CATEGORIES,
      'category-role-perspective.registry.json': {
        rolesByCategory: { 'architecture-support': [{ role: 'host', status: 'deprecated' }] },
      },
      'roles.registry.json': '{ not valid json',
    },
    (registryRoot) => {
      assert.deepEqual(resolveNamingRegistryInputs({ registryRoot }).roles, [
        { role: 'host', category: 'architecture-support', status: 'deprecated' },
      ]);
    },
  );
});

test('perspective membership-only entries can use legacy grouped roles status', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': ARCHITECTURE_SUPPORT_CATEGORIES,
      'category-role-perspective.registry.json': {
        rolesByCategory: { 'architecture-support': [{ role: 'host' }] },
      },
      'roles.registry.json': {
        rolesByCategory: { 'architecture-support': [{ role: 'host', status: 'deprecated' }] },
      },
    },
    (registryRoot) => {
      assert.deepEqual(resolveNamingRegistryInputs({ registryRoot }).roles, [
        { role: 'host', category: 'architecture-support', status: 'deprecated' },
      ]);
    },
  );
});

test('canonical roles array status wins over perspective status and legacy grouped status', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': ARCHITECTURE_SUPPORT_CATEGORIES,
      'category-role-perspective.registry.json': {
        rolesByCategory: { 'architecture-support': [{ role: 'host', status: 'deprecated' }] },
      },
      'roles.registry.json': {
        roles: [{ role: 'host', status: 'active' }],
        rolesByCategory: { 'architecture-support': [{ role: 'host', status: 'deprecated' }] },
      },
    },
    (registryRoot) => {
      assert.deepEqual(resolveNamingRegistryInputs({ registryRoot }).roles, [
        { role: 'host', category: 'architecture-support', status: 'active' },
      ]);
    },
  );
});

test('legacy grouped roles registry stays a strict membership source when perspective is absent', () => {
  withNamingRegistryRoot(
    {
      'categories.registry.json': ARCHITECTURE_SUPPORT_CATEGORIES,
      'category-role-perspective.registry.json': null,
      'roles.registry.json': '{ malformed legacy membership source',
    },
    (registryRoot) => {
      assert.throws(() => resolveNamingRegistryInputs({ registryRoot }), SyntaxError);
    },
  );
});

test('roles with a category outside categories.registry.json are rejected', () => {
  withNamingRegistryRoot(
    {
      'category-role-perspective.registry.json': {
        rolesByCategory: { 'not-a-category': [{ role: 'host', status: 'active' }] },
      },
    },
    (registryRoot) => {
      assert.throws(
        () => resolveNamingRegistryInputs({ registryRoot }),
        /Invalid roles registry: category must be one of/u,
      );
    },
  );
});

test('reportable extensions without a leading dot are rejected', () => {
  withNamingRegistryRoot(
    { 'reportable-extensions.registry.json': { version: '1', reportableExtensions: ['ts'] } },
    (registryRoot) => {
      assert.throws(
        () => resolveNamingRegistryInputs({ registryRoot }),
        /each extension must start with "\."/u,
      );
    },
  );
});

test('activeSet only drives the derived transitional registryState and registrySource fields', () => {
  const result = resolveNamingRegistryInputs({ activeSet: 'custom' });

  assert.equal(result.registryState, 'custom');
  assert.equal(result.registrySource, 'custom');
  assert.equal(result.registryDigests.resolved, result.registryDigests.builtin);
});

test('registryDigests.custom digests a valid Custom root and falls back to builtin when it is invalid', () => {
  withNamingRegistryRoot(
    { 'reportable-extensions.registry.json': { version: '1', reportableExtensions: ['.ts', '.abc'] } },
    (customRegistryRoot) => {
      const result = resolveNamingRegistryInputs({ customRegistryRoot });

      assert.notEqual(result.registryDigests.custom, result.registryDigests.builtin);
      assert.equal(result.registryDigests.resolved, result.registryDigests.builtin);
      assert.deepEqual(result.reportableExtensions, INTENDED_BUILTIN_REPORTABLE_EXTENSIONS);
    },
  );

  withNamingRegistryRoot({ 'case-rules.registry.json': '{ broken' }, (customRegistryRoot) => {
    const result = resolveNamingRegistryInputs({ customRegistryRoot });
    assert.equal(result.registryDigests.custom, result.registryDigests.builtin);
  });
});

test('the legacy in-package custom set converts to a complete root with its pre-#41 digest', () => {
  const legacyRoles = JSON.parse(
    fs.readFileSync(path.join(LEGACY_CUSTOM_FIXTURE_ROOT, 'roles.registry.custom.json'), 'utf8'),
  );
  const legacyExtensions = JSON.parse(
    fs.readFileSync(
      path.join(LEGACY_CUSTOM_FIXTURE_ROOT, 'reportable-extensions.registry.custom.json'),
      'utf8',
    ),
  );
  const rolesByCategory = {};
  for (const { role, category, notes } of legacyRoles) {
    rolesByCategory[category] ??= [];
    rolesByCategory[category].push(notes === undefined ? { role } : { role, notes });
  }

  withNamingRegistryRoot(
    {
      'category-role-perspective.registry.json': { version: '1', rolesByCategory },
      'roles.registry.json': {
        version: '1',
        roles: legacyRoles.map(({ role, status }) => ({ role, status })),
      },
      'reportable-extensions.registry.json': { version: '1', reportableExtensions: legacyExtensions },
    },
    (customRegistryRoot) => {
      const result = resolveNamingRegistryInputs({ customRegistryRoot });
      assert.equal(result.registryDigests.custom, LEGACY_CUSTOM_SET_DIGEST);
    },
  );
});

test('validateNamingRegistrySet passes the Builtin root', () => {
  assert.deepEqual(validateNamingRegistrySet(NAMING_BUILTIN_REGISTRY_ROOT), []);
});

test('validateNamingRegistrySet attributes failures per registry in registry-id order', () => {
  withNamingRegistryRoot(
    {
      'reportable-extensions.registry.json': { version: '1', reportableExtensions: ['ts'] },
      'case-rules.registry.json': '{ broken',
      'summary-buckets.registry.json': null,
    },
    (registryRoot) => {
      const failures = validateNamingRegistrySet(registryRoot);

      assert.deepEqual(
        failures.map((failure) => failure.registryId),
        ['naming/case-rules', 'naming/reportable-extensions', 'naming/summary-buckets'],
      );
      for (const failure of failures) {
        assert.equal(typeof failure.detail, 'string');
        assert.ok(failure.detail.length > 0);
      }
    },
  );
});
