import {
  collectNamingSemanticFamilyBridgeFindings,
} from './tree-naming-semantic-family-bridge-contributor.logic.mjs';

export const attachTreeNamingSemanticFamilyBridgeContributor = ({
  namingSemanticFamilyBridge,
  preparedAddressKeyedJoinEvidence,
  validatorDevelopmentRoot = null,
}) => {
  if (namingSemanticFamilyBridge === undefined && preparedAddressKeyedJoinEvidence === undefined) {
    return null;
  }

  return () =>
    collectNamingSemanticFamilyBridgeFindings(namingSemanticFamilyBridge, {
      preparedAddressKeyedJoinEvidence,
      validatorDevelopmentRoot,
    });
};
