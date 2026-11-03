// Repository package expression test plumbing (Tree slice spec S3.2; bridge contract §4.8;
// calculogic-validator#159). Test-only and not shipped. A catalogue case's declared identity reaches
// Stage 3 as on the default path: Naming's real projection with Naming's real folder-label interpreter
// (Builtin case rules), then Tree's real §4.8 intake and its accepted elements.
import { projectNamingRepositoryPackageLabels } from '../../../../naming/src/naming-repository-package-label-projection.logic.mjs';
import { interpretNamingFolderLabel } from '../../../../naming/src/rules/naming-rule-interpret-folder-label.logic.mjs';
import { prepareNamingRuntimeInputs } from '../../../../naming/src/naming-validator.wiring.mjs';
import { prepareTreeRepositoryPackageIntake, toTreeRepositoryPackageElements } from '../../../src/tree-repository-package-evidence.logic.mjs';

const { caseRulesRuntime } = prepareNamingRuntimeInputs();
export const interpretPackageSegment = (label) => interpretNamingFolderLabel(label, { caseRulesRuntime });

// For `buildCatalogueCase({ bridgeSections })`: the §4.8 section for an identity fact, or nothing.
export const repositoryPackageBridgeSections = (identity) => {
  const section = projectNamingRepositoryPackageLabels({ repositoryPackageIdentity: identity, interpretFolderLabel: interpretPackageSegment });
  return section ? () => ({ namingRepositoryPackageLabels: section }) : undefined;
};

// The Stage 3 input for a built case: Tree's intake of the payload's §4.8 section, then its elements.
export const repositoryPackageElementsOf = (built) => toTreeRepositoryPackageElements(prepareTreeRepositoryPackageIntake({ namingOccurrenceBridge: built.bridge }));
