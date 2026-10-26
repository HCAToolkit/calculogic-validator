// Tree Semantic Home reasoning report summary (Tree slice spec S2.12 B6; calculogic-validator#102).
// What a run's findings could rest on: whether Stage 2 was evaluated and, if not, why; the parameter
// set's conformance; its registry provenance, only when a registry was read; and the finding codes
// that depend on Stage 2A. Status and conformance stay separate fields, and a missing registry is
// reported as absent, never as Builtin.

const EVALUATED = 'evaluated';

// The finding codes decided from Stage 2A placement (S2.12), in the order they were migrated.
export const TREE_SEMANTIC_HOME_GOVERNED_CODES = Object.freeze(['TREE_FAMILY_SCATTERED']);

// `reasoning` is `treeFolderSemanticHomeReasoning`; null when Stage 2 was not prepared at all.
export const toTreeSemanticHomeReasoningReport = (reasoning) => {
  if (!reasoning) return null;
  const { status, parameterSet } = reasoning;
  return {
    status,
    ...(status !== EVALUATED && parameterSet?.reason ? { reason: parameterSet.reason } : {}),
    conformance: parameterSet.conformance,
    ...(parameterSet.conformanceBinding ? { conformanceBinding: structuredClone(parameterSet.conformanceBinding) } : {}),
    ...(parameterSet.registry ? { registry: { ...parameterSet.registry } } : {}),
    governedCodes: [...TREE_SEMANTIC_HOME_GOVERNED_CODES],
  };
};
