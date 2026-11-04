import { collectEmergentBoundaryOpportunityFindings } from './tree-emergent-boundary-opportunity-contributor.logic.mjs';

// Stage 3 first advisory finding (Tree spec S3.13): reads the run's prepared Stage 3 record when the
// runtime calls it, so it needs nothing at attach time and emits nothing when Stage 3 was not prepared.
export const attachTreeEmergentBoundaryOpportunityContributor = () => (preparedInputs) =>
  collectEmergentBoundaryOpportunityFindings({ preparedDependencies: preparedInputs?.preparedDependencies });
