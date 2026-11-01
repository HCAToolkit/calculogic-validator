// Run-level Linguistic Foundation selection (validator config spec §10; Linguistic Foundation shared
// contract §5.3, §15.4; calculogic-validator#150). The config loader has already checked the
// `linguisticProfile` shape (stage 1). This module applies the well-formed selection to the registered
// profiles (stage 2). The foundation classifies the selection; this module, as suite core, decides what
// that classification does to the run: an invalid selection stops it. Suite core never resolves tokens.
import { prepareLinguisticFoundation } from '../../../linguistic-foundation/src/linguistic-foundation.wiring.mjs';

const describeRequest = ({ profileId, profileVersion }) =>
  `requested profileId "${profileId}"${profileVersion === undefined ? '' : `, profileVersion "${profileVersion}"`}`;

// Returns the prepared foundation when the config selects a profile, `null` when it selects none, and
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

// Report provenance of the run's active profile (report schema §4, §5), or null when none is active.
export const toLinguisticProfileProvenance = (linguisticFoundation) => {
  const profile = linguisticFoundation?.profile;
  return profile ? { profileId: profile.profileId, profileVersion: profile.profileVersion, lexiconDigest: profile.lexiconDigest } : null;
};
