/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§6.1)
 * Responsibility: Naming's registry inventory for the Builtin/Custom registry lifecycle.
 * Invariants: lists only Naming-owned registries; descriptors declare comparison canonicalization
 *   only (spec §5), and set-like paths are declared only where Naming's loaders already treat
 *   order as insignificant; comparison declarations state entry identity separately (spec §8.4)
 *   and cover every root field except `version`.
 */
import { fileURLToPath } from 'node:url';

export const NAMING_REGISTRY_SLICE_ID = 'naming';

export const NAMING_BUILTIN_REGISTRY_ROOT = fileURLToPath(new URL('./_builtin/', import.meta.url));

const READABLE_VERSIONS_V1 = Object.freeze(['1']);

// `comparison` is the registry's entry identity for three-way comparison (spec §8.4).
// `reconciliation` declares which of its collections accept merge-fields or add-alongside (spec
// §12.7); the reasons are recorded in doc/Audits/registry-reconciliation-capabilities.audit.md.
// `migrations` declares the steps from older `version` values, each naming a transform of the
// slice's migration module and the descriptor of its source version (spec §8.3). Empty while no
// registry has changed shape. `references` declares the entries of other registries of the same slice
// that this registry's entries name (spec §12.11): each edge's id, target registry and target `keyed`
// collection. The slice's reference resolver interprets them; the edges are recorded with the
// validation that enforces them in doc/Audits/registry-reference-edges.audit.md.
const defineNamingRegistry = (name, descriptor, comparison, reconciliation = [], migrations = [], references = []) =>
  Object.freeze({
    registryId: `${NAMING_REGISTRY_SLICE_ID}/${name}`,
    name,
    fileName: `${name}.registry.json`,
    readableVersions: READABLE_VERSIONS_V1,
    descriptor: Object.freeze(descriptor),
    comparison: Object.freeze(comparison.map((collection) => Object.freeze(collection))),
    reconciliation: Object.freeze(
      reconciliation.map((declaration) =>
        Object.freeze({
          ...declaration,
          ...(declaration.mergeFields
            ? { mergeFields: Object.freeze(declaration.mergeFields.map((group) => Object.freeze([...group]))) }
            : {}),
        }),
      ),
    ),
    migrations: Object.freeze(
      migrations.map((step) => Object.freeze({ ...step, fromDescriptor: Object.freeze(step.fromDescriptor) })),
    ),
    references: Object.freeze(references.map((edge) => Object.freeze({ ...edge }))),
  });

// [6.1] cfg-registryLifecycle · Container · "Naming registry inventory"
export const NAMING_REGISTRY_INVENTORY = Object.freeze([
  defineNamingRegistry('agnostic-core-meanings', { setLike: [{ path: 'meanings', key: 'meaning' }] }, [
    { kind: 'keyed', path: 'meanings', key: 'meaning' },
  ], [{ path: 'meanings', mergeFields: [['status'], ['definition']] }]),
  // One case policy for semantic names.
  defineNamingRegistry('case-rules', {}, [{ kind: 'value', path: 'semanticName' }]),
  defineNamingRegistry('categories', { setLike: [{ path: 'categories', key: 'category' }] }, [
    { kind: 'keyed', path: 'categories', key: 'category' },
  ], [{ path: 'categories', mergeFields: [['status'], ['definition']] }]),
  defineNamingRegistry('category-role-perspective', {
    setLike: [
      { path: 'rolesByCategory.*', key: 'role' },
      { path: 'rolesByCategory.*[].agnosticCoreMeanings' },
      { path: 'rolesByCategory.*[].baseMeanings' },
      { path: 'rolesByCategory.*[].overlayMeanings' },
    ],
  }, [
    // A declared category may have no roles, so each category is also a group-presence entry.
    { kind: 'keyed', path: 'rolesByCategory.*', key: 'role' },
  ], [], [], [
    { edgeId: 'naming/perspective-category', to: 'naming/categories', targetCollection: 'categories' },
    { edgeId: 'naming/perspective-role-definition', to: 'naming/roles', targetCollection: 'roles' },
    { edgeId: 'naming/perspective-meaning', to: 'naming/agnostic-core-meanings', targetCollection: 'meanings' },
    { edgeId: 'naming/perspective-inherits-from', to: 'naming/category-role-perspective', targetCollection: 'rolesByCategory.*' },
  ]),
  // An outcome's code, severity and classification are its behavior; the rest is display text.
  defineNamingRegistry('finding-policy', {}, [{ kind: 'value', path: 'outcomes.*' }], [
    { path: 'outcomes.*', mergeFields: [['classification', 'code', 'severity'], ['message'], ['ruleRef'], ['suggestedFix']] },
  ]),
  // The projection indexes active patterns by their unique folder name and sorts its observations,
  // so pattern order carries no meaning; `tokenOrder` stays ordered.
  defineNamingRegistry('folder-composition-patterns', {
    setLike: [
      { path: 'folderCompositionPatterns', key: 'patternId' },
      { path: 'folderSemanticContextPatterns', key: 'patternId' },
    ],
  }, [
    { kind: 'keyed', path: 'folderCompositionPatterns', key: 'patternId' },
    { kind: 'keyed', path: 'folderSemanticContextPatterns', key: 'patternId' },
  ], [
    // The matching fields of a pattern move together.
    {
      path: 'folderCompositionPatterns',
      mergeFields: [
        ['status'],
        ['definition'],
        ['compositionKind', 'confidence', 'folderName', 'qualification', 'semanticQualifier', 'structuralRoleToken', 'tokenOrder'],
      ],
    },
    {
      path: 'folderSemanticContextPatterns',
      mergeFields: [['status'], ['definition'], ['confidence', 'folderName', 'qualification', 'semanticContext']],
    },
  ]),
  // Detection is first-match, so pattern order is part of the policy.
  defineNamingRegistry('missing-role-patterns', {
    setLike: [{ path: 'missingRolePatterns[].extensionSegmentIndexes' }],
  }, [{ kind: 'keyed', path: 'missingRolePatterns', key: 'patternId', ordered: true }]),
  defineNamingRegistry('reportable-extensions', { setLike: [{ path: 'reportableExtensions' }] }, [
    { kind: 'members', path: 'reportableExtensions' },
  ]),
  defineNamingRegistry('reportable-root-files', { setLike: [{ path: 'reportableRootFiles' }] }, [
    { kind: 'members', path: 'reportableRootFiles' },
  ]),
  defineNamingRegistry('roles', {
    setLike: [{ path: 'roles', key: 'role' }],
    omitEmpty: ['roles[].notes'],
  }, [{ kind: 'keyed', path: 'roles', key: 'role' }], [{ path: 'roles', mergeFields: [['status'], ['definition'], ['notes']] }]),
  // `specialCases` is first-match ordered; its match lists are membership tests.
  // Its records have no stable key, so the ordered list is compared as one value.
  defineNamingRegistry('special-cases', {
    setLike: [{ path: 'specialCases[].match.suffixEquals' }, { path: 'specialCases[].match.basenameEquals' }],
  }, [{ kind: 'value', path: 'specialCases' }]),
  // Bucket lists are ordered: their order is the summary order.
  defineNamingRegistry('summary-buckets', {}, [
    { kind: 'value', path: 'classificationBuckets' },
    { kind: 'value', path: 'secondaryBucketFamilies' },
  ]),
  defineNamingRegistry('walk-exclusions', {
    setLike: [{ path: 'excludedDirectories' }, { path: 'allowDotFiles' }],
  }, [
    { kind: 'members', path: 'excludedDirectories' },
    { kind: 'members', path: 'allowDotFiles' },
    { kind: 'value', path: 'skipDotDirectories' },
  ]),
]);

// [6.1] cfg-registryLifecycle · Container · "Naming retired registry inventory"
// Registries a release removed or renamed keep their id and canonical-form descriptor here, so an
// orphan's Baseline copy from an earlier release can still be verified (lifecycle spec §12.1). Empty
// until a naming registry is retired.
export const NAMING_RETIRED_REGISTRY_INVENTORY = Object.freeze([]);
