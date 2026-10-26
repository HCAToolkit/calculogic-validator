import { collectSemanticHomeScatterFindings } from './tree-semantic-home-scatter-contributor.logic.mjs';

// Stage 2B-i (Tree spec S2.12): reads the run's prepared inputs when the runtime calls it, so it needs
// nothing at attach time and emits nothing when Stage 2 was not evaluated.
export const attachTreeSemanticHomeScatterContributor = () => (preparedInputs) =>
  collectSemanticHomeScatterFindings({
    preparedDependencies: preparedInputs?.preparedDependencies,
    validatorDevelopmentRoot: preparedInputs?.validatorDevelopmentRoot ?? null,
  });
