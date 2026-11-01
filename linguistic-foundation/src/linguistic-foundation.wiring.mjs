/**
 * Configuration: cfg-linguisticFoundation
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md
 * Responsibility: Composes the prepared foundation: load the registered profiles from a registry root,
 *   convert them, and select the active one (contract §5.3, §15.3).
 * Invariants: loader, converter and selection are each owned by their module; no profile is active
 *   without an explicit selection; output is frozen.
 */
import { toLanguageProfileRuntime } from './linguistic-foundation-runtime-converters.logic.mjs';
import { selectActiveLanguageProfile } from './linguistic-foundation-profile-selection.logic.mjs';
import {
  BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT,
  getBuiltinLanguageProfileRegistries,
  loadLanguageProfileRegistriesFromRegistryRoot,
} from './registries/linguistic-foundation-language-profile-registry.logic.mjs';
import { LANGUAGE_PROFILE_INVENTORY } from './registries/linguistic-foundation-language-profile-inventory.knowledge.mjs';

// [5.2.7] cfg-linguisticFoundation · Primitive · "prepareLinguisticFoundation"
export const prepareLinguisticFoundation = ({ profileSelection, registryRoot = BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT, inventory = LANGUAGE_PROFILE_INVENTORY } = {}) => {
  const registries =
    registryRoot === BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT && inventory === LANGUAGE_PROFILE_INVENTORY
      ? getBuiltinLanguageProfileRegistries()
      : loadLanguageProfileRegistriesFromRegistryRoot(registryRoot, inventory);
  const registeredProfiles = registries.map(toLanguageProfileRuntime);
  const { status, requested, problems, profile } = selectActiveLanguageProfile({ selection: profileSelection, registeredProfiles });
  return Object.freeze({ selection: Object.freeze({ status, requested, problems }), profile });
};
