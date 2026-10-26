/**
 * Tree Semantic Home parameter set converter (Tree spec Stage 2 S2.9, S2.10 RR4; calculogic-validator#102).
 *
 * Turns a validated `semantic-home-policy` payload, its registry provenance and the lifecycle Baseline
 * entry comparison (lifecycle spec §11.4) into the frozen `treeSemanticHomeParameterSet`. Pure: it
 * reads no file and calls no lifecycle code that does. Parameters are found by registry identity
 * (`keyedEntryAddress`), never by position, and keyed by their S2.5 names through the explicit S2.10
 * identifier table. It decides nothing about eligibility, attribution or placement. Conformance is
 * decided by the Stage 2A-iii evaluator from the four values and the installed reasoning source digest
 * the loader passes in (RR4); without a digest it is `not-checked`.
 */
import { keyedEntryAddress } from '../../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import { TREE_REGISTRY_INVENTORY } from './registries/tree-registry-inventory.knowledge.mjs';
import {
  SEMANTIC_HOME_PARAMETER_IDS,
  SEMANTIC_HOME_PARAMETER_NAMES_BY_ID,
  SEMANTIC_HOME_POLICY_REGISTRY_ID,
} from './registries/tree-semantic-home-policy-registry.logic.mjs';
import { SEMANTIC_HOME_CONFORMANCE, evaluateTreeSemanticHomeConformance } from './tree-semantic-home-conformance.logic.mjs';

const PARAMETERS_COLLECTION = 'semanticHomeParameters';

// RR4: each lifecycle `baselineComparison` and the Tree `origin` it gives. `differs` and `absent` are
// both `override`; the comparison state keeps them apart.
export const ORIGIN_BY_BASELINE_COMPARISON = Object.freeze({
  'not-applicable': 'builtin',
  matches: 'baseline',
  differs: 'override',
  absent: 'override',
  unverifiable: 'unverified',
});

export const SEMANTIC_HOME_PARAMETER_SET_AVAILABILITY = Object.freeze({
  available: 'available',
  configurationUnavailable: 'configuration-unavailable',
  notPrepared: 'not-prepared',
});
const CONFORMANCE_NOT_CHECKED = SEMANTIC_HOME_CONFORMANCE.notChecked;

// S2.9: an explicit non-Builtin registry root without a lifecycle resolution. A preparation state,
// not a claim about the registry: no registry was read, so none is reported.
export const NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET = Object.freeze({
  availability: SEMANTIC_HOME_PARAMETER_SET_AVAILABILITY.notPrepared,
  reason: 'registry-resolution-absent',
  conformance: CONFORMANCE_NOT_CHECKED,
});

const registryEntry = TREE_REGISTRY_INVENTORY.find((entry) => entry.registryId === SEMANTIC_HOME_POLICY_REGISTRY_ID);

const parameterAddress = (parameterId) =>
  keyedEntryAddress(registryEntry, { collection: PARAMETERS_COLLECTION, groups: [], key: parameterId });

const convertParameter = (record, comparisonEntry) => {
  const origin = ORIGIN_BY_BASELINE_COMPARISON[comparisonEntry.baselineComparison];
  if (origin === undefined) {
    throw new Error(
      `Unknown Baseline comparison state ${JSON.stringify(comparisonEntry.baselineComparison)} for parameter ${record.parameterId}.`,
    );
  }

  return Object.freeze({
    parameterId: record.parameterId,
    value: record.value,
    catalogueCases: Object.freeze([...record.catalogueCases]),
    baselineComparison: comparisonEntry.baselineComparison,
    origin,
    ...(comparisonEntry.baselineComparison === 'unverifiable' ? { baselineComparisonReason: comparisonEntry.reason } : {}),
  });
};

// `payload` is a validated `semantic-home-policy` registry; `registry` is
// `{ registryId, version, source, digest }` as the run's resolution reports it; `comparison` is
// `compareResolvedRegistryWithBaseline`'s result for that same payload; `reasoningSourceDigest` is the
// installed reasoning modules' digest, or null when it was not computed.
export const prepareTreeSemanticHomeParameterSet = ({ payload, registry, comparison, reasoningSourceDigest = null }) => {
  const registryBlock = Object.freeze({
    registryId: registry.registryId,
    version: registry.version,
    source: registry.source,
    digest: registry.digest,
  });

  // RR5: a readable version-1 registry has no parameter section. Builtin values never stand in.
  if (!Object.hasOwn(payload, PARAMETERS_COLLECTION)) {
    return Object.freeze({
      registry: registryBlock,
      availability: SEMANTIC_HOME_PARAMETER_SET_AVAILABILITY.configurationUnavailable,
      reason: 'parameter-set-absent',
      conformance: CONFORMANCE_NOT_CHECKED,
    });
  }

  const comparisonByAddress = new Map(comparison.entries.map((entry) => [entry.address, entry]));
  const recordById = new Map(payload.semanticHomeParameters.map((record) => [record.parameterId, record]));
  const parameters = {};
  for (const parameterId of SEMANTIC_HOME_PARAMETER_IDS) {
    const address = parameterAddress(parameterId);
    const comparisonEntry = comparisonByAddress.get(address);
    if (!recordById.has(parameterId) || !comparisonEntry) {
      throw new Error(`Parameter ${parameterId} (${address}) is missing from the payload or its Baseline comparison.`);
    }
    parameters[SEMANTIC_HOME_PARAMETER_NAMES_BY_ID[parameterId]] = convertParameter(recordById.get(parameterId), comparisonEntry);
  }

  // RR4: decided from the values alone, never from origin, comparison, rationale or source.
  const values = Object.fromEntries(Object.entries(parameters).map(([name, parameter]) => [name, parameter.value]));
  return Object.freeze({
    registry: registryBlock,
    availability: SEMANTIC_HOME_PARAMETER_SET_AVAILABILITY.available,
    parameters: Object.freeze(parameters),
    ...evaluateTreeSemanticHomeConformance({ values, reasoningSourceDigest }),
  });
};
