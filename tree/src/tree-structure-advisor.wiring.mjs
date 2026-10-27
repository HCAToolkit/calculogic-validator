import fs from 'node:fs';
import path from 'node:path';
import {
  runTreeStructureAdvisor as runTreeStructureAdvisorRuntime,
  summarizeFindings,
} from './tree-structure-advisor.logic.mjs';
import {
  collectDefaultTreeStructureAdvisorContributors,
} from './tree-structure-advisor-contributors-assembly.wiring.mjs';
import {
  collectSuiteScopedSnapshotInputs,
  toReportedScopeExclusions,
} from '../../src/core/suite-scoped-snapshot-input.logic.mjs';
import { resolveValidatorDevelopmentContext } from '../../src/core/validator-development-context.logic.mjs';
import { prepareTreeCodebaseValidationInput } from '../../structural-addressing/src/structural-addressing-tree-codebase-validation-input.logic.mjs';
import { prepareTreeCodebaseAddressedSnapshot } from '../../structural-addressing/src/structural-addressing-tree-codebase.logic.mjs';
import { prepareTreeAddressedOccurrenceSnapshot } from './tree-addressed-occurrence-snapshot.logic.mjs';
import { prepareTreeStructuralHomeEvidence } from './tree-structural-home-evidence.logic.mjs';
import { prepareTreeFamilyRootFolderEvidence } from './tree-family-root-folder-evidence.logic.mjs';
import { prepareTreeSemanticNamingFolderTypeRelationshipEvidence } from './tree-semantic-naming-folder-type-relationship.logic.mjs';
import { prepareTreeFolderKindEvidence } from './tree-folder-kind-evidence.logic.mjs';
import {
  prepareTreeOccurrenceClassificationReplacementRuntime,
} from './tree-occurrence-classification.logic.mjs';
import { prepareTreeStructuralContextAssessment } from './tree-structural-context-assessment.logic.mjs';
import { prepareNamingSemanticEvidenceBridge } from '../../naming/src/naming-semantic-evidence-bridge.logic.mjs';
import { projectNamingFolderCompositionBridge } from '../../naming/src/naming-folder-composition-projection.logic.mjs';
import { prepareTreeNamingSectionIntake } from './tree-naming-section-intake.logic.mjs';
import { prepareTreeFolderFactEvidence } from './tree-folder-fact-evidence.logic.mjs';
import { prepareTreeFolderCandidates } from './tree-folder-candidates.logic.mjs';
import { prepareTreeFolderSemanticEvidence } from './tree-folder-semantic-evidence.logic.mjs';
import { createNamingOccurrenceBridgePayload } from '../../naming/src/naming-occurrence-bridge-payload.logic.mjs';
import { loadNamingFolderCompositionPatternsRegistryFromRegistryRoot } from '../../naming/src/registries/naming-folder-composition-patterns-registry.logic.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT, NAMING_REGISTRY_SLICE_ID } from '../../naming/src/registries/naming-registry-inventory.knowledge.mjs';
import { prepareTreeNamingOccurrenceBridgeIntake } from './tree-naming-occurrence-intake.logic.mjs';
import { prepareContextualTreeRepoShapePolicy } from './tree-contextual-repo-shape-policy.logic.mjs';
import { prepareTreeRepoShapeEvidence } from './tree-repo-shape-evidence.logic.mjs';
import { collectDeclaredLocalPackageEvidence } from '../../src/core/repository-local-package-evidence.logic.mjs';
import {
  loadTreeRuntimeRegistries,
  loadTreeSemanticHomeParameterSet,
} from './registries/tree-runtime-registries.logic.mjs';
import { TREE_REGISTRY_SLICE_ID } from './registries/tree-registry-inventory.knowledge.mjs';
import { prepareTreeFolderSemanticHomeReasoning } from './tree-folder-semantic-home-reasoning.logic.mjs';

const TOP_LEVEL_SCAN_EXCLUSIONS = new Set(['.git', 'node_modules']);
const TREE_ADDRESS_PROFILE_ID = 'tree-structure-advisor-address-profile';
const TREE_ADDRESSED_SNAPSHOT_ID = 'tree-structure-advisor-current-snapshot';

const WALK_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.reports',
  '.turbo',
  '.yarn',
  'coverage',
  'dist',
  'node_modules',
]);

const collectTopLevelDirectoryNames = (repositoryRoot) =>
  fs
    .readdirSync(repositoryRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((directoryName) => !TOP_LEVEL_SCAN_EXCLUSIONS.has(directoryName))
    .filter((directoryName) => !directoryName.startsWith('.'))
    .sort((left, right) => left.localeCompare(right));

// `registryRoots` carries the run's resolved registry roots (#41 registry lifecycle): the suite
// root for scope profiles, the Tree root for Tree's own registries and the Naming root for the
// Naming folder-composition registry. Without it (a direct call outside a validation run) every
// registry comes from Builtin. `registryResolution` is the run's whole lifecycle resolution, which the
// Semantic Home parameter loader needs for provenance (Tree spec S2.9); its roots are the run's roots.
const resolveRegistryRoots = ({ registryResolution, registryRoots }) => {
  if (!registryResolution) {
    return registryRoots;
  }
  if (registryRoots && registryRoots !== registryResolution.registryRoots) {
    throw new Error('Tree wiring received registry roots that are not the registry resolution\'s own roots.');
  }
  return registryResolution.registryRoots;
};

export const prepareTreeStructureAdvisorInputs = (
  repositoryRoot,
  {
    scope,
    targets,
    packageRoot,
    namingSemanticFamilyBridge,
    namingSemanticEvidenceEnrichment,
    interpretFolderLabel,
    namingOccurrenceBridge,
    preparedAddressKeyedJoinEvidence,
    registryResolution,
    registryRoots: suppliedRegistryRoots,
  } = {},
) => {
  const registryRoots = resolveRegistryRoots({ registryResolution, registryRoots: suppliedRegistryRoots });
  const scopedSnapshotInputs = collectSuiteScopedSnapshotInputs(repositoryRoot, {
    scope,
    targets,
    walkExcludedDirectories: WALK_EXCLUDED_DIRECTORIES,
    skipDotDirectories: true,
    packageRoot,
    registryRoots,
  });
  const developmentContext = resolveValidatorDevelopmentContext({
    targetRepositoryRoot: repositoryRoot,
    packageRoot,
  });
  const validatorDevelopmentRoot = developmentContext.validatorDevelopmentRoot === null
    ? null
    : (path.relative(developmentContext.targetRepositoryRoot, developmentContext.validatorDevelopmentRoot) || '.')
      .split(path.sep)
      .join('/');
  const selectedPaths = scopedSnapshotInputs.selectedPaths;
  const structuralAddressTargets = scopedSnapshotInputs.targetDescriptors ?? scopedSnapshotInputs.targets;
  // Occurrence identity and nesting come from Structural Addressing (Refs #45): the Addressing-owned
  // validation input adapter, the tree-codebase producer, then Tree's projection onto its snapshot
  // contract. Contract: doc/ValidatorSpecs/tree-owned/tree-structural-address-probe-contract.spec.md.
  const treeCodebaseValidationInput = prepareTreeCodebaseValidationInput({
    selectedPaths,
    includeRoots: scopedSnapshotInputs.includeRoots,
    targets: structuralAddressTargets,
  });
  const structuralAddressSnapshot = prepareTreeAddressedOccurrenceSnapshot({
    occurrenceRecords: prepareTreeCodebaseAddressedSnapshot(treeCodebaseValidationInput.treeCodebaseInput).occurrenceRecords,
    declaredScopeRoots: treeCodebaseValidationInput.declaredScopeRoots,
    targets: structuralAddressTargets,
    selectedPaths,
    source: 'tree-structure-advisor.wiring',
  });
  const {
    signalPolicy: treeSignalPolicy,
    repoShapePolicy,
    structuralHomesRegistry,
    folderKindsRegistry,
    semanticNamingFolderTypeRelationshipsRegistry,
    structuralRoleTokensRegistry,
    structuralContextAssessmentPoliciesRegistry,
  } = loadTreeRuntimeRegistries(registryRoots?.[TREE_REGISTRY_SLICE_ID]);
  // Read only by Stage 2A reasoning below (Tree spec S2.9, S2.14).
  const treeSemanticHomeParameterSet = loadTreeSemanticHomeParameterSet({ registryResolution, registryRoots });
  const treeRepoShapeEvidence = prepareTreeRepoShapeEvidence({
    localPackageEvidence: collectDeclaredLocalPackageEvidence(repositoryRoot),
  });
  const treeRepoShapePolicy = prepareContextualTreeRepoShapePolicy({
    registryPolicy: repoShapePolicy,
    validatorDevelopmentRoot,
    repoShapeEvidence: treeRepoShapeEvidence,
  });
  const namingFolderCompositionPatternsRegistry = loadNamingFolderCompositionPatternsRegistryFromRegistryRoot(
    registryRoots?.[NAMING_REGISTRY_SLICE_ID] ?? NAMING_BUILTIN_REGISTRY_ROOT,
  );
  const namingFolderCompositionBridge = projectNamingFolderCompositionBridge({
    folderOccurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
    folderCompositionPatternsRegistry: namingFolderCompositionPatternsRegistry,
  });
  // The occurrence bridge is built from Naming's source observations, never from prepared evidence:
  // preparation is a consumer view, and the producer copies only source fields (#82).
  const combinedNamingSemanticObservations = {
    observations: [
      ...(Array.isArray(namingSemanticFamilyBridge?.observations) ? namingSemanticFamilyBridge.observations : []),
      ...namingFolderCompositionBridge.observations,
    ],
  };
  const addressedOccurrenceNamespace = {
    addressProfileId: TREE_ADDRESS_PROFILE_ID,
    addressedSnapshotId: TREE_ADDRESSED_SNAPSHOT_ID,
    occurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
  };
  // A caller-supplied payload is used as supplied. Otherwise Tree builds one against its own snapshot
  // with the Naming-owned producer, passing the staged N1 source and folder-label interpreter (S1.1).
  const addressedNamingOccurrenceBridge = namingOccurrenceBridge ?? createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: combinedNamingSemanticObservations,
    addressedOccurrenceNamespace,
    namingSemanticEvidenceEnrichment,
    interpretFolderLabel,
  });
  const treeNamingSectionIntake = prepareTreeNamingSectionIntake({
    namingOccurrenceBridge: addressedNamingOccurrenceBridge,
    bridgeSource: namingOccurrenceBridge ? 'caller-supplied' : 'tree-built',
    addressedNamespace: { addressProfileId: TREE_ADDRESS_PROFILE_ID, addressedSnapshotId: TREE_ADDRESSED_SNAPSHOT_ID },
    addressedOccurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
    staged: { namingSemanticFamilyBridge, namingSemanticEvidenceEnrichment, interpretFolderLabel },
  });
  // Stage 1B-i (S1.3 fact level, S1.8): built only from the intake above and Tree's snapshot.
  const treeFolderFactEvidence = prepareTreeFolderFactEvidence({
    sectionIntake: treeNamingSectionIntake,
    addressedNamespace: { addressProfileId: TREE_ADDRESS_PROFILE_ID, addressedSnapshotId: TREE_ADDRESSED_SNAPSHOT_ID },
    addressedOccurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
  });
  const addressedNamingSemanticEvidenceBridge = prepareNamingSemanticEvidenceBridge(addressedNamingOccurrenceBridge);
  const treeNamingOccurrenceBridgeIntake = prepareTreeNamingOccurrenceBridgeIntake({
    namingOccurrenceBridge: addressedNamingOccurrenceBridge,
    namingSemanticFamilyBridge,
  });

  const treeStructuralHomeEvidence = prepareTreeStructuralHomeEvidence({
    addressedOccurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
    structuralHomesRegistry,
  });
  const treeSemanticNamingFolderTypeRelationshipEvidence = prepareTreeSemanticNamingFolderTypeRelationshipEvidence({
    addressedOccurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
    namingSemanticEvidenceRecords: addressedNamingSemanticEvidenceBridge.observations,
    treeStructuralHomeEvidence,
    treeRepoShapePolicy,
    relationshipsRegistry: semanticNamingFolderTypeRelationshipsRegistry,
    structuralRoleTokensRegistry,
  });
  const treeFamilyRootFolderEvidence = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
    namingSemanticEvidenceRecords: addressedNamingSemanticEvidenceBridge.observations,
    treeSemanticNamingFolderTypeRelationshipEvidence,
  });
  const treeFolderKindEvidence = prepareTreeFolderKindEvidence({
    addressedOccurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
    treeStructuralHomeEvidence,
    treeFamilyRootFolderEvidence,
    treeSemanticNamingFolderTypeRelationshipEvidence,
    folderKindsRegistry,
  });
  // Stage 1B-ii (S1.4-S1.7, S1.9): candidates and candidate-relative evidence, built only from the
  // intake and the 1B-i fact record; Tree's own folder evidence is referenced, never read by a rule.
  const treeFolderSemanticEvidence = prepareTreeFolderSemanticEvidence({
    sectionIntake: treeNamingSectionIntake,
    factEvidence: treeFolderFactEvidence,
    candidates: prepareTreeFolderCandidates({
      factEvidence: treeFolderFactEvidence,
      sectionIntake: treeNamingSectionIntake,
      folderKindEvidence: treeFolderKindEvidence,
      structuralHomeEvidence: treeStructuralHomeEvidence,
    }),
  });
  // Stage 2A (S2.3-S2.9): candidate reasoning and placement from the Stage 1 records and the loaded
  // parameters, all by reference. Nothing reads it yet, so it changes no finding.
  const treeFolderSemanticHomeReasoning = prepareTreeFolderSemanticHomeReasoning({
    semanticEvidence: treeFolderSemanticEvidence,
    factEvidence: treeFolderFactEvidence,
    sectionIntake: treeNamingSectionIntake,
    parameterSet: treeSemanticHomeParameterSet,
    scope: scopedSnapshotInputs.scope,
  });
  const treeOccurrenceClassificationReplacementRuntime = prepareTreeOccurrenceClassificationReplacementRuntime({
    treeStructuralHomeEvidence,
    treeFamilyRootFolderEvidence,
    treeSemanticNamingFolderTypeRelationshipEvidence,
    treeFolderKindEvidence,
    treeRepoShapePolicy,
  });
  const currentOccurrenceClassificationRecords = treeOccurrenceClassificationReplacementRuntime.classifyOccurrenceRecords(
    structuralAddressSnapshot.occurrenceRecords,
  );

  const treeStructuralContextAssessment = prepareTreeStructuralContextAssessment({
    currentOccurrenceClassificationRecords,
    structuralContextAssessmentPoliciesRegistry,
  });

  return {
    scope: scopedSnapshotInputs.scope,
    selectedPaths,
    // Suite-owned nested-entry exclusions (#56), in their reported form.
    scopeExclusions: toReportedScopeExclusions(scopedSnapshotInputs.scopeExclusions),
    validatorDevelopmentRoot,
    topLevelDirectoryNames: collectTopLevelDirectoryNames(repositoryRoot),
    targets: scopedSnapshotInputs.targets,
    structuralAddressSnapshot,
    preparedDependencies: {
      treeStructuralHomeEvidence,
      addressedNamingOccurrenceBridge,
      addressedNamingSemanticEvidenceBridge,
      treeSemanticNamingFolderTypeRelationshipEvidence,
      treeFamilyRootFolderEvidence,
      treeFolderKindEvidence,
      treeRepoShapePolicy,
      treeRepoShapeEvidence,
      treeSignalPolicy,
      treeStructuralContextAssessment,
      treeOccurrenceClassificationReplacementRuntime,
      treeNamingOccurrenceBridgeIntake,
      treeNamingSectionIntake,
      treeFolderFactEvidence,
      treeFolderSemanticEvidence,
      treeSemanticHomeParameterSet,
      treeFolderSemanticHomeReasoning,
    },
    findingContributors: collectDefaultTreeStructureAdvisorContributors({
      repositoryRoot,
      selectedPaths,
      namingSemanticFamilyBridge,
      preparedAddressKeyedJoinEvidence,
      validatorDevelopmentRoot,
      treeSignalPolicy,
    }),
  };
};

export const runTreeStructureAdvisor = (
  repositoryRoot,
  {
    scope,
    targets,
    packageRoot,
    namingSemanticFamilyBridge,
    namingSemanticEvidenceEnrichment,
    interpretFolderLabel,
    namingOccurrenceBridge,
    preparedAddressKeyedJoinEvidence,
    registryResolution,
    registryRoots,
  } = {},
) => {
  const preparedInputs = prepareTreeStructureAdvisorInputs(repositoryRoot, {
    scope,
    targets,
    packageRoot,
    namingSemanticFamilyBridge,
    namingSemanticEvidenceEnrichment,
    interpretFolderLabel,
    namingOccurrenceBridge,
    preparedAddressKeyedJoinEvidence,
    registryResolution,
    registryRoots,
  });
  return runTreeStructureAdvisorRuntime(preparedInputs);
};

export { summarizeFindings };
