// Tree organizational-placement classification (Tree spec S2.16, slice 2). Classifies every
// (`home-elsewhere` file, eligible home) relation of the prepared Stage 2A record as `paired` (R2 ownership,
// S2.12 B2), `consistent` (the organizational-placement policy) or `reportable`. It is the one owner of R2
// pairing and of the policy's interpretation; the `TREE_FAMILY_SCATTERED` contributor only presents what it
// classifies. It reads prepared records only: Stage 2A placements and candidates, Naming's accepted section
// records (role, role category, family root), the run's role-category vocabulary, Tree's structural-home
// evidence and the prepared policy. It never re-decides eligibility, placement or a structural home, and
// it reads no file name.

import { toCandidateKey } from './tree-folder-candidates.logic.mjs';
import { SEMANTIC_HOME_PLACEMENT_STATES, SEMANTIC_HOME_REASONING_STATUSES } from './tree-semantic-home-reasoning.knowledge.mjs';
import { toValidatorDevelopmentPathPrefix, toValidatorDocAuthorityPathPrefix } from './tree-validator-development-root.logic.mjs';

export const TREE_ORGANIZATIONAL_PLACEMENT_SOURCE = 'tree-organizational-placement';
export const ORGANIZATIONAL_PLACEMENT_CLASSIFICATIONS = Object.freeze({ paired: 'paired', consistent: 'consistent', reportable: 'reportable' });
export const ORGANIZATIONAL_PLACEMENT_RULES = Object.freeze({
  r2Ownership: 'r2-ownership',
  organizationalPolicy: 'organizational-policy',
  sameNamespace: 'same-namespace',
  colocated: 'colocated',
  noApplicableEntry: 'no-applicable-entry',
  policyInapplicable: 'policy-inapplicable',
});
export const ORGANIZATIONAL_PLACEMENT_APPLICABILITY = Object.freeze({ applicable: 'applicable', inapplicable: 'inapplicable' });
export const ORGANIZATIONAL_PLACEMENT_INAPPLICABLE_REASONS = Object.freeze({
  policyNotPrepared: 'policy-not-prepared',
  vocabularyUnusable: 'vocabulary-unusable',
});
export const TREE_ORGANIZATIONAL_PLACEMENT_GOVERNED_CODES = Object.freeze(['TREE_FAMILY_SCATTERED']);

const ACTIVE_ROLE_STATUS = 'active';
const USABLE_VOCABULARY_STATE = 'usable';

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) => `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;
const copyTuple = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) => ({ addressProfileId, addressedSnapshotId, occurrenceAddress });
const folderOf = (filePath) => (filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '');

// R2 (S2.12 B2): a document under the validator development root's `doc/` is paired with a home when the
// home lies under that root, outside its `doc/`, in the top-level owned area the document's Naming
// `familyRoot` names. Without a validator development root nothing is paired.
const isPairedByR2 = ({ filePath, familyRoot, homePath, developmentContext }) => {
  const { validatorRootPrefix, docAuthorityRootPrefix } = developmentContext;
  if (docAuthorityRootPrefix === null || !filePath.startsWith(docAuthorityRootPrefix)) return false;
  const homePrefix = `${homePath}/`;
  if (!homePrefix.startsWith(validatorRootPrefix) || homePrefix.startsWith(docAuthorityRootPrefix)) return false;
  const ownedArea = homePath.slice(validatorRootPrefix.length).split('/')[0];
  return typeof familyRoot === 'string' && ownedArea.length > 0 && familyRoot === ownedArea;
};

// S2.16 step 4: a folder's namespace is the structural home of the folder or of its nearest ancestor.
const namespaceResolver = (structuralHomeEvidence) => {
  const homeByFolder = new Map((structuralHomeEvidence?.evidenceRecords ?? []).filter((record) => record.structuralHome).map((record) => [record.path, record.structuralHome]));
  return (folderPath) => {
    const parts = folderPath.split('/');
    for (let length = parts.length; length > 0; length -= 1) {
      const prefix = parts.slice(0, length).join('/');
      if (homeByFolder.has(prefix)) return homeByFolder.get(prefix);
    }
    return null;
  };
};

// S2.16 step 1: applicability, and the entries whose selectors the run's vocabulary declares.
const applicableEntriesOf = (placementPolicy, vocabularyIntake) => {
  if (placementPolicy?.availability !== 'available') {
    return { applicability: ORGANIZATIONAL_PLACEMENT_APPLICABILITY.inapplicable, reason: ORGANIZATIONAL_PLACEMENT_INAPPLICABLE_REASONS.policyNotPrepared, entries: [], diagnostics: [] };
  }
  if (vocabularyIntake?.state !== USABLE_VOCABULARY_STATE) {
    return { applicability: ORGANIZATIONAL_PLACEMENT_APPLICABILITY.inapplicable, reason: ORGANIZATIONAL_PLACEMENT_INAPPLICABLE_REASONS.vocabularyUnusable, entries: [], diagnostics: [] };
  }
  const records = vocabularyIntake.vocabulary?.records ?? [];
  const known = { roles: new Set(records.flatMap((record) => record.roles)), roleCategories: new Set(records.map((record) => record.category)) };
  const diagnostics = [];
  const entries = placementPolicy.policy.entries.filter((entry) => {
    const [kind] = Object.keys(entry.select);
    const missing = entry.select[kind].filter((value) => !known[kind].has(value));
    if (missing.length > 0) diagnostics.push({ entryId: entry.entryId, reason: 'selector-outside-vocabulary', values: [...missing] });
    return missing.length === 0;
  });
  return { applicability: ORGANIZATIONAL_PLACEMENT_APPLICABILITY.applicable, entries, diagnostics };
};

// S2.16 steps 2-3: the file's kind from its accepted, active Naming role; a roles entry wins over a
// roleCategories entry. Registry validation makes at most one entry of each kind match.
const entryForKind = (entries, record) => {
  if (!record || record.roleStatus !== ACTIVE_ROLE_STATUS) return null;
  return entries.find((entry) => entry.select.roles?.includes(record.role)) ?? entries.find((entry) => entry.select.roleCategories?.includes(record.roleCategory)) ?? null;
};

const classify = ({ paired, applicable, entry, fileNamespace, homeNamespace }) => {
  const { r2Ownership, organizationalPolicy, sameNamespace, colocated, noApplicableEntry, policyInapplicable } = ORGANIZATIONAL_PLACEMENT_RULES;
  const { consistent, reportable } = ORGANIZATIONAL_PLACEMENT_CLASSIFICATIONS;
  if (paired) return [ORGANIZATIONAL_PLACEMENT_CLASSIFICATIONS.paired, { rule: r2Ownership }];
  if (!applicable) return [reportable, { rule: policyInapplicable }];
  if (!entry) return [reportable, { rule: noApplicableEntry }];
  if (entry.arrangement === 'colocated') return [reportable, { rule: colocated, entryId: entry.entryId }];
  if (entry.namespaces.includes(fileNamespace) && !entry.namespaces.includes(homeNamespace)) {
    return [consistent, { rule: organizationalPolicy, entryId: entry.entryId, arrangement: entry.arrangement, fileNamespace, homeNamespace }];
  }
  return [reportable, { rule: sameNamespace, entryId: entry.entryId, fileNamespace, homeNamespace }];
};

// [S2.16] The prepared record `treeOrganizationalPlacement`: null when Stage 2 was not evaluated. Each
// relation carries the file and home identities, its classification and its basis, sorted by file then
// home address. `validatorDevelopmentRoot` is the run's prepared development root, or null.
export const prepareTreeOrganizationalPlacement = ({
  semanticHomeReasoning,
  sectionIntake,
  vocabularyIntake,
  structuralHomeEvidence,
  placementPolicy,
  validatorDevelopmentRoot = null,
} = {}) => {
  if (semanticHomeReasoning?.status !== SEMANTIC_HOME_REASONING_STATUSES.evaluated) return null;

  const candidateByKey = new Map((semanticHomeReasoning.semanticEvidenceSource?.candidates ?? []).map((candidate) => [toCandidateKey(candidate.candidateId), candidate]));
  const kindByTuple = new Map((sectionIntake?.semanticEvidenceEnrichment?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record]));
  const familyRootByTuple = new Map((sectionIntake?.bridgeObservations?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record.observation?.familyRoot]));
  const developmentContext = {
    validatorRootPrefix: toValidatorDevelopmentPathPrefix(validatorDevelopmentRoot),
    docAuthorityRootPrefix: toValidatorDocAuthorityPathPrefix(validatorDevelopmentRoot),
  };
  const namespaceOf = namespaceResolver(structuralHomeEvidence);
  const { applicability, reason, entries, diagnostics } = applicableEntriesOf(placementPolicy, vocabularyIntake);
  const applicable = applicability === ORGANIZATIONAL_PLACEMENT_APPLICABILITY.applicable;

  const relations = [];
  for (const placement of semanticHomeReasoning.placements) {
    if (placement.state !== SEMANTIC_HOME_PLACEMENT_STATES.homeElsewhere) continue;
    // S2.12 B1: the file's homes are the distinct folders of the eligible candidates it matches elsewhere.
    const homes = new Map();
    for (const candidateId of placement.elsewhereHomes) {
      const candidate = candidateByKey.get(toCandidateKey(candidateId));
      if (!candidate) throw new Error(`No Stage 1 candidate for ${toCandidateKey(candidateId)}.`);
      homes.set(toTupleKey(candidate.folderIdentityTuple), { folder: candidate.folderIdentityTuple, folderPath: candidate.path });
    }
    const fileKey = toTupleKey(placement.file);
    const entry = entryForKind(entries, kindByTuple.get(fileKey));
    const fileNamespace = namespaceOf(folderOf(placement.path));
    for (const home of homes.values()) {
      const paired = isPairedByR2({ filePath: placement.path, familyRoot: familyRootByTuple.get(fileKey), homePath: home.folderPath, developmentContext });
      const [classification, basis] = classify({ paired, applicable, entry, fileNamespace, homeNamespace: namespaceOf(home.folderPath) });
      relations.push(Object.freeze({ file: copyTuple(placement.file), path: placement.path, home: copyTuple(home.folder), homePath: home.folderPath, classification, basis: Object.freeze(basis) }));
    }
  }
  relations.sort((left, right) => left.file.occurrenceAddress.localeCompare(right.file.occurrenceAddress) || left.home.occurrenceAddress.localeCompare(right.home.occurrenceAddress));

  return Object.freeze({
    source: TREE_ORGANIZATIONAL_PLACEMENT_SOURCE,
    validatorDevelopmentRoot,
    policy: Object.freeze({
      ...(placementPolicy?.registry ? placementPolicy.registry : {}),
      applicability,
      ...(reason ? { reason } : {}),
    }),
    relations: Object.freeze(relations),
    diagnostics: Object.freeze(diagnostics),
  });
};

// The classified relations of one file, keyed by home folder (identity tuple).
export const relationsByFile = (record) => {
  const byFile = new Map();
  for (const relation of record?.relations ?? []) {
    const key = toTupleKey(relation.file);
    if (!byFile.has(key)) byFile.set(key, new Map());
    byFile.get(key).set(toTupleKey(relation.home), relation);
  }
  return byFile;
};

// [S2.16] `meta.organizationalPlacement`: provenance and classification counts; null without a record.
export const toTreeOrganizationalPlacementReport = (record) => {
  if (!record) return null;
  const counts = { paired: 0, consistent: 0, reportable: 0 };
  for (const relation of record.relations) counts[relation.classification] += 1;
  return {
    policy: structuredClone(record.policy),
    counts,
    ...(record.diagnostics.length > 0 ? { diagnostics: structuredClone(record.diagnostics) } : {}),
    governedCodes: [...TREE_ORGANIZATIONAL_PLACEMENT_GOVERNED_CODES],
  };
};
