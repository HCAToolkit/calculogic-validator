// The Stage 3 evidence catalogue (Tree spec S3.9) as one declarative table (calculogic-validator#130).
// Data only. Stage 3 reasoning is not implemented (S3.11 step 4), so nothing here is a reasoning
// result: `expected` is what correct reasoning concludes, and is not asserted against anything yet.
// What is executable now is the table's integrity and each case's Stage 1 and Stage 2 `preconditions`,
// which run through `buildCatalogueCase` against the existing implementation.
//
// `source: 'measured'` cases reproduce, as fixed synthetic trees, the evidence measured on this
// repository at 667a151 (S3.9); they do not change as the repository grows. `synthetic` cases are
// contrast trees.
//
// A case:
// - `tree`: files for `buildCatalogueCase`. Each file is `{ dir, root, count, tokens?, semanticName?,
//   role?, roleCategory?, noObservation?, ambiguous? }`; file `i` of the expanded list is
//   `<dir>/<root>-<i>.logic.mjs`. Folder labels are the basename's hyphen tokens.
// - `directory`, `lineageTokens`: the focus directory and the leading N1 tokens its lineage expresses
//   (checked as a precondition, never derived here).
// - `candidates`: the focus directory's candidates (S3.3). `prefix` is the shared residual prefix;
//   `members` are semantic names; `memberSets` appear where S3.5's partition matters; `expected` is the
//   S3.6 outcome; `relations` name another candidate of the same case by its prefix.
// - `notDiscovered`: relationships V0 discovery cannot form (S3.10).
// - `knownGap`: only on a known discrepancy (S3.9): the expected outcome, what the specified rules would
//   produce, and the cause.
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

// E1, E13: tree/src with eight semantic-home units, one more `semantic` unit and four unrelated units.
const E1_SEMANTIC_HOME = ['attribution', 'conformance', 'eligibility', 'parameter-set', 'placement', 'reasoning', 'reasoning-report', 'strength-profile'].map(
  (rest) => file('tree/src', ['tree', 'semantic', 'home', ...rest.split('-')]),
);
const E1_FILES = [
  ...E1_SEMANTIC_HOME,
  file('tree/src', ['tree', 'semantic', 'naming', 'folder', 'type', 'relationship']),
  ...['shim-detection', 'occurrence-classification', 'repo-shape-evidence', 'structure-advisor'].map((rest) => file('tree/src', ['tree', ...rest.split('-')])),
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

export const EMERGENT_BOUNDARY_CATALOGUE = Object.freeze({
  id: 'emergent-boundary-catalogue',
  version: '1',
  cases: [
    {
      id: 'E1',
      source: 'measured',
      tree: { files: E1_FILES },
      directory: 'tree/src',
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
        tree: { files: units },
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
        tree: { files: [...lifecycle, ...broader] },
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
          { prefix: ['rule'], members: names(rules), expected: { outcome: 'insufficient-evidence', reasons: ['whole-directory-value-undetermined'] } },
          {
            prefix: ['rule', 'check'],
            members: names(check),
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
            expected: { outcome: 'insufficient-evidence', reasons: ['low-specificity', 'low-coverage'] },
            relations: [{ to: 'widget-panel', relation: 'redundant' }],
          },
        ],
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
      tree: { files: E1_FILES.map((entry) => (E1_SEMANTIC_HOME.includes(entry) ? { ...entry, ambiguous: true } : entry)) },
      directory: 'tree/src',
      lineageTokens: ['tree'],
      candidates: E1_CANDIDATES,
      preconditions: { ...E1_PRECONDITIONS, ambiguous: names(E1_SEMANTIC_HOME) },
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
  ],
});
