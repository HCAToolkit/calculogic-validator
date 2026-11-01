// Naming token lexical-identity section and first-consumer integration: executable contract evidence
// (bridge contract §4.7, §6.4; validator config spec §10; Linguistic Foundation shared contract §8.5,
// §15.4; calculogic-validator#150). Contract only: no producer, consumer or config key is active, and
// these tests prove the contract is expressible and that today's runtime is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CONSUMER_PROBLEMS,
  ENTRY_STATUSES,
  MALFORMED_SELECTIONS,
  SECTION_FIELDS,
  SECTION_NAME,
  SELECTION_CASES,
  buildReferenceSection,
  checkReferenceSection,
} from './fixtures/naming-token-lexical-identity/naming-token-lexical-identity-section.fixture.mjs';
import { buildCatalogueCase, files } from '../tree/test/fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { EMERGENT_BOUNDARY_CATALOGUE } from '../tree/test/fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from '../tree/test/fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { prepareTreeEmergentBoundaryReasoning } from '../tree/src/tree-emergent-boundary-reasoning.logic.mjs';
import { prepareLinguisticFoundation } from '../linguistic-foundation/src/linguistic-foundation.wiring.mjs';
import { selectActiveLanguageProfile } from '../linguistic-foundation/src/linguistic-foundation-profile-selection.logic.mjs';
import { compareLexicalResolutions, resolveSurfaceForm } from '../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';
import { LEXICAL_RESOLUTION_STATUSES } from '../linguistic-foundation/src/linguistic-foundation.knowledge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const BRIDGE = read('doc/ValidatorSpecs/cross-cutting/naming-bridge-occurrence-identity-contract.spec.md');
const CONFIG = read('doc/ValidatorSpecs/validator-config.spec.md');
const sectionOf = (text, heading) => {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, heading);
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n#{2,3} /u);
  return next < 0 ? text.slice(start) : text.slice(start, start + heading.length + next);
};
const rows = (text) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\|\s*-/u.test(line))
    .map((line) => line.slice(2, -2).split(' | ').map((cell) => cell.trim()));
const english = () => prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;

const E10 = EMERGENT_BOUNDARY_CATALOGUE.cases.find((entry) => entry.id === 'E10');
const fileSpecs = E10.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options));
const buildE10 = (withSection) =>
  buildCatalogueCase({
    files: fileSpecs,
    ...(withSection
      ? { bridgeSections: ({ n1, n2Records }) => ({ [SECTION_NAME]: buildReferenceSection({ n1Records: n1, n2Records, profile: english() }) }) }
      : {}),
  });
const stageThreeOf = (built) =>
  prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
  });

test('§4.7, §6.4: the fixture restates the contract tables: fields, entry statuses and consumer problems', () => {
  const fieldRows = rows(sectionOf(BRIDGE, '### 6.4 Naming token lexical-identity fields')).slice(1);
  assert.deepEqual(fieldRows.map((row) => row[0].replace(/`/gu, '')), SECTION_FIELDS);
  // Entry statuses are the foundation's, without `profile-unavailable` (the section is omitted instead).
  assert.deepEqual(ENTRY_STATUSES, Object.values(LEXICAL_RESOLUTION_STATUSES).filter((status) => status !== 'profile-unavailable'));
  assert.match(fieldRows.find((row) => row[0] === '`tokens[].status`')[3], /`resolved`, `ambiguous` or `unknown`/u);
  const consumer = sectionOf(BRIDGE, '### 4.7 Naming token lexical-identity section');
  const meanings = rows(consumer.slice(consumer.indexOf('**Consumer identity rules.**'))).slice(1, 1 + CONSUMER_PROBLEMS.length).map((row) => row[1]);
  assert.deepEqual(meanings, CONSUMER_PROBLEMS.map(([, meaning]) => meaning));
  assert.match(consumer, /\*\*Not emitted\*\*; no producer or consumer exists/u);
});

test('§4.7 expressibility: under english v1 the section carries every E10 token aligned, and relates the `rules` label to the member `rule` token', () => {
  const built = buildCatalogueCase({ files: fileSpecs });
  const acceptedN1 = built.sectionIntake.semanticEvidenceEnrichment.acceptedRecords;
  const acceptedN2 = built.sectionIntake.folderLabelObservations.acceptedRecords;
  const section = buildReferenceSection({ n1Records: acceptedN1, n2Records: acceptedN2, profile: english() });
  // Envelope: §4.4 rule 5 plus `lexicalProfile`.
  assert.deepEqual(Object.keys(section).sort(), ['contractVersion', 'identityTupleFields', 'lexicalProfile', 'producerId', 'recordCount', 'records', 'source']);
  assert.deepEqual(section.lexicalProfile, { profileId: 'english', profileVersion: '1', lexiconDigest: english().lexiconDigest });
  assert.equal(section.recordCount, acceptedN1.filter((record) => record.semanticTokens).length + acceptedN2.filter((record) => record.parseOutcome === 'parsed').length);
  const keys = section.records.map((record) => [record.addressProfileId, record.addressedSnapshotId, record.occurrenceAddress].join('\u0000'));
  assert.deepEqual(keys, [...keys].sort(), 'records sorted by identity tuple');
  assert.deepEqual(checkReferenceSection(section, { namespace: acceptedN1[0], acceptedN1, acceptedN2 }).records.flatMap((record) => record.problems), []);

  const pathOf = (record) => built.pathOfAddress.get(record.occurrenceAddress);
  const label = section.records.find((record) => record.tokenSource === 'label-tokens' && pathOf(record) === 'naming/src/rules');
  assert.deepEqual(label.tokens.map((entry) => [entry.surface, entry.status]), [['rules', 'resolved']]);
  const member = section.records.find((record) => record.tokenSource === 'semantic-tokens' && record.tokens[1]?.surface === 'rule');
  assert.deepEqual(member.tokens.map((entry) => entry.status), ['unknown', 'resolved', 'unknown', 'unknown'], '`unknown` tokens are valid entries');
  const asResolution = (entry) => ({ ...entry, provenance: section.lexicalProfile });
  assert.equal(compareLexicalResolutions(asResolution(label.tokens[0]), asResolution(member.tokens[1])), 'same-lexeme');
});

test('§4.7 producer rules: with no active profile the section is omitted', () => {
  const built = buildCatalogueCase({ files: fileSpecs });
  const input = { n1Records: built.sectionIntake.semanticEvidenceEnrichment.acceptedRecords, n2Records: built.sectionIntake.folderLabelObservations.acceptedRecords };
  assert.equal(buildReferenceSection({ ...input, profile: null }), null);
  assert.equal(buildReferenceSection({ ...input, profile: prepareLinguisticFoundation().profile }), null);
});

test('§4.7 consumer identity rules: each problem is detected on its own', () => {
  const built = buildCatalogueCase({ files: fileSpecs });
  const acceptedN1 = built.sectionIntake.semanticEvidenceEnrichment.acceptedRecords;
  const acceptedN2 = built.sectionIntake.folderLabelObservations.acceptedRecords;
  const namespace = { addressProfileId: acceptedN1[0].addressProfileId, addressedSnapshotId: acceptedN1[0].addressedSnapshotId };
  const section = buildReferenceSection({ n1Records: acceptedN1, n2Records: acceptedN2, profile: english() });
  const index = section.records.findIndex((record) => record.tokenSource === 'semantic-tokens' && record.tokens[1]?.surface === 'rule');
  const target = section.records[index];
  const withRecord = (record, extra = []) => ({ ...section, records: [...section.records.slice(0, index), record, ...section.records.slice(index + 1), ...extra], recordCount: section.records.length + extra.length });
  const editEntry = (position, change) => ({ ...target, tokens: target.tokens.map((entry, at) => (at === position ? change(entry) : entry)) });
  const cases = {
    'invalid-identity': withRecord({ ...target, occurrenceAddress: '' }),
    'duplicate-identity': withRecord(target, [target]),
    'namespace-mismatch': withRecord({ ...target, addressedSnapshotId: 'other' }),
    'unmatched-record': withRecord({ ...target, tokenSource: 'label-tokens' }),
    'token-count-mismatch': withRecord({ ...target, tokens: target.tokens.slice(0, -1) }),
    'surface-mismatch': withRecord(editEntry(1, (entry) => ({ ...entry, surface: 'rules' }))),
    'status-readings-disagree': withRecord(editEntry(0, (entry) => ({ ...entry, status: 'resolved' }))),
    'lexeme-outside-profile': withRecord(editEntry(1, (entry) => ({ ...entry, readings: entry.readings.map((reading) => ({ ...reading, lexemeId: 'other.rule' })) }))),
  };
  assert.deepEqual(Object.keys(cases), CONSUMER_PROBLEMS.map(([code]) => code));
  for (const [problem, variant] of Object.entries(cases)) {
    const result = checkReferenceSection(variant, { namespace, acceptedN1, acceptedN2 });
    assert.deepEqual([...new Set(result.records.flatMap((record) => record.problems))], [problem], problem);
  }
  for (const envelope of [{ ...section, lexicalProfile: undefined }, { ...section, lexicalProfile: { ...section.lexicalProfile, lexiconDigest: '' } }, { ...section, recordCount: 0 }]) {
    assert.equal(checkReferenceSection(envelope, { namespace, acceptedN1, acceptedN2 }).section, 'malformed-section');
  }
});

test('§4.4 rule 2: current Tree reads a payload carrying the section exactly as without it, through Stage 3', () => {
  const [without, withSection] = [buildE10(false), buildE10(true)];
  for (const field of ['sectionIntake', 'factEvidence', 'semanticEvidence', 'reasoning']) {
    assert.deepEqual(withSection[field], without[field], field);
  }
  assert.deepEqual(stageThreeOf(withSection), stageThreeOf(without), 'Stage 3 record');
});

test('config §10.4: the selection table is the fixture, and the foundation classifies each case as the table expects', () => {
  const table = rows(sectionOf(CONFIG, '### 10.4 Validation and selection failures')).slice(1).filter((row) => row.length === 2);
  assert.deepEqual(table.map((row) => row[0]), SELECTION_CASES.map((entry) => entry.situation));
  const registeredProfiles = [english()];
  for (const entry of SELECTION_CASES) {
    const [, behavior] = table.find((row) => row[0] === entry.situation);
    assert.equal(/^Stop/u.test(behavior), entry.outcome === 'stop', `${entry.situation}: outcome`);
    if (entry.problem && entry.problem !== 'malformed') assert.ok(behavior.includes(`\`${entry.problem}\``), `${entry.situation}: names its problem`);
    if (entry.stage !== 'resolution') continue;
    const selection = selectActiveLanguageProfile({ selection: entry.value, registeredProfiles });
    assert.deepEqual(selection.problems, entry.problem ? [entry.problem] : [], entry.situation);
    assert.equal(selection.profile?.profileId ?? null, entry.active, entry.situation);
    if (entry.unknownToken) assert.equal(resolveSurfaceForm(selection.profile, entry.unknownToken).status, 'unknown');
  }
  // Stage 1 shapes never reach profile resolution; the foundation would also refuse them.
  for (const value of MALFORMED_SELECTIONS.filter((item) => item !== null)) {
    assert.deepEqual(selectActiveLanguageProfile({ selection: value, registeredProfiles }).problems, ['selection-malformed'], JSON.stringify(value));
  }
  assert.match(sectionOf(CONFIG, '### 10.4 Validation and selection failures'), /`validate:naming`, `validate:tree` and `validate:all`/u);
});

test('not yet current: the schema has no `linguisticProfile`, and all three CLIs reject it today exactly as an unknown key', () => {
  const schema = JSON.parse(read('src/validator-config.schema.json'));
  assert.equal(JSON.stringify(schema).includes('linguisticProfile'), false);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'linguistic-profile-config-'));
  try {
    const configs = {
      linguistic: { version: '0.1', linguisticProfile: { profileId: 'english' } },
      unknown: { version: '0.1', notAKey: true },
      plain: { version: '0.1' },
    };
    for (const [name, value] of Object.entries(configs)) fs.writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(value));
    const run = (bin, name) => spawnSync(process.execPath, [path.join(ROOT, 'bin', bin), '--scope=system', `--config=${path.join(directory, `${name}.json`)}`], { cwd: ROOT, encoding: 'utf8' });
    for (const bin of ['calculogic-validate-naming.host.mjs', 'calculogic-validate-tree.host.mjs', 'calculogic-validate.host.mjs']) {
      const [linguistic, unknown, plain] = ['linguistic', 'unknown', 'plain'].map((name) => run(bin, name));
      assert.equal(linguistic.status, 1, `${bin}: stops`);
      assert.equal(linguistic.stdout, '', `${bin}: no report`);
      assert.equal(linguistic.status, unknown.status, `${bin}: same as any unknown key`);
      assert.notEqual(plain.status, 1, `${bin}: a config without the key runs`);
      assert.notEqual(plain.stdout, '', `${bin}: and reports`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
