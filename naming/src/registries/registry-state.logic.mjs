/**
 * Naming registry-state owner (#41 registry lifecycle).
 *
 * Loads, validates and canonicalizes Naming's registry payload from one resolved Naming registry
 * root: the package Builtin root, or a consumer Custom root chosen by the suite registry lifecycle
 * (src/core/registry-lifecycle/). It does not choose the source, merge sources, or read
 * configuration. Spec: doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md
 * (§9.3, §11.3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { stableStringify, sha256Hex } from '../../../src/core/validator-report-meta.logic.mjs';
import {
  assertAllowedFields,
  assertRegistryEntries,
  assertRegistryRootFields,
  isPathSegmentName,
  isSingleFileExtension,
} from '../../../src/core/registry-entry-shape.logic.mjs';
import { NAMING_SUPPORTED_SEMANTIC_NAME_STYLES } from '../naming-validator.contracts.mjs';
import { loadSummaryBucketsFromFile } from './naming-summary-buckets-registry.logic.mjs';
import { loadMissingRolePatternsFromFile } from './naming-missing-role-patterns-registry.logic.mjs';
import { loadFindingPolicyFromFile } from './naming-finding-policy-registry.logic.mjs';
import { loadNamingWalkExclusionsFromRegistryRoot } from './naming-walk-exclusions-registry.logic.mjs';
import { loadNamingSpecialCaseRulesFromRegistryRoot } from './naming-special-case-rules-registry.logic.mjs';
import { loadNamingFolderCompositionPatternsRegistryFromRegistryRoot } from './naming-folder-composition-patterns-registry.logic.mjs';
import { validateAgnosticCoreMeaningsRegistryFromRegistryRoot } from './naming-agnostic-core-meanings-registry.logic.mjs';
import {
  NAMING_BUILTIN_REGISTRY_ROOT,
  NAMING_REGISTRY_INVENTORY,
  NAMING_REGISTRY_SLICE_ID,
} from './naming-registry-inventory.knowledge.mjs';

const ROLES_REGISTRY_FILENAME = 'roles.registry.json';
const CATEGORY_ROLE_PERSPECTIVE_REGISTRY_FILENAME = 'category-role-perspective.registry.json';
const ALLOWED_ROLE_STATUSES = new Set(['active', 'deprecated']);
const ROLE_FIELDS = Object.freeze(['role', 'status', 'definition', 'notes']);
// A perspective entry carries membership, notes and meanings. Role status lives in roles.registry.json,
// which always covers a valid perspective, so a perspective `status` would never be read.
const PERSPECTIVE_ENTRY_FIELDS = Object.freeze([
  'role',
  'notes',
  'agnosticCoreMeanings',
  'baseMeanings',
  'overlayMeanings',
  'inheritsFrom',
]);

const loadCategorySet = ({ registryRoot }) => {
  const parsed = loadJsonFile(path.join(registryRoot, 'categories.registry.json'));
  const categories = parsed?.categories;

  if (!Array.isArray(categories)) {
    throw new Error('Invalid categories registry: expected a categories array.');
  }

  const categorySet = new Set();

  for (const categoryEntry of categories) {
    if (!categoryEntry || typeof categoryEntry !== 'object' || Array.isArray(categoryEntry)) {
      throw new Error(
        'Invalid categories registry: each category entry must be an object.',
      );
    }

    const category =
      typeof categoryEntry.category === 'string' ? categoryEntry.category.trim() : '';
    if (!category) {
      throw new Error(
        'Invalid categories registry: each category entry must include a non-empty category string.',
      );
    }

    categorySet.add(category);
  }

  return categorySet;
};

const canonicalizeRole = (roleEntry, { allowedCategories }) => {
  if (!roleEntry || typeof roleEntry !== 'object' || Array.isArray(roleEntry)) {
    throw new Error('Invalid roles registry: each entry must be an object.');
  }

  const role = typeof roleEntry.role === 'string' ? roleEntry.role.trim() : '';
  const category = typeof roleEntry.category === 'string' ? roleEntry.category.trim() : '';
  const status = typeof roleEntry.status === 'string' ? roleEntry.status.trim() : '';

  if (!role || !category || !status) {
    throw new Error(
      'Invalid roles registry: role, category, and status must be non-empty strings.',
    );
  }

  if (!allowedCategories.has(category)) {
    const allowedCategoriesLabel = [...allowedCategories].sort((a, b) => a.localeCompare(b));
    throw new Error(
      `Invalid roles registry: category must be one of ${allowedCategoriesLabel.join(', ')}.`,
    );
  }

  if (!ALLOWED_ROLE_STATUSES.has(status)) {
    throw new Error('Invalid roles registry: status must be "active" or "deprecated".');
  }

  const canonicalRole = { role, category, status };

  if (roleEntry.notes !== undefined) {
    if (typeof roleEntry.notes !== 'string') {
      throw new Error('Invalid roles registry: notes must be a string when provided.');
    }

    const notes = roleEntry.notes.trim();
    if (notes) {
      canonicalRole.notes = notes;
    }
  }

  return canonicalRole;
};

const canonicalizeRoles = (roles, { allowedCategories }) => {
  const dedupedByRole = new Map();

  for (const roleEntry of roles) {
    const canonicalRole = canonicalizeRole(roleEntry, { allowedCategories });
    if (!dedupedByRole.has(canonicalRole.role)) {
      dedupedByRole.set(canonicalRole.role, canonicalRole);
    }
  }

  return [...dedupedByRole.values()].sort((a, b) => a.role.localeCompare(b.role));
};

const canonicalizeExtensions = (extensions) => {
  if (!Array.isArray(extensions)) {
    throw new Error('Invalid reportable extensions registry: expected an array of strings.');
  }

  const deduped = new Set();

  for (const extensionValue of extensions) {
    if (typeof extensionValue !== 'string') {
      throw new Error(
        'Invalid reportable extensions registry: each extension must be a non-empty string.',
      );
    }

    const extension = extensionValue.trim();
    if (!extension) {
      throw new Error(
        'Invalid reportable extensions registry: each extension must be a non-empty string.',
      );
    }

    // Candidates are matched by `path.extname`, which yields one extension, such as ".ts".
    if (!isSingleFileExtension(extension)) {
      throw new Error(
        `Invalid reportable extensions registry: "${extension}" must be a single extension starting with ".", such as ".ts".`,
      );
    }

    deduped.add(extension);
  }

  return [...deduped].sort((a, b) => a.localeCompare(b));
};

const canonicalizeCaseRules = (caseRulesValue) => {
  if (!caseRulesValue || typeof caseRulesValue !== 'object' || Array.isArray(caseRulesValue)) {
    throw new Error('Invalid case-rules registry: expected an object.');
  }

  const semanticName = caseRulesValue.semanticName;
  if (!semanticName || typeof semanticName !== 'object' || Array.isArray(semanticName)) {
    throw new Error('Invalid case-rules registry: expected semanticName object.');
  }

  assertAllowedFields(semanticName, ['style'], { registryLabel: 'case-rules', label: 'semanticName' });

  const style = typeof semanticName.style === 'string' ? semanticName.style.trim() : '';
  if (!NAMING_SUPPORTED_SEMANTIC_NAME_STYLES.includes(style)) {
    throw new Error(
      `Invalid case-rules registry: semanticName.style must be one of ${NAMING_SUPPORTED_SEMANTIC_NAME_STYLES.join(', ')}.`,
    );
  }

  return {
    semanticName: {
      style,
    },
  };
};

const digestPayload = (payload) => sha256Hex(stableStringify(payload));

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const loadCanonicalRoleStatusByRole = ({ registryRoot }) => {
  const canonicalRolesPath = path.join(registryRoot, ROLES_REGISTRY_FILENAME);

  if (!fs.existsSync(canonicalRolesPath)) {
    return null;
  }

  let parsed;

  try {
    parsed = loadJsonFile(canonicalRolesPath);
  } catch {
    return null;
  }

  const roles = parsed?.roles;

  if (!Array.isArray(roles)) {
    return null;
  }

  const statusByRole = new Map();

  for (const roleEntry of roles) {
    if (!roleEntry || typeof roleEntry !== 'object' || Array.isArray(roleEntry)) {
      continue;
    }

    const role = typeof roleEntry.role === 'string' ? roleEntry.role.trim() : '';
    const status = typeof roleEntry.status === 'string' ? roleEntry.status.trim() : '';

    if (!role || !status || !ALLOWED_ROLE_STATUSES.has(status)) {
      continue;
    }

    if (!statusByRole.has(role)) {
      statusByRole.set(role, status);
    }
  }

  return statusByRole;
};

const loadLegacyGroupedRoleStatusByRole = ({ registryRoot }) => {
  const legacyRolesPath = path.join(registryRoot, ROLES_REGISTRY_FILENAME);

  if (!fs.existsSync(legacyRolesPath)) {
    return null;
  }

  let parsed;

  try {
    parsed = loadJsonFile(legacyRolesPath);
  } catch {
    return null;
  }

  const rolesByCategory = parsed?.rolesByCategory;

  if (
    !rolesByCategory ||
    typeof rolesByCategory !== 'object' ||
    Array.isArray(rolesByCategory)
  ) {
    return null;
  }

  const statusByRole = new Map();

  for (const roles of Object.values(rolesByCategory)) {
    if (!Array.isArray(roles)) {
      continue;
    }

    for (const roleEntry of roles) {
      if (!roleEntry || typeof roleEntry !== 'object' || Array.isArray(roleEntry)) {
        continue;
      }

      const role = typeof roleEntry.role === 'string' ? roleEntry.role.trim() : '';
      const status = typeof roleEntry.status === 'string' ? roleEntry.status.trim() : '';

      if (!role || !status || !ALLOWED_ROLE_STATUSES.has(status)) {
        continue;
      }

      if (!statusByRole.has(role)) {
        statusByRole.set(role, status);
      }
    }
  }

  return statusByRole;
};

const loadRolesPayload = ({ registryRoot }) => {
  const categoryRolePerspectivePath = path.join(
    registryRoot,
    CATEGORY_ROLE_PERSPECTIVE_REGISTRY_FILENAME,
  );
  const hasCategoryRolePerspective = fs.existsSync(categoryRolePerspectivePath);
  const membershipSourcePath = hasCategoryRolePerspective
    ? categoryRolePerspectivePath
    : path.join(registryRoot, ROLES_REGISTRY_FILENAME);

  const parsed = loadJsonFile(membershipSourcePath);
  const rolesByCategory = parsed?.rolesByCategory;

  if (!rolesByCategory || typeof rolesByCategory !== 'object' || Array.isArray(rolesByCategory)) {
    throw new Error('Invalid roles registry: expected rolesByCategory object.');
  }

  const canonicalStatusByRole = hasCategoryRolePerspective
    ? loadCanonicalRoleStatusByRole({ registryRoot })
    : null;
  const legacyGroupedStatusByRole =
    hasCategoryRolePerspective && canonicalStatusByRole === null
      ? loadLegacyGroupedRoleStatusByRole({ registryRoot })
      : null;

  const flattenedRoles = [];

  for (const [category, roles] of Object.entries(rolesByCategory)) {
    if (!Array.isArray(roles)) {
      throw new Error(
        `Invalid roles registry: category "${category}" must map to an array.`,
      );
    }

    for (const roleEntry of roles) {
      const role = typeof roleEntry?.role === 'string' ? roleEntry.role.trim() : '';
      const canonicalStatus = role ? canonicalStatusByRole?.get(role) : undefined;
      const perspectiveStatus = roleEntry?.status;
      const legacyGroupedStatus = role ? legacyGroupedStatusByRole?.get(role) : undefined;
      const status = canonicalStatus ?? perspectiveStatus ?? legacyGroupedStatus;
      flattenedRoles.push({ ...roleEntry, category, status });
    }
  }

  const allowedCategories = loadCategorySet({ registryRoot });
  return canonicalizeRoles(flattenedRoles, { allowedCategories });
};

const loadReportableExtensions = ({ registryRoot }) => {
  const parsed = loadJsonFile(
    path.join(registryRoot, 'reportable-extensions.registry.json'),
  );

  if (!Array.isArray(parsed?.reportableExtensions)) {
    throw new Error(
      'Invalid reportable extensions registry: expected reportableExtensions array.',
    );
  }

  return canonicalizeExtensions(parsed.reportableExtensions);
};

const canonicalizeRootFilenames = (rootFilenames) => {
  if (!Array.isArray(rootFilenames)) {
    throw new Error('Invalid reportable root files registry: expected an array of strings.');
  }

  const deduped = new Set();

  for (const rootFilenameValue of rootFilenames) {
    if (typeof rootFilenameValue !== 'string') {
      throw new Error(
        'Invalid reportable root files registry: each root filename must be a non-empty string.',
      );
    }

    const rootFilename = rootFilenameValue.trim();
    if (!rootFilename) {
      throw new Error(
        'Invalid reportable root files registry: each root filename must be a non-empty string.',
      );
    }

    // Candidates are matched by basename, so a value with a path separator would never match.
    if (!isPathSegmentName(rootFilename)) {
      throw new Error(
        `Invalid reportable root files registry: "${rootFilename}" must be a bare file name without a path.`,
      );
    }

    deduped.add(rootFilename);
  }

  return [...deduped].sort((a, b) => a.localeCompare(b));
};

const loadReportableRootFiles = ({ registryRoot }) => {
  const parsed = loadJsonFile(
    path.join(registryRoot, 'reportable-root-files.registry.json'),
  );

  if (!Array.isArray(parsed?.reportableRootFiles)) {
    throw new Error(
      'Invalid reportable root files registry: expected reportableRootFiles array.',
    );
  }

  return canonicalizeRootFilenames(parsed.reportableRootFiles);
};

const loadSummaryBuckets = ({ registryRoot }) =>
  loadSummaryBucketsFromFile(path.join(registryRoot, 'summary-buckets.registry.json'));

const loadMissingRolePatterns = ({ registryRoot }) =>
  loadMissingRolePatternsFromFile(path.join(registryRoot, 'missing-role-patterns.registry.json'));

const loadFindingPolicy = ({ registryRoot }) =>
  loadFindingPolicyFromFile(path.join(registryRoot, 'finding-policy.registry.json'));

const loadCaseRules = ({ registryRoot }) => {
  const parsed = loadJsonFile(path.join(registryRoot, 'case-rules.registry.json'));

  return canonicalizeCaseRules(parsed);
};


const buildNamingRegistryPayload = ({ registryRoot }) => ({
  roles: loadRolesPayload({ registryRoot }),
  reportableExtensions: loadReportableExtensions({ registryRoot }),
  reportableRootFiles: loadReportableRootFiles({ registryRoot }),
  summaryBuckets: loadSummaryBuckets({ registryRoot }),
  missingRolePatterns: loadMissingRolePatterns({ registryRoot }),
  findingPolicy: loadFindingPolicy({ registryRoot }),
  caseRules: loadCaseRules({ registryRoot }),
});

const cachedNamingRegistryPayloadsByRoot = new Map();

// Loads Naming's resolved registry payload from one registry root. Only the package Builtin root is
// cached, because consumer Custom roots are user-editable files.
export const loadNamingRegistryPayload = ({ registryRoot = NAMING_BUILTIN_REGISTRY_ROOT } = {}) => {
  const resolvedRoot = path.resolve(registryRoot);
  const isBuiltinRoot = resolvedRoot === path.resolve(NAMING_BUILTIN_REGISTRY_ROOT);
  if (isBuiltinRoot && cachedNamingRegistryPayloadsByRoot.has(resolvedRoot)) {
    return cachedNamingRegistryPayloadsByRoot.get(resolvedRoot);
  }

  const payload = buildNamingRegistryPayload({ registryRoot: resolvedRoot });
  if (isBuiltinRoot) {
    cachedNamingRegistryPayloadsByRoot.set(resolvedRoot, payload);
  }

  return payload;
};

export const digestNamingRegistryPayload = (payload) => digestPayload(payload);

const toNamingRegistryId = (name) => `${NAMING_REGISTRY_SLICE_ID}/${name}`;

// Strict check of the categories registry records. Runtime loading only needs category names;
// registry-set validation also checks status, definition and unique categories.
const validateCategoriesRegistry = ({ registryRoot }) => {
  loadCategorySet({ registryRoot });
  assertRegistryEntries(loadJsonFile(path.join(registryRoot, 'categories.registry.json')).categories, {
    registryLabel: 'categories',
    listLabel: 'categories',
    keyField: 'category',
    requiredStringFields: ['definition'],
    enumFields: { status: [...ALLOWED_ROLE_STATUSES] },
  });
};

// Strict check of the canonical roles registry (`roles[]: { role, status, definition?, notes? }`)
// and of the perspective → roles reference edge. Runtime loading stays tolerant of a malformed or
// legacy-shaped roles file for older roots; registry-set validation does not.
const validateCanonicalRolesRegistry = ({ registryRoot }) => {
  const parsed = loadJsonFile(path.join(registryRoot, ROLES_REGISTRY_FILENAME));
  const roles = parsed?.roles;
  if (!Array.isArray(roles)) {
    throw new Error('Invalid roles registry: expected a roles array.');
  }

  const canonicalRoles = new Set();
  roles.forEach((roleEntry, index) => {
    if (!roleEntry || typeof roleEntry !== 'object' || Array.isArray(roleEntry)) {
      throw new Error(`Invalid roles registry: roles[${index}] must be an object.`);
    }

    assertAllowedFields(roleEntry, ROLE_FIELDS, { registryLabel: 'roles', label: `roles[${index}]` });

    const role = typeof roleEntry.role === 'string' ? roleEntry.role.trim() : '';
    if (!role) {
      throw new Error(`Invalid roles registry: roles[${index}].role must be a non-empty string.`);
    }

    if (canonicalRoles.has(role)) {
      throw new Error(`Invalid roles registry: role "${role}" is duplicated.`);
    }

    if (!ALLOWED_ROLE_STATUSES.has(roleEntry.status)) {
      throw new Error(`Invalid roles registry: roles[${index}].status must be "active" or "deprecated".`);
    }

    const { definition, notes } = roleEntry;
    if (definition !== undefined && (typeof definition !== 'string' || definition.trim().length === 0)) {
      throw new Error(`Invalid roles registry: roles[${index}].definition must be a non-empty string when provided.`);
    }

    // `notes` is declared omittable (inventory omitEmpty): an empty string or null equals no note.
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      throw new Error(`Invalid roles registry: roles[${index}].notes must be a string when provided.`);
    }

    canonicalRoles.add(role);
  });

  const perspective = loadJsonFile(path.join(registryRoot, CATEGORY_ROLE_PERSPECTIVE_REGISTRY_FILENAME));
  const missingRoles = Object.values(perspective?.rolesByCategory ?? {})
    .flatMap((entries) => (Array.isArray(entries) ? entries : []))
    .map((entry) => (typeof entry?.role === 'string' ? entry.role.trim() : ''))
    .filter((role) => role && !canonicalRoles.has(role));
  if (missingRoles.length > 0) {
    throw new Error(
      `Invalid roles registry: no roles entry for category-role-perspective roles ${[...new Set(missingRoles)].sort().join(', ')}.`,
    );
  }
};

const AGNOSTIC_CORE_MEANINGS_REGISTRY_FILENAME = 'agnostic-core-meanings.registry.json';
const PERSPECTIVE_MEANING_FIELDS = Object.freeze(['agnosticCoreMeanings', 'baseMeanings', 'overlayMeanings']);

// Reference edges of the category-role perspective beyond role membership: meaning lists name
// agnostic core meanings, and `inheritsFrom` names a role in a perspective category.
const validateCategoryRolePerspectiveReferences = ({ registryRoot }) => {
  const perspective = loadJsonFile(path.join(registryRoot, CATEGORY_ROLE_PERSPECTIVE_REGISTRY_FILENAME));
  const rolesByCategory = perspective?.rolesByCategory ?? {};
  const meanings = new Set(
    (loadJsonFile(path.join(registryRoot, AGNOSTIC_CORE_MEANINGS_REGISTRY_FILENAME))?.meanings ?? []).map(
      (entry) => entry?.meaning,
    ),
  );
  const fail = (message) => {
    throw new Error(`Invalid category-role-perspective registry: ${message}`);
  };

  // Every rolesByCategory key names a declared category, including keys with no roles.
  const declaredCategories = loadCategorySet({ registryRoot });
  const undeclaredCategories = Object.keys(rolesByCategory).filter((category) => !declaredCategories.has(category));
  if (undeclaredCategories.length > 0) {
    fail(`rolesByCategory keys not declared in categories: ${undeclaredCategories.sort().join(', ')}.`);
  }

  // A role belongs to exactly one category: runtime keeps the first membership it meets, so a role
  // listed twice would make category order (which comparison digests ignore) decide its category.
  const categoryByRole = new Map();
  for (const [category, entries] of Object.entries(rolesByCategory)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const role = typeof entry?.role === 'string' ? entry.role.trim() : '';
      if (!role) {
        continue;
      }

      if (categoryByRole.has(role)) {
        fail(`role "${role}" is listed under both ${categoryByRole.get(role)} and ${category}.`);
      }

      categoryByRole.set(role, category);
    }
  }

  for (const [category, entries] of Object.entries(rolesByCategory)) {
    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      const label = `rolesByCategory.${category}[${index}]`;
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        assertAllowedFields(entry, PERSPECTIVE_ENTRY_FIELDS, { registryLabel: 'category-role-perspective', label });
      }

      for (const field of PERSPECTIVE_MEANING_FIELDS) {
        const values = entry?.[field];
        if (values === undefined) {
          continue;
        }

        if (!Array.isArray(values) || values.length === 0 || !values.every((value) => meanings.has(value))) {
          fail(`${label}.${field} must be a non-empty array of agnostic core meanings.`);
        }
      }

      const parent = entry?.inheritsFrom;
      if (parent === undefined) {
        return;
      }

      if (parent !== null && typeof parent === 'object' && !Array.isArray(parent)) {
        assertAllowedFields(parent, ['category', 'role'], {
          registryLabel: 'category-role-perspective',
          label: `${label}.inheritsFrom`,
        });
      }

      const parentExists =
        parent !== null &&
        typeof parent === 'object' &&
        Array.isArray(rolesByCategory[parent.category]) &&
        rolesByCategory[parent.category].some((candidate) => candidate?.role === parent.role);
      if (!parentExists) {
        fail(`${label}.inheritsFrom must name a { category, role } present in rolesByCategory.`);
      }
    });
  }
};

// Root fields of each Naming registry besides `version`. Payload roots are closed: a loader ignores
// an undeclared root field, so it would pass validation and never reach runtime.
const NAMING_REGISTRY_ROOT_FIELDS = Object.freeze({
  'agnostic-core-meanings': ['meanings'],
  'case-rules': ['semanticName'],
  categories: ['categories'],
  'category-role-perspective': ['rolesByCategory'],
  'finding-policy': ['outcomes'],
  'folder-composition-patterns': ['folderCompositionPatterns', 'folderSemanticContextPatterns'],
  'missing-role-patterns': ['missingRolePatterns'],
  'reportable-extensions': ['reportableExtensions'],
  'reportable-root-files': ['reportableRootFiles'],
  roles: ['roles'],
  'special-cases': ['specialCases'],
  'summary-buckets': ['classificationBuckets', 'secondaryBucketFamilies'],
  'walk-exclusions': ['excludedDirectories', 'skipDotDirectories', 'allowDotFiles'],
});

// Naming's registry-set validation entry point (lifecycle spec §9.3). Runs Naming's own shape and
// reference validation over one registry root, one registry at a time, and returns a
// deterministic list of `{ registryId, detail }` failures. It builds no runtime state.
export const validateNamingRegistrySet = (registryRoot) => {
  const checks = [
    ['agnostic-core-meanings', () => validateAgnosticCoreMeaningsRegistryFromRegistryRoot(registryRoot)],
    ['categories', () => validateCategoriesRegistry({ registryRoot })],
    [
      'category-role-perspective',
      () => {
        loadRolesPayload({ registryRoot });
        validateCategoryRolePerspectiveReferences({ registryRoot });
      },
    ],
    ['reportable-extensions', () => loadReportableExtensions({ registryRoot })],
    ['reportable-root-files', () => loadReportableRootFiles({ registryRoot })],
    ['roles', () => validateCanonicalRolesRegistry({ registryRoot })],
    ['summary-buckets', () => loadSummaryBuckets({ registryRoot })],
    ['missing-role-patterns', () => loadMissingRolePatterns({ registryRoot })],
    ['finding-policy', () => loadFindingPolicy({ registryRoot })],
    ['case-rules', () => loadCaseRules({ registryRoot })],
    ['walk-exclusions', () => loadNamingWalkExclusionsFromRegistryRoot(registryRoot)],
    ['special-cases', () => loadNamingSpecialCaseRulesFromRegistryRoot(registryRoot)],
    [
      'folder-composition-patterns',
      () => loadNamingFolderCompositionPatternsRegistryFromRegistryRoot(registryRoot),
    ],
  ];
  // Every inventory registry has exactly one check; a gap is a programming error, never a pass.
  const inventoryNames = NAMING_REGISTRY_INVENTORY.map((entry) => entry.name).sort();
  const checkedNames = checks.map(([name]) => name).sort();
  const rootFieldNames = Object.keys(NAMING_REGISTRY_ROOT_FIELDS).sort();
  if (
    JSON.stringify(inventoryNames) !== JSON.stringify(checkedNames) ||
    JSON.stringify(inventoryNames) !== JSON.stringify(rootFieldNames)
  ) {
    throw new Error('Naming registry-set validation must check every Naming inventory registry exactly once.');
  }

  const failures = [];

  for (const [name, check] of checks) {
    try {
      assertRegistryRootFields(
        loadJsonFile(path.join(registryRoot, `${name}.registry.json`)),
        NAMING_REGISTRY_ROOT_FIELDS[name],
        { registryLabel: name },
      );
      check();
    } catch (error) {
      failures.push({ registryId: toNamingRegistryId(name), detail: error.message });
    }
  }

  return failures.sort((left, right) =>
    left.registryId === right.registryId ? 0 : left.registryId < right.registryId ? -1 : 1,
  );
};

const tryLoadNamingRegistryPayload = (registryRoot) => {
  try {
    return loadNamingRegistryPayload({ registryRoot });
  } catch {
    return null;
  }
};

// Resolves Naming's registry inputs for one run (lifecycle spec §6, §11.3).
// - `registryRoot`: the resolved (active) Naming registry root; defaults to Builtin.
// - `activeSet`: the lifecycle's active set; defaults to `builtin`.
// - `customRegistryRoot`: the consumer Custom Naming root when a Custom set exists, used only for
//   the transitional `registryDigests.custom` value.
export const resolveNamingRegistryInputs = ({
  registryRoot = NAMING_BUILTIN_REGISTRY_ROOT,
  activeSet = 'builtin',
  customRegistryRoot,
} = {}) => {
  const resolvedPayload = loadNamingRegistryPayload({ registryRoot });
  const builtinPayload = loadNamingRegistryPayload();
  const builtinDigest = digestPayload(builtinPayload);
  const customPayload = customRegistryRoot ? tryLoadNamingRegistryPayload(customRegistryRoot) : null;

  return {
    // Derived, deprecated transitional fields (lifecycle spec §11.3).
    registryState: activeSet,
    registrySource: activeSet,
    registryDigests: {
      builtin: builtinDigest,
      custom: customPayload ? digestPayload(customPayload) : builtinDigest,
      resolved: digestPayload(resolvedPayload),
    },
    roles: resolvedPayload.roles,
    reportableExtensions: resolvedPayload.reportableExtensions,
    reportableRootFiles: resolvedPayload.reportableRootFiles,
    summaryBuckets: resolvedPayload.summaryBuckets,
    missingRolePatterns: resolvedPayload.missingRolePatterns,
    findingPolicy: resolvedPayload.findingPolicy,
    caseRules: resolvedPayload.caseRules,
  };
};
