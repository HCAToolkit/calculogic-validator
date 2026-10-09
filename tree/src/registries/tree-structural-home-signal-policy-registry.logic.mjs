// Tree structural-home-signal-policy registry shape validation (#41 registry lifecycle).
// The registry is evidence-policy reference data with no runtime consumer yet; this module owns
// its shape so Tree's registry-set validation entry point covers it (lifecycle spec §9.3).
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

export const STRUCTURAL_HOME_SIGNAL_CATEGORIES = Object.freeze(['strong', 'contextual', 'weak', 'anti-pattern']);
export const STRUCTURAL_HOME_SIGNAL_STATUSES = Object.freeze(['active']);

export const assertValidStructuralHomeSignalPolicyRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Tree structural-home-signal-policy registry: expected object payload.');
  }

  assertRegistryEntries(payload.structuralHomeSignalPolicy, {
    registryLabel: 'Tree structural-home-signal-policy',
    listLabel: 'structuralHomeSignalPolicy',
    keyField: 'token',
    requiredStringFields: ['definition', 'evidenceMeaning', 'notes'],
    enumFields: { signalCategory: STRUCTURAL_HOME_SIGNAL_CATEGORIES, status: STRUCTURAL_HOME_SIGNAL_STATUSES },
  });

  return payload;
};
