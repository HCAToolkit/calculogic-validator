import { resolveNamingRegistryInputs } from './registries/registry-state.logic.mjs';
import { loadNamingWalkExclusionsFromRegistryRoot } from './registries/naming-walk-exclusions-registry.logic.mjs';
import { loadNamingSpecialCaseRulesFromRegistryRoot } from './registries/naming-special-case-rules-registry.logic.mjs';
import { NAMING_REGISTRY_SLICE_ID } from './registries/naming-registry-inventory.knowledge.mjs';
import {
  toNamingRolesRuntime,
  toReportableExtensionsSet,
  toReportableRootFilesSet,
  toSummaryBucketsRuntime,
  toMissingRolePatternsRuntime,
  toFindingPolicyRuntime,
  toCaseRulesRuntime,
} from './naming-runtime-converters.logic.mjs';
import {
  parseCanonicalName,
  getSpecialCaseType,
  isAllowedSpecialCase,
  classifyPath as classifyPathRuntime,
  runNamingValidator as runNamingValidatorRuntime,
  listNamingValidatorScopes,
  getScopeProfile,
  summarizeFindings as summarizeFindingsRuntime,
} from './naming-validator.logic.mjs';
import { projectNamingSemanticFamilyBridge } from './naming-semantic-family-bridge-projection.logic.mjs';
import { createNamingOccurrenceBridgePayload } from './naming-occurrence-bridge-payload.logic.mjs';
import { prepareNamingSemanticEvidenceBridge } from './naming-semantic-evidence-bridge.logic.mjs';
import { normalizePath } from '../../src/core/scoped-target-paths.logic.mjs';
import { collectValidatorCandidatePaths } from '../../src/core/validator-candidate-collection.logic.mjs';
import { createValidatorCandidatePolicyFromValues } from '../../src/core/validator-candidate-policy.logic.mjs';
import { DEFAULT_VALIDATOR_SCOPE } from '../../src/core/validator-scopes.logic.mjs';
import {
  getBuiltinRegistryRoots,
  resolveActiveRegistrySet,
} from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';

// Registry roots for helpers called outside a validation run (no target root): Builtin.
const BUILTIN_REGISTRY_RESOLUTION = Object.freeze({
  activeSet: 'builtin',
  registryRoots: getBuiltinRegistryRoots(),
});

// Prepares Naming's runtime inputs from one resolved registry set (#41 registry lifecycle).
// `registryResolution` comes from `resolveActiveRegistrySet`; without it, Builtin roots are used.
export const prepareNamingRuntimeInputs = ({ registryResolution = BUILTIN_REGISTRY_RESOLUTION } = {}) => {
  const namingRegistryRoot = registryResolution.registryRoots[NAMING_REGISTRY_SLICE_ID];
  const registryInputs = resolveNamingRegistryInputs({
    registryRoot: namingRegistryRoot,
    activeSet: registryResolution.activeSet,
    customRegistryRoot: registryResolution.customRegistryRoots?.[NAMING_REGISTRY_SLICE_ID],
  });

  return {
    reportableExtensions: toReportableExtensionsSet(registryInputs.reportableExtensions),
    reportableRootFiles: toReportableRootFilesSet(registryInputs.reportableRootFiles),
    namingRolesRuntime: toNamingRolesRuntime(registryInputs.roles),
    walkExclusions: loadNamingWalkExclusionsFromRegistryRoot(namingRegistryRoot),
    specialCaseRulesRuntime: loadNamingSpecialCaseRulesFromRegistryRoot(namingRegistryRoot),
    summaryBucketsRuntime: toSummaryBucketsRuntime(registryInputs.summaryBuckets),
    missingRolePatternsRuntime: toMissingRolePatternsRuntime(registryInputs.missingRolePatterns),
    findingPolicyRuntime: toFindingPolicyRuntime(registryInputs.findingPolicy),
    caseRulesRuntime: toCaseRulesRuntime(registryInputs.caseRules),
    registryRoots: registryResolution.registryRoots,
    // Transitional, derived fields (lifecycle spec §11.3).
    registry: {
      registryState: registryInputs.registryState,
      registrySource: registryInputs.registrySource,
      registryDigests: registryInputs.registryDigests,
    },
    ...(registryResolution.registrySet ? { registrySet: registryResolution.registrySet } : {}),
    ...(registryResolution.registryProvenance
      ? { registryProvenance: registryResolution.registryProvenance[NAMING_REGISTRY_SLICE_ID] }
      : {}),
  };
};

const createNamingCandidatePolicy = ({
  reportableExtensions,
  reportableRootFiles,
  walkExclusions,
  packageRoot,
}) =>
  createValidatorCandidatePolicyFromValues({
    candidateExtensions: reportableExtensions,
    candidateRootFiles: reportableRootFiles,
    walkExclusions,
  });

const collectNamingCandidatePaths = (repositoryRoot, {
  scope,
  targets = [],
  reportableExtensions,
  reportableRootFiles,
  walkExclusions,
  packageRoot,
  registryRoots,
}) =>
  collectValidatorCandidatePaths(repositoryRoot, {
    scope,
    targets,
    skipSymlinkedCandidateScopeRoots: true,
    packageRoot,
    registryRoots,
    candidatePolicy: createNamingCandidatePolicy({
      reportableExtensions,
      reportableRootFiles,
      walkExclusions,
    }),
  });

export const prepareNamingValidatorInputs = (
  repositoryRoot,
  { scope, targets, packageRoot, registryResolution } = {},
) => {
  const runtimeInputs = prepareNamingRuntimeInputs({
    registryResolution: registryResolution ?? resolveActiveRegistrySet({ targetRoot: repositoryRoot }),
  });
  const selectedScope = scope ?? DEFAULT_VALIDATOR_SCOPE;
  const candidatePaths = collectNamingCandidatePaths(repositoryRoot, {
    scope: selectedScope,
    targets: targets ?? [],
    reportableExtensions: runtimeInputs.reportableExtensions,
    reportableRootFiles: runtimeInputs.reportableRootFiles,
    walkExclusions: runtimeInputs.walkExclusions,
    packageRoot,
    registryRoots: runtimeInputs.registryRoots,
  });

  return {
    ...runtimeInputs,
    scope: candidatePaths.scope,
    selectedPaths: candidatePaths.selectedPaths,
    targets: candidatePaths.targets,
  };
};

export const projectNamingOccurrenceBridge = (namingRuntimeOrReportOutput = {}, options = {}) =>
  createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: options.namingSemanticFamilyBridge ??
      projectNamingSemanticFamilyBridge(namingRuntimeOrReportOutput),
    addressedOccurrenceNamespace: options.addressedOccurrenceNamespace,
    sourceReportRef: options.sourceReportRef,
    sourceSnapshotRef: options.sourceSnapshotRef,
  });

export const runNamingValidator = (
  repositoryRoot,
  { scope, targets, packageRoot, addressedOccurrenceNamespace, registryResolution } = {},
) => {
  const preparedInputs = prepareNamingValidatorInputs(repositoryRoot, {
    scope,
    targets,
    packageRoot,
    registryResolution,
  });

  const result = runNamingValidatorRuntime(preparedInputs);
  const namingOccurrenceBridge = addressedOccurrenceNamespace !== undefined
    ? projectNamingOccurrenceBridge(result, { addressedOccurrenceNamespace })
    : undefined;

  return {
    ...result,
    // Summarized with the resolved summary-bucket registry, so callers never fall back to Builtin.
    summary: summarizeFindingsRuntime(result.findings, preparedInputs.summaryBucketsRuntime),
    registry: preparedInputs.registry,
    ...(preparedInputs.registrySet ? { registrySet: preparedInputs.registrySet } : {}),
    ...(preparedInputs.registryProvenance ? { registryProvenance: preparedInputs.registryProvenance } : {}),
    ...(namingOccurrenceBridge ? { namingOccurrenceBridge } : {}),
  };
};

export const collectRepositoryPaths = (rootDirectory, options = {}) => {
  const runtimeInputs = prepareNamingRuntimeInputs();

  return collectNamingCandidatePaths(rootDirectory, {
    scope: options.scope,
    targets: options.targets ?? [],
    reportableExtensions: options.reportableExtensions ?? runtimeInputs.reportableExtensions,
    reportableRootFiles: options.reportableRootFiles ?? runtimeInputs.reportableRootFiles,
    walkExclusions: options.walkExclusions ?? runtimeInputs.walkExclusions,
    packageRoot: options.packageRoot,
  }).selectedPaths;
};

export const classifyPath = (relativePath, namingRolesRuntime) => {
  const runtimeInputs = prepareNamingRuntimeInputs();
  return classifyPathRuntime(
    relativePath,
    namingRolesRuntime ?? runtimeInputs.namingRolesRuntime,
    runtimeInputs.missingRolePatternsRuntime,
    runtimeInputs.findingPolicyRuntime,
    runtimeInputs.caseRulesRuntime,
    runtimeInputs.specialCaseRulesRuntime,
  );
};

export const summarizeFindings = (findings, options = {}) => {
  const runtimeInputs = prepareNamingRuntimeInputs();
  const summaryBucketsRuntime = options.summaryBucketsRuntime ?? runtimeInputs.summaryBucketsRuntime;
  return summarizeFindingsRuntime(findings, summaryBucketsRuntime);
};

export {
  parseCanonicalName,
  getSpecialCaseType,
  isAllowedSpecialCase,
  normalizePath,
  listNamingValidatorScopes,
  getScopeProfile,
  projectNamingSemanticFamilyBridge,
  createNamingOccurrenceBridgePayload,
  prepareNamingSemanticEvidenceBridge,
};
