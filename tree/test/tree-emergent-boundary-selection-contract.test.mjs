// Contract-text checks for the Stage 3 opportunity-selection evidence contract (Tree spec S3.13.9;
// calculogic-validator#175). The contract adopts no rule: `opportunity-selection` stays unresolved in the
// adopted policy, E22 is not presented as evidence for outer-only, and the policy-expansion regression
// guard and the catalogue evidence required before adoption are stated.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getBuiltinTreeEmergentBoundaryPolicy } from '../src/registries/tree-emergent-boundary-policy-loader.logic.mjs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const TREE = read('doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md');
const NL = read('doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md');
const between = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, start);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? undefined : to);
};
const S3_13_9 = between(TREE, '##### S3.13.9 Opportunity selection', '\n### ');
const S3_13_1 = between(TREE, '##### S3.13.1 Owner decisions', '##### S3.13.2');

test('S3.13.9 adopts no rule: the adopted policy keeps `opportunity-selection` unresolved, and EL5 is unchanged', () => {
  assert.deepEqual(getBuiltinTreeEmergentBoundaryPolicy().policy.decisions['opportunity-selection'], { status: 'unresolved' });
  assert.match(S3_13_9, /This subsection adopts no selection rule and changes no behavior/u);
  assert.match(S3_13_9, /EL5 is unchanged/u);
  assert.match(TREE, /\| EL5 \| No related candidate is also a complete `opportunity` \| `assessment\.selection\.status` is `not-needed` \|/u);
});

test('E22 is characterized as nested opportunities with selection unresolved, never as evidence for outer-only', () => {
  assert.equal(TREE.includes('supported by E22'), false);
  assert.equal(NL.includes('outer-only included'), false);
  assert.match(S3_13_1, /E22 shows nested opportunities with selection unresolved; it does not establish that the outer boundary is better/u);
  assert.match(S3_13_9, /\*\*What it does not establish:\*\* that the outer boundary is better/u);
  // The catalogue's own record of E22 is unchanged: it still decides no selection.
  const e22 = EMERGENT_BOUNDARY_CATALOGUE.cases.find((entry) => entry.id === 'E22');
  assert.ok(e22, 'E22 stays a catalogue case');
  assert.match(TREE, /The first case with nested eligible candidates \(`opportunity-selection`, S3\.8\); it decides no selection/u);
});

test('the candidate strategies are alternatives only, and the remainder threshold is a separate decision', () => {
  for (const strategy of ['Outer-only', 'Inner-only', 'Remainder-based (hypothesis)', 'Unresolved (current)']) assert.ok(S3_13_9.includes(strategy), strategy);
  for (const shape of ['E22 shape', 'Inner-preferred', 'Two subgroups', 'Three-level chain', '`semantic-home`']) assert.ok(S3_13_9.includes(shape), shape);
  assert.match(S3_13_9, /Remainder-based selection is a testable hypothesis, not an adopted principle or a committed direction/u);
  assert.match(S3_13_9, /Its threshold is a separate decision\.\*\* It does not inherit `minimum-primary-units`/u);
});

test('the policy-expansion regression guard requires measurement and owner approval, and a test is not permission', () => {
  const guard = between(S3_13_9, '**Policy-expansion regression guard.**', '**Evidence required');
  assert.deepEqual([...guard.matchAll(/^(\d)\. \*\*([^*]+)\*\*/gmu)].map((match) => match[2]), ['Measure:', 'Preserve, or obtain approval:', 'A test is not permission.']);
  assert.match(guard, /^4\. Until a selection rule is adopted/mu);
  assert.match(NL, /S3\.13\.9 policy-expansion regression guard/u);
});

test('the evidence required before adoption names four structural cases, each separating structure from interpretation', () => {
  const required = between(S3_13_9, '**Evidence required before any selection rule is adopted.**', '- Every case states');
  assert.deepEqual([...required.matchAll(/^\| (SE-\d) /gmu)].map((match) => match[1]), ['SE-1', 'SE-2', 'SE-3', 'SE-4']);
  assert.match(required, /\| Required case \| Structural evidence \(synthetic, recorded fields\) \| Domain interpretation \(stated separately, never inferred\) \|/u);
  assert.match(S3_13_9, /E22 remains a measured case with selection unresolved\. It is not counted as SE-2/u);
  // The S3.9 cases gain none of them: SE-1 to SE-4 live in their own collection (slice S3).
  assert.equal([...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions].some((entry) => /^SE-/u.test(entry.id)), false);
  assert.deepEqual(EMERGENT_BOUNDARY_CATALOGUE.selectionCases.map((entry) => entry.id), ['SE-1', 'SE-2', 'SE-3', 'SE-4']);
});
