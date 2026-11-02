/**
 * Configuration: cfg-linguisticFoundation
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md
 * Responsibility: Resolution of one surface form under the active profile (contract §4.3, §6.1, §7),
 *   the lexeme-comparison relation (contract §6.2), and the feature-map predicate consumers use to check
 *   presented readings (contract §8.3).
 * Invariants: declared entries only (R1); exact surface equality (R2); the form alone (R3); sorted
 *   readings from the runtime profile (R4); ambiguity recorded, never resolved; no language-specific
 *   content; output is frozen.
 */
import { LEXEME_COMPARISON_RELATIONS, LEXICAL_RESOLUTION_STATUSES, LINGUISTIC_FEATURE_SPACES } from './linguistic-foundation.knowledge.mjs';

const STATUSES = LEXICAL_RESOLUTION_STATUSES;
const RELATIONS = LEXEME_COMPARISON_RELATIONS;
const EMPTY = Object.freeze([]);

// [5.2.5] cfg-linguisticFoundation · Primitive · "resolveSurfaceForm"
// `profile`: the active runtime profile, or `null` when none is active.
export const resolveSurfaceForm = (profile, surface) => {
  if (typeof surface !== 'string' || surface.length === 0) {
    throw new TypeError('resolveSurfaceForm: a surface form is a non-empty string, exactly as a producer supplies it.');
  }
  if (profile === null || profile === undefined) {
    return Object.freeze({ surface, status: STATUSES.profileUnavailable, readings: EMPTY });
  }
  const readings = profile.readingsOf(surface);
  const lexemeCount = new Set(readings.map((reading) => reading.lexemeId)).size;
  const status = readings.length === 0 ? STATUSES.unknown : lexemeCount === 1 ? STATUSES.resolved : STATUSES.ambiguous;
  return Object.freeze({
    surface,
    status,
    readings,
    provenance: Object.freeze({ profileId: profile.profileId, profileVersion: profile.profileVersion, lexiconDigest: profile.lexiconDigest }),
  });
};

// [5.2.6] cfg-linguisticFoundation · Primitive · "compareLexicalResolutions"
export const compareLexicalResolutions = (left, right) => {
  const lexical = (resolution) => resolution.status === STATUSES.resolved || resolution.status === STATUSES.ambiguous;
  if (!lexical(left) || !lexical(right)) return RELATIONS.undetermined;
  if (left.provenance.profileId !== right.provenance.profileId || left.provenance.profileVersion !== right.provenance.profileVersion) {
    return RELATIONS.undetermined;
  }
  const rightIds = new Set(right.readings.map((reading) => reading.lexemeId));
  const shared = left.readings.some((reading) => rightIds.has(reading.lexemeId));
  if (left.status === STATUSES.resolved && right.status === STATUSES.resolved) return shared ? RELATIONS.sameLexeme : RELATIONS.differentLexemes;
  return shared ? RELATIONS.possiblySameLexeme : RELATIONS.differentLexemes;
};

// [5.2.8] cfg-linguisticFoundation · Primitive · "isFoundationFeatureMap"
// Concern: Logic · Parent: "Linguistic Foundation runtime"
// Notes: a plain object whose every own key is a foundation feature space and whose value is one of that
// space's values. Consumers validating presented readings ask this instead of copying the vocabulary.
export const isFoundationFeatureMap = (features) =>
  features !== null &&
  typeof features === 'object' &&
  !Array.isArray(features) &&
  Object.entries(features).every(([space, value]) => Object.hasOwn(LINGUISTIC_FEATURE_SPACES, space) && typeof value === 'string' && LINGUISTIC_FEATURE_SPACES[space].includes(value));
