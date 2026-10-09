// Tree surface-structural-home-perspective registry shape validation (#41 registry lifecycle).
// The registry is placement-evidence reference data with no runtime consumer yet; this module owns
// its shape so Tree's registry-set validation entry point covers it (lifecycle spec §9.3).
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

export const assertValidSurfaceStructuralHomePerspectiveRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Tree surface-structural-home-perspective registry: expected object payload.');
  }

  const bySurface = payload.structuralHomesBySurface;
  if (!bySurface || typeof bySurface !== 'object' || Array.isArray(bySurface) || Object.keys(bySurface).length === 0) {
    throw new Error(
      'Invalid Tree surface-structural-home-perspective registry: structuralHomesBySurface must be a non-empty object.',
    );
  }

  for (const [surface, entries] of Object.entries(bySurface)) {
    assertRegistryEntries(entries, {
      registryLabel: 'Tree surface-structural-home-perspective',
      listLabel: `structuralHomesBySurface.${surface}`,
      keyField: 'structuralHome',
      requiredStringFields: ['relationshipStatus', 'signalStrength', 'rationale'],
    });
  }

  return payload;
};
