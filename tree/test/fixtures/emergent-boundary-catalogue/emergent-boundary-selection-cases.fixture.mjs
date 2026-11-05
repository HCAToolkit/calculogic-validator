// The Stage 3 selection evidence cases SE-1 to SE-4 (Tree spec S3.13.9; calculogic-validator#175, slice
// S3). Data only, and never a reasoning or selection result. Each case is a synthetic tree whose focus
// directory holds nested complete opportunities, so `opportunity-selection` is needed and unresolved.
//
// A case keeps two kinds of statement apart:
// - `candidates` and `structure` are **structural evidence**: what Stage 3 records for the tree (checked
//   against the runtime in `tree-emergent-boundary-selection-cases.test.mjs`).
// - `interpretation` is **domain interpretation**: a reading of the file names that the record does not
//   carry. It is never checked against reasoning and never justifies a rule by itself. `preferred` is
//   `null` where no reading prefers one boundary.
// `strategies` records what each hypothetical strategy (S3.13.9) would select, for comparison only: none
// is adopted, and the test computes them with a test-only reference, never the runtime.
// `evidenceDetermines` is whether recorded fields alone determine a preferred boundary.
//
// File `i` of the expanded list is `<dir>/<root>-<i>.logic.mjs` (`buildCatalogueCase`); every member is
// `concern-core`, so primary.

const file = (dir, tokens) => ({ dir, root: tokens[0], count: 1, tokens, semanticName: tokens.join('-') });
const group = (dir, prefix, rests) => rests.map((rest) => file(dir, [...prefix, ...rest.split('-')]));
const names = (files) => files.map((entry) => entry.semanticName);

// Four unrelated siblings, so no grouping covers the whole directory (S3.5).
const SIBLINGS = ['schema-parse', 'clock-tick', 'path-join', 'event-emit'].map((name) => file('lib', name.split('-')));
const OPPORTUNITY = { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] };
const REDUNDANT = { outcome: 'not-an-opportunity', reasons: ['redundant-with'] };

const SE_1 = (() => {
  const index = group('lib', ['cache', 'store', 'index'], ['build', 'query', 'merge']);
  const rest = group('lib', ['cache', 'store'], ['config', 'errors']);
  return {
    id: 'SE-1',
    scenario: 'inner-preferred',
    source: 'synthetic',
    tree: { files: [...index, ...rest, ...SIBLINGS] },
    directory: 'lib',
    lineageTokens: [],
    candidates: [
      { prefix: ['cache'], members: names([...index, ...rest]), expected: REDUNDANT, relations: [{ to: 'cache-store', relation: 'redundant' }] },
      { prefix: ['cache', 'store'], members: names([...index, ...rest]), expected: OPPORTUNITY, relations: [{ to: 'cache-store-index', relation: 'nested-subgroup' }], relatedOpportunities: ['cache-store-index'] },
      { prefix: ['cache', 'store', 'index'], members: names(index), expected: OPPORTUNITY, relations: [{ to: 'cache-store', relation: 'nested-subgroup' }], relatedOpportunities: ['cache-store'] },
    ],
    structure: { outer: 'cache-store', nested: ['cache-store-index'], levels: 2, primaryUnits: { 'cache-store': 5, 'cache-store-index': 3 }, remainderUnits: 2 },
    interpretation: {
      preferred: ['cache-store-index'],
      statement: 'The index units are one responsibility (building, querying and merging an index). `config` and `errors` read as store-wide helpers that do not by themselves call for a `cache-store/` folder.',
    },
    strategies: { outerOnly: ['cache-store'], innerOnly: ['cache-store-index'], remainderBased: { selectsOuterWhenThresholdAtMost: 2 } },
    evidenceDetermines: false,
  };
})();

const SE_2 = (() => {
  const html = group('lib', ['report', 'render', 'html'], ['page', 'table', 'chart']);
  const rest = group('lib', ['report', 'render'], ['csv', 'json', 'markdown', 'text', 'xml']);
  return {
    id: 'SE-2',
    scenario: 'outer-preferred',
    source: 'synthetic',
    tree: { files: [...html, ...rest, ...SIBLINGS] },
    directory: 'lib',
    lineageTokens: [],
    candidates: [
      { prefix: ['report'], members: names([...html, ...rest]), expected: REDUNDANT, relations: [{ to: 'report-render', relation: 'redundant' }] },
      { prefix: ['report', 'render'], members: names([...html, ...rest]), expected: OPPORTUNITY, relations: [{ to: 'report-render-html', relation: 'nested-subgroup' }], relatedOpportunities: ['report-render-html'] },
      { prefix: ['report', 'render', 'html'], members: names(html), expected: OPPORTUNITY, relations: [{ to: 'report-render', relation: 'nested-subgroup' }], relatedOpportunities: ['report-render'] },
    ],
    structure: { outer: 'report-render', nested: ['report-render-html'], levels: 2, primaryUnits: { 'report-render': 8, 'report-render-html': 3 }, remainderUnits: 5 },
    interpretation: {
      preferred: ['report-render'],
      statement: 'Every unit renders a report in one format; HTML happens to need three. One `report-render/` boundary keeps the renderers together, with HTML as a sub-concern.',
    },
    strategies: { outerOnly: ['report-render'], innerOnly: ['report-render-html'], remainderBased: { selectsOuterWhenThresholdAtMost: 5 } },
    evidenceDetermines: false,
  };
})();

const SE_3 = (() => {
  const parse = group('lib', ['pipeline', 'stage', 'parse'], ['lexer', 'grammar', 'tree']);
  const emit = group('lib', ['pipeline', 'stage', 'emit'], ['writer', 'format', 'buffer']);
  return {
    id: 'SE-3',
    scenario: 'two-coherent-subgroups',
    source: 'synthetic',
    tree: { files: [...parse, ...emit, ...SIBLINGS] },
    directory: 'lib',
    lineageTokens: [],
    candidates: [
      { prefix: ['pipeline'], members: names([...parse, ...emit]), expected: REDUNDANT, relations: [{ to: 'pipeline-stage', relation: 'redundant' }] },
      {
        prefix: ['pipeline', 'stage'],
        members: names([...parse, ...emit]),
        expected: OPPORTUNITY,
        relations: [{ to: 'pipeline-stage-parse', relation: 'nested-subgroup' }, { to: 'pipeline-stage-emit', relation: 'nested-subgroup' }],
        relatedOpportunities: ['pipeline-stage-emit', 'pipeline-stage-parse'],
      },
      { prefix: ['pipeline', 'stage', 'parse'], members: names(parse), expected: OPPORTUNITY, relations: [{ to: 'pipeline-stage', relation: 'nested-subgroup' }, { to: 'pipeline-stage-emit', relation: 'disjoint' }], relatedOpportunities: ['pipeline-stage'] },
      { prefix: ['pipeline', 'stage', 'emit'], members: names(emit), expected: OPPORTUNITY, relations: [{ to: 'pipeline-stage', relation: 'nested-subgroup' }], relatedOpportunities: ['pipeline-stage'] },
    ],
    structure: { outer: 'pipeline-stage', nested: ['pipeline-stage-emit', 'pipeline-stage-parse'], levels: 2, primaryUnits: { 'pipeline-stage': 6, 'pipeline-stage-emit': 3, 'pipeline-stage-parse': 3 }, remainderUnits: 0 },
    interpretation: {
      preferred: null,
      statement: 'Both readings are reasonable: one `pipeline-stage/` folder holding `parse/` and `emit/`, or two sibling folders. Nothing in the names prefers one.',
    },
    strategies: { outerOnly: ['pipeline-stage'], innerOnly: ['pipeline-stage-emit', 'pipeline-stage-parse'], remainderBased: { selectsOuterWhenThresholdAtMost: 0 } },
    evidenceDetermines: false,
  };
})();

const SE_4 = (() => {
  const engine = group('lib', ['sync', 'engine'], ['clock', 'queue', 'retry']);
  const journal = group('lib', ['sync', 'engine', 'journal'], ['append', 'compact', 'replay']);
  const segment = group('lib', ['sync', 'engine', 'journal', 'segment'], ['open', 'seal', 'index']);
  return {
    id: 'SE-4',
    scenario: 'three-level-chain',
    source: 'synthetic',
    tree: { files: [...engine, ...journal, ...segment, ...SIBLINGS] },
    directory: 'lib',
    lineageTokens: [],
    candidates: [
      { prefix: ['sync'], members: names([...engine, ...journal, ...segment]), expected: REDUNDANT, relations: [{ to: 'sync-engine', relation: 'redundant' }] },
      {
        prefix: ['sync', 'engine'],
        members: names([...engine, ...journal, ...segment]),
        expected: OPPORTUNITY,
        relations: [{ to: 'sync-engine-journal', relation: 'nested-subgroup' }, { to: 'sync-engine-journal-segment', relation: 'nested-subgroup' }],
        relatedOpportunities: ['sync-engine-journal', 'sync-engine-journal-segment'],
      },
      {
        prefix: ['sync', 'engine', 'journal'],
        members: names([...journal, ...segment]),
        expected: OPPORTUNITY,
        relations: [{ to: 'sync-engine', relation: 'nested-subgroup' }, { to: 'sync-engine-journal-segment', relation: 'nested-subgroup' }],
        relatedOpportunities: ['sync-engine', 'sync-engine-journal-segment'],
      },
      {
        prefix: ['sync', 'engine', 'journal', 'segment'],
        members: names(segment),
        expected: OPPORTUNITY,
        relations: [{ to: 'sync-engine', relation: 'nested-subgroup' }, { to: 'sync-engine-journal', relation: 'nested-subgroup' }],
        relatedOpportunities: ['sync-engine', 'sync-engine-journal'],
      },
    ],
    structure: {
      outer: 'sync-engine',
      nested: ['sync-engine-journal', 'sync-engine-journal-segment'],
      levels: 3,
      primaryUnits: { 'sync-engine': 9, 'sync-engine-journal': 6, 'sync-engine-journal-segment': 3 },
      // Per nesting step: the outer's units outside the next level down.
      remainderUnitsByLevel: { 'sync-engine': 3, 'sync-engine-journal': 3 },
    },
    interpretation: {
      preferred: null,
      statement: 'A nested `sync-engine/journal/segment/` layout, a single level, or two levels are all defensible; which levels deserve folders is a design choice the names do not settle.',
    },
    strategies: {
      outerOnly: ['sync-engine'],
      innerOnly: ['sync-engine-journal-segment'],
      remainderBased: { defined: false, reason: 'a chain needs a recursive definition: whether selection recurses, and whether a selected outer boundary also reports its subgroups (S3.13.9)' },
    },
    evidenceDetermines: false,
  };
})();

export const EMERGENT_BOUNDARY_SELECTION_CASES = Object.freeze([SE_1, SE_2, SE_3, SE_4]);
