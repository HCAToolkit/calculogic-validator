// Tree lexical-identity consumption, executable contract evidence (Tree slice spec S1.1-S1.3, S3.2,
// S3.7, S3.9; bridge contract §4.7; Linguistic Foundation shared contract §6.2, §9; calculogic-validator#153).
// Test-only and not shipped. `referenceStageThreeExpression` restates the amended S3.2 walk so its
// expectations can be checked before any runtime implements it; it is not the Tree consumer, which belongs
// to the implementation slice. It mirrors today's runtime walk exactly where the amendment changes
// nothing, and the contract tests check that against the runtime for every catalogue case.
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
// Returns the members per directory with their steps and notes, the units counted, and the units
// themselves (for the no-repeat check).
export const referenceStageThreeExpression = ({ built, lexicalSection }) => {
  const intake = referenceLexicalIntake(lexicalSection, { sectionIntake: built.sectionIntake, namespace: built.namespace });
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
