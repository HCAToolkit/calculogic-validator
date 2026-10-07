import {
  attachTreeShimDiagnosticsContributor,
} from './contributors/tree-shim-diagnostics-contributor.wiring.mjs';
import {
  attachTreeNamingSemanticFamilyBridgeContributor,
} from './contributors/tree-naming-semantic-family-bridge-contributor.wiring.mjs';

export const collectDefaultTreeStructureAdvisorContributors = ({
  repositoryRoot,
  selectedPaths,
  namingSemanticFamilyBridge,
  preparedAddressKeyedJoinEvidence,
  validatorDevelopmentRoot = null,
}) => [
  attachTreeShimDiagnosticsContributor({
    repositoryRoot,
    selectedPaths,
    validatorDevelopmentRoot,
  }),
  attachTreeNamingSemanticFamilyBridgeContributor({
    namingSemanticFamilyBridge,
    preparedAddressKeyedJoinEvidence,
    validatorDevelopmentRoot,
  }),
].filter(Boolean);
