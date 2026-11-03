// Tree lexical-identity consumption, executable contract evidence (Tree slice spec S1.1-S1.3, S3.2,
// S3.7, S3.9; bridge contract §4.7; Linguistic Foundation shared contract §6.2, §9; calculogic-validator#153).
// Test-only and not shipped. `referenceStageThreeExpression` restates the amended S3.2 walk independently
// of the runtime (tree-lexical-identity-evidence and the Stage 3 walk). It mirrors the pre-amendment
// runtime exactly where the amendment changes nothing, and the tests check the implemented runtime
// against it everywhere.
import { compareLexicalResolutions } from '../../../../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';
import { toCandidateKey } from '../../../src/tree-folder-candidates.logic.mjs';
import { checkReferenceSection } from '../../../../test/fixtures/naming-token-lexical-identity/naming-token-lexical-identity-section.fixture.mjs';

// S3.2: the bases a step can record, in tie-break precedence order (earlier wins an equal end).
export const LINEAGE_BASES = Object.freeze(['stage-1-root', 'stage-1-prefix', 'positional-label', 'lexical-label']);
// S3.2 relation outcomes per (member, lineage folder) unit, in the contract table's order.
export const LEXICAL_UNIT_OUTCOMES = Object.freeze([
  ['same-lexeme', 'lexical-label'],
  ['different-lexemes', null],
  ['undetermined', 'undetermined'],
  ['possibly-same-lexeme', 'possible'],
]);
// S3.7: the `expressionUnits` keys.
export const EXPRESSION_UNIT_KINDS = Object.freeze(['lexical', 'possible', 'undetermined']);

// Repository package expression (Tree slice spec S3.2; bridge contract §4.4 rule 9, §4.8; capability
// inventory §3.11; calculogic-validator#157). Contract only, implementation-pending: no runtime module
// exists, so the reference below is the only executable statement of the amendment.
export const PACKAGE_BASIS = 'repository-package';
export const PACKAGE_SECTION = 'namingRepositoryPackageLabels';
export const PACKAGE_SECTION_VERSION = 'naming-repository-package-label.v1';
export const PACKAGE_ELEMENTS = Object.freeze(['scope', 'name']);

// §3.11 (reference): the neutral fact from a manifest `name` value, `{ scope, name }` or `null`.
export const referencePackageIdentity = (manifestName) => {
  if (typeof manifestName !== 'string') return null;
  const scoped = /^@([^/\s]+)\/([^/\s]+)$/u.exec(manifestName);
  if (scoped) return { scope: scoped[1], name: scoped[2] };
  return /^[^@/\s][^/\s]*$/u.test(manifestName) ? { scope: null, name: manifestName } : null;
};

// §4.8 producer (reference): one record per declared segment, scope first, each interpreted by the
// folder-label interpreter Naming is given. No fact, no section.
export const referencePackageLabelSection = (identity, interpretFolderLabel) => {
  if (!identity) return undefined;
  const records = PACKAGE_ELEMENTS.filter((element) => identity[element] !== null && identity[element] !== undefined).map((element) => ({
    element,
    segment: identity[element],
    ...interpretFolderLabel(identity[element]),
  }));
  return { contractVersion: PACKAGE_SECTION_VERSION, producerId: 'naming-repository-package-label', source: 'calculogic-validator/naming', recordCount: records.length, records };
};

// §4.8 consumer (reference): the envelope (§4.4 rules 3 and 9), then the record cases in table order.
// Returns the elements, in walk order, that carry parsed label tokens; a not-parsed or dropped record
// contributes none. An absent section records nothing (`null`).
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const PARSED_ONLY = ['labelTokens', 'labelRoot', 'labelFacts'];
const packageRecordShapeProblem = (record) => {
  if (!isPlainObject(record) || !PACKAGE_ELEMENTS.includes(record.element)) return 'invalid-record-shape';
  if (!isNonEmptyString(record.segment)) return 'invalid-record-shape';
  if (record.parseOutcome === 'parsed') {
    const tokensOk = Array.isArray(record.labelTokens) && record.labelTokens.length > 0 && record.labelTokens.every(isNonEmptyString);
    const factsOk = record.labelFacts === undefined || (Array.isArray(record.labelFacts) && record.labelFacts.length > 0);
    return tokensOk && record.labelRoot === record.labelTokens[0] && factsOk && !('notParsedReasons' in record) ? null : 'invalid-record-shape';
  }
  if (record.parseOutcome === 'not-parsed') {
    const reasonsOk = Array.isArray(record.notParsedReasons) && record.notParsedReasons.length > 0;
    return reasonsOk && PARSED_ONLY.every((field) => !(field in record)) ? null : 'invalid-record-shape';
  }
  return 'invalid-record-shape';
};
export const referencePackageIntake = (section) => {
  if (section === undefined) return null;
  if (!isPlainObject(section)) return { availability: 'section-invalid', elements: [], rejected: [] };
  if (section.contractVersion !== PACKAGE_SECTION_VERSION) return { availability: 'section-unsupported', elements: [], rejected: [] };
  if ('identityTupleFields' in section || !Array.isArray(section.records) || section.recordCount !== section.records.length) {
    return { availability: 'section-invalid', elements: [], rejected: [] };
  }
  const rejected = [];
  const shaped = section.records.filter((record, index) => {
    const problem = packageRecordShapeProblem(record);
    if (problem) rejected.push({ index, problem });
    return !problem;
  });
  const counts = new Map(shaped.map((record) => [record.element, shaped.filter((other) => other.element === record.element).length]));
  let kept = shaped.filter((record) => {
    if (counts.get(record.element) === 1) return true;
    rejected.push({ element: record.element, problem: 'duplicate-element' });
    return false;
  });
  const order = kept.map((record) => record.element);
  if (order.length === 2 && order[0] === 'name') {
    for (const record of kept) rejected.push({ element: record.element, problem: 'element-order' });
    kept = [];
  }
  const elements = kept.filter((record) => record.parseOutcome === 'parsed').map(({ element, segment, labelTokens }) => ({ element, segment, labelTokens: [...labelTokens] }));
  return { availability: 'available', elements, rejected };
};

const keyOf = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) => `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

// S1.2, S1.3 (reference intake): the section's availability and its accepted records, by the bridge §4.7
// consumer checks over the accepted N1 and N2 records. The envelope is checked as Stage 1A checks the other
// sections (§4.4 rules 2-3): only an absent section (`undefined`: the payload has no such key) records
// nothing (`null`); a present value that is not a plain object, `null` included, is `section-invalid`;
// an object with another contract version is `section-unsupported`. `namespace` is the authoritative
// addressed namespace, never derived from accepted records, so records with no accepted source are
// rejected by their §4.7 case (unmatched record) rather than crashing the intake.
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const referenceLexicalIntake = (section, { sectionIntake, namespace }) => {
  if (section === undefined) return null;
  if (!isPlainObject(section)) return { availability: 'section-invalid', accepted: new Map(), rejected: [] };
  if (section.contractVersion !== 'naming-token-lexical-identity.v1') return { availability: 'section-unsupported', accepted: new Map(), rejected: [] };
  const acceptedN1 = sectionIntake.semanticEvidenceEnrichment.acceptedRecords;
  const acceptedN2 = sectionIntake.folderLabelObservations.acceptedRecords;
  const checked = checkReferenceSection(section, { namespace, acceptedN1, acceptedN2 });
  if (checked.section) return { availability: 'section-invalid', accepted: new Map(), rejected: [] };
  const accepted = new Map();
  const rejected = [];
  section.records.forEach((record, index) => {
    if (checked.records[index].problems.length === 0) accepted.set(keyOf(record), record);
    else rejected.push({ key: checked.records[index].key, problems: checked.records[index].problems });
  });
  return { availability: 'available', lexicalProfile: { ...section.lexicalProfile }, accepted, rejected };
};

// One aligned position's relation (foundation §6.2), through the one Tree-facing operation S1.1 names: a
// lineage folder's label token against a member's token. A record unavailable for either occurrence is
// `undetermined` (bridge §4.7 absence behavior).
const relationAt = (intake, folderTuple, labelIndex, memberTuple, memberIndex) => {
  const label = intake.accepted.get(keyOf(folderTuple));
  const member = intake.accepted.get(keyOf(memberTuple));
  if (label?.tokenSource !== 'label-tokens' || member?.tokenSource !== 'semantic-tokens') return { relation: 'undetermined', lexemeIds: [] };
  const left = { ...label.tokens[labelIndex], provenance: intake.lexicalProfile };
  const right = { ...member.tokens[memberIndex], provenance: intake.lexicalProfile };
  const shared = left.readings.map((reading) => reading.lexemeId).filter((id) => right.readings.some((reading) => reading.lexemeId === id));
  return { relation: compareLexicalResolutions(left, right), lexemeIds: [...new Set(shared)].sort() };
};

// The amended S3.2 walk for every member of every directory. `lexicalSection` is the payload's section
// value (undefined when absent); `built.namespace` is the addressed namespace the case was built in.
// `packageSection` is the §4.8 section value (undefined when absent; calculogic-validator#157): its
// parsed elements are walked first, outermost, from position 0.
// Returns the members per directory with their steps and notes, the units counted, and the units
// themselves (for the no-repeat check).
export const referenceStageThreeExpression = ({ built, lexicalSection, packageSection }) => {
  const intake = referenceLexicalIntake(lexicalSection, { sectionIntake: built.sectionIntake, namespace: built.namespace });
  const packageElements = referencePackageIntake(packageSection)?.elements ?? [];
  const lexical = intake?.availability === 'available' ? intake : null;
  const occurrenceFacts = built.factEvidence.occurrenceFacts;
  const folderByKey = new Map(occurrenceFacts.filter((entry) => entry.occurrenceType === 'folder').map((entry) => [keyOf(entry.identityTuple), entry]));
  const parentKeyOf = (entry) => (entry.parentOccurrenceAddress ? keyOf({ ...entry.identityTuple, occurrenceAddress: entry.parentOccurrenceAddress }) : null);
  const candidates = built.semanticEvidence.candidates;
  const candidateByKey = new Map(candidates.map((candidate) => [toCandidateKey(candidate.candidateId), candidate]));
  const terminating = new Set(candidates.filter((candidate) => candidate.candidateId.candidateSource === 'naming-package-root').map((candidate) => keyOf(candidate.folderIdentityTuple)));
  const recordsByMember = new Map();
  for (const record of built.semanticEvidence.memberRelationships) recordsByMember.set(keyOf(record.member), [...(recordsByMember.get(keyOf(record.member)) ?? []), record]);
  const observationByKey = new Map(built.sectionIntake.bridgeObservations.acceptedRecords.map((record) => [keyOf(record), record.observation]));
  const enrichmentByKey = new Map(built.sectionIntake.semanticEvidenceEnrichment.acceptedRecords.map((record) => [keyOf(record), record]));

  const relevantLineageOf = (file) => {
    const lineage = [];
    let key = parentKeyOf(file);
    while (key && folderByKey.has(key) && !lineage.includes(key)) {
      lineage.push(key);
      if (terminating.has(key)) break;
      key = parentKeyOf(folderByKey.get(key));
    }
    return lineage;
  };
  const stageOneEndsOf = (file) => {
    const ends = new Map();
    for (const record of recordsByMember.get(keyOf(file.identityTuple)) ?? []) {
      const candidate = candidateByKey.get(toCandidateKey(record.candidateId));
      if (!candidate) continue;
      const folderKey = keyOf(candidate.folderIdentityTuple);
      const reached = [
        ...(record.channels.prefix?.result === 'match' ? [{ end: candidate.labelTokens.length, basis: 'stage-1-prefix' }] : []),
        ...(record.channels.root?.result === 'match' ? [{ end: 1, basis: 'stage-1-root' }] : []),
      ];
      for (const entry of reached) if (!ends.has(folderKey) || entry.end > ends.get(folderKey).end) ends.set(folderKey, entry);
    }
    return ends;
  };

  const units = [];
  const walk = (file, tokens) => {
    const stageOneEnds = stageOneEndsOf(file);
    const steps = [];
    const possible = [];
    let position = 0;
    // S3.2 repository package expression: each element at most once, in order, only at the position the
    // walk has reached, only on exact full equality, and never after a folder (they come first). No
    // lexical comparison is made for them.
    for (const { element, segment, labelTokens } of packageElements) {
      const end = position + labelTokens.length;
      if (end > tokens.length || labelTokens.some((token, offset) => tokens[position + offset] !== token)) continue;
      steps.push({ element, segment, basis: PACKAGE_BASIS, positions: { start: position, end }, tokens: tokens.slice(position, end) });
      position = end;
    }
    for (const folderKey of relevantLineageOf(file).reverse()) {
      const folder = folderByKey.get(folderKey);
      const reached = [];
      const stageOne = stageOneEnds.get(folderKey);
      const stageOneEnd = stageOne ? Math.min(stageOne.end, tokens.length) : 0;
      if (stageOne) reached.push({ end: stageOneEnd, basis: stageOne.basis });
      const label = folder.facts?.folderLabel;
      if (label?.state === 'parsed' && Array.isArray(label.labelTokens) && label.labelTokens.length > 0) {
        const labelTokens = label.labelTokens;
        const end = position + labelTokens.length;
        if (end <= tokens.length) {
          const nonExact = labelTokens.map((token, offset) => offset).filter((offset) => tokens[position + offset] !== labelTokens[offset]);
          if (nonExact.length === 0) reached.push({ end, basis: 'positional-label' });
          else if (lexical && end > Math.max(position, stageOneEnd)) {
            // S3.2 relation outcomes: one unit per (member, lineage folder), over the non-exact positions only.
            const relations = nonExact.map((offset) => ({
              position: position + offset,
              labelToken: labelTokens[offset],
              memberToken: tokens[position + offset],
              ...relationAt(lexical, folder.identityTuple, offset, file.identityTuple, position + offset),
            }));
            const has = (relation) => relations.some((entry) => entry.relation === relation);
            const unit = relations.every((entry) => entry.relation === 'same-lexeme')
              ? 'lexical'
              : has('different-lexemes')
                ? null
                : has('undetermined')
                  ? 'undetermined'
                  : 'possible';
            if (unit) units.push({ member: keyOf(file.identityTuple), folder: folderKey, unit });
            if (unit === 'lexical') reached.push({ end, basis: 'lexical-label', relations });
            if (unit === 'possible') possible.push({ folderPath: folder.path, positions: { start: position, end }, relations });
          }
        }
      }
      // Ties keep the earlier basis: Stage 1, then `positional-label`, then `lexical-label`.
      const furthest = reached.reduce((best, entry) => (!best || entry.end > best.end ? entry : best), null);
      if (!furthest || furthest.end <= position) continue;
      steps.push({
        folderPath: folder.path,
        basis: furthest.basis,
        positions: { start: position, end: furthest.end },
        tokens: tokens.slice(position, furthest.end),
        ...(furthest.relations ? { relations: furthest.relations } : {}),
      });
      position = furthest.end;
    }
    return { length: position, steps, possible };
  };

  const directories = new Map();
  for (const entry of occurrenceFacts) {
    if (entry.occurrenceType !== 'file') continue;
    const parentKey = parentKeyOf(entry);
    const folder = parentKey ? folderByKey.get(parentKey) : null;
    if (!folder) continue;
    const directory = directories.get(folder.path) ?? { members: [] };
    directories.set(folder.path, directory);
    if (entry.facts.semanticIdentity.state !== 'semantic-observation') continue;
    const enrichment = enrichmentByKey.get(keyOf(entry.identityTuple));
    const tokens = entry.facts.tokens.state === 'available' && Array.isArray(enrichment?.semanticTokens) ? [...enrichment.semanticTokens] : null;
    const expression = tokens ? walk(entry, tokens) : { length: 0, steps: [], possible: [] };
    directory.members.push({ key: keyOf(entry.identityTuple), path: entry.path, semanticName: observationByKey.get(keyOf(entry.identityTuple))?.semanticName ?? null, tokens, ...expression });
  }
  const counts = Object.fromEntries(EXPRESSION_UNIT_KINDS.map((kind) => [kind, units.filter((item) => item.unit === kind).length]));
  return { intake, directories, units, expressionUnits: lexical ? counts : null };
};

// S3.3 discovery over the reference expression: one candidate per shared residual prefix carried by at
// least two member files, with its members and distinct leading-token sequences.
export const referenceDiscovery = (members) => {
  const groups = new Map();
  for (const member of members) {
    if (!member.tokens) continue;
    const residual = member.tokens.slice(member.length);
    for (let length = 1; length <= residual.length; length += 1) {
      const prefix = residual.slice(0, length);
      const group = groups.get(prefix.join('-')) ?? { prefix, members: [] };
      groups.set(prefix.join('-'), group);
      group.members.push(member);
    }
  }
  return [...groups.values()]
    .filter((group) => group.members.length >= 2)
    .map((group) => ({
      prefix: group.prefix,
      members: [...new Set(group.members.map((member) => member.semanticName))].sort(),
      // Distinct sequences, ordered as the runtime orders them (joined, by localeCompare).
      leadingTokenSequences: [...new Map(group.members.map((member) => [...member.tokens.slice(0, member.length), ...group.prefix]).map((sequence) => [sequence.join('\u0000'), sequence])).entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, sequence]) => sequence),
    }))
    .sort((left, right) => left.prefix.join('-').localeCompare(right.prefix.join('-')));
};
