// Test-only reference for the organizational-placement contract (Tree spec S2.16). Not runtime behavior:
// no production registry, loader or emitter exists for it. It classifies each (home-elsewhere file,
// eligible home) relation of a prepared Stage 2 record as `paired`, `consistent` or `reportable`, exactly
// as S2.16 specifies, and derives which files the contract would report.
//
// R2 is never re-implemented: pairing is read from the production `TREE_FAMILY_SCATTERED` emitter, which
// omits a file paired with every home and lists `pairedHomes` on the others.

import { collectSemanticHomeScatterFindings } from '../../../src/contributors/tree-semantic-home-scatter-contributor.logic.mjs';

const tupleKey = (tuple) => `${tuple.addressProfileId}\u0000${tuple.addressedSnapshotId}\u0000${tuple.occurrenceAddress}`;
const candidateKey = (candidateId) => JSON.stringify(candidateId);

// Load-time validation of a policy fixture, as S2.16 states it for the registry.
export const assertValidOrganizationalPlacementPolicy = (policy, structuralHomes) => {
  const seen = { roles: new Map(), roleCategories: new Map() };
  const ids = new Set();
  for (const entry of policy.entries) {
    if (ids.has(entry.entryId)) throw new Error(`duplicate entryId ${entry.entryId}`);
    ids.add(entry.entryId);
    const kinds = Object.keys(entry.select);
    if (kinds.length !== 1 || !['roles', 'roleCategories'].includes(kinds[0]) || entry.select[kinds[0]].length === 0) throw new Error(`${entry.entryId}: select must name exactly one non-empty kind`);
    if (!['centralized', 'colocated'].includes(entry.arrangement)) throw new Error(`${entry.entryId}: unknown arrangement`);
    if (entry.arrangement === 'centralized') {
      if (!entry.namespaces?.length) throw new Error(`${entry.entryId}: a centralized entry lists namespaces`);
      for (const namespace of entry.namespaces) if (!structuralHomes.includes(namespace)) throw new Error(`${entry.entryId}: unknown namespace ${namespace}`);
    } else if (entry.namespaces !== undefined) {
      throw new Error(`${entry.entryId}: a colocated entry lists no namespaces`);
    }
    for (const value of entry.select[kinds[0]]) {
      if (seen[kinds[0]].has(value)) throw new Error(`${entry.entryId}: ${value} is already selected by ${seen[kinds[0]].get(value)}`);
      seen[kinds[0]].set(value, entry.entryId);
    }
  }
};

// Every relation of the record, classified (S2.16), and the files the contract would report.
export const classifyOrganizationalPlacement = ({ preparedDependencies, validatorDevelopmentRoot = null, policy }) => {
  const reasoning = preparedDependencies.treeFolderSemanticHomeReasoning;
  const candidates = new Map((reasoning.semanticEvidenceSource?.candidates ?? []).map((candidate) => [candidateKey(candidate.candidateId), candidate]));
  const homeOfFolder = new Map(preparedDependencies.treeStructuralHomeEvidence.evidenceRecords.filter((record) => record.structuralHome).map((record) => [record.path, record.structuralHome]));
  const namespaceOf = (folderPath) => {
    const parts = folderPath.split('/');
    for (let length = parts.length; length > 0; length -= 1) {
      const prefix = parts.slice(0, length).join('/');
      if (homeOfFolder.has(prefix)) return homeOfFolder.get(prefix);
    }
    return null;
  };
  const kindOf = new Map(preparedDependencies.treeNamingSectionIntake.semanticEvidenceEnrichment.acceptedRecords.map((record) => [record.repoRelativePath, record]));
  const vocabulary = preparedDependencies.treeRoleCategoryVocabularyIntake;
  const usable = vocabulary?.state === 'usable';
  const knownRoles = new Set((vocabulary?.vocabulary?.records ?? []).flatMap((record) => record.roles));
  const knownCategories = new Set((vocabulary?.vocabulary?.records ?? []).map((record) => record.category));
  const diagnostics = [];
  const applicable = usable
    ? policy.entries.filter((entry) => {
        const [kind] = Object.keys(entry.select);
        const known = kind === 'roles' ? knownRoles : knownCategories;
        const missing = entry.select[kind].filter((value) => !known.has(value));
        if (missing.length > 0) diagnostics.push({ entryId: entry.entryId, reason: 'selector-outside-vocabulary', values: missing });
        return missing.length === 0;
      })
    : [];
  const entryFor = (record) => {
    if (!record || record.roleStatus !== 'active') return null;
    return applicable.find((entry) => entry.select.roles?.includes(record.role)) ?? applicable.find((entry) => entry.select.roleCategories?.includes(record.roleCategory)) ?? null;
  };

  // R2 pairing, from the production emitter.
  const findings = collectSemanticHomeScatterFindings({ preparedDependencies, validatorDevelopmentRoot });
  const reportedToday = new Map(findings.flatMap((finding) => finding.details.files.map((file) => [file.path, new Set((file.pairedHomes ?? []).map(tupleKey))])));

  const relations = [];
  for (const placement of reasoning.placements.filter((item) => item.state === 'home-elsewhere')) {
    const homes = new Map();
    for (const candidateId of placement.elsewhereHomes) {
      const candidate = candidates.get(candidateKey(candidateId));
      homes.set(tupleKey(candidate.folderIdentityTuple), { tuple: candidate.folderIdentityTuple, path: candidate.path });
    }
    const pairedKeys = reportedToday.has(placement.path) ? reportedToday.get(placement.path) : new Set(homes.keys());
    const fileFolder = placement.path.includes('/') ? placement.path.slice(0, placement.path.lastIndexOf('/')) : '';
    const fileNamespace = namespaceOf(fileFolder);
    const entry = entryFor(kindOf.get(placement.path));
    for (const [key, home] of [...homes.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const homeNamespace = namespaceOf(home.path);
      let classification;
      let basis;
      if (pairedKeys.has(key)) {
        [classification, basis] = ['paired', { rule: 'r2-ownership' }];
      } else if (!usable) {
        [classification, basis] = ['reportable', { rule: 'policy-inapplicable' }];
      } else if (!entry) {
        [classification, basis] = ['reportable', { rule: 'no-applicable-entry' }];
      } else if (entry.arrangement === 'colocated') {
        [classification, basis] = ['reportable', { rule: 'colocated', entryId: entry.entryId }];
      } else if (entry.namespaces.includes(fileNamespace) && !entry.namespaces.includes(homeNamespace)) {
        [classification, basis] = ['consistent', { rule: 'organizational-policy', entryId: entry.entryId, arrangement: entry.arrangement, fileNamespace, homeNamespace }];
      } else {
        [classification, basis] = ['reportable', { rule: 'same-namespace', entryId: entry.entryId, fileNamespace, homeNamespace }];
      }
      relations.push({ file: { ...placement.file }, path: placement.path, home: { ...home.tuple }, homePath: home.path, classification, basis });
    }
  }
  const reported = [...new Set(relations.filter((relation) => relation.classification === 'reportable').map((relation) => relation.path))].sort();
  const counts = { paired: 0, consistent: 0, reportable: 0 };
  for (const relation of relations) counts[relation.classification] += 1;
  return { relations, reported, counts, diagnostics, applicability: usable ? 'applicable' : 'inapplicable', reportedToday: [...reportedToday.keys()].sort(), pairedToday: reportedToday };
};
