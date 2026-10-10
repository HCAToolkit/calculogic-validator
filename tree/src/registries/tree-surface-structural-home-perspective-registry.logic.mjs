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

// Reference edge (lifecycle spec §9.3): every perspective entry names a structural home declared in
// the resolved structural-homes registry.
export const assertSurfaceStructuralHomePerspectiveReferences = (perspectivePayload, structuralHomesPayload) => {
  const declaredHomes = new Set(
    (Array.isArray(structuralHomesPayload?.structuralHomes) ? structuralHomesPayload.structuralHomes : []).map(
      (entry) => entry?.structuralHome,
    ),
  );
  const danglingHomes = new Set();
  for (const entries of Object.values(perspectivePayload.structuralHomesBySurface)) {
    for (const entry of entries) {
      if (!declaredHomes.has(entry.structuralHome)) {
        danglingHomes.add(entry.structuralHome);
      }
    }
  }

  if (danglingHomes.size > 0) {
    throw new Error(
      `Invalid Tree surface-structural-home-perspective registry: structural homes not declared in structural-homes: ${[...danglingHomes].sort().join(', ')}.`,
    );
  }
};
