import { buildDirectValidatorReportEnvelope } from '../../../src/core/validator-direct-report.logic.mjs';
import { summarizeFindings } from '../naming-validator.host.mjs';

export const buildNamingValidatorReport = ({
  findings,
  summary: resolvedSummary,
  totalFilesScanned,
  scope,
  filters,
  registry,
  registrySet,
  registryProvenance,
  toolVersion,
  configDigest,
  sourceSnapshot,
  selectedScopeProfile,
  startedAtDate,
  endedAtDate,
  registryEntry,
}) => {
  const summary = resolvedSummary ?? summarizeFindings(findings);

  return {
    ...buildDirectValidatorReportEnvelope({
      registryEntry,
      fallbackValidatorId: 'naming',
      toolVersion,
      configDigest,
      sourceSnapshot,
      startedAtDate,
      endedAtDate,
    }),
    ...(registry
      ? {
          registryState: registry.registryState,
          registrySource: registry.registrySource,
          registryDigests: registry.registryDigests,
        }
      : {}),
    ...(registrySet ? { registrySet } : {}),
    ...(registryProvenance ? { registryProvenance } : {}),
    scope,
    totalFilesScanned,
    filters,
    scopeSummary: {
      scope,
      reportableFilesInScope: totalFilesScanned,
      findingsGenerated: findings.length,
    },
    scopeContract: {
      description: selectedScopeProfile?.description ?? '',
      includeRoots: selectedScopeProfile?.includeRoots ?? [],
      includeRootFiles: selectedScopeProfile?.includeRootFiles ?? [],
    },
    counts: summary.counts,
    codeCounts: summary.codeCounts,
    specialCaseTypeCounts: summary.specialCaseTypeCounts,
    warningRoleStatusCounts: summary.warningRoleStatusCounts,
    warningRoleCategoryCounts: summary.warningRoleCategoryCounts,
    familyRootCounts: summary.familyRootCounts,
    familySubgroupCounts: summary.familySubgroupCounts,
    semanticFamilyCounts: summary.semanticFamilyCounts,
    findings,
  };
};
