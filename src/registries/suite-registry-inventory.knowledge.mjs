/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§6.1)
 * Responsibility: Suite core's registry inventory for the Builtin/Custom registry lifecycle.
 * Invariants: lists only suite-owned registries; exit-policy order is meaningful (first match wins)
 *   and stays ordered; scope-profile root files are normalized to a sorted set by their loader.
 */
import { fileURLToPath } from 'node:url';

export const SUITE_REGISTRY_SLICE_ID = 'suite';

export const SUITE_BUILTIN_REGISTRY_ROOT = fileURLToPath(new URL('./_builtin/', import.meta.url));

const READABLE_VERSIONS_V1 = Object.freeze(['1']);

const defineSuiteRegistry = (name, descriptor = {}) =>
  Object.freeze({
    registryId: `${SUITE_REGISTRY_SLICE_ID}/${name}`,
    name,
    fileName: `${name}.registry.json`,
    readableVersions: READABLE_VERSIONS_V1,
    descriptor: Object.freeze(descriptor),
  });

// [6.1] cfg-registryLifecycle · Container · "Suite registry inventory"
export const SUITE_REGISTRY_INVENTORY = Object.freeze([
  defineSuiteRegistry('exit-policy'),
  defineSuiteRegistry('scope-profiles', { setLike: [{ path: 'profiles.*.includeRootFiles' }] }),
]);
