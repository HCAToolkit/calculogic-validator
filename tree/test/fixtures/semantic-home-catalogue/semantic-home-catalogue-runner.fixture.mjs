// Runs the declarative S2.11 catalogue (`semantic-home-catalogue-cases.fixture.mjs`) through the real
// Stage 1 preparers and Stage 2A reasoning (calculogic-validator#102 K4). For each case and variant it
// checks every stated expectation and projects the actual results, keyed by case id and occurrence
// identity, so the conformance binding can digest what the reasoning actually did, not what the table says.
import { buildCatalogueCase, files } from './semantic-home-catalogue.fixture.mjs';

const SOURCE_ALIASES = Object.freeze({ 'naming-folder-label': 'label', 'naming-folder-semantic-context': 'context', 'naming-package-root': 'package-root' });

const expandTree = ({ files: fileSpecs = [], folders, n2 }) => ({
  files: fileSpecs.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options)),
  ...(folders ? { folders } : {}),
  ...(n2 ? { n2 } : {}),
});

const folderOf = (filePath) => (filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '');
const rootOf = (filePath) => {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1);
  return name.slice(0, name.lastIndexOf('-'));
};

const checkCandidates = (built, expectations) =>
  expectations.flatMap((expected) => {
    const label = `candidate ${expected.folder}${expected.source ? ` (${expected.source})` : ''}`;
    if (expected.none) {
      const found = built.reasoning.candidateOutcomes.filter((outcome) => built.pathOfAddress.get(outcome.candidateId.folderAddressPath) === expected.folder);
      return found.length === 0 ? [] : [`${label}: expected no candidate, found ${found.length}`];
    }
    const outcome = built.outcomeAt(expected.folder, expected.source ?? 'label');
    if (!outcome) return [`${label}: no candidate`];
    const actual = `${outcome.outcome}/${outcome.reasons[0]}`;
    return actual === `${expected.outcome}/${expected.reason}` ? [] : [`${label}: expected ${expected.outcome}/${expected.reason}, got ${actual}`];
  });

const checkPlacements = (built, expectations) =>
  expectations.flatMap((expected) => {
    const label = expected.file ? `placement ${expected.file}` : `placements in ${expected.folder}${expected.root ? ` (${expected.root})` : ''}`;
    const selected = expected.file
      ? built.reasoning.placements.filter((placement) => placement.path === expected.file)
      : built.placementsIn(expected.folder).filter((placement) => !expected.root || rootOf(placement.path) === expected.root);
    if (selected.length === 0) return [`${label}: no file selected`];
    return selected.flatMap((placement) => {
      const nearest = placement.nearestHome ? built.pathOfAddress.get(placement.nearestHome.folderAddressPath) : undefined;
      const mismatches = [
        placement.state === expected.state ? null : `state ${placement.state}`,
        placement.reason === expected.reason ? null : `reason ${placement.reason}`,
        nearest === expected.nearest ? null : `nearest ${nearest}`,
      ].filter(Boolean);
      return mismatches.length === 0 ? [] : [`${label}: ${placement.path} has ${mismatches.join(', ')}`];
    });
  });

// The digested projection of one run: actual outcomes and placements, ordered as the record orders them.
const projectResults = (built) => ({
  candidates: built.reasoning.candidateOutcomes.map((outcome) => ({
    folderAddressPath: outcome.candidateId.folderAddressPath,
    folder: built.pathOfAddress.get(outcome.candidateId.folderAddressPath),
    source: SOURCE_ALIASES[outcome.candidateId.candidateSource],
    outcome: outcome.outcome,
    reason: outcome.reasons[0],
  })),
  placements: built.reasoning.placements.map((placement) => ({
    occurrenceAddress: placement.file.occurrenceAddress,
    file: placement.path,
    state: placement.state,
    reason: placement.reason ?? null,
    decidedAtStep: placement.decidedAtStep,
    nearestHome: placement.nearestHome?.folderAddressPath ?? null,
  })),
});

// Every case and variant under `parameterSet`: `failures` lists each unmet expectation as
// `C<n>[/variant]: ...`; `results` is the projection the results digest is computed from.
export const runSemanticHomeCatalogue = ({ catalogue, parameterSet }) => {
  const failures = [];
  const results = [];
  for (const entry of catalogue.cases) {
    for (const run of [{ name: null, tree: entry.tree, expected: entry.expected }, ...(entry.variants ?? [])]) {
      const runId = run.name ? `${entry.id}/${run.name}` : entry.id;
      const built = buildCatalogueCase({ ...expandTree(run.tree), parameterSet });
      failures.push(
        ...[...checkCandidates(built, run.expected.candidates), ...checkPlacements(built, run.expected.placements)].map((failure) => `${runId}: ${failure}`),
      );
      results.push({ caseId: entry.id, variant: run.name, ...projectResults(built) });
    }
  }
  return { failures, results };
};
