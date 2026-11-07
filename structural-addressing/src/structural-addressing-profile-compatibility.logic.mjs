/**
 * Configuration: Structural Addressing tree-codebase
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/structural-addressing-shared-contract.spec.md (§8)
 * Responsibility: derive the joined policy identity from an Addressing-owned descriptor.
 * Invariants: no environment inputs, consumer imports, comparator selection or active revision changes.
 */

// [8] Structural Addressing · Primitive · "prepareStructuralAddressingProfileCompatibility"
// Concern: Logic · Parent: Addressing profile compatibility
export const prepareStructuralAddressingProfileCompatibility = (profile) => {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) ||
      typeof profile.profileId !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(profile.profileId)) {
    throw new Error('Addressing compatibility requires a lowercase kebab-case profile family.');
  }
  if (!profile.compatibilityPolicy || typeof profile.compatibilityPolicy !== 'object' || Array.isArray(profile.compatibilityPolicy)) {
    throw new Error('Addressing compatibility requires a policy descriptor.');
  }
  const { status, revision } = profile.compatibilityPolicy;
  if (status === 'legacy-unqualified' && revision === null &&
      typeof profile.legacyAddressProfileId === 'string' && profile.legacyAddressProfileId.length > 0) {
    return { addressProfileId: profile.legacyAddressProfileId, compatibilityPolicy: { status, revision } };
  }
  if (status === 'versioned' && typeof revision === 'string' && /^[1-9][0-9]*$/u.test(revision) &&
      profile.legacyAddressProfileId === undefined) {
    return { addressProfileId: `${profile.profileId}@${revision}`, compatibilityPolicy: { status, revision } };
  }
  throw new Error('Addressing compatibility requires a valid legacy-unqualified or versioned descriptor.');
};
