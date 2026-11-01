/**
 * Configuration: cfg-validatorRunner
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-validatorRunner.md (§2.2, §2.4, §4.2)
 * Responsibility: Run-level Linguistic Foundation selection: applies the config's well-formed
 *   `linguisticProfile` (stage 1 already checked its shape) to the registered profiles (stage 2,
 *   validator config spec §10.4; Linguistic Foundation shared contract §5.3, §15.4;
 *   calculogic-validator#150), and derives the report provenance of the active profile.
 * Invariants: no selection yields `null`; a selection that is not active stops the run (suite core owns
 *   that consequence, the foundation only classifies); diagnostics name the requested profileId and any
 *   pinned profileVersion; suite core never resolves tokens.
 */
import { prepareLinguisticFoundation } from '../../../linguistic-foundation/src/linguistic-foundation.wiring.mjs';

// [4.2] cfg-validatorRunner · Primitive · "describeRequest"
// Concern: Logic · Parent: "prepareRunLinguisticFoundation"
// Notes: names the requested profileId and any pinned profileVersion in stage-2 diagnostics.
const describeRequest = ({ profileId, profileVersion }) =>
  `requested profileId "${profileId}"${profileVersion === undefined ? '' : `, profileVersion "${profileVersion}"`}`;

// [2.2] cfg-validatorRunner · Container · "prepareRunLinguisticFoundation"
// Concern: Logic · Parent: CLI hosts (validate-all, validate-naming, validate-tree)
// Notes: returns the prepared foundation when the config selects a profile, `null` when it selects none, and
// throws when the selection names an unregistered profile or a mismatched version.
export const prepareRunLinguisticFoundation = (config) => {
  const selection = config?.linguisticProfile;
  if (selection === undefined) return null;
  const foundation = prepareLinguisticFoundation({ profileSelection: selection });
  if (foundation.selection.status !== 'active') {
    throw new Error(`Invalid validator config: linguisticProfile could not be resolved (${foundation.selection.problems.join(', ')}): ${describeRequest(selection)}.`);
  }
  return foundation;
};

// [2.4] cfg-validatorRunner · Primitive · "toLinguisticProfileProvenance"
// Concern: Logic · Parent: report envelope metadata
// Notes: report provenance of the run's active profile (report schema §4, §5), or null when none is active.
export const toLinguisticProfileProvenance = (linguisticFoundation) => {
  const profile = linguisticFoundation?.profile;
  return profile ? { profileId: profile.profileId, profileVersion: profile.profileVersion, lexiconDigest: profile.lexiconDigest } : null;
};
