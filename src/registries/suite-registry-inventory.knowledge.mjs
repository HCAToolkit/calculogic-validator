/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§6.1)
 * Responsibility: Suite core's registry inventory for the Builtin/Custom registry lifecycle.
 * Invariants: lists only suite-owned registries; exit-policy order is meaningful (first match wins)
 *   and stays ordered; scope-profile root files are normalized to a sorted set by their loader;
 *   comparison declarations state entry identity separately (spec §8.4).
 */
import { fileURLToPath } from 'node:url';

export const SUITE_REGISTRY_SLICE_ID = 'suite';

export const SUITE_BUILTIN_REGISTRY_ROOT = fileURLToPath(new URL('./_builtin/', import.meta.url));

const READABLE_VERSIONS_V1 = Object.freeze(['1']);

// `comparison` is the registry's entry identity for three-way comparison (spec §8.4).
// `reconciliation` declares which of its collections accept merge-fields or add-alongside (spec
// §12.7); the reasons are recorded in doc/Audits/registry-reconciliation-capabilities.audit.md.
const defineSuiteRegistry = (name, descriptor, comparison, reconciliation = []) =>
  Object.freeze({
    registryId: `${SUITE_REGISTRY_SLICE_ID}/${name}`,
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
  });

// [6.1] cfg-registryLifecycle · Container · "Suite registry inventory"
export const SUITE_REGISTRY_INVENTORY = Object.freeze([
  // Exit policies are first-match, so their order is part of the policy.
  defineSuiteRegistry('exit-policy', {}, [{ kind: 'keyed', path: 'policies', key: 'id', ordered: true }]),
  // Each scope profile is one entry.
  defineSuiteRegistry('scope-profiles', { setLike: [{ path: 'profiles.*.includeRootFiles' }] }, [
    { kind: 'value', path: 'profiles.*' },
  ], [{ path: 'profiles.*', mergeFields: [['includeRoots'], ['includeRootFiles']] }]),
]);

// [6.1] cfg-registryLifecycle · Container · "Suite retired registry inventory"
// Registries a release removed or renamed keep their id and canonical-form descriptor here, so an
// orphan's Baseline copy from an earlier release can still be verified (lifecycle spec §12.1). Empty
// until a suite registry is retired.
export const SUITE_RETIRED_REGISTRY_INVENTORY = Object.freeze([]);
