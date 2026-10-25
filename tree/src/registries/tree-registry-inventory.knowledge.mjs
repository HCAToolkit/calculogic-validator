/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§6.1)
 * Responsibility: Tree's registry inventory for the Builtin/Custom registry lifecycle.
 * Invariants: lists only Tree-owned registries; descriptors declare comparison canonicalization
 *   only (spec §5), and set-like paths are declared only where Tree's loaders already treat
 *   order as insignificant; comparison declarations state entry identity separately (spec §8.4).
 */
import { fileURLToPath } from 'node:url';

export const TREE_REGISTRY_SLICE_ID = 'tree';

export const TREE_BUILTIN_REGISTRY_ROOT = fileURLToPath(new URL('./_builtin/', import.meta.url));

const READABLE_VERSIONS_V1 = Object.freeze(['1']);

// `comparison` is the registry's entry identity for three-way comparison (spec §8.4).
// `reconciliation` declares which of its collections accept merge-fields or add-alongside (spec
// §12.7); the reasons are recorded in doc/Audits/registry-reconciliation-capabilities.audit.md.
// `migrations` declares the steps from older `version` values, each naming a transform of the
// slice's migration module (`tree-registry-migrations.logic.mjs`) and the descriptor of its source
// version (spec §8.3). `readableVersions` lists the versions the runtime reads; it is `["1"]` unless
// a registry declares more. `references` declares the entries of other registries of the same slice
// that this registry's entries name (spec §12.11): each edge's id, target registry and target `keyed`
// collection. The slice's reference resolver interprets them; the edges are recorded with the
// validation that enforces them in doc/Audits/registry-reference-edges.audit.md.
const defineTreeRegistry = (
  name,
  descriptor,
  comparison,
  reconciliation = [],
  migrations = [],
  references = [],
  readableVersions = READABLE_VERSIONS_V1,
) =>
  Object.freeze({
    registryId: `${TREE_REGISTRY_SLICE_ID}/${name}`,
    name,
    fileName: `${name}.registry.json`,
    readableVersions: Object.freeze([...readableVersions]),
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

// [6.1] cfg-registryLifecycle · Container · "Tree registry inventory"
export const TREE_REGISTRY_INVENTORY = Object.freeze([
  defineTreeRegistry('folder-kinds', { setLike: [{ path: 'folderKinds', key: 'folderKind' }] }, [
    { kind: 'keyed', path: 'folderKinds', key: 'folderKind' },
  ], [{ path: 'folderKinds', mergeFields: [['status'], ['definition']] }]),
  defineTreeRegistry('repo-shape-policy', { setLike: [{ path: 'allowedTopLevelDirectories' }] }, [
    { kind: 'members', path: 'allowedTopLevelDirectories' },
  ]),
  // Version "2" adds `semanticHomeParameters` (Tree spec Stage 2 S2.10). Its records are atomic (RR3):
  // the collection declares no reconciliation, so each parameter is kept or taken whole.
  defineTreeRegistry(
    'semantic-home-policy',
    {
      setLike: [
        { path: 'semanticHomePolicy', key: 'policyId' },
        { path: 'semanticHomeParameters', key: 'parameterId' },
      ],
    },
    [
      { kind: 'keyed', path: 'semanticHomePolicy', key: 'policyId' },
      { kind: 'keyed', path: 'semanticHomeParameters', key: 'parameterId' },
    ],
    [{ path: 'semanticHomePolicy', mergeFields: [['status'], ['definition'], ['derivationMeaning', 'guardrails', 'inputLane']] }],
    [
      {
        from: '1',
        to: '2',
        transform: 'semantic-home-policy-v1-to-v2',
        fromDescriptor: { setLike: [{ path: 'semanticHomePolicy', key: 'policyId' }] },
      },
    ],
    [],
    ['1', '2'],
  ),
  // At most one rule can match (relationshipPerspective is unique), so order carries no meaning.
  defineTreeRegistry('semantic-naming-folder-type-relationships', {
    setLike: [{ path: 'semanticNamingFolderTypeRelationships', key: 'relationshipPerspective' }],
  }, [{ kind: 'keyed', path: 'semanticNamingFolderTypeRelationships', key: 'relationshipPerspective' }], [
    {
      path: 'semanticNamingFolderTypeRelationships',
      mergeFields: [['status'], ['definition'], ['namingPerspective', 'repoShapeCondition', 'structuralHomeCondition', 'treeFolderType']],
    },
  ]),
  // The loader converts all six vocabularies to Sets.
  defineTreeRegistry('shim-detection-signals', {
    setLike: [
      { path: 'shimDetectionSignals.folderSignals' },
      { path: 'shimDetectionSignals.nameTokenSignals' },
      { path: 'shimDetectionSignals.surfaceSegmentSignals' },
      { path: 'shimSuppressionVocabularies.nonRuntimeWeakSignalSurfaces' },
      { path: 'shimSuppressionVocabularies.detectorImplementationTokens' },
      { path: 'shimExtensionAllowlist.relevantFileExtensions' },
    ],
  }, [
    { kind: 'members', path: 'shimDetectionSignals.folderSignals' },
    { kind: 'members', path: 'shimDetectionSignals.nameTokenSignals' },
    { kind: 'members', path: 'shimDetectionSignals.surfaceSegmentSignals' },
    { kind: 'members', path: 'shimSuppressionVocabularies.nonRuntimeWeakSignalSurfaces' },
    { kind: 'members', path: 'shimSuppressionVocabularies.detectorImplementationTokens' },
    { kind: 'members', path: 'shimExtensionAllowlist.relevantFileExtensions' },
  ]),
  // policyId is unique, a second match is an ambiguity error, and results are sorted.
  defineTreeRegistry('structural-context-assessment-policies', { setLike: [{ path: 'policies', key: 'policyId' }] }, [
    { kind: 'keyed', path: 'policies', key: 'policyId' },
  ]),
  defineTreeRegistry('structural-home-signal-policy', { setLike: [{ path: 'structuralHomeSignalPolicy', key: 'token' }] }, [
    { kind: 'keyed', path: 'structuralHomeSignalPolicy', key: 'token' },
  ], [{ path: 'structuralHomeSignalPolicy', mergeFields: [['status'], ['definition'], ['notes'], ['evidenceMeaning', 'signalCategory']] }]),
  defineTreeRegistry('structural-homes', { setLike: [{ path: 'structuralHomes', key: 'structuralHome' }] }, [
    { kind: 'keyed', path: 'structuralHomes', key: 'structuralHome' },
  ], [{ path: 'structuralHomes', mergeFields: [['status'], ['definition']] }]),
  defineTreeRegistry('structural-role-tokens', { setLike: [{ path: 'structuralRoleTokens', key: 'token' }] }, [
    { kind: 'keyed', path: 'structuralRoleTokens', key: 'token' },
  ], [{ path: 'structuralRoleTokens', mergeFields: [['status'], ['definition'], ['relationshipPerspective', 'structuralRole']] }]),
  defineTreeRegistry('surface-structural-home-perspective', {
    setLike: [{ path: 'structuralHomesBySurface.*', key: 'structuralHome' }],
  }, [{ kind: 'keyed', path: 'structuralHomesBySurface.*', key: 'structuralHome' }], [
    { path: 'structuralHomesBySurface.*', mergeFields: [['rationale'], ['relationshipStatus', 'signalStrength']] },
  ], [], [
    { edgeId: 'tree/perspective-structural-home', to: 'tree/structural-homes', targetCollection: 'structuralHomes' },
  ]),
  // Both consumers test the matchers with .some(), so order and repetition carry no meaning.
  defineTreeRegistry('validator-owned-signals', { setLike: [{ path: 'validatorOwnedBasenameSignals', key: 'pattern' }] }, [
    { kind: 'keyed', path: 'validatorOwnedBasenameSignals', key: 'pattern' },
  ]),
]);

// [6.1] cfg-registryLifecycle · Container · "Tree retired registry inventory"
// Registries a release removed or renamed keep their id and canonical-form descriptor here, so an
// orphan's Baseline copy from an earlier release can still be verified (lifecycle spec §12.1). Empty
// until a tree registry is retired.
export const TREE_RETIRED_REGISTRY_INVENTORY = Object.freeze([]);
