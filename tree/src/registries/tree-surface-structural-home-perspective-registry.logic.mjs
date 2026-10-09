// Tree surface-structural-home-perspective registry shape validation (#41 registry lifecycle).
// The registry is placement-evidence reference data with no runtime consumer yet; this module owns
// its shape so Tree's registry-set validation entry point covers it (lifecycle spec §9.3).

const fail = (message) => {
  throw new Error(`Invalid Tree surface-structural-home-perspective registry: ${message}`);
};

const assertNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
};

export const assertValidSurfaceStructuralHomePerspectiveRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('expected object payload.');
  }

  const bySurface = payload.structuralHomesBySurface;
  if (!bySurface || typeof bySurface !== 'object' || Array.isArray(bySurface) || Object.keys(bySurface).length === 0) {
    fail('structuralHomesBySurface must be a non-empty object.');
  }

  for (const [surface, entries] of Object.entries(bySurface)) {
    if (!Array.isArray(entries)) {
      fail(`structuralHomesBySurface.${surface} must be an array.`);
    }

    const seenHomes = new Set();
    entries.forEach((entry, index) => {
      const label = `structuralHomesBySurface.${surface}[${index}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        fail(`${label} must be an object.`);
      }
      for (const field of ['structuralHome', 'relationshipStatus', 'signalStrength', 'rationale']) {
        assertNonEmptyString(entry[field], `${label}.${field}`);
      }
      if (seenHomes.has(entry.structuralHome)) {
        fail(`${label}.structuralHome "${entry.structuralHome}" is duplicated.`);
      }
      seenHomes.add(entry.structuralHome);
    });
  }

  return payload;
};
