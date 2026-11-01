/**
 * Configuration: cfg-linguisticFoundation
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md
 * Responsibility: Active language profile selection (contract §5.3, D2).
 * Invariants: explicit selection only; no default, no detection, no fallback; one status per selection;
 *   output is frozen.
 */
import { LANGUAGE_PROFILE_SELECTION_PROBLEMS, LANGUAGE_PROFILE_SELECTION_STATUSES } from './linguistic-foundation.knowledge.mjs';

const STATUSES = LANGUAGE_PROFILE_SELECTION_STATUSES;
const PROBLEMS = LANGUAGE_PROFILE_SELECTION_PROBLEMS;
const SELECTION_FIELDS = Object.freeze(['profileId', 'profileVersion']);
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const result = (status, requested, problems, profile) =>
  Object.freeze({ status, requested: requested === null ? null : Object.freeze({ ...requested }), problems: Object.freeze(problems), profile });

// [5.2.4] cfg-linguisticFoundation · Primitive · "selectActiveLanguageProfile"
// `registeredProfiles`: the runtime profiles of the registered profiles.
export const selectActiveLanguageProfile = ({ selection, registeredProfiles }) => {
  if (selection === undefined || selection === null) return result(STATUSES.none, null, [], null);
  const wellFormed =
    isPlainObject(selection) &&
    Object.keys(selection).every((field) => SELECTION_FIELDS.includes(field)) &&
    typeof selection.profileId === 'string' &&
    selection.profileId.length > 0 &&
    (selection.profileVersion === undefined || (typeof selection.profileVersion === 'string' && selection.profileVersion.length > 0));
  if (!wellFormed) return result(STATUSES.invalid, null, [PROBLEMS.selectionMalformed], null);

  const requested = { profileId: selection.profileId, ...(selection.profileVersion === undefined ? {} : { profileVersion: selection.profileVersion }) };
  const profile = registeredProfiles.find((candidate) => candidate.profileId === selection.profileId);
  if (!profile) return result(STATUSES.invalid, requested, [PROBLEMS.profileNotRegistered], null);
  if (selection.profileVersion !== undefined && selection.profileVersion !== profile.profileVersion) {
    return result(STATUSES.invalid, requested, [PROBLEMS.profileVersionMismatch], null);
  }
  return result(STATUSES.active, requested, [], profile);
};
