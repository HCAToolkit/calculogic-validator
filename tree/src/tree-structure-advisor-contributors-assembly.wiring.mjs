import {
  attachTreeShimDiagnosticsContributor,
} from './contributors/tree-shim-diagnostics-contributor.wiring.mjs';
import {
  attachTreeSemanticHomeScatterContributor,
} from './contributors/tree-semantic-home-scatter-contributor.wiring.mjs';

// `namingSemanticFamilyBridge` and `preparedAddressKeyedJoinEvidence` are still accepted and passed in
// by wiring; since Stage 2B-iv (Tree spec S2.12) no default contributor reads them. Stage 1 and
// Stage 2A take Naming evidence from the section intake, not from here.
export const collectDefaultTreeStructureAdvisorContributors = ({
  repositoryRoot,
  selectedPaths,
  namingSemanticFamilyBridge,
  preparedAddressKeyedJoinEvidence,
  validatorDevelopmentRoot = null,
  treeSignalPolicy,
}) => [
  attachTreeShimDiagnosticsContributor({
    repositoryRoot,
    selectedPaths,
    validatorDevelopmentRoot,
    treeSignalPolicy,
  }),
  attachTreeSemanticHomeScatterContributor(),
].filter(Boolean);
