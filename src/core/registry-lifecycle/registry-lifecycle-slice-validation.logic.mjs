/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§2.1, §5.2.4)
 * Responsibility: Maps each inventory slice to its slice-owned registry-set validation entry point.
 * Invariants: suite core only calls the entry points; validation rules stay with each slice
 *   (lifecycle spec §9.3).
 */
import { validateNamingRegistrySet } from '../../../naming/src/registries/registry-state.logic.mjs';
import { validateTreeRegistrySet } from '../../../tree/src/registries/tree-registry-set.logic.mjs';
import { validateSuiteRegistrySet } from '../../registries/suite-registry-set.logic.mjs';

const SLICE_REGISTRY_SET_VALIDATORS = Object.freeze({
  naming: validateNamingRegistrySet,
  tree: validateTreeRegistrySet,
  suite: validateSuiteRegistrySet,
});

// [5.2.4] cfg-registryLifecycle · Primitive · "validateSliceRegistrySet"
export const validateSliceRegistrySet = (sliceId, registryRoot) => {
  const validate = SLICE_REGISTRY_SET_VALIDATORS[sliceId];
  if (!validate) {
    throw new Error(`No registry-set validation entry point is declared for slice "${sliceId}".`);
  }

  return validate(registryRoot);
};
