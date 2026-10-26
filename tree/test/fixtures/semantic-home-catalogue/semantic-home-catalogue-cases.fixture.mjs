// The S2.11 contrast catalogue as one declarative table (Tree spec S2.11, RR4; calculogic-validator#102 K4).
// Data only: each case's tree and the expected results S2.11 states for it. The conformance binding
// cites this table's canonical digest, so any change to a tree or an expectation is visible. The
// per-case catalogue tests keep their own trees and assertions, independent of this table.
//
// Trees: `files` are `{ dir, root, count, tokens?, noObservation?, ambiguous? }` (`tokens: null` means
// the N1 token group is not provided); `folders` are `{ path, context?, packageRoot? }`; `n2` is
// `'not-staged'` or `{ rejected: folderPath }`. File `i` of the expanded list is
// `<dir>/<root>-<i>.logic.mjs`.
// Expectations: `candidates` select by `folder` and `source` (`label` by default, `context`,
// `package-root`), or state that a folder has no candidate (`none: true`); `placements` select every
// file directly in `folder` (optionally only those of `root`), or one `file`.

const f = (dir, root, count, options = {}) => ({ dir, root, count, ...options });
const C8_FILES = [f('docs/tree-owned', 'tree', 7, { tokens: ['tree', 'notes'] }), f('docs/tree-owned', 'other', 2), f('tree', 'tree', 6)];
const C13_FILES = [f('src', 'alpha', 3), f('src', 'beta', 3), f('src', 'gamma', 2), f('src', 'delta', 1)];

export const SEMANTIC_HOME_CATALOGUE = Object.freeze({
  id: 'semantic-home-catalogue',
  version: '2',
  cases: [
    {
      id: 'C1',
      tree: { files: [f('pricing', 'pricing', 6)] },
      expected: {
        candidates: [{ folder: 'pricing', outcome: 'eligible', reason: 'supported' }],
        placements: [{ folder: 'pricing', state: 'inside-home', nearest: 'pricing' }],
      },
    },
    {
      id: 'C2',
      tree: { files: [f('src', 'alpha', 3), f('src', 'beta', 3), f('src', 'gamma', 2)] },
      expected: { candidates: [{ folder: 'src', outcome: 'not-eligible', reason: 'contradicted' }], placements: [] },
    },
    {
      id: 'C3',
      tree: { files: [f('tests', 'x', 6, { noObservation: true })] },
      expected: {
        candidates: [{ folder: 'tests', outcome: 'undetermined', reason: 'insufficient-evaluated-coverage' }],
        placements: [{ folder: 'tests', state: 'undetermined', reason: 'no-semantic-observation' }],
      },
    },
    {
      id: 'C4',
      tree: { files: [f('shared', 'shared', 4), f('shared', 'other', 4)] },
      expected: { candidates: [{ folder: 'shared', outcome: 'undetermined', reason: 'mixed-evidence' }], placements: [] },
    },
    {
      id: 'C5',
      tree: { files: [f('billing', 'billing', 1), f('billing/src', 'billing', 6)] },
      expected: {
        candidates: [
          { folder: 'billing/src', outcome: 'not-eligible', reason: 'contradicted' },
          { folder: 'billing', outcome: 'eligible', reason: 'supported' },
        ],
        placements: [
          { folder: 'billing', state: 'inside-home', nearest: 'billing' },
          { folder: 'billing/src', state: 'inside-home', nearest: 'billing' },
        ],
      },
    },
    {
      id: 'C6',
      tree: { files: [f('app', 'app', 3), f('app/pricing', 'pricing', 8), f('app/pricing', 'app', 1)] },
      expected: {
        candidates: [
          { folder: 'app/pricing', outcome: 'eligible', reason: 'supported' },
          { folder: 'app', outcome: 'eligible', reason: 'supported' },
        ],
        placements: [
          { folder: 'app/pricing', root: 'pricing', state: 'inside-home', nearest: 'app/pricing' },
          { folder: 'app/pricing', root: 'app', state: 'inside-home', nearest: 'app' },
          { folder: 'app', state: 'inside-home', nearest: 'app' },
        ],
      },
    },
    {
      id: 'C7',
      tree: { files: [f('ledger/audit', 'audit', 5), f('ledger/audit', 'ledger', 5)] },
      expected: {
        candidates: [
          { folder: 'ledger/audit', outcome: 'undetermined', reason: 'mixed-evidence' },
          { folder: 'ledger', outcome: 'undetermined', reason: 'depends-on-undetermined-nested-candidate' },
        ],
        placements: [{ folder: 'ledger/audit', root: 'ledger', state: 'undetermined', reason: 'home-on-lineage-undetermined' }],
      },
    },
    {
      id: 'C8',
      tree: { files: C8_FILES },
      expected: {
        candidates: [
          { folder: 'docs/tree-owned', outcome: 'undetermined', reason: 'claim-unresolved' },
          { folder: 'tree', outcome: 'eligible', reason: 'supported' },
        ],
        placements: [{ folder: 'docs/tree-owned', root: 'tree', state: 'undetermined', reason: 'home-on-lineage-undetermined' }],
      },
    },
    {
      id: 'C9',
      tree: { folders: [{ path: 'tree', context: 'tree' }], files: [f('tree', 'tree', 5)] },
      expected: {
        candidates: [
          { folder: 'tree', outcome: 'eligible', reason: 'supported' },
          { folder: 'tree', source: 'context', outcome: 'eligible', reason: 'supported' },
        ],
        placements: [{ folder: 'tree', state: 'inside-home', nearest: 'tree' }],
      },
    },
    {
      id: 'C10',
      tree: { folders: [{ path: 'kit', context: 'toolkit' }], files: [f('kit', 'kit', 6), f('kit', 'other', 1)] },
      expected: {
        candidates: [
          { folder: 'kit', outcome: 'eligible', reason: 'supported' },
          { folder: 'kit', source: 'context', outcome: 'not-eligible', reason: 'contradicted' },
        ],
        placements: [],
      },
    },
    {
      id: 'C11',
      tree: { folders: [{ path: 'platform/pkg', packageRoot: 'pkg' }], files: [f('platform', 'platform', 5), f('platform/pkg', 'platform', 4)] },
      expected: {
        candidates: [
          { folder: 'platform', outcome: 'eligible', reason: 'supported' },
          { folder: 'platform/pkg', source: 'package-root', outcome: 'not-eligible', reason: 'contradicted' },
        ],
        placements: [{ folder: 'platform/pkg', root: 'platform', state: 'home-elsewhere' }],
      },
    },
    {
      id: 'C12',
      tree: { files: [f('services/billing', 'billing', 4), f('apps/billing', 'billing', 4), f('shared', 'billing', 1)] },
      expected: {
        candidates: [
          { folder: 'services/billing', outcome: 'eligible', reason: 'supported' },
          { folder: 'apps/billing', outcome: 'eligible', reason: 'supported' },
          { folder: 'shared', outcome: 'not-eligible', reason: 'contradicted' },
        ],
        placements: [
          { folder: 'services/billing', state: 'inside-home', nearest: 'services/billing' },
          { folder: 'apps/billing', state: 'inside-home', nearest: 'apps/billing' },
          { folder: 'shared', state: 'home-elsewhere' },
        ],
      },
    },
    {
      id: 'C13',
      tree: { files: C13_FILES, n2: 'not-staged' },
      expected: {
        candidates: [{ folder: 'src', none: true }],
        placements: [{ folder: 'src', root: 'delta', state: 'undetermined', reason: 'candidate-discovery-incomplete' }],
      },
      variants: [
        {
          name: 'rejected-folder-label',
          tree: { files: C13_FILES, n2: { rejected: 'src' } },
          expected: {
            candidates: [{ folder: 'src', none: true }],
            placements: [{ folder: 'src', root: 'delta', state: 'undetermined', reason: 'candidate-discovery-incomplete' }],
          },
        },
      ],
    },
    {
      id: 'C14',
      tree: { files: [f('registry-lifecycle', 'registry', 10, { tokens: ['registry', 'lifecycle', 'a', 'b'], ambiguous: true })] },
      expected: {
        candidates: [{ folder: 'registry-lifecycle', outcome: 'eligible', reason: 'supported' }],
        placements: [{ folder: 'registry-lifecycle', state: 'inside-home', nearest: 'registry-lifecycle' }],
      },
    },
    {
      id: 'C15',
      tree: { folders: [{ path: 'packages/ui', packageRoot: 'ui' }], files: [f('packages/ui', 'ui', 6)] },
      expected: {
        candidates: [
          { folder: 'packages/ui', source: 'package-root', outcome: 'eligible', reason: 'supported' },
          { folder: 'packages', outcome: 'undetermined', reason: 'no-active-members' },
        ],
        placements: [{ folder: 'packages/ui', state: 'inside-home', nearest: 'packages/ui' }],
      },
    },
    {
      id: 'C16',
      tree: { files: [f('billing', 'billing', 3), f('billing/billing-api', 'billing', 4, { tokens: ['billing', 'api', 'x'] })] },
      expected: {
        candidates: [
          { folder: 'billing', outcome: 'eligible', reason: 'supported' },
          { folder: 'billing/billing-api', outcome: 'eligible', reason: 'supported' },
        ],
        placements: [{ folder: 'billing/billing-api', state: 'inside-home', nearest: 'billing/billing-api' }],
      },
    },
    {
      id: 'C17',
      tree: { files: [f('ops', 'ops', 1)] },
      expected: { candidates: [{ folder: 'ops', outcome: 'undetermined', reason: 'insufficient-support' }], placements: [] },
    },
    {
      id: 'C18',
      tree: {
        files: [
          f('structural-addressing', 'structural', 5, { tokens: ['structural', 'addressing', 'x'] }),
          f('structural-addressing', 'structural', 1, { tokens: null }),
        ],
      },
      expected: {
        candidates: [{ folder: 'structural-addressing', outcome: 'eligible', reason: 'supported' }],
        placements: [{ file: 'structural-addressing/structural-5.logic.mjs', state: 'undetermined', reason: 'home-on-lineage-undetermined' }],
      },
    },
    {
      id: 'C19',
      tree: { files: [f('reports', 'reports', 3), f('reports', 'x', 7, { noObservation: true })] },
      expected: { candidates: [{ folder: 'reports', outcome: 'undetermined', reason: 'insufficient-evaluated-coverage' }], placements: [] },
    },
    {
      id: 'C20',
      tree: { files: [f('ops', 'ops', 2)] },
      expected: { candidates: [{ folder: 'ops', outcome: 'eligible', reason: 'supported' }], placements: [] },
    },
    {
      id: 'C21',
      tree: { files: [f('lib', 'lib', 1), f('lib', 'other', 9)] },
      expected: { candidates: [{ folder: 'lib', outcome: 'not-eligible', reason: 'contradicted' }], placements: [] },
    },
    {
      id: 'C22',
      tree: { files: [f('cache', 'cache', 1), f('cache', 'other', 3)] },
      expected: { candidates: [{ folder: 'cache', outcome: 'not-eligible', reason: 'contradicted' }], placements: [] },
    },
    {
      id: 'C23',
      tree: { files: [f('queue', 'queue', 4), f('queue', 'other', 6)] },
      expected: { candidates: [{ folder: 'queue', outcome: 'undetermined', reason: 'mixed-evidence' }], placements: [] },
    },
    {
      id: 'C24',
      tree: { files: [f('auth', 'auth', 3), f('auth', 'other', 1)] },
      expected: { candidates: [{ folder: 'auth', outcome: 'eligible', reason: 'supported' }], placements: [] },
    },
    {
      id: 'C25',
      tree: { files: [f('docs/tree-owned', 'tree', 1, { tokens: ['tree', 'notes'] }), f('docs/tree-owned', 'other', 8)] },
      expected: { candidates: [{ folder: 'docs/tree-owned', outcome: 'not-eligible', reason: 'contradicted' }], placements: [] },
    },
    {
      id: 'C26',
      tree: {
        files: [
          f('billing-api', 'billing', 8, { tokens: ['billing', 'api', 'x'] }),
          f('billing-api', 'billing', 1, { tokens: ['billing', 'core'] }),
          f('billing-api', 'other', 1),
          f('billing', 'billing', 4),
        ],
      },
      expected: {
        candidates: [
          { folder: 'billing-api', outcome: 'eligible', reason: 'supported' },
          { folder: 'billing', outcome: 'eligible', reason: 'supported' },
        ],
        placements: [{ file: 'billing-api/billing-8.logic.mjs', state: 'home-elsewhere' }],
      },
    },
    {
      id: 'C27',
      tree: { files: [f('ops-owned', 'ops', 1, { tokens: ['ops', 'notes'] })] },
      expected: {
        candidates: [{ folder: 'ops-owned', outcome: 'undetermined', reason: 'claim-unresolved' }],
        placements: [{ folder: 'ops-owned', state: 'undetermined', reason: 'home-on-lineage-undetermined' }],
      },
    },
    {
      id: 'C28',
      tree: { files: [...C8_FILES, f('docs', 'tree', 1, { tokens: ['tree', 'notes'] })] },
      expected: {
        candidates: [
          { folder: 'docs/tree-owned', outcome: 'undetermined', reason: 'claim-unresolved' },
          { folder: 'tree', outcome: 'eligible', reason: 'supported' },
        ],
        placements: [
          { folder: 'docs/tree-owned', root: 'tree', state: 'undetermined', reason: 'home-on-lineage-undetermined' },
          { folder: 'docs', root: 'tree', state: 'home-elsewhere' },
        ],
      },
    },
    {
      id: 'C29',
      tree: { files: [f('audit-owned', 'other', 4), f('audit-owned', 'other', 4, { tokens: null })] },
      expected: { candidates: [{ folder: 'audit-owned', outcome: 'not-eligible', reason: 'contradicted' }], placements: [] },
    },
    {
      id: 'C30',
      tree: {
        files: [
          f('ledger-sync', 'other', 1),
          f('ledger-sync/queue', 'queue', 1),
          f('ledger-sync/queue', 'queue', 1, { tokens: null }),
          f('ledger-sync/queue', 'other', 1, { tokens: null }),
        ],
      },
      expected: {
        candidates: [
          { folder: 'ledger-sync/queue', outcome: 'undetermined', reason: 'mixed-evidence' },
          { folder: 'ledger-sync', outcome: 'undetermined', reason: 'depends-on-undetermined-nested-candidate' },
        ],
        placements: [],
      },
    },
  ],
});
