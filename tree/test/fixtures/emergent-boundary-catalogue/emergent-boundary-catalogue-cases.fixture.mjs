// The Stage 3 evidence catalogue (Tree spec S3.9) as one declarative table (calculogic-validator#130).
// Data only, and never a reasoning result: `expected` is what correct reasoning concludes. The table's
// integrity and each case's Stage 1 and Stage 2 `preconditions` are checked in
// `tree-emergent-boundary-catalogue.test.mjs`; the Stage 3 reasoning (S3.11 step 4) is checked against
// `expected` in `tree-emergent-boundary-reasoning.logic.test.mjs`.
//
// `source: 'measured'` cases reproduce, as fixed synthetic trees, the evidence measured on this
// repository at 667a151 (S3.9); they do not change as the repository grows. `synthetic` cases are
// contrast trees.
//
// A case:
// - `tree`: files for `buildCatalogueCase`. Each file is `{ dir, root, count, tokens?, semanticName?,
//   role?, roleCategory?, noObservation?, ambiguous? }`; file `i` of the expanded list is
//   `<dir>/<root>-<i>.logic.mjs`. Folder labels are the basename's hyphen tokens.
// - `directoryMembers`: where S3.9 states it, the focus directory's member occurrences (S3.2; checked).
// - `directory`, `lineageTokens`: the focus directory and the leading N1 tokens its lineage expresses
//   (checked as a precondition, never derived here).
// - `candidates`: the focus directory's candidates (S3.3). `prefix` is the shared residual prefix;
//   `members` are semantic names; `memberSets` appear where S3.5's partition matters; `expected` is the
//   S3.6 outcome; `relations` name another candidate of the same case by its prefix.
// - `notDiscovered`: relationships V0 discovery cannot form (S3.10).
// - `knownGap`: only on a known discrepancy (S3.9): the expected outcome, what the specified rules would
//   produce, and the cause.
// - `policyIncomplete`: only on a policy-incomplete case (S3.9): the candidates whose assessment the
//   experimental policy cannot complete, the unresolved decisions (S3.8), and the cause. Optionally
//   `outcomesAtTestedValues` (calculogic-validator#162): per unresolved decision, one entry per value of
//   `EXPERIMENTAL_TEST_VALUES` (exactly those values), each giving every listed candidate's outcome with
//   only that decision resolved to that value. A record of the experimental variants, never an adopted
//   value or an expected outcome: `expected` stays what correct reasoning concludes.
// - Without `memberSets`, every member is supported, except where `existing-structure` or `redundancy`
//   decides the candidate first (E2), so the partition cannot matter (S3.6).
// - `preconditions`: Stage 2 candidate outcomes, Stage 2 placements of named files, and Stage 1 root
//   comparisons of named files against a folder's label candidate. Names select files in the focus
//   directory only (a semantic name can recur elsewhere, as E2's spec and logic file do).

const spec = { role: 'spec', roleCategory: 'documentation' };
const fixture = { role: 'fixture', roleCategory: 'quality-support' };
const test = { role: 'test', roleCategory: 'quality-support' };

// One file named by its N1 tokens: `familyRoot` is the first token, `semanticName` the joined tokens.
const file = (dir, tokens, options = {}) => ({ dir, root: tokens[0], count: 1, tokens, semanticName: tokens.join('-'), ...options });
const unobserved = (dir, count) => ({ dir, root: 'unobserved', count, noObservation: true });
const others = (dir, root, count) => ({ dir, root, count, tokens: [root, 'item'] });
const names = (files) => files.map((entry) => entry.semanticName);

// E1, E13: tree/src with eight semantic-home units among 28 direct members (S3.9): one more `semantic`
// unit and nineteen unrelated units.
const E1_SEMANTIC_HOME = ['attribution', 'conformance', 'eligibility', 'parameter-set', 'placement', 'reasoning', 'reasoning-report', 'strength-profile'].map(
  (rest) => file('tree/src', ['tree', 'semantic', 'home', ...rest.split('-')]),
);
const E1_FILES = [
  ...E1_SEMANTIC_HOME,
  file('tree/src', ['tree', 'semantic', 'naming', 'folder', 'type', 'relationship']),
  // Nineteen units whose residuals share no leading token, so they form no candidate; E1 has 28 members.
  ...[
    'shim-detection',
    'occurrence-classification',
    'repo-shape-evidence',
    'structure-advisor',
    'addressed-occurrence-snapshot',
    'contextual-repo-shape-policy',
    'family-root-folder-evidence',
    'naming-occurrence-intake',
    'structural-context-assessment',
    'validator-development-root',
    'folder-candidates',
    'kind-evidence',
    'fact-evidence',
    'section-intake',
    'signal-policy',
    'surface-perspective',
    'owned-signals',
    'role-tokens',
    'home-attribution',
  ].map((rest) => file('tree/src', ['tree', ...rest.split('-')])),
];
const E1_CANDIDATES = [
  {
    prefix: ['semantic', 'home'],
    members: names(E1_SEMANTIC_HOME),
    expected: { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] },
    relations: [{ to: 'semantic', relation: 'nested-subgroup' }],
  },
  {
    prefix: ['semantic'],
    members: [...names(E1_SEMANTIC_HOME), 'tree-semantic-naming-folder-type-relationship'],
    expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] },
  },
  {
    prefix: ['semantic', 'home', 'reasoning'],
    members: ['tree-semantic-home-reasoning', 'tree-semantic-home-reasoning-report'],
    expected: { outcome: 'insufficient-evidence', reasons: ['below-minimum-units'] },
    relations: [{ to: 'semantic-home', relation: 'nested-subgroup' }],
  },
];
const E1_PRECONDITIONS = {
  candidates: [
    { folder: 'tree', outcome: 'eligible', reason: 'supported' },
    { folder: 'tree/src', outcome: 'not-eligible', reason: 'contradicted' },
  ],
  placements: [{ names: names(E1_SEMANTIC_HOME), state: 'inside-home', nearest: 'tree' }],
  rootComparisons: [{ names: names(E1_FILES), folder: 'tree', result: 'match' }],
};

// E14, E15: a five-member `semantic-home` group in `lib`; the fifth member also matches a different,
// longer claim (`semantic-home-strength`) whose folder is eligible (E14) or undetermined (E15).
const GROUP_OF_FOUR = ['alpha', 'beta', 'gamma', 'delta'].map((rest) => file('lib', ['semantic', 'home', rest]));
const FIFTH_MEMBER = file('lib', ['semantic', 'home', 'strength', 'profile']);
const STRENGTH_FOLDER_SUPPORT = ['score', 'weight', 'bound', 'facet'].map((rest) => file('semantic-home-strength', ['semantic', 'home', 'strength', rest]));
const partialEvidenceCase = ({ id, strengthFolder, fifthPlacement, memberSets }) => ({
  id,
  source: 'synthetic',
  tree: { files: [...GROUP_OF_FOUR, FIFTH_MEMBER, ...strengthFolder] },
  directory: 'lib',
  lineageTokens: [],
  candidates: [
    {
      prefix: ['semantic', 'home'],
      members: [...names(GROUP_OF_FOUR), FIFTH_MEMBER.semanticName],
      memberSets,
      expected: { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] },
    },
    {
      prefix: ['semantic'],
      members: [...names(GROUP_OF_FOUR), FIFTH_MEMBER.semanticName],
      expected: { outcome: 'not-an-opportunity', reasons: ['redundant-with'] },
      relations: [{ to: 'semantic-home', relation: 'redundant' }],
    },
  ],
  preconditions: {
    candidates: [{ folder: 'lib', outcome: 'not-eligible', reason: 'contradicted' }, fifthPlacement.home],
    placements: [{ names: names(GROUP_OF_FOUR), state: 'no-home' }, fifthPlacement.placement],
  },
});

const CASES = [
    {
      id: 'E1',
      source: 'measured',
      tree: { files: E1_FILES },
      directory: 'tree/src',
      directoryMembers: 28,
      lineageTokens: ['tree'],
      candidates: E1_CANDIDATES,
      preconditions: E1_PRECONDITIONS,
    },
    (() => {
      const specs = ['get-tree-commands', 'shared-contract', 'tree-codebase-validation-input'].map((rest) =>
        file('doc/specs', ['structural', 'addressing', ...rest.split('-')], spec),
      );
      return {
        id: 'E2',
        source: 'measured',
        tree: {
          files: [
            ...specs,
            file('doc/specs', ['registry', 'model', 'and', 'slice', 'interaction'], spec),
            file('doc/specs', ['validator', 'config'], spec),
            ...['marker-strategies', 'profile', 'render-tree', 'tree-codebase', 'tree-codebase-validation-input'].map((rest) =>
              file('structural-addressing/src', ['structural', 'addressing', ...rest.split('-')]),
            ),
            unobserved('structural-addressing/test', 6),
          ],
        },
        directory: 'doc/specs',
        lineageTokens: [],
        candidates: [
          {
            prefix: ['structural', 'addressing'],
            members: names(specs),
            expected: { outcome: 'insufficient-evidence', reasons: ['corresponding-home-unresolved'] },
          },
          {
            prefix: ['structural'],
            members: names(specs),
            expected: { outcome: 'not-an-opportunity', reasons: ['redundant-with'] },
            relations: [{ to: 'structural-addressing', relation: 'redundant' }],
          },
        ],
        preconditions: {
          candidates: [{ folder: 'structural-addressing', outcome: 'undetermined', reason: 'insufficient-evaluated-coverage', governingChannel: 'prefix' }],
          placements: [
            {
              names: names(specs),
              state: 'undetermined',
              reason: 'home-elsewhere-undetermined',
              consulted: [{ folder: 'structural-addressing', relation: 'match' }],
            },
          ],
        },
      };
    })(),
    (() => {
      const units = ['loader', 'resolver', 'state', 'policy', 'report'].map((rest) => file('lib', ['registry', rest]));
      return {
        id: 'E3',
        source: 'synthetic',
        // Unrelated siblings: S3.9 does not make the group the whole directory, which would be E9's case.
        tree: { files: [...units, others('lib', 'cache', 1), others('lib', 'schema', 1)] },
        directory: 'lib',
        lineageTokens: [],
        candidates: [{ prefix: ['registry'], members: names(units), expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] } }],
        preconditions: { placements: [{ names: names(units), state: 'no-home' }] },
      };
    })(),
    (() => {
      const report = file('lib', ['semantic', 'home', 'report']);
      const support = file('lib', ['semantic', 'home', 'test'], fixture);
      return {
        id: 'E4',
        source: 'synthetic',
        tree: { files: [report, support] },
        directory: 'lib',
        lineageTokens: [],
        candidates: [
          {
            prefix: ['semantic', 'home'],
            members: names([report, support]),
            expected: { outcome: 'not-an-opportunity', reasons: ['single-responsibility-unit'] },
          },
          {
            prefix: ['semantic'],
            members: names([report, support]),
            expected: { outcome: 'not-an-opportunity', reasons: ['single-responsibility-unit'] },
            relations: [{ to: 'semantic-home', relation: 'redundant' }],
          },
        ],
        preconditions: { placements: [{ names: names([report, support]), state: 'no-home' }] },
      };
    })(),
    {
      id: 'E5',
      source: 'synthetic',
      tree: { files: [file('lib', ['loader']), file('lib', ['loader'], test), file('lib', ['loader'], fixture)] },
      directory: 'lib',
      lineageTokens: [],
      candidates: [{ prefix: ['loader'], members: ['loader'], expected: { outcome: 'not-an-opportunity', reasons: ['single-responsibility-unit'] } }],
      preconditions: { placements: [{ names: ['loader'], state: 'no-home' }] },
    },
    (() => {
      const lifecycle = ['loader', 'resolver', 'state'].map((rest) => file('lib', ['registry', 'lifecycle', rest]));
      const broader = ['policy', 'report'].map((rest) => file('lib', ['registry', rest]));
      return {
        id: 'E6',
        source: 'synthetic',
        // Unrelated siblings, as in E3: `registry` must not be the whole directory.
        tree: { files: [...lifecycle, ...broader, others('lib', 'cache', 1), others('lib', 'schema', 1)] },
        directory: 'lib',
        lineageTokens: [],
        candidates: [
          {
            prefix: ['registry', 'lifecycle'],
            members: names(lifecycle),
            expected: { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] },
            relations: [{ to: 'registry', relation: 'nested-subgroup' }],
          },
          { prefix: ['registry'], members: names([...lifecycle, ...broader]), expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] } },
        ],
        preconditions: { placements: [{ names: names([...lifecycle, ...broader]), state: 'no-home' }] },
      };
    })(),
    (() => {
      const folderUnits = ['candidates', 'fact-evidence', 'kind-evidence', 'semantic-evidence', 'semantic-home-reasoning'].map((rest) =>
        file('tree/src', ['tree', 'folder', ...rest.split('-')]),
      );
      const semanticHome = ['attribution', 'placement', 'conformance'].map((rest) => file('tree/src', ['tree', 'semantic', 'home', rest]));
      return {
        id: 'E7',
        source: 'measured',
        tree: { files: [...folderUnits, ...semanticHome, file('tree/src', ['tree', 'shim', 'detection'])] },
        directory: 'tree/src',
        lineageTokens: ['tree'],
        candidates: [
          { prefix: ['folder'], members: names(folderUnits), expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] } },
          {
            prefix: ['folder', 'semantic'],
            members: ['tree-folder-semantic-evidence', 'tree-folder-semantic-home-reasoning'],
            expected: { outcome: 'insufficient-evidence', reasons: ['below-minimum-units'] },
            relations: [{ to: 'folder', relation: 'nested-subgroup' }],
          },
          {
            prefix: ['semantic', 'home'],
            members: names(semanticHome),
            expected: { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] },
            relations: [{ to: 'folder', relation: 'disjoint' }],
          },
          {
            prefix: ['semantic'],
            members: names(semanticHome),
            expected: { outcome: 'not-an-opportunity', reasons: ['redundant-with'] },
            relations: [{ to: 'semantic-home', relation: 'redundant' }],
          },
        ],
        notDiscovered: [
          {
            relationship: '`tree-folder-semantic-home-reasoning` to the `semantic-home` group, through its middle tokens',
            limitation: 'relationships away from leading tokens',
          },
        ],
        preconditions: {
          candidates: [{ folder: 'tree', outcome: 'eligible', reason: 'supported' }],
          placements: [{ names: [...names(folderUnits), ...names(semanticHome)], state: 'inside-home', nearest: 'tree' }],
          rootComparisons: [{ names: [...names(folderUnits), ...names(semanticHome)], folder: 'tree', result: 'match' }],
        },
      };
    })(),
    (() => {
      // Simplified on purpose: the measured specs also share a fourth token (`retirement`, five of eight),
      // a nested group S3.9 does not address; distinct fourth tokens keep this case to the agreed E8.
      // That nested group is deferred evidence for the provisional selection rule (S3.8), not dropped.
      const knownRoots = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'].map((rest) =>
        file('doc/specs', ['tree', 'known', 'roots', rest], spec),
      );
      const otherTree = ['occurrence-addressing-profile', 'registry-policy-inventory', 'structural-address-usage', 'structure-advisor-validator'].map((rest) =>
        file('doc/specs', ['tree', ...rest.split('-')], spec),
      );
      const treeOwned = ['addressed-occurrence', 'occurrence-model', 'policy-loading', 'registry-definitions', 'probe-contract', 'probe-boundary', 'vocabulary'].map(
        (rest) => file('doc/specs/tree-owned', ['tree', 'notes', ...rest.split('-')], spec),
      );
      return {
        id: 'E8',
        source: 'measured',
        tree: {
          files: [
            ...knownRoots,
            ...otherTree,
            ...treeOwned,
            file('doc/specs/tree-owned', ['validator', 'tree', 'reality'], spec),
            file('doc/specs/tree-owned', ['validator', 'tree', 'map'], spec),
            unobserved('doc/specs/tree-owned', 3),
            ...['advisor', 'wiring', 'host', 'contracts', 'intake', 'evidence'].map((rest) => file('tree', ['tree', rest])),
          ],
        },
        directory: 'doc/specs',
        lineageTokens: [],
        candidates: [
          {
            prefix: ['tree'],
            members: names([...knownRoots, ...otherTree]),
            expected: { outcome: 'explained-by-existing-structure', reasons: [], home: 'tree' },
          },
          {
            prefix: ['tree', 'known', 'roots'],
            members: names(knownRoots),
            expected: { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] },
            relations: [{ to: 'tree', relation: 'nested-subgroup' }],
          },
          {
            prefix: ['tree', 'known'],
            members: names(knownRoots),
            expected: { outcome: 'not-an-opportunity', reasons: ['redundant-with'] },
            relations: [{ to: 'tree-known-roots', relation: 'redundant' }],
          },
        ],
        preconditions: {
          candidates: [
            { folder: 'tree', outcome: 'eligible', reason: 'supported' },
            { folder: 'doc/specs/tree-owned', outcome: 'undetermined', reason: 'claim-unresolved', governingChannel: 'prefix' },
          ],
          placements: [
            {
              names: names([...knownRoots, ...otherTree]),
              state: 'home-elsewhere',
              elsewhere: ['tree'],
              consulted: [{ folder: 'doc/specs/tree-owned', relation: 'possible-root-reading' }],
            },
          ],
        },
      };
    })(),
    (() => {
      const units = ['format', 'parse', 'diff'].map((rest) => file('src/utils', ['date', rest]));
      return {
        id: 'E9',
        source: 'synthetic',
        tree: { files: units },
        directory: 'src/utils',
        lineageTokens: [],
        candidates: [{ prefix: ['date'], members: names(units), expected: { outcome: 'insufficient-evidence', reasons: ['whole-directory-value-undetermined'] } }],
        preconditions: { placements: [{ names: names(units), state: 'no-home' }] },
      };
    })(),
    (() => {
      const check = ['role', 'case', 'hyphen'].map((rest) => file('naming/src/rules', ['naming', 'rule', 'check', rest]));
      const rules = [...check, ...['parse', 'derive', 'classify', 'interpret', 'hints'].map((rest) => file('naming/src/rules', ['naming', 'rule', rest]))];
      return {
        id: 'E10',
        source: 'measured',
        tree: {
          files: [
            ...rules,
            ...['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'].map((root) => others('naming/src', root, 1)),
          ],
        },
        directory: 'naming/src/rules',
        lineageTokens: ['naming'],
        candidates: [
          // S3.5 (undetermined ancestors): `home-on-lineage-undetermined` alone leaves every member supported.
          {
            prefix: ['rule'],
            members: names(rules),
            memberSets: { supported: names(rules), conflicting: [], unresolved: [] },
            expected: { outcome: 'insufficient-evidence', reasons: ['whole-directory-value-undetermined'] },
          },
          {
            prefix: ['rule', 'check'],
            members: names(check),
            memberSets: { supported: names(check), conflicting: [], unresolved: [] },
            expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] },
            relations: [{ to: 'rule', relation: 'nested-subgroup' }],
          },
        ],
        knownGap: {
          candidate: 'rule-check',
          expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] },
          rulesWouldProduce: { outcome: 'opportunity' },
          cause:
            'No prepared evidence relates `rule` to the folder label `rules` (S3.10 singular/plural limit), so the folder\'s own concept stays in the residual and inflates specificity. Owner: Naming or a shared Linguistic Foundation.',
        },
        preconditions: {
          candidates: [
            { folder: 'naming', outcome: 'undetermined', reason: 'mixed-evidence' },
            { folder: 'naming/src/rules', outcome: 'not-eligible', reason: 'contradicted' },
          ],
          placements: [{ names: names(rules), state: 'undetermined', reason: 'home-on-lineage-undetermined' }],
          rootComparisons: [
            { names: names(rules), folder: 'naming', result: 'match' },
            { names: names(rules), folder: 'naming/src/rules', result: 'foreign' },
          ],
          // The gap is an absence: Naming's label tokens for the folder are `rules`, the members carry
          // `rule`, and no prepared evidence relates the two.
          labelTokens: [{ folder: 'naming/src/rules', tokens: ['rules'], memberToken: 'rule', names: names(rules) }],
        },
      };
    })(),
    (() => {
      const registryUnits = ['inventory', 'migrations', 'references', 'set', 'bridge-domains'].map((rest) =>
        file('tree/src/registries', ['tree', 'registry', ...rest.split('-')]),
      );
      const registries = [...registryUnits, file('tree/src/registries', ['tree', 'structural', 'homes', 'registry'])];
      return {
        id: 'E11',
        source: 'measured',
        tree: { files: [...registries, ...['advisor', 'wiring', 'host'].map((rest) => file('tree', ['tree', rest]))] },
        directory: 'tree/src/registries',
        lineageTokens: ['tree'],
        candidates: [{ prefix: ['registry'], members: names(registryUnits), expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] } }],
        notDiscovered: [
          {
            relationship: 'members\' `registry` to the folder label `registries` (and `rule` to `rules`, E10)',
            limitation: 'singular/plural lexical relationship',
          },
        ],
        preconditions: {
          candidates: [{ folder: 'tree', outcome: 'eligible', reason: 'supported' }],
          placements: [{ names: names(registries), state: 'inside-home', nearest: 'tree' }],
          rootComparisons: [
            { names: names(registries), folder: 'tree', result: 'match' },
            { names: names(registries), folder: 'tree/src/registries', result: 'foreign' },
          ],
          labelTokens: [{ folder: 'tree/src/registries', tokens: ['registries'], memberToken: 'registry', names: names(registryUnits) }],
        },
      };
    })(),
    (() => {
      const evaluated = ['north', 'south', 'east'].map((rest) => file('lib', ['widget', 'panel', rest]));
      return {
        id: 'E12',
        source: 'synthetic',
        tree: { files: [...evaluated, unobserved('lib', 9)] },
        directory: 'lib',
        lineageTokens: [],
        candidates: [
          { prefix: ['widget', 'panel'], members: names(evaluated), expected: { outcome: 'insufficient-evidence', reasons: ['low-coverage'] } },
          {
            prefix: ['widget'],
            members: names(evaluated),
            expected: { outcome: 'insufficient-evidence', reasons: ['low-coverage'] },
            relations: [{ to: 'widget-panel', relation: 'redundant' }],
          },
        ],
        policyIncomplete: {
          candidates: ['widget-panel', 'widget'],
          unresolvedDecisions: ['coverage-share'],
          cause: 'No catalogue case fixes the coverage share for `low-coverage` (S3.8), and coverage comes before every other rule that applies (S3.6).',
        },
        preconditions: {
          candidates: [{ folder: 'lib', outcome: 'undetermined', reason: 'insufficient-evaluated-coverage' }],
          placements: [
            { names: names(evaluated), state: 'no-home' },
            { unobservedIn: 'lib', state: 'undetermined', reason: 'no-semantic-observation' },
          ],
        },
      };
    })(),
    {
      id: 'E13',
      source: 'synthetic',
      // S3.9: E1 with every member flagged `family-boundary-heuristic`.
      tree: { files: E1_FILES.map((entry) => ({ ...entry, ambiguous: true })) },
      directory: 'tree/src',
      directoryMembers: 28,
      lineageTokens: ['tree'],
      candidates: E1_CANDIDATES,
      preconditions: { ...E1_PRECONDITIONS, ambiguous: names(E1_FILES) },
    },
    partialEvidenceCase({
      id: 'E14',
      strengthFolder: STRENGTH_FOLDER_SUPPORT,
      fifthPlacement: {
        home: { folder: 'semantic-home-strength', outcome: 'eligible', reason: 'supported', governingChannel: 'prefix' },
        placement: { names: [FIFTH_MEMBER.semanticName], state: 'home-elsewhere', elsewhere: ['semantic-home-strength'] },
      },
      memberSets: { supported: names(GROUP_OF_FOUR), conflicting: [FIFTH_MEMBER.semanticName], unresolved: [] },
    }),
    partialEvidenceCase({
      id: 'E15',
      strengthFolder: [...STRENGTH_FOLDER_SUPPORT.slice(0, 2), unobserved('semantic-home-strength', 3)],
      fifthPlacement: {
        home: { folder: 'semantic-home-strength', outcome: 'undetermined', reason: 'insufficient-evaluated-coverage', governingChannel: 'prefix' },
        placement: {
          names: [FIFTH_MEMBER.semanticName],
          state: 'undetermined',
          reason: 'home-elsewhere-undetermined',
          consulted: [{ folder: 'semantic-home-strength', relation: 'match' }],
        },
      },
      memberSets: { supported: names(GROUP_OF_FOUR), conflicting: [], unresolved: [FIFTH_MEMBER.semanticName] },
    }),
  // E16, E17 (calculogic-validator#142): S3.2 positional lineage expression, measured at d0fbdce.
  // Reclassified from implementation-pending when calculogic-validator#144 implemented the amendment.
  // `lineageExpression` gives each member's lineage-expressed tokens where they differ between members
  // (checked against the preconditions).
  (() => {
    const cli = ['args', 'runner', 'usage'].map((rest) => file('naming/src/cli', ['naming', 'cli', rest]));
    const builder = file('naming/src/cli', ['naming', 'report', 'builder']);
    return {
      id: 'E16',
      source: 'measured',
      tree: { files: [...cli, builder, ...['alpha', 'bravo', 'charlie'].map((root) => others('naming/src', root, 1))] },
      directory: 'naming/src/cli',
      lineageTokens: ['naming'],
      lineageExpression: { ...Object.fromEntries(names(cli).map((name) => [name, ['naming', 'cli']])), [builder.semanticName]: ['naming'] },
      // `cli` is expressed by `cli/`, so no residual prefix is shared and nothing is discovered.
      candidates: [],
      preconditions: {
        rootComparisons: [{ names: [...names(cli), builder.semanticName], folder: 'naming', result: 'match' }],
        positionalLabels: [{ folder: 'naming/src/cli', tokens: ['cli'], position: 1, names: names(cli) }],
      },
    };
  })(),
  (() => {
    const health = [file('naming/src/health', ['naming', 'health', 'check'], { role: 'host', roleCategory: 'architecture-support' }), file('naming/src/health', ['naming', 'health', 'check'])];
    return {
      id: 'E17',
      source: 'measured',
      tree: { files: [...health, ...['alpha', 'bravo', 'charlie'].map((root) => others('naming/src', root, 1))] },
      directory: 'naming/src/health',
      lineageTokens: ['naming', 'health'],
      candidates: [
        {
          prefix: ['check'],
          members: ['naming-health-check'],
          expected: { outcome: 'not-an-opportunity', reasons: ['single-responsibility-unit'] },
        },
      ],
      preconditions: {
        rootComparisons: [{ names: ['naming-health-check'], folder: 'naming', result: 'match' }],
        positionalLabels: [{ folder: 'naming/src/health', tokens: ['health'], position: 1, names: ['naming-health-check'] }],
      },
    };
  })(),
  // Repository package expression (S3.2; calculogic-validator#157, implemented by #159). E18-E20 reproduce,
  // as fixed trees, the directories measured at 9fe8bb1 whose members lead with the repository's concept.
  // `repositoryPackage` is the target root manifest's declared package identity (raw segments), the case's
  // added evidence; `lineageExpression` is what S3.2 expresses with it. The results the runtime gave before
  // #159 are recorded in S3.9 and checked individually by tree-repository-package-expression-contract.
  ...(() => {
    const repositoryPackage = { scope: 'calculogic', name: 'validator' };
    const contracts = { role: 'contracts', roleCategory: 'architecture-support' };
    const knowledge = { role: 'knowledge', roleCategory: 'concern-core' };
    const host = { role: 'host', roleCategory: 'architecture-support' };
    const opportunity = { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] };
    const lowSpecificity = { outcome: 'insufficient-evidence', reasons: ['low-specificity'] };
    const split = (dir, name, options) => file(dir, name.split('-'), options);

    // E18: src/core/cli (9 members).
    const cliFiles = ['validator-cli-direct', 'validator-cli-output', 'validator-cli-registry-resolution', 'validator-cli-runner', 'validator-cli-scopes', 'validator-cli-targets', 'validator-cli-usage'].map((name) => split('src/core/cli', name));
    const cliReport = ['validator-report-examples', 'validator-report-summary'].map((name) => split('src/core/cli', name));
    const e18 = {
      id: 'E18',
      source: 'measured',
      repositoryPackage,
      tree: { files: [...cliFiles, ...cliReport] },
      directory: 'src/core/cli',
      directoryMembers: 9,
      lineageTokens: [],
      lineageExpression: { ...Object.fromEntries(names(cliFiles).map((name) => [name, ['validator', 'cli']])), ...Object.fromEntries(names(cliReport).map((name) => [name, ['validator']])) },
      // `validator` is expressed by the declared package name, and `cli/` then continues at position 1.
      candidates: [{ prefix: ['report'], members: names(cliReport), expected: lowSpecificity }],
      preconditions: {},
    };

    // E19: src/core (22 members).
    const core = [
      split('src/core', 'npm-arg-forwarding-guard'),
      split('src/core', 'validator-candidate-policy', contracts),
      split('src/core', 'validator-candidate-policy'),
      split('src/core', 'validator-development-context'),
      split('src/core', 'validator-direct-report'),
      split('src/core', 'validator-exit-code'),
      split('src/core', 'validator-registry', knowledge),
      split('src/core', 'validator-report-capture-metadata'),
      split('src/core', 'validator-report-identity'),
      split('src/core', 'validator-report-meta'),
      split('src/core', 'validator-report', contracts),
      split('src/core', 'registry-entry-shape'),
      split('src/core', 'validator-root-files', knowledge),
      split('src/core', 'validator-runner'),
      split('src/core', 'validator-scopes'),
      split('src/core', 'repository-local-package-evidence'),
      split('src/core', 'repository-root'),
      split('src/core', 'scoped-target-paths'),
      split('src/core', 'source-snapshot'),
      split('src/core', 'suite-scoped-snapshot-input'),
      split('src/core', 'target-path-containment'),
      split('src/core', 'validator-candidate-collection'),
    ];
    const validatorNames = [...new Set(core.filter((entry) => entry.tokens[0] === 'validator').map((entry) => entry.semanticName))];
    const e19 = {
      id: 'E19',
      source: 'measured',
      repositoryPackage,
      tree: { files: core },
      directory: 'src/core',
      directoryMembers: 22,
      lineageTokens: [],
      lineageExpression: Object.fromEntries(validatorNames.map((name) => [name, ['validator']])),
      candidates: [
        { prefix: ['candidate'], members: ['validator-candidate-collection', 'validator-candidate-policy'], expected: lowSpecificity },
        {
          prefix: ['candidate', 'policy'],
          members: ['validator-candidate-policy'],
          expected: { outcome: 'not-an-opportunity', reasons: ['single-responsibility-unit'] },
          relations: [{ to: 'candidate', relation: 'nested-subgroup' }],
        },
        { prefix: ['registry'], members: ['registry-entry-shape', 'validator-registry'], expected: lowSpecificity },
        { prefix: ['report'], members: ['validator-report', 'validator-report-capture-metadata', 'validator-report-identity', 'validator-report-meta'], expected: lowSpecificity },
        { prefix: ['repository'], members: ['repository-local-package-evidence', 'repository-root'], expected: lowSpecificity },
      ],
      preconditions: {},
    };

    // E20: bin (6 entry-point hosts); the scope expresses `calculogic`, the name `validator` where it follows.
    const validate = ['calculogic-validate', 'calculogic-validate-naming', 'calculogic-validate-tree'].map((name) => split('bin', name, host));
    const validatorHosts = ['calculogic-validator-health', 'calculogic-validator-registry', 'calculogic-validator-report-summarize'].map((name) => split('bin', name, host));
    const e20 = {
      id: 'E20',
      source: 'measured',
      repositoryPackage,
      tree: { files: [...validate, ...validatorHosts] },
      directory: 'bin',
      directoryMembers: 6,
      lineageTokens: [],
      lineageExpression: { ...Object.fromEntries(names(validate).map((name) => [name, ['calculogic']])), ...Object.fromEntries(names(validatorHosts).map((name) => [name, ['calculogic', 'validator']])) },
      candidates: [{ prefix: ['validate'], members: names(validate), expected: lowSpecificity }],
      preconditions: {},
    };

    // E21 (negative): `validator` after a token a folder expresses is never expressed by the package. The
    // package elements are outermost and apply only at position 0, so `tree-validator-*` keeps `validator`.
    const negative = ['alpha', 'beta', 'gamma'].map((rest) => file('tree/src', ['tree', 'validator', rest]));
    const negativeOthers = ['shim', 'host'].map((rest) => file('tree/src', ['tree', rest, 'detection']));
    const e21 = {
      id: 'E21',
      source: 'synthetic',
      repositoryPackage,
      tree: { files: [...negative, ...negativeOthers, ...['advisor', 'wiring', 'host'].map((rest) => file('tree', ['tree', rest]))] },
      directory: 'tree/src',
      directoryMembers: 5,
      lineageTokens: ['tree'],
      candidates: [{ prefix: ['validator'], members: names(negative), expected: lowSpecificity }],
      preconditions: {
        rootComparisons: [{ names: [...names(negative), ...names(negativeOthers)], folder: 'tree', result: 'match' }],
      },
    };
    return [e18, e19, e20, e21];
  })(),
  (() => {
    // E22 (calculogic-validator#162): the measured `doc/ValidatorSpecs` at 40f18fa, with the `retirement`
    // subgroup E8 leaves out on purpose (five of the eight `tree-known-roots` specs share it). An independent
    // base case, not an E8 companion: the subgroup changes five of E8's files, and a companion only adds.
    // The first case with nested eligible candidates, for the open `opportunity-selection` decision (S3.8):
    // it records the evidence and decides no selection. One unrecognized file
    // (`filename-case-and-interpretation-contract.md`) makes the four candidates that do not end at existing
    // structure policy-incomplete, exactly as E8.1; their `expected` outcomes follow E8.1's.
    const D = 'doc/specs';
    const knownRoots = [
      'derived-compatibility-path',
      'responsibility-retirement-audit',
      'retirement-addressed-occurrence-contract',
      'retirement-naming-semantic-bridge-contract',
      'retirement-registry-alignment',
      'retirement-semantic-home-evidence-contract',
      'retirement-target-model',
      'structural-addressing-bridge',
    ].map((rest) => file(D, ['tree', 'known', 'roots', ...rest.split('-')], spec));
    const retirement = knownRoots.filter((entry) => entry.tokens[3] === 'retirement');
    const otherTree = ['occurrence-addressing-profile', 'registry-policy-inventory', 'structural-address-usage-inventory', 'structure-advisor-validator'].map((rest) =>
      file(D, ['tree', ...rest.split('-')], spec),
    );
    const addressing = ['get-tree-commands', 'shared-contract', 'tree-codebase-validation-input'].map((rest) => file(D, ['structural', 'addressing', ...rest.split('-')], spec));
    const lowCoverage = { outcome: 'insufficient-evidence', reasons: ['low-coverage'] };
    const opportunity = { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] };
    const redundantWith = { outcome: 'not-an-opportunity', reasons: ['redundant-with'] };
    const atEveryTestedShare = { structural: redundantWith, 'tree-known': redundantWith, 'tree-known-roots': opportunity, 'tree-known-roots-retirement': opportunity };
    return {
      id: 'E22',
      source: 'measured',
      relatedTo: 'E8',
      tree: {
        files: [
          ...addressing,
          ...knownRoots,
          ...otherTree,
          file(D, ['validator', 'config'], spec),
          file(D, ['linguistic', 'foundation', 'shared', 'contract'], spec),
          unobserved(D, 1),
          ...['marker-strategies', 'profile', 'render-tree', 'tree-codebase', 'tree-codebase-validation-input'].map((rest) =>
            file('structural-addressing/src', ['structural', 'addressing', ...rest.split('-')]),
          ),
          unobserved('structural-addressing/test', 6),
          ...['advisor', 'wiring', 'host', 'contracts', 'intake', 'evidence'].map((rest) => file('tree', ['tree', rest])),
        ],
      },
      directory: D,
      directoryMembers: 17,
      lineageTokens: [],
      candidates: [
        {
          prefix: ['structural', 'addressing'],
          members: names(addressing),
          memberSets: { supported: [], conflicting: [], unresolved: names(addressing) },
          expected: { outcome: 'insufficient-evidence', reasons: ['corresponding-home-unresolved'] },
        },
        {
          prefix: ['structural'],
          members: names(addressing),
          memberSets: { supported: [], conflicting: [], unresolved: names(addressing) },
          expected: lowCoverage,
          relations: [{ to: 'structural-addressing', relation: 'redundant' }],
        },
        { prefix: ['tree'], members: names([...knownRoots, ...otherTree]), expected: { outcome: 'explained-by-existing-structure', reasons: [], home: 'tree' } },
        {
          prefix: ['tree', 'known'],
          members: names(knownRoots),
          expected: lowCoverage,
          relations: [{ to: 'tree', relation: 'nested-subgroup' }, { to: 'tree-known-roots', relation: 'redundant' }],
        },
        {
          prefix: ['tree', 'known', 'roots'],
          members: names(knownRoots),
          expected: lowCoverage,
          relations: [{ to: 'tree', relation: 'nested-subgroup' }, { to: 'tree-known-roots-retirement', relation: 'nested-subgroup' }],
        },
        {
          prefix: ['tree', 'known', 'roots', 'retirement'],
          members: names(retirement),
          expected: lowCoverage,
          relations: [{ to: 'tree', relation: 'nested-subgroup' }, { to: 'tree-known', relation: 'nested-subgroup' }, { to: 'tree-known-roots', relation: 'nested-subgroup' }],
        },
      ],
      policyIncomplete: {
        candidates: ['structural', 'tree-known', 'tree-known-roots', 'tree-known-roots-retirement'],
        unresolvedDecisions: ['coverage-share'],
        cause:
          'One unrecognized file could join any of these documentation groupings with another category, which the experimental policy leaves unresolved, so no conclusion is invariant under admissible completions (S3.6); for `structural` and `tree-known` it could also break redundancy. As E8.1.',
        // Measured: every tested share decides the same outcomes (members ÷ files is 17/18).
        outcomesAtTestedValues: {
          'coverage-share': [
            { value: 0.1, outcomes: atEveryTestedShare },
            { value: 0.25, outcomes: atEveryTestedShare },
            { value: 0.5, outcomes: atEveryTestedShare },
          ],
        },
      },
      preconditions: {
        candidates: [{ folder: 'tree', outcome: 'eligible', reason: 'supported' }],
      },
    };
  })(),
];

// S3.9 companion cases (calculogic-validator#138): a base case plus one condition measured on the real
// repository. The base case is never rewritten; the companion keeps its intent and its candidates.
// - `companionOf`: the base case.
// - `implementationPending`: only where the expected outcome follows a contract amendment the runtime
//   does not implement yet. `runtimeProduces` is what today's runtime gives, per candidate; it is
//   checked exactly, so the case is reclassified when the runtime changes. (E10.1 was reclassified
//   when calculogic-validator#140 implemented S3.5, and E16 and E17 when #144 implemented S3.2; no case
//   is pending.)
const baseCase = (id) => CASES.find((entry) => entry.id === id);
const COMPANIONS = [
  (() => {
    // E10 plus `doc/ValidatorSpecs/naming-owned/`: four `naming-*` specs, so its label candidate is
    // undetermined (`claim-unresolved`) with an eligible root reading, and every rule member consults
    // it through `possible-root-reading` from elsewhere.
    const base = baseCase('E10');
    const namingOwned = ['semantic-family', 'semantic-name', 'documentation-map', 'bridge-rules'].map((rest) =>
      file('doc/specs/naming-owned', ['naming', ...rest.split('-')], spec),
    );
    const ruleNames = base.candidates.find((candidate) => candidate.prefix.join('-') === 'rule').members;
    return {
      ...base,
      id: 'E10.1',
      companionOf: 'E10',
      tree: { files: [...base.tree.files, ...namingOwned] },
      // S3.5 claim-relative uncertainty: the folder puts forward `naming`, which is broader, so every member is supported.
      candidates: base.candidates,
      knownGap: { ...base.knownGap },
      preconditions: {
        ...base.preconditions,
        candidates: [
          ...base.preconditions.candidates,
          { folder: 'doc/specs/naming-owned', outcome: 'undetermined', reason: 'claim-unresolved', governingChannel: 'prefix' },
        ],
        placements: [
          {
            names: ruleNames,
            state: 'undetermined',
            reason: 'home-on-lineage-undetermined',
            consulted: [
              { folder: 'naming', relation: 'match' },
              { folder: 'doc/specs/naming-owned', relation: 'possible-root-reading' },
            ],
          },
        ],
      },
    };
  })(),
  (() => {
    // E8 plus one unrecognized file in the focus directory (`filename-case-and-interpretation-contract.md`,
    // `NAMING_MISSING_ROLE`).
    const base = baseCase('E8');
    const outcomeOf = (prefix) => (prefix === 'tree' ? null : { outcome: 'insufficient-evidence', reasons: ['low-coverage'] });
    return {
      ...base,
      id: 'E8.1',
      companionOf: 'E8',
      tree: { files: [...base.tree.files, unobserved('doc/specs', 1)] },
      candidates: base.candidates.map((candidate) => {
        const expected = outcomeOf(candidate.prefix.join('-'));
        return expected ? { ...candidate, expected } : candidate;
      }),
      policyIncomplete: {
        candidates: ['tree-known-roots', 'tree-known'],
        unresolvedDecisions: ['coverage-share'],
        cause:
          'One unrecognized file could join either documentation grouping with another category, which the experimental policy leaves unresolved, so neither conclusion is invariant under admissible completions (S3.6); for `tree-known` it could also break redundancy.',
      },
      preconditions: {
        ...base.preconditions,
        placements: [...base.preconditions.placements, { unobservedIn: 'doc/specs', state: 'undetermined', reason: 'no-semantic-observation' }],
      },
    };
  })(),
];

// S3.9 lexical-evidence companions (calculogic-validator#153): a base case, or a companion, under one
// more evidence condition, an active language profile, with the tree unchanged. The base case keeps its
// checks exactly; the lexical companion states what the amended S3.2 rule (lexical-label expression)
// concludes under that condition.
// - `lexicalCompanionOf`: the case it extends. `lexicalProfile`: the profile selection the case runs under.
// - `candidates`: the focus directory's candidates under the condition; `lineageTokens` and
//   `lineageExpression` are the declared lineage-expressed tokens under it.
// - `lexicalSteps`: the `lexical-label` steps S3.2 records, per member; `notDiscoveredUnderCondition`:
//   the base candidates the condition no longer discovers, and why; `kindSuffix`: members carrying the
//   folder label's lexeme only as their final token (S3.10 kind-suffix grouping, not expressed).
// - `expressionUnits`: the S3.7 counts over the whole case tree.
// - `beforeImplementation.runtimeProduced`: what the runtime produced in the focus directory before the
//   #153 implementation slice. The companions were implementation-pending until then; they are now
//   ordinary cases, and this record is still checked, as the result of a run without the section.
const companionCase = (id) => COMPANIONS.find((entry) => entry.id === id);
const E10_RUNTIME_BEFORE_IMPLEMENTATION = Object.freeze({
  rule: { outcome: 'insufficient-evidence', reasons: ['whole-directory-value-undetermined'] },
  'rule-check': { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] },
});
const E10_LEXICAL_EXPECTATION = (base) => {
  const ruleMembers = base.candidates.find((candidate) => candidate.prefix.join('-') === 'rule').members;
  const checkMembers = base.candidates.find((candidate) => candidate.prefix.join('-') === 'rule-check').members;
  return {
    directory: 'naming/src/rules',
    lineageTokens: ['naming', 'rule'],
    candidates: [
      {
        prefix: ['check'],
        members: checkMembers,
        memberSets: { supported: checkMembers, conflicting: [], unresolved: [] },
        leadingTokenSequences: [['naming', 'rule', 'check']],
        expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] },
      },
    ],
    lexicalSteps: [{ folder: 'naming/src/rules', names: ruleMembers, position: 1, labelTokens: ['rules'], tokens: ['rule'], lexemeIds: ['english.rule'] }],
    notDiscoveredUnderCondition: [
      { prefix: 'rule', reason: 'the folder\'s own concept: `rules/` expresses `rule` (lexical-label), so it is no residual token' },
      { prefix: 'rule-check', reason: 'the same grouping is discovered as `check`: equal leading tokens `naming-rule-check` over the same members (D-T1, as E17)' },
    ],
  };
};
const LEXICAL_COMPANIONS = [
  (() => {
    const base = baseCase('E10');
    return {
      ...base,
      ...E10_LEXICAL_EXPECTATION(base),
      id: 'E10-L',
      lexicalCompanionOf: 'E10',
      lexicalProfile: { profileId: 'english' },
      knownGap: undefined,
      expressionUnits: { lexical: 8, possible: 0, undetermined: 24 },
      beforeImplementation: { runtimeProduced: E10_RUNTIME_BEFORE_IMPLEMENTATION },
    };
  })(),
  (() => {
    const base = companionCase('E10.1');
    return {
      ...base,
      ...E10_LEXICAL_EXPECTATION(baseCase('E10')),
      id: 'E10.1-L',
      lexicalCompanionOf: 'E10.1',
      lexicalProfile: { profileId: 'english' },
      knownGap: undefined,
      // Structural evidence, not lexical identity, keeps `naming-owned/` as broader context (S3.5): its
      // tokens are `unknown`, and the Stage 2 preconditions are E10.1's, unchanged.
      expressionUnits: { lexical: 8, possible: 0, undetermined: 36 },
      beforeImplementation: { runtimeProduced: E10_RUNTIME_BEFORE_IMPLEMENTATION },
    };
  })(),
  (() => {
    const base = baseCase('E11');
    const registryMembers = base.candidates[0].members;
    return {
      ...base,
      id: 'E11-L',
      lexicalCompanionOf: 'E11',
      lexicalProfile: { profileId: 'english' },
      lineageTokens: ['tree'],
      lineageExpression: Object.fromEntries(registryMembers.map((name) => [name, ['tree', 'registry']])),
      candidates: [],
      lexicalSteps: [{ folder: 'tree/src/registries', names: registryMembers, position: 1, labelTokens: ['registries'], tokens: ['registry'], lexemeIds: ['english.registry'] }],
      notDiscoveredUnderCondition: [{ prefix: 'registry', reason: '`registries/` expresses `registry` (lexical-label); the residuals share no prefix, as in E16' }],
      kindSuffix: [{ folder: 'tree/src/registries', names: ['tree-structural-homes-registry'], token: 'registry', labelTokens: ['registries'] }],
      notDiscovered: [{ relationship: 'the member whose final token is `registry` to the folder label `registries`', limitation: 'kind-suffix grouping' }],
      expressionUnits: { lexical: 5, possible: 0, undetermined: 7 },
      beforeImplementation: { runtimeProduced: { registry: { outcome: 'insufficient-evidence', reasons: ['low-specificity'] } } },
    };
  })(),
];

export const EMERGENT_BOUNDARY_CATALOGUE = Object.freeze({
  id: 'emergent-boundary-catalogue',
  version: '1',
  cases: CASES,
  companions: COMPANIONS,
  lexicalCompanions: LEXICAL_COMPANIONS,
});
