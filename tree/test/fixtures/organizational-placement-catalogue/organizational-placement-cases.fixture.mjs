// The organizational-placement catalogue OP-1 to OP-8 (Tree spec S2.16). Data only. Each case is a real
// temporary repository (`files`), prepared through Naming staging and Tree wiring, with a fixture policy
// shaped as the future `tree/organizational-placement` registry. `expected` lists every relation's
// classification; `reported` the files the contract would report; `reportedToday` what the production
// emitter reports now (empty policy).

export const POLICY_EMPTY = Object.freeze({ registryId: 'tree/organizational-placement', version: '1', entries: [] });
const DOCUMENTATION_CENTRALIZED = { entryId: 'documentation-centralized', select: { roleCategories: ['documentation'] }, arrangement: 'centralized', namespaces: ['doc', 'docs'], definition: 'Documentation is kept in a central documentation tree.' };
const DOCUMENTATION_COLOCATED = { entryId: 'documentation-colocated', select: { roleCategories: ['documentation'] }, arrangement: 'colocated', definition: 'Documentation is kept beside the code it describes.' };
const ENTRY_SCRIPTS_CENTRALIZED = { entryId: 'entry-scripts-centralized', select: { roles: ['host', 'entry', 'cli'] }, arrangement: 'centralized', namespaces: ['bin', 'scripts'], definition: 'Entry points are kept in executable or script trees.' };
const ENTRY_SCRIPTS_COLOCATED = { entryId: 'entry-scripts-colocated', select: { roles: ['host', 'entry', 'cli'] }, arrangement: 'colocated', definition: 'Entry points are kept beside their subject.' };
const policy = (...entries) => Object.freeze({ registryId: 'tree/organizational-placement', version: '1', entries });

export const POLICY_CENTRALIZED = policy(DOCUMENTATION_CENTRALIZED, ENTRY_SCRIPTS_CENTRALIZED);

const HOME = ['render', 'layout', 'state'].map((name) => `src/widget-engine/widget-engine-${name}.logic.mjs`);
const DOC_HOME = ['render', 'layout', 'state'].map((name) => `doc/widget-engine/widget-engine-${name}.spec.md`);
const OVERVIEW = ['doc/specs/widget-engine-overview.spec.md', 'doc/specs/other-topic.spec.md'];

export const ORGANIZATIONAL_PLACEMENT_CASES = Object.freeze([
  {
    id: 'OP-1', scenario: 'centralized-documentation', files: [...HOME, ...OVERVIEW], policy: policy(DOCUMENTATION_CENTRALIZED),
    expected: [{ path: 'doc/specs/widget-engine-overview.spec.md', homePath: 'src/widget-engine', classification: 'consistent', rule: 'organizational-policy' }],
    reported: [], reportedToday: ['doc/specs/widget-engine-overview.spec.md'],
  },
  {
    id: 'OP-2', scenario: 'entry-script', files: [...HOME, 'scripts/widget-engine.host.mjs'], policy: policy(ENTRY_SCRIPTS_CENTRALIZED),
    expected: [{ path: 'scripts/widget-engine.host.mjs', homePath: 'src/widget-engine', classification: 'consistent', rule: 'organizational-policy' }],
    reported: [], reportedToday: ['scripts/widget-engine.host.mjs'],
  },
  {
    id: 'OP-3', scenario: 'within-namespace-scatter', files: [...DOC_HOME, 'doc/guides/widget-engine-usage.spec.md', 'doc/guides/other-topic.spec.md'], policy: policy(DOCUMENTATION_CENTRALIZED),
    expected: [{ path: 'doc/guides/widget-engine-usage.spec.md', homePath: 'doc/widget-engine', classification: 'reportable', rule: 'same-namespace' }],
    reported: ['doc/guides/widget-engine-usage.spec.md'], reportedToday: ['doc/guides/widget-engine-usage.spec.md'],
  },
  {
    id: 'OP-4', scenario: 'colocated-documentation', files: [...HOME, ...OVERVIEW], policy: policy(DOCUMENTATION_COLOCATED),
    expected: [{ path: 'doc/specs/widget-engine-overview.spec.md', homePath: 'src/widget-engine', classification: 'reportable', rule: 'colocated' }],
    reported: ['doc/specs/widget-engine-overview.spec.md'], reportedToday: ['doc/specs/widget-engine-overview.spec.md'],
  },
  {
    id: 'OP-5', scenario: 'no-applicable-entry', files: [...HOME, 'src/misc/widget-engine-helper.logic.mjs', 'src/misc/other-topic.logic.mjs'], policy: policy(DOCUMENTATION_CENTRALIZED),
    expected: [{ path: 'src/misc/widget-engine-helper.logic.mjs', homePath: 'src/widget-engine', classification: 'reportable', rule: 'no-applicable-entry' }],
    reported: ['src/misc/widget-engine-helper.logic.mjs'], reportedToday: ['src/misc/widget-engine-helper.logic.mjs'],
  },
  {
    id: 'OP-6', scenario: 'several-namespaces', files: [...HOME, ...DOC_HOME, ...OVERVIEW], policy: policy(DOCUMENTATION_CENTRALIZED),
    expected: [
      { path: 'doc/specs/widget-engine-overview.spec.md', homePath: 'doc/widget-engine', classification: 'reportable', rule: 'same-namespace' },
      { path: 'doc/specs/widget-engine-overview.spec.md', homePath: 'src/widget-engine', classification: 'consistent', rule: 'organizational-policy' },
    ],
    reported: ['doc/specs/widget-engine-overview.spec.md'], reportedToday: ['doc/specs/widget-engine-overview.spec.md'],
  },
  {
    id: 'OP-7', scenario: 'r2-ownership', validatorDevelopmentRoot: '.',
    files: ['widget/widget-render.logic.mjs', 'widget/widget-layout.logic.mjs', 'widget/widget-state.logic.mjs', 'doc/specs/widget-overview.spec.md', 'doc/specs/other-topic.spec.md'], policy: policy(DOCUMENTATION_CENTRALIZED),
    expected: [{ path: 'doc/specs/widget-overview.spec.md', homePath: 'widget', classification: 'paired', rule: 'r2-ownership' }],
    reported: [], reportedToday: [],
  },
  {
    id: 'OP-8', scenario: 'mixed-arrangement', files: [...HOME, ...OVERVIEW, 'scripts/widget-engine.host.mjs'], policy: policy(DOCUMENTATION_CENTRALIZED, ENTRY_SCRIPTS_COLOCATED),
    expected: [
      { path: 'doc/specs/widget-engine-overview.spec.md', homePath: 'src/widget-engine', classification: 'consistent', rule: 'organizational-policy' },
      { path: 'scripts/widget-engine.host.mjs', homePath: 'src/widget-engine', classification: 'reportable', rule: 'colocated' },
    ],
    reported: ['scripts/widget-engine.host.mjs'], reportedToday: ['doc/specs/widget-engine-overview.spec.md', 'scripts/widget-engine.host.mjs'],
  },
]);
