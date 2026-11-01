/**
 * Configuration: cfg-linguisticFoundation
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md
 * Responsibility: The registered language profiles (contract §15.1, §15.2).
 * Invariants: one entry per profile, sorted by `profileId`; adding a profile is one entry here and one
 *   registry file, with no change to the foundation logic.
 */

// [6.2] cfg-linguisticFoundation · Knowledge · "language profile inventory"
export const LANGUAGE_PROFILE_INVENTORY = Object.freeze([
  Object.freeze({ profileId: 'english', registryFilename: 'english-language-profile.registry.json' }),
]);
