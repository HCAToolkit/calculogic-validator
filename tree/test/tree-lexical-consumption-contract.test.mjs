// Tree lexical-identity consumption: executable contract evidence (Tree slice spec S1.1-S1.3, S3.2, S3.7,
// S3.9, S3.11; bridge contract §4.7; Linguistic Foundation shared contract §8.5, §9.2, §12;
// calculogic-validator#153). Contract slice: no Tree runtime reads the section yet. These tests prove the
// amended rules are expressible and deterministic through a test-only reference walk, that the reference
// equals today's runtime wherever the amendment changes nothing, and that today's runtime still reads a
// payload carrying the section exactly as without it, so the lexical companions are implementation-pending.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import {
  LEXICAL_UNIT_OUTCOMES,
  LINEAGE_BASES,
  referenceDiscovery,
  referenceLexicalIntake,
  referenceStageThreeExpression,
} from './fixtures/lexical-consumption/tree-lexical-expression-reference.fixture.mjs';
import { prepareTreeEmergentBoundaryReasoning } from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { projectNamingTokenLexicalIdentities } from '../../naming/src/naming-token-lexical-identity-projection.logic.mjs';
import { prepareLinguisticFoundation } from '../../linguistic-foundation/src/linguistic-foundation.wiring.mjs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const TREE = read('doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md');
const LF = read('doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md');
const BRIDGE = read('doc/ValidatorSpecs/cross-cutting/naming-bridge-occurrence-identity-contract.spec.md');
const between = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, start);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? undefined : to);
};
const S3_2 = between(TREE, '#### S3.2 Terms', '#### S3.3');
const S3_9_LEXICAL = between(TREE, '##### Lexical-evidence companions', '#### S3.10');
const SECTION = 'namingTokenLexicalIdentities';
const prefixKey = (prefix) => prefix.join('-');
const english = prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;

const ALL = [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions];
const LEXICAL = EMERGENT_BOUNDARY_CATALOGUE.lexicalCompanions;
const baseOf = (entry) => ALL.find((item) => item.id === entry.lexicalCompanionOf);
const fileSpecsOf = (entry) => entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options));

// The section as Naming's real producer projects it from the builder's N1 and N2 records; `edit` may
// alter it (dropped records, unsupported or invalid envelopes, synthetic readings).
const build = (fileSpecs, { profile = english, edit } = {}) => {
  let section;
  const built = buildCatalogueCase({
    files: fileSpecs,
    ...(profile
      ? {
          bridgeSections: ({ n1, n2Records }) => {
            const projected = projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection: { records: n1 }, folderLabelObservationSection: { records: n2Records }, lexicalProfile: profile });
            section = edit ? edit(projected) : projected;
            return { [SECTION]: section };
          },
        }
      : {}),
  });
  return { built, section };
};
const runtimeOf = (built) =>
  prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
  });
const stepsOf = (member) => member.steps.map(({ folderPath, basis, positions, tokens }) => ({ folderPath, basis, positions, tokens }));
const lineageOf = (entry, semanticName) => entry.lineageExpression?.[semanticName] ?? entry.lineageTokens;

test('reference fidelity: without the section, the reference walk and discovery reproduce today\'s runtime for every catalogue case and companion', () => {
  for (const entry of ALL) {
    const { built } = build(fileSpecsOf(entry), { profile: null });
    const reference = referenceStageThreeExpression({ built, lexicalSection: undefined });
    assert.equal(reference.intake, null, `${entry.id}: an absent section records nothing`);
    assert.equal(reference.expressionUnits, null, `${entry.id}: no units without an available section`);
    assert.deepEqual(reference.units, [], `${entry.id}: no lexical comparison is made`);
    for (const directory of runtimeOf(built).directories) {
      const members = reference.directories.get(directory.path).members;
      const discovered = referenceDiscovery(members);
      assert.deepEqual(discovered.map((candidate) => prefixKey(candidate.prefix)), directory.candidates.map((candidate) => prefixKey(candidate.prefix)), `${entry.id} ${directory.path}: candidates`);
      for (const candidate of directory.candidates) {
        const mirrored = discovered.find((item) => prefixKey(item.prefix) === prefixKey(candidate.prefix));
        assert.deepEqual(mirrored.members, [...new Set(candidate.members.map((member) => member.semanticName))].sort(), `${entry.id} ${prefixKey(candidate.prefix)}: members`);
        assert.deepEqual(mirrored.leadingTokenSequences, candidate.leadingTokens, `${entry.id} ${prefixKey(candidate.prefix)}: leading-token sequences`);
        for (const member of candidate.members) {
          const own = members.find((item) => item.path === member.path);
          assert.deepEqual(stepsOf(own), member.lineageExpression.map(({ folderPath, basis, positions, tokens }) => ({ folderPath, basis, positions, tokens })), `${entry.id} ${member.path}: steps`);
        }
      }
    }
  }
});

test('S3.9 lexical companions: the table names exactly the fixture\'s cases, each extending its case\'s tree unchanged, with its units and the pending marker', () => {
  const rows = [...S3_9_LEXICAL.matchAll(/^\| (E[\d.]+-L) \| (E[\d.]+) \| ([^|]+) \| ([^|]+) \|$/gmu)].map((match) => ({ id: match[1], base: match[2], condition: match[3], expected: match[4] }));
  assert.deepEqual(rows.map((row) => [row.id, row.base]), LEXICAL.map((entry) => [entry.id, entry.lexicalCompanionOf]));
  assert.deepEqual(LEXICAL.map((entry) => entry.id), ['E10-L', 'E10.1-L', 'E11-L']);
  for (const entry of LEXICAL) {
    const row = rows.find((item) => item.id === entry.id);
    const base = baseOf(entry);
    assert.deepEqual(entry.tree, base.tree, `${entry.id}: the tree is ${base.id}'s, unchanged`);
    assert.deepEqual(entry.lexicalProfile, { profileId: 'english' }, `${entry.id}: English v1 is the condition`);
    const { lexical, possible, undetermined } = entry.expressionUnits;
    assert.ok(row.condition.includes(`lexical ${lexical}, possible ${possible}, undetermined ${undetermined}`), `${entry.id}: units in the table`);
    assert.ok(row.expected.includes('**Implementation-pending:**'), `${entry.id}: pending marker`);
    assert.equal(entry.knownGap, undefined, `${entry.id}: no known gap under the condition`);
    for (const candidate of entry.candidates) assert.ok(row.expected.includes(`\`${prefixKey(candidate.prefix)}\``), `${entry.id}: names ${prefixKey(candidate.prefix)}`);
    for (const prefix of Object.keys(entry.implementationPending.runtimeProduces)) {
      assert.ok(base.candidates.some((candidate) => prefixKey(candidate.prefix) === prefix), `${entry.id}: today's result is a candidate of ${base.id}`);
    }
  }
  // The base cases keep their checks: E10 and E10.1 are still known-gap cases without the condition.
  assert.deepEqual(ALL.filter((entry) => entry.knownGap).map((entry) => entry.id), ['E10', 'E10.1']);
});

test('S3.2 lexical-label expression: each lexical companion reaches its declared expression, discovery and units under English v1', () => {
  for (const entry of LEXICAL) {
    const { built, section } = build(fileSpecsOf(entry));
    const reference = referenceStageThreeExpression({ built, lexicalSection: section });
    assert.equal(reference.intake.availability, 'available', `${entry.id}: section available`);
    assert.deepEqual(reference.intake.rejected, [], `${entry.id}: every record accepted`);
    const members = reference.directories.get(entry.directory).members;
    for (const member of members.filter((item) => item.tokens)) {
      assert.deepEqual(member.steps.flatMap((step) => step.tokens), lineageOf(entry, member.semanticName), `${entry.id} ${member.semanticName}: lineage-expressed tokens`);
      assert.deepEqual(member.possible, [], `${entry.id} ${member.semanticName}: no possible expression`);
    }
    for (const expected of entry.lexicalSteps) {
      for (const name of expected.names) {
        const step = members.find((item) => item.semanticName === name).steps.find((item) => item.basis === 'lexical-label');
        assert.ok(step, `${entry.id} ${name}: a lexical-label step`);
        assert.equal(step.folderPath, expected.folder);
        assert.deepEqual(step.positions, { start: expected.position, end: expected.position + expected.labelTokens.length }, `${entry.id} ${name}: positions`);
        assert.deepEqual(step.tokens, expected.tokens);
        assert.deepEqual(step.relations.map(({ labelToken, memberToken, relation, lexemeIds }) => ({ labelToken, memberToken, relation, lexemeIds })), [
          { labelToken: expected.labelTokens[0], memberToken: expected.tokens[0], relation: 'same-lexeme', lexemeIds: expected.lexemeIds },
        ]);
      }
    }
    const discovered = referenceDiscovery(members);
    assert.deepEqual(discovered.map((candidate) => prefixKey(candidate.prefix)), entry.candidates.map((candidate) => prefixKey(candidate.prefix)), `${entry.id}: discovered candidates`);
    for (const expected of entry.candidates) {
      const candidate = discovered.find((item) => prefixKey(item.prefix) === prefixKey(expected.prefix));
      assert.deepEqual(candidate.members, [...expected.members].sort(), `${entry.id} ${prefixKey(expected.prefix)}: members`);
      assert.deepEqual(candidate.leadingTokenSequences, expected.leadingTokenSequences, `${entry.id} ${prefixKey(expected.prefix)}: leading tokens`);
    }
    for (const { prefix } of entry.notDiscoveredUnderCondition) {
      assert.ok(!discovered.some((candidate) => prefixKey(candidate.prefix) === prefix), `${entry.id}: ${prefix} is not discovered under the condition`);
      assert.ok(baseOf(entry).candidates.some((candidate) => prefixKey(candidate.prefix) === prefix), `${entry.id}: ${prefix} is discovered without it`);
    }
    for (const suffix of entry.kindSuffix ?? []) {
      for (const name of suffix.names) {
        const member = members.find((item) => item.semanticName === name);
        assert.equal(member.tokens.at(-1), suffix.token, `${entry.id} ${name}: the lexeme is the final token`);
        assert.ok(!member.steps.some((step) => step.folderPath === suffix.folder), `${entry.id} ${name}: the folder expresses nothing for a kind-suffix member`);
      }
    }
    assert.deepEqual(reference.expressionUnits, entry.expressionUnits, `${entry.id}: S3.7 units`);
  }
});

test('implementation-pending: today\'s runtime reads each lexical companion exactly as its base case, through Stage 1A and Stage 3', () => {
  for (const entry of LEXICAL) {
    const withSection = build(fileSpecsOf(entry)).built;
    const without = build(fileSpecsOf(entry), { profile: null }).built;
    for (const field of ['sectionIntake', 'factEvidence', 'semanticEvidence', 'reasoning']) assert.deepEqual(withSection[field], without[field], `${entry.id}: ${field}`);
    const runtime = runtimeOf(withSection);
    assert.deepEqual(runtime, runtimeOf(without), `${entry.id}: the Stage 3 record`);
    const directory = runtime.directories.find((item) => item.path === entry.directory);
    const recorded = entry.implementationPending.runtimeProduces;
    assert.deepEqual(directory.candidates.map((candidate) => prefixKey(candidate.prefix)).sort(), Object.keys(recorded).sort(), `${entry.id}: today's candidates`);
    for (const candidate of directory.candidates) {
      assert.deepEqual({ outcome: candidate.assessment.outcome, reasons: candidate.assessment.reasons }, recorded[prefixKey(candidate.prefix)], `${entry.id} ${prefixKey(candidate.prefix)}: today's result, exactly as recorded`);
    }
    assert.equal('lexicalIdentity' in runtime, false, `${entry.id}: no lexical block before the implementation`);
  }
});

// Synthetic trees for the relation outcomes. `edit` replaces the readings of one label's token, to reach
// `possibly-same-lexeme`, which English v1 cannot produce (it declares no ambiguous form).
const tokenFile = (dir, tokens) => ({ dir, root: tokens[0], count: 1, tokens, semanticName: tokens.join('-') });
const withAmbiguousLabel = (folderSurface) => (section) => ({
  ...section,
  records: section.records.map((record) =>
    record.tokenSource === 'label-tokens' && record.tokens.some((entry) => entry.surface === folderSurface)
      ? {
          ...record,
          tokens: record.tokens.map((entry) =>
            entry.surface === folderSurface
              ? { surface: folderSurface, status: 'ambiguous', readings: [{ lexemeId: 'english.registry', features: { number: 'plural' }, basis: 'lexicon-entry' }, { lexemeId: 'english.rule', features: { number: 'plural' }, basis: 'lexicon-entry' }] }
              : entry,
          ),
        }
      : record,
  ),
});
const memberAt = (reference, dir, name) => reference.directories.get(dir).members.find((member) => member.semanticName === name);

test('S3.2 relation outcomes: exact precedence, a multi-token label, the order rule, `different-lexemes` decisive, `undetermined` and `possibly-same-lexeme`', () => {
  const tree = [
    tokenFile('kit/naming-rules', ['naming', 'rule', 'parse']),
    tokenFile('kit/naming-rules', ['naming', 'rule', 'check']),
    tokenFile('lib/rule', ['rule', 'loader']),
    tokenFile('lib/rule', ['rule', 'state']),
    tokenFile('pkg/rules', ['alpha', 'beta', 'rule']),
    tokenFile('pkg/rules', ['alpha', 'gamma', 'rule']),
    tokenFile('box/rules-zeta', ['registry', 'omega', 'x']),
    tokenFile('box/rules-zeta', ['registry', 'omega', 'y']),
    tokenFile('naming/cli', ['naming', 'cli', 'args']),
    tokenFile('naming/cli', ['naming', 'cli', 'usage']),
    tokenFile('pad/omega-sigma', ['tau', 'upsilon', 'x']),
    tokenFile('pad/omega-sigma', ['tau', 'upsilon', 'y']),
  ];
  const { built, section } = build(tree);
  const reference = referenceStageThreeExpression({ built, lexicalSection: section });

  // A multi-token label: position 0 is exact and never compared; position 1 is `same-lexeme`.
  const multi = memberAt(reference, 'kit/naming-rules', 'naming-rule-parse');
  const multiStep = multi.steps.find((step) => step.folderPath === 'kit/naming-rules');
  assert.equal(multiStep.basis, 'lexical-label');
  assert.deepEqual(multiStep.positions, { start: 0, end: 2 });
  assert.deepEqual(multiStep.relations.map((relation) => [relation.position, relation.relation]), [[1, 'same-lexeme']], 'only the non-exact position is compared');
  // Exact equality keeps `positional-label` (or Stage 1), and the folder is never compared lexically.
  const exact = memberAt(reference, 'lib/rule', 'rule-loader');
  assert.ok(exact.steps.every((step) => step.basis !== 'lexical-label'));
  assert.ok(!reference.units.some((unit) => unit.member === exact.key && built.pathOfAddress.get(unit.folder.split('\u0000')[2]) === 'lib/rule'), 'no unit for an exact folder');
  // Exact equality at a position the outer lineage reached (`cli` at 1): `positional-label`, no unit.
  const continued = memberAt(reference, 'naming/cli', 'naming-cli-args');
  assert.deepEqual(continued.steps.map((step) => [step.folderPath, step.basis]), [['naming', 'stage-1-root'], ['naming/cli', 'positional-label']]);
  // The order rule: `rules` equals the lexeme of a token away from `p`, so it expresses nothing.
  const away = memberAt(reference, 'pkg/rules', 'alpha-beta-rule');
  assert.deepEqual(away.steps, [], 'nothing is expressed');
  assert.equal(away.length, 0);
  // `different-lexemes` at one position decides, whatever the other says: no unit at all.
  const different = memberAt(reference, 'box/rules-zeta', 'registry-omega-x');
  assert.deepEqual(different.steps, []);
  const unitsOf = (member) => reference.units.filter((unit) => unit.member === member.key).map((unit) => [built.pathOfAddress.get(unit.folder.split('\u0000')[2]), unit.unit]);
  assert.deepEqual(unitsOf(different), [['box', 'undetermined']], '`rules-zeta` (different + undetermined) records nothing; only `box` is undetermined');
  // Every unit is one (member, lineage folder) pair, counted once.
  const pairs = reference.units.map((unit) => `${unit.member}|${unit.folder}`);
  assert.equal(new Set(pairs).size, pairs.length, 'no repeated probe');
  assert.deepEqual(unitsOf(away), [['pkg', 'undetermined'], ['pkg/rules', 'undetermined']], 'aligned at p only; the token at position 2 is never probed');
  assert.deepEqual(unitsOf(continued), [], 'an exact or Stage 1 continuation is never compared lexically');
  // Two non-exact `undetermined` positions in one label are still one unit.
  assert.deepEqual(unitsOf(memberAt(reference, 'pad/omega-sigma', 'tau-upsilon-x')), [['pad', 'undetermined'], ['pad/omega-sigma', 'undetermined']]);

  // `possibly-same-lexeme`: no expression, a possible unit and a note; never a step or a residual change.
  const ambiguous = build(tree, { edit: withAmbiguousLabel('rules') });
  const possibleReference = referenceStageThreeExpression({ built: ambiguous.built, lexicalSection: ambiguous.section });
  const possible = memberAt(possibleReference, 'kit/naming-rules', 'naming-rule-parse');
  assert.ok(possible.steps.every((step) => step.basis !== 'lexical-label'), 'no lexical step');
  assert.equal(possible.length, 1, 'only the Stage 1 root is expressed');
  assert.deepEqual(possible.possible.map((note) => [note.folderPath, note.positions, note.relations.map((relation) => relation.relation)]), [['kit/naming-rules', { start: 0, end: 2 }, ['possibly-same-lexeme']]]);
  assert.equal(possibleReference.expressionUnits.possible, 2, 'one possible unit per member of `kit/naming-rules`');
});

test('dropped records and unavailable sections: structural reasoning is exactly as without lexical evidence; only lexical metadata records why', () => {
  const entry = LEXICAL.find((item) => item.id === 'E10-L');
  const specs = fileSpecsOf(entry);
  const plain = referenceStageThreeExpression({ built: build(specs, { profile: null }).built, lexicalSection: undefined });
  const full = (() => {
    const { built, section } = build(specs);
    return referenceStageThreeExpression({ built, lexicalSection: section });
  })();
  const dropName = 'naming-rule-parse';
  const dropped = (() => {
    const { built, section } = build(specs, {
      edit: (projected) => ({
        ...projected,
        records: projected.records.map((record) =>
          record.tokenSource === 'semantic-tokens' && record.tokens.map((item) => item.surface).join('-') === dropName
            ? { ...record, tokens: record.tokens.map((item, at) => (at === 1 ? { ...item, surface: 'rules' } : item)) }
            : record,
        ),
      }),
    });
    return referenceStageThreeExpression({ built, lexicalSection: section });
  })();
  assert.deepEqual(dropped.intake.rejected.map((item) => item.problems), [['surface-mismatch']], 'the record is dropped with its diagnostic');
  const dirOf = (reference) => reference.directories.get(entry.directory).members;
  for (const member of dirOf(dropped)) {
    const expected = member.semanticName === dropName ? dirOf(plain) : dirOf(full);
    assert.deepEqual(stepsOf(member), stepsOf(expected.find((item) => item.path === member.path)), `${member.semanticName}: as ${member.semanticName === dropName ? 'without' : 'with'} lexical evidence`);
  }
  assert.deepEqual(dropped.expressionUnits, { lexical: 7, possible: 0, undetermined: 25 }, 'only the lexical metadata differs');

  for (const [state, edit] of [
    ['section-unsupported', (projected) => ({ ...projected, contractVersion: 'naming-token-lexical-identity.v2' })],
    ['section-invalid', (projected) => ({ ...projected, lexicalProfile: { ...projected.lexicalProfile, lexiconDigest: '' } })],
  ]) {
    const { built, section } = build(specs, { edit });
    const reference = referenceStageThreeExpression({ built, lexicalSection: section });
    assert.equal(reference.intake.availability, state, state);
    assert.equal(reference.expressionUnits, null, `${state}: no units`);
    for (const member of dirOf(reference)) assert.deepEqual(stepsOf(member), stepsOf(dirOf(plain).find((item) => item.path === member.path)), `${state}: ${member.semanticName} as without the section`);
  }
});

test('reference intake boundaries: absent records nothing, a present non-object is `section-invalid`, and the namespace never comes from accepted records', () => {
  const entry = LEXICAL.find((item) => item.id === 'E10-L');
  const specs = fileSpecsOf(entry);
  const plainBuilt = build(specs, { profile: null }).built;
  const plain = referenceStageThreeExpression({ built: plainBuilt, lexicalSection: undefined });
  const dirOf = (reference) => reference.directories.get(entry.directory).members;
  assert.equal(referenceLexicalIntake(undefined, { sectionIntake: plainBuilt.sectionIntake, namespace: plainBuilt.namespace }), null, 'absent: no intake record');

  // §4.4 rule 3, Tree S1.3: a present value that is not a plain object is a malformed envelope.
  for (const value of [null, [], 'namingTokenLexicalIdentities', 42, true]) {
    const { built, section } = build(specs, { edit: () => value });
    assert.equal(section, value);
    const reference = referenceStageThreeExpression({ built, lexicalSection: section });
    const label = `present ${JSON.stringify(value)}`;
    assert.equal(reference.intake.availability, 'section-invalid', label);
    assert.equal(reference.intake.accepted.size, 0, `${label}: nothing accepted`);
    assert.equal(reference.expressionUnits, null, `${label}: no units`);
    assert.deepEqual(reference.units, [], `${label}: no lexical comparison`);
    for (const member of dirOf(reference)) assert.deepEqual(stepsOf(member), stepsOf(dirOf(plain).find((item) => item.path === member.path)), `${label}: ${member.semanticName} as without the section`);
    // Today's runtime reads such a payload as without the section (implementation-pending).
    assert.deepEqual(runtimeOf(built), runtimeOf(plainBuilt), `${label}: today's Stage 3 record`);
  }

  // A supported section with no accepted N1 or N2 source record: every record is an unmatched record
  // (bridge §4.7), and nothing throws.
  const { built, section } = build(specs);
  const emptySources = {
    ...built.sectionIntake,
    semanticEvidenceEnrichment: { ...built.sectionIntake.semanticEvidenceEnrichment, acceptedRecords: [] },
    folderLabelObservations: { ...built.sectionIntake.folderLabelObservations, acceptedRecords: [] },
  };
  let intake;
  assert.doesNotThrow(() => { intake = referenceLexicalIntake(section, { sectionIntake: emptySources, namespace: built.namespace }); });
  assert.equal(intake.availability, 'available', 'the envelope is valid');
  assert.equal(intake.accepted.size, 0);
  assert.equal(intake.rejected.length, section.records.length);
  assert.deepEqual([...new Set(intake.rejected.flatMap((item) => item.problems))], ['unmatched-record']);
  let reference;
  assert.doesNotThrow(() => { reference = referenceStageThreeExpression({ built: { ...built, sectionIntake: emptySources }, lexicalSection: section }); });
  assert.deepEqual(reference.expressionUnits, { lexical: 0, possible: 0, undetermined: 0 }, 'no member token to compare');
  // The namespace is the one passed in: another snapshot makes every record a namespace mismatch.
  const other = referenceLexicalIntake(section, { sectionIntake: built.sectionIntake, namespace: { ...built.namespace, addressedSnapshotId: 'other-snapshot' } });
  assert.deepEqual([...new Set(other.rejected.flatMap((item) => item.problems))], ['namespace-mismatch']);
  assert.equal(other.accepted.size, 0);
});

test('contract text: the S3.2 relation table and bases, S1.3 and S3.7 omission, the D-T decisions, and the foundation and bridge amendments', () => {
  const tableRows = S3_2.slice(S3_2.indexOf('**Relation outcomes, per folder.**')).split('\n').filter((line) => line.startsWith('| ') && !/^\|\s*-/u.test(line)).slice(1);
  assert.deepEqual(tableRows.map((row) => row.split(' | ')[0].match(/`([a-z-]+)`/u)[1]), LEXICAL_UNIT_OUTCOMES.map(([relation]) => relation));
  for (const [relation, recorded] of LEXICAL_UNIT_OUTCOMES) {
    const row = tableRows.find((line) => line.split(' | ')[0].includes(`\`${relation}\``));
    if (recorded === 'lexical-label') assert.match(row, /\| `lexical-label` \|/u);
    else if (recorded) assert.match(row, new RegExp(`\\*\\*${recorded}\\*\\* unit`, 'u'), relation);
    else assert.match(row, /\| none \| nothing/u, relation);
  }
  assert.match(S3_2, /Stage 1 \(`stage-1-root`, `stage-1-prefix`\), `positional-label`, `lexical-label`/u);
  assert.deepEqual(LINEAGE_BASES, ['stage-1-root', 'stage-1-prefix', 'positional-label', 'lexical-label']);
  assert.match(S3_2, /The unit of accounting is one \(member, lineage folder\) pair/u);
  assert.match(between(TREE, '#### S1.3 Evidence availability', '#### S1.4'), /\*\*Absent: nothing is recorded\.\*\*/u);
  assert.match(between(TREE, '#### S3.7 Output', '#### S3.8'), /Without an `available` section the record is byte-identical/u);
  assert.match(TREE, /\| D-T1 \|[^\n]*\*\*Not decided\.\*\*/u);
  assert.match(TREE, /\| D-T2 \|[^\n]*\*\*Open\.\*\*/u);
  assert.match(TREE, /\| D-T3 \|[^\n]*\*\*Deferred\.\*\*/u);
  assert.match(LF, /### 9\.2 Tree \(Contract, calculogic-validator#153; implementation-pending\)/u);
  assert.match(LF, /\| D5 \| \*\*Resolved\*\* \(calculogic-validator#153\)/u);
  assert.match(LF, /from two importers of the foundation to three/u);
  assert.match(BRIDGE, /\*\*Tree consumption \(Contract, calculogic-validator#153; implementation-pending\):\*\*/u);
});
