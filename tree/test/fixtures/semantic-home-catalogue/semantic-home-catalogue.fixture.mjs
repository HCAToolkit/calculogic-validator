// Builds one S2.11 catalogue case into real Stage 1 evidence: a caller-style bridge payload and
// addressed occurrence records go through the real intake and Stage 1 preparers, then Stage 2A
// reasoning runs on them with the given parameter set (the Builtin set by default).
import { prepareTreeNamingSectionIntake } from '../../../src/tree-naming-section-intake.logic.mjs';
import { prepareTreeFolderFactEvidence } from '../../../src/tree-folder-fact-evidence.logic.mjs';
import { prepareTreeFolderCandidates } from '../../../src/tree-folder-candidates.logic.mjs';
import { prepareTreeFolderSemanticEvidence } from '../../../src/tree-folder-semantic-evidence.logic.mjs';
import { prepareTreeFolderSemanticHomeReasoning } from '../../../src/tree-folder-semantic-home-reasoning.logic.mjs';
import { getBuiltinTreeSemanticHomeParameterSet } from '../../../src/registries/tree-semantic-home-parameter-set-loader.logic.mjs';

const NAMESPACE = { addressProfileId: 'tree-codebase', addressedSnapshotId: 'catalogue' };
const ROLE = { role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' };

const section = (contractVersion, records) => ({
  contractVersion,
  producerId: 'semantic-home-catalogue',
  source: 'calculogic-validator/naming',
  identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'],
  recordCount: records.length,
  records,
});

// A file spec: `n` files in `dir` with `familyRoot` `root`.
// - `tokens`: N1 tokens (default `[root, 'item']`); `null` means the token group is not provided.
// - `noObservation: true`: no v1 observation (and no N1 record).
// - `ambiguous: true`: the observation carries `family-boundary-heuristic`.
export const files = (dir, root, n, options = {}) => Array.from({ length: n }, () => ({ dir, root, ...options }));

// `folders`: `{ path, context?: root, packageRoot?: root }` (labels are the basename's hyphen
// tokens, always parsed unless `n2` says otherwise). `n2`: `'not-staged'`, or `{ rejected: path }`.
export const buildCatalogueCase = ({ folders: folderSpecs = [], files: fileSpecs = [], n2 = 'available', parameterSet } = {}) => {
  const folderPaths = new Set();
  for (const spec of [...folderSpecs.map((folder) => folder.path), ...fileSpecs.map((file) => file.dir)]) {
    const parts = spec.split('/');
    for (let index = 1; index <= parts.length; index += 1) folderPaths.add(parts.slice(0, index).join('/'));
  }
  const folderList = [...folderPaths].sort();
  const addressByPath = new Map();
  const childCount = new Map();
  const nextAddress = (parentAddress) => {
    const count = (childCount.get(parentAddress) ?? 0) + 1;
    childCount.set(parentAddress, count);
    return parentAddress ? `${parentAddress}.${count}` : `F${count}`;
  };
  const occurrences = [];
  for (const folderPath of folderList) {
    const parentPath = folderPath.includes('/') ? folderPath.slice(0, folderPath.lastIndexOf('/')) : null;
    const parentAddress = parentPath ? addressByPath.get(parentPath) : null;
    const address = nextAddress(parentAddress);
    addressByPath.set(folderPath, address);
    occurrences.push({ addressPath: address, path: folderPath, occurrenceType: 'folder', parentAddressPath: parentAddress });
  }

  const tuple = (occurrenceAddress) => ({ ...NAMESPACE, occurrenceAddress });
  const observations = [];
  const n1 = [];
  fileSpecs.forEach((spec, index) => {
    const parentAddress = addressByPath.get(spec.dir);
    const address = nextAddress(parentAddress);
    const path = `${spec.dir}/${spec.root}-${index}.logic.mjs`;
    occurrences.push({ addressPath: address, path, occurrenceType: 'file', parentAddressPath: parentAddress });
    if (spec.noObservation) return;
    observations.push({
      ...tuple(address),
      semanticName: `${spec.root}-item`,
      familyRoot: spec.root,
      semanticFamily: spec.root,
      ...(spec.ambiguous ? { ambiguityFlags: ['family-boundary-heuristic'] } : {}),
    });
    n1.push(spec.tokens === null ? { ...tuple(address), ...ROLE } : { ...tuple(address), semanticTokens: spec.tokens ?? [spec.root, 'item'], ...ROLE });
  });
  for (const folder of folderSpecs) {
    const address = addressByPath.get(folder.path);
    if (folder.context) {
      observations.push({ ...tuple(address), familyRoot: folder.context, semanticName: folder.context, semanticEvidenceKind: 'folder-semantic-context', occurrenceType: 'folder' });
    }
    if (folder.packageRoot) {
      observations.push({
        ...tuple(address),
        familyRoot: folder.packageRoot,
        semanticEvidenceKind: 'semantic-family-root-folder',
        familyRootQualification: 'package-root-folder',
        occurrenceType: 'folder',
      });
    }
  }
  const n2Records = folderList.flatMap((folderPath) => {
    const labelTokens = folderPath.slice(folderPath.lastIndexOf('/') + 1).split('-');
    const record = { ...tuple(addressByPath.get(folderPath)), parseOutcome: 'parsed', labelTokens, labelRoot: labelTokens[0] };
    // A duplicated identity tuple is rejected at intake, record and duplicate alike.
    return n2?.rejected === folderPath ? [record, record] : [record];
  });

  const bridge = {
    bridgeContractVersion: 'naming-occurrence-bridge.v1',
    ...NAMESPACE,
    observations,
    namingSemanticEvidenceEnrichment: section('naming-semantic-evidence-enrichment.v1', n1),
    ...(n2 === 'not-staged' ? {} : { namingFolderLabelObservations: section('naming-folder-label-observation.v1', n2Records) }),
  };
  const staged = {
    namingSemanticFamilyBridge: { observations: [] },
    namingSemanticEvidenceEnrichment: { records: [] },
    ...(n2 === 'not-staged' ? {} : { interpretFolderLabel: () => ({}) }),
  };
  const sectionIntake = prepareTreeNamingSectionIntake({
    namingOccurrenceBridge: bridge,
    bridgeSource: 'tree-built',
    addressedNamespace: NAMESPACE,
    addressedOccurrenceRecords: occurrences,
    staged,
  });
  const factEvidence = prepareTreeFolderFactEvidence({ sectionIntake, addressedNamespace: NAMESPACE, addressedOccurrenceRecords: occurrences });
  const candidates = prepareTreeFolderCandidates({ factEvidence, sectionIntake });
  const semanticEvidence = prepareTreeFolderSemanticEvidence({ sectionIntake, factEvidence, candidates });
  const reasoning = prepareTreeFolderSemanticHomeReasoning({
    semanticEvidence,
    factEvidence,
    parameterSet: parameterSet ?? getBuiltinTreeSemanticHomeParameterSet(),
  });

  const pathOfAddress = new Map(occurrences.map((occurrence) => [occurrence.addressPath, occurrence.path]));
  const SOURCE_ALIASES = { 'naming-folder-label': 'label', 'naming-folder-semantic-context': 'context', 'naming-package-root': 'package-root' };
  // `outcomeAt('docs/tree-owned')` or `outcomeAt('kit', 'context')`.
  const outcomeAt = (folderPath, source = 'label') =>
    reasoning.candidateOutcomes.find(
      (outcome) => pathOfAddress.get(outcome.candidateId.folderAddressPath) === folderPath && SOURCE_ALIASES[outcome.candidateId.candidateSource] === source,
    );
  const attributionsAt = (folderPath, source = 'label') =>
    reasoning.memberAttributions.filter(
      (record) => pathOfAddress.get(record.candidateId.folderAddressPath) === folderPath && SOURCE_ALIASES[record.candidateId.candidateSource] === source,
    );
  return { sectionIntake, factEvidence, semanticEvidence, reasoning, outcomeAt, attributionsAt, pathOfAddress };
};
