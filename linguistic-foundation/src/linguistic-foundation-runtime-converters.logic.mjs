/**
 * Configuration: cfg-linguisticFoundation
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md
 * Responsibility: Converter from a validated language profile payload to its frozen runtime profile
 *   (contract §4.3 R4, §15.3).
 * Invariants: no validation (the loader owns it) and no resolution decision (the resolution module
 *   owns it); readings are sorted by lexeme identifier, then features, by code unit; output is frozen,
 *   and the lookup is private: it is reachable only through read-only accessors, so no caller can
 *   change a resolution without changing the profile version and digest.
 */
import { LEXICAL_READING_BASES } from './linguistic-foundation.knowledge.mjs';

const featureKey = (features) =>
  Object.keys(features)
    .sort()
    .map((space) => `${space}=${features[space]}`)
    .join(',');
const readingKey = (reading) => `${reading.lexemeId}\u0000${featureKey(reading.features)}`;
const byCodeUnit = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

export const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

// [5.2.3] cfg-linguisticFoundation · Primitive · "toLanguageProfileRuntime"
export const toLanguageProfileRuntime = ({ payload, lexiconDigest }) => {
  const readingsBySurface = new Map();
  for (const entry of payload.entries) {
    for (const form of entry.forms) {
      const features = Object.fromEntries(Object.keys(form.features).sort().map((space) => [space, form.features[space]]));
      const readings = readingsBySurface.get(form.surface) ?? [];
      readings.push({ lexemeId: entry.lexemeId, features, basis: LEXICAL_READING_BASES.lexiconEntry });
      readingsBySurface.set(form.surface, readings);
    }
  }
  for (const readings of readingsBySurface.values()) {
    readings.sort((left, right) => byCodeUnit(readingKey(left), readingKey(right)));
    deepFreeze(readings);
  }
  const surfaces = Object.freeze([...readingsBySurface.keys()].sort(byCodeUnit));
  const NO_READINGS = Object.freeze([]);
  // The map stays in this closure; callers see only frozen readings and a frozen surface list.
  return Object.freeze({
    profileId: payload.profileId,
    profileVersion: payload.profileVersion,
    lexiconDigest,
    readingsOf: (surface) => readingsBySurface.get(surface) ?? NO_READINGS,
    surfaces: () => surfaces,
  });
};
