import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretNamingFolderLabel } from '../src/rules/naming-rule-interpret-folder-label.logic.mjs';
import { prepareNamingRuntimeInputs } from '../src/naming-validator.wiring.mjs';

const { caseRulesRuntime } = prepareNamingRuntimeInputs();
const interpret = (label) => interpretNamingFolderLabel(label, { caseRulesRuntime });

test('folder-label interpretation produces the documented worked examples (interpretation spec §13.7)', () => {
  assert.deepEqual(interpret('bin'), { parseOutcome: 'parsed', labelTokens: ['bin'], labelRoot: 'bin' });
  assert.deepEqual(interpret('registry-lifecycle'), {
    parseOutcome: 'parsed',
    labelTokens: ['registry', 'lifecycle'],
    labelRoot: 'registry',
  });
  assert.deepEqual(interpret('tree-owned'), { parseOutcome: 'parsed', labelTokens: ['tree', 'owned'], labelRoot: 'tree' });
  for (const label of ['Audits', 'ConventionRoutines', 'Indexes', 'ValidatorSpecs']) {
    assert.deepEqual(interpret(label), { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] }, label);
  }
  assert.deepEqual(interpret('_builtin'), { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-unsupported-character'] });
  assert.deepEqual(interpret('tree-and-naming'), {
    parseOutcome: 'parsed',
    labelTokens: ['tree', 'and', 'naming'],
    labelRoot: 'tree',
    labelFacts: ['contains-connector-token'],
  });
  assert.deepEqual(interpret('-draft'), { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-malformed-separator'] });
});

test('a label with four or more tokens yields no family, subgroup, or ambiguity output', () => {
  assert.deepEqual(interpret('legacy-in-package-custom-set'), {
    parseOutcome: 'parsed',
    labelTokens: ['legacy', 'in', 'package', 'custom', 'set'],
    labelRoot: 'legacy',
  });
});

test('not-parsed reasons: every reason is covered, all applicable reasons are reported sorted, and nothing else is kept', () => {
  assert.deepEqual(interpret(''), { parseOutcome: 'not-parsed', notParsedReasons: ['label-empty'] });
  assert.deepEqual(interpret(undefined), { parseOutcome: 'not-parsed', notParsedReasons: ['label-empty'] });
  assert.deepEqual(interpret('a--b'), { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-malformed-separator'] });
  assert.deepEqual(interpret('draft-'), { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-malformed-separator'] });
  assert.deepEqual(interpret('Bad_Name'), {
    parseOutcome: 'not-parsed',
    notParsedReasons: ['label-has-unsupported-character', 'label-has-uppercase'],
  });
  assert.deepEqual(interpret('-Bad.Name-'), {
    parseOutcome: 'not-parsed',
    notParsedReasons: ['label-has-malformed-separator', 'label-has-unsupported-character', 'label-has-uppercase'],
  });
  // A not-parsed result never retains a partial interpretation.
  for (const label of ['Audits', '_builtin', 'Bad_Name', '-draft', '']) {
    assert.deepEqual(Object.keys(interpret(label)).sort(), ['notParsedReasons', 'parseOutcome'], label);
  }
});

test('the connector fact applies only after the first token', () => {
  assert.deepEqual(interpret('and-more').labelFacts, undefined);
  assert.deepEqual(interpret('cats-or-dogs').labelFacts, ['contains-connector-token']);
  assert.deepEqual(interpret('build-with-care').labelFacts, ['contains-connector-token']);
});

test('interpretation depends only on the label and returns a fresh result each time', () => {
  const first = interpret('registry-lifecycle');
  first.labelTokens.push('mutated');
  assert.deepEqual(interpret('registry-lifecycle').labelTokens, ['registry', 'lifecycle']);
});

test('interpretation uses the supplied case-rules runtime and fails closed instead of emitting a reasonless not-parsed record', () => {
  // A hand-built runtime whose pattern is stricter than its declared style. The supported registry
  // path cannot produce this (only `kebab-case` exists and always maps to one pattern); the
  // interpreter must still never emit `notParsedReasons: []`.
  const stricterRuntime = { semanticName: { style: 'kebab-case', pattern: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/ } };
  assert.equal(interpretNamingFolderLabel('folder-123', { caseRulesRuntime: stricterRuntime }).parseOutcome, 'parsed');
  assert.throws(
    () => interpretNamingFolderLabel('123-folder', { caseRulesRuntime: stricterRuntime }),
    /not-parsed reason vocabulary cannot describe/,
  );
  // With the prepared runtime the same label parses.
  assert.equal(interpret('123-folder').parseOutcome, 'parsed');

  assert.throws(
    () => interpretNamingFolderLabel('bin', { caseRulesRuntime: { semanticName: { style: 'camelCase', pattern: /./ } } }),
    /supported semantic-name style/,
  );
  assert.throws(() => interpretNamingFolderLabel('bin', {}), /supported semantic-name style/);
});
