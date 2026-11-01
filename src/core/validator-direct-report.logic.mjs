import { getValidatorReportIdentity } from './validator-report-identity.logic.mjs';
export const buildDirectValidatorReportEnvelope = ({
  registryEntry,
  fallbackValidatorId,
  toolVersion,
  configDigest,
  // Report schema §4: only when the run has an active language profile (calculogic-validator#150).
  linguisticProfile,
  sourceSnapshot,
  startedAtDate,
  endedAtDate,
}) => {
  const reportIdentity = getValidatorReportIdentity(registryEntry, {
    validatorId: fallbackValidatorId,
  });

  return {
    mode: reportIdentity.mode,
    validatorId: reportIdentity.validatorId,
    toolVersion,
    ...(toolVersion ? { validatorVersion: toolVersion } : {}),
    ...(configDigest ? { configDigest } : {}),
    ...(linguisticProfile ? { linguisticProfile } : {}),
    sourceSnapshot,
    startedAt: startedAtDate.toISOString(),
    endedAt: endedAtDate.toISOString(),
    durationMs: endedAtDate.getTime() - startedAtDate.getTime(),
  };
};
