// Linguistic Foundation shared contract, executable evidence (doc/ValidatorSpecs/
// linguistic-foundation-shared-contract.spec.md; calculogic-validator#146). Test-only: the contract's
// vocabularies and worked examples are read from the spec and checked against the fixture data and the
// test-only reference model, so the document and the evidence change together. No runtime module exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRIDGE_EXAMPLES,
  FOUNDATION,
  INVALID_BRIDGE_RECORDS,
  INVALID_PROFILES,
  MEASURED_NUMBER_PAIRS,
  MEASURED_STRIP_TRAPS,
  NUMBERLESS_PROFILE,
  SAMPLE_PROFILE,
} from './fixtures/linguistic-foundation/linguistic-foundation-contract-cases.fixture.mjs';
import { bridgeRecordOf, checkBridgeRecord, compare, resolve, validateProfile } from './fixtures/linguistic-foundation/linguistic-foundation-reference-model.fixture.mjs';
import { EMERGENT_BOUNDARY_CATALOGUE } from '../tree/test/fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = fs.readFileSync(path.join(ROOT, 'doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md'), 'utf8');
const section = (heading) => {
  const start = SPEC.indexOf(heading);
  assert.ok(start >= 0, `spec section ${heading}`);
  const next = SPEC.slice(start + heading.length).search(/\n#{2,3} /u);
  return next < 0 ? SPEC.slice(start) : SPEC.slice(start, start + heading.length + next);
};
const tableRows = (text) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\|\s*-/u.test(line))
    .slice(1)
    .map((line) => line.slice(2, -2).split(' | ').map((cell) => cell.trim()));
const codes = (cell) => [...cell.matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
const r = (surface, profile = SAMPLE_PROFILE) => resolve(profile, surface);

test('vocabularies: the fixture foundation vocabularies are exactly the contract tables', () => {
  assert.deepEqual(tableRows(section('### 6.1 Statuses')).map((row) => codes(row[0])[0]), FOUNDATION.resolutionStatuses);
  assert.deepEqual(tableRows(section('### 6.2 Lexeme-comparison relation')).map((row) => codes(row[0])[0]), FOUNDATION.comparisonRelations);
  assert.match(section('## 7. Provenance'), /The only basis is `lexicon-entry`/u);
  assert.deepEqual(FOUNDATION.readingBases, ['lexicon-entry']);
  const support = tableRows(section('### 5.1 What every language profile declares')).find((row) => row[0] === '`featureSupport`');
  assert.deepEqual(codes(support[1]).slice(-3), FOUNDATION.supportStatuses);
  assert.match(section('### 4.1 Terms'), /The first and only promoted space is `number`, with values `singular` and `plural`\./u);
  assert.deepEqual(FOUNDATION.featureSpaces, { number: ['singular', 'plural'] });
});

test('§3.1, §5.1: the foundation holds no lexeme, form or entry; every lexeme is profile-scoped', () => {
  assert.deepEqual(Object.keys(FOUNDATION).sort(), ['comparisonRelations', 'featureSpaces', 'readingBases', 'resolutionStatuses', 'supportStatuses']);
  for (const profile of [SAMPLE_PROFILE, NUMBERLESS_PROFILE]) {
    assert.deepEqual(validateProfile(profile), [], `${profile.profileId}: valid`);
    for (const entry of profile.entries) assert.ok(entry.lexemeId.startsWith(`${profile.profileId}.`), entry.lexemeId);
  }
});

test('§4.2, §5.1: each profile rule is enforced on its own', () => {
  for (const { problem, change } of INVALID_PROFILES) assert.deepEqual(validateProfile(change(SAMPLE_PROFILE)), [problem], problem);
});

test('§6.3: every worked resolution is reproduced, and the spec and fixture list the same forms', () => {
  const rows = tableRows(section('### 6.3 Worked examples')).filter((row) => row.length === 4);
  assert.ok(rows.length >= 10);
  for (const [surfaceCell, statusCell, readingsCell] of rows) {
    const [surface] = codes(surfaceCell);
    const expected = [...readingsCell.matchAll(/`([^`]+)` \(([^)]+)\)/gu)].map(([, lexemeId, number]) => ({ lexemeId, features: number === '—' ? {} : { number } }));
    const resolution = r(surface);
    assert.equal(resolution.status, codes(statusCell)[0], `${surface}: status`);
    assert.deepEqual(resolution.readings.map(({ lexemeId, features }) => ({ lexemeId, features })), expected, `${surface}: readings, in contract order`);
  }
});

test('§6.3: every worked comparison is reproduced, and the relation is symmetric', () => {
  const rows = tableRows(section('### 6.3 Worked examples')).filter((row) => row.length === 3 && row[0] !== 'Left');
  assert.ok(rows.length >= 8);
  for (const [left, right, relation] of rows) {
    const [l, rr, expected] = [codes(left)[0], codes(right)[0], codes(relation)[0]];
    assert.equal(compare(r(l), r(rr)), expected, `${l} / ${rr}`);
    assert.equal(compare(r(rr), r(l)), expected, `${rr} / ${l}: symmetric`);
  }
});

test('§4.3 R1, §10: no reading is derived; every measured strip trap keeps its own reading or stays unknown', () => {
  for (const surface of MEASURED_STRIP_TRAPS) {
    assert.ok(section('## 10. Measured evidence').includes(`\`${surface}\``), `${surface}: listed in §10`);
    const stripped = surface.slice(0, -1);
    assert.equal(r(stripped).status, 'unknown', `${stripped}: never minted`);
    for (const reading of r(surface).readings) assert.notEqual(reading.features.number, 'plural', `${surface}: not a plural`);
  }
  // Any form the profile does not declare is unknown, whatever its shape.
  const declared = new Set(SAMPLE_PROFILE.entries.flatMap((entry) => entry.forms.map((form) => form.surface)));
  for (const surface of ['rulez', 'Rules', 'rules ', 'rule-s', 'registrys', 'policys', 'statu', 'cros']) {
    assert.equal(declared.has(surface), false);
    assert.equal(r(surface).status, 'unknown', `${surface}: unknown, not derived (R1, R2)`);
  }
});

test('§10: the measured number pairs are the contract list, and each relates its forms', () => {
  const listed = section('## 10. Measured evidence').match(/\*\*Forms where a singular token also occurs\*\* \((\d+)\): (.*)/u);
  const specPairs = [...listed[2].matchAll(/`([^`]+)`\/`([^`]+)`/gu)].map(([, plural, singular]) => [plural, singular]);
  assert.equal(Number(listed[1]), specPairs.length);
  assert.deepEqual(specPairs, MEASURED_NUMBER_PAIRS.map((entry) => [...entry]));
  for (const [plural, singular] of MEASURED_NUMBER_PAIRS) {
    const relation = compare(r(plural), r(singular));
    assert.ok(['same-lexeme', 'possibly-same-lexeme'].includes(relation), `${plural}/${singular}: ${relation}`);
  }
});

test('§4.3 R3, R4, §7: resolution is deterministic, order-independent and carries its provenance', () => {
  const reversed = { ...SAMPLE_PROFILE, entries: [...SAMPLE_PROFILE.entries].reverse().map((entry) => ({ ...entry, forms: [...entry.forms].reverse() })) };
  const surfaces = [...new Set(SAMPLE_PROFILE.entries.flatMap((entry) => entry.forms.map((form) => form.surface)))];
  for (const surface of surfaces) {
    const resolution = r(surface);
    assert.deepEqual(r(surface, reversed), resolution, `${surface}: entry order changes nothing`);
    assert.deepEqual(resolution.provenance, { profileId: 'english-sample', profileVersion: '0', lexiconDigest: resolution.provenance.lexiconDigest });
    assert.match(resolution.provenance.lexiconDigest, /^[0-9a-f]{64}$/u);
    for (const reading of resolution.readings) assert.equal(reading.basis, 'lexicon-entry');
  }
});

test('§4.3 R5, §6.1: feature ambiguity is not lexical ambiguity; a numberless profile carries no number', () => {
  const series = r('series');
  assert.equal(series.status, 'resolved');
  assert.deepEqual(series.readings.map((item) => item.features.number), ['plural', 'singular']);
  assert.equal(compare(series, r('series')), 'same-lexeme');
  const rule = r('rule', NUMBERLESS_PROFILE);
  assert.deepEqual(rule.readings.map((item) => item.features), [{}]);
  assert.equal(compare(rule, r('rule')), 'undetermined', 'different profiles are not compared');
});

test('§5.3, §6.1: without an active profile every resolution is profile-unavailable, with no provenance', () => {
  const resolution = resolve(null, 'rule');
  assert.deepEqual(resolution, { surface: 'rule', status: 'profile-unavailable', readings: [] });
  assert.equal(compare(resolution, r('rule')), 'undetermined');
});

test('§9.2 sufficiency: the contract relates the E10 and E11 folder labels to their members, which literal equality cannot', () => {
  const cases = Object.fromEntries(EMERGENT_BOUNDARY_CATALOGUE.cases.map((entry) => [entry.id, entry]));
  for (const id of ['E10', 'E11']) {
    const entry = cases[id];
    const label = entry.directory.split('/').at(-1);
    const [candidate] = entry.candidates;
    const memberToken = candidate.prefix[0];
    assert.notEqual(label, memberToken, `${id}: not literally equal, so S3.2 positional-label cannot relate them`);
    assert.equal(compare(r(label), r(memberToken)), 'same-lexeme', `${id}: ${label} / ${memberToken}`);
  }
  // The catalogue is unchanged by this contract: both stay as recorded until Tree's consumption slice.
  assert.ok(cases.E10.knownGap, 'E10 is still a known-gap case');
});

test('§8.2, §8.3 (Proposed): the bridge record is expressible, and each consumer check is enforced on its own', () => {
  for (const { tokenSource, sourceTokens, record } of BRIDGE_EXAMPLES) {
    assert.deepEqual(bridgeRecordOf(SAMPLE_PROFILE, tokenSource, sourceTokens), record, `${tokenSource}: reproduced`);
    assert.deepEqual(checkBridgeRecord(SAMPLE_PROFILE, record, sourceTokens), [], `${tokenSource}: accepted`);
  }
  const [{ record, sourceTokens }] = BRIDGE_EXAMPLES;
  for (const { problem, change } of INVALID_BRIDGE_RECORDS) assert.deepEqual(checkBridgeRecord(SAMPLE_PROFILE, change(record), sourceTokens), [problem], problem);
});
