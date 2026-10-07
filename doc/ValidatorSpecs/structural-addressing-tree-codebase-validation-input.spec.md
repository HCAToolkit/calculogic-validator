# Structural Addressing tree-codebase Validation Input Spec (Issue #45)

## Status and ownership

- **Ownership:** Addressing-owned (`structural-addressing`). The adapter is a domain adapter for the `tree-codebase` profile, as `ValidatorBridgeContracts.md` §3.2 assigns to Addressing.
- **Authority:** bounded normative supporting spec for the validation input adapter of the `tree-codebase` profile. It does not change the profile, the marker strategies or `prepareTreeCodebaseAddressedSnapshot`.
- **current runtime truth (#45):** the adapter (`structural-addressing/src/structural-addressing-tree-codebase-validation-input.logic.mjs`, `prepareTreeCodebaseValidationInput`) is implemented. Tree wiring consumes it: adapter → `prepareTreeCodebaseAddressedSnapshot` → the Tree-owned projection (`tree-owned/tree-structural-address-probe-contract.spec.md`, "Addressing-backed projection"). Tree's private producers (`prepareTreeOccurrenceSnapshot`, `prepareTreeStructuralAddressSnapshot`) are no longer used by wiring. They remain only as the comparison and parity tests' reference until their retirement, a separate #39 follow-on.
- **History:** this spec landed first (#46), the adapter and projection with parity tests second (#47), and the wiring switch third.

Evidence: `doc/Audits/tree-structural-addressing-comparison.audit.md` (#40, #44), §5.

Issue lineage: Refs #45; parent Refs #39.

---

## Purpose

`prepareTreeCodebaseAddressedSnapshot` addresses a nested node tree. Validation runs do not have one: suite-core supplies a flat file list plus scope and target information. The adapter turns those prepared suite-core values into:

- the node tree Structural Addressing addresses, and
- the root information the Tree projection needs to keep Tree's snapshot contract.

The adapter is pure. It performs no filesystem access, and it adds, removes or reinterprets no files.

---

## Inputs

| Input | Source | Meaning |
|---|---|---|
| `selectedPaths` | suite-core `collectSuiteScopedSnapshotInputs` | Repository-relative file paths of the run. The **membership authority**. |
| `includeRoots` | the resolved scope profile | Directory roots of the scope (`.` for the whole repository). |
| `targets` | suite-core target descriptors (`{ relPath, kind }`, or a string `relPath`) | Explicit targets of the run, when any. |

Normalization, applied to every path: POSIX separators, no leading `./`, no trailing `/`, and empty values dropped.

**Membership rule.** Every selected path appears in the output exactly once, as a file node. No other file appears. The adapter applies no exclusion list, no dot-directory rule and no symlink rule. Suite-core has already decided membership, including the paths the audit lists under I1–I3 and D3. Below the effective roots, folders exist only as ancestors of selected files.

---

## Two root sets

The adapter derives two root sets. Neither replaces the other, and the adapter returns both.

```
suite-core inputs
      ↓ normalize targets (file target → containing folder)
declaredScopeRoots        (normalized, overlapping roots preserved)
      ↓ collapse nested folder roots into the outermost one
effectiveAddressingRoots  (what Structural Addressing addresses)
      ↓
prepareTreeCodebaseAddressedSnapshot
```

### declaredScopeRoots

The normalized but **uncollapsed** scope-root list, as sorted unique strings. It reproduces Tree's current scope-root derivation exactly, so the Tree projection keeps the envelope's `scopeRoots` and deepest-root scope binding.

First normalize the targets: normalize each `relPath`, drop empty and `.` targets, and deduplicate by `relPath`. The branch is chosen on the **normalized** targets. A run whose only target is the repository root (`--target .`, which suite-core passes as `{ relPath: '.', kind: 'dir' }`) has no normalized targets, so it falls through to the include-roots branch. For example, `--scope=docs --target .` keeps `['doc', 'docs']`, and `repo` keeps `['.']`.

1. **Normalized targets present.** Resolve each normalized target's kind:
   - use the descriptor's `kind` when it is `dir` or `file`;
   - otherwise `dir` when a selected path lies below the target;
   - otherwise `file` when the target itself is a selected path;
   - otherwise `dir`.

   Then map each target:
   - a directory target maps to its own path;
   - a nested file target maps to its containing folder (I4);
   - a repository-root file target maps to `.`.

   Duplicates are removed.
2. **No normalized targets, include roots present.** The normalized include roots, for example `['.']` for `repo`, `['src', 'test']` for `app`, or the embedded root `['calculogic-validator']`.
3. **Neither.** The unique first path segments of the selected paths. This is the top-level-entry fallback, which the `system` profile reaches: its profile has `includeRootFiles` but no `includeRoots`. Each top-level entry, file or folder, is then its own declared root, as in Tree today.

Overlapping roots stay in this list. `tree` and `tree/src` are both declared when both are targeted, or when file targets `tree/a.mjs` and `tree/sub/b.mjs` resolve to `tree` and `tree/sub`.

### effectiveAddressingRoots

The roots Structural Addressing addresses, derived from `declaredScopeRoots`:

- Every declared root that is a folder path (anything but `.`, and anything but a top-level-entry fallback root) is kept, **unless another kept folder root contains it**, in which case it is collapsed into the outermost one (D4). Collapsing happens after file targets have become containing folders, so overlap that appears only through containing folders is collapsed too.
- `.` is never collapsed into and never absorbs another root. A declared `.`, and the top-level-entry fallback, mean that selected paths under no folder root are addressed from the repository root: their top-level entries become root nodes directly. No `.` occurrence is emitted (§5.3 of the audit).

### Node tree construction

- Each effective folder root becomes a root folder node: `name` is its basename and `path` is its full repository-relative path. This holds even when no selected path lies below it. A targeted excluded directory (`--target=dist`, I3) selects no files, and its bare root is still emitted, as Tree does today. Ancestors above an effective root are **not** emitted, so the D2 phantom ancestors do not exist.
- Each declared folder root that was collapsed into an effective root is still emitted as a folder node beneath it, with its intermediate folders, even when no selected path lies below it. Tree emits every declared scope root today, so collapse corrects the nesting (D4) without dropping a root. With targets `tree` and `tree/empty`, and only `tree/a.mjs` selected, `tree/empty` becomes a child of `tree`. With `tree` and `tree/x/empty`, the intermediate `tree/x` is created so that `tree/x/empty` nests under it. That intermediate is a new occurrence, which Tree's detached root never had, and it is gated with D4.
- Each selected path is placed under the **deepest effective folder root containing it**. Intermediate folders below that root are created as folder nodes.
- A selected path under no effective folder root is placed from the repository root, with its top-level entry as a root node. Examples are a docs-profile `README.md` beside `doc`, a repository-root file target, and every path under `.` or the fallback.
- Folder nodes are created once per path. Sibling order is left to `prepareTreeCodebaseAddressedSnapshot`, which sorts by name, then type, then path.

---

## Output contract

```js
{
  declaredScopeRoots: ['tree', 'tree/src'],   // sorted, uncollapsed (Tree projection input)
  effectiveAddressingRoots: ['tree'],         // sorted, collapsed; `.` when top-level entries are addressed directly
  treeCodebaseInput: { scopeRoots: [/* tree-codebase nodes */] },
}
```

`treeCodebaseInput` is passed unchanged to `prepareTreeCodebaseAddressedSnapshot`. Its records provide `path`, `name`, `occurrenceType`, `addressPath`, `parentAddressPath`, `depth` and `orderIndex`. The Tree projection receives `declaredScopeRoots` from this output and must never reconstruct it from the collapsed set or from the addressed records.

---

## Invariants

- **Deterministic:** the same inputs always produce the same output.
- **Membership:** the set of file nodes equals the set of normalized selected paths.
- **One identity per path:** no path appears twice, even with overlapping declared roots.
- **Nesting:** every effective folder root is a root node, including one with no selected files, and no root node contains another root node's path.
- **Every declared root emitted, with its actual type:** every declared root other than `.` appears as a node. A folder root appears as a folder node, either as an effective root or nested beneath one. A top-level-entry fallback root keeps the type of the entry it names: under `--scope=system`, `package.json` is a declared root and a root-level **file** node, as Tree emits it today (`occurrenceType: 'file'`).
- **Declared roots preserved:** every declared root survives in `declaredScopeRoots` whatever the collapse does.
- **No `.` occurrence:** `.` is never a node.

---

## Relationship to Tree

- The Tree-owned projection maps the addressed records plus `declaredScopeRoots` onto Tree's snapshot contract. That covers the envelope, the `resolvedPath`/`actualName` aliases, the probe-contract concepts and the scope flags. Its rules live in `tree-owned/tree-structural-address-probe-contract.spec.md`, not here.
- The adapter carries no Tree vocabulary and makes no structural-home, semantic-home, folder-kind or placement decision (`ValidatorBridgeContracts.md` §3.5).
- Naming → Tree join namespace IDs are stamped by Tree wiring, as today. The adapter does not emit them.

---

## Expected differences from Tree's private producer

These differences are corrections, gated in #45:

- **D1:** root files outside every scope root are addressed at depth 0 with a `.` binding.
- **D2:** no phantom ancestors, so a folder scope root that a phantom sorted before keeps marker `A`.
- **D4:** collapsed overlapping roots get one nested identity per path. An empty collapsed root is kept, and nesting it can add intermediate folders below the outer root (`tree/x` for `tree/x/empty`).
- **O2:** `orderIndex` is non-null.

Every other address, parent, depth and type is identical. The comparison suite (`test/tree-structural-addressing.comparison.test.mjs`) and the #45 production parity test hold that line.

---

## Test expectations (step 2)

- **Root sets:** each derivation branch (targets, include roots, fallback) produces Tree's `scopeRoots` list exactly, for every input class in the audit's Coverage and limits section.
- **Branch selection after normalization:** a run whose only target is the repository root (`{ relPath: '.', kind: 'dir' }`) falls through to the include roots. `--scope=docs --target .` must give `['doc', 'docs']`, and `--scope=repo --target .` must give `['.']`, matching Tree.
- **Overlap:** overlapping inputs (directory targets, and file targets with nesting containing folders) keep every declared root, while the effective roots are collapsed. An empty collapsed root (`tree` + `tree/empty`, and `tree` + `tree/x/empty`) is still emitted, nested under the outer root.
- **Membership and identity:** the membership and one-identity-per-path invariants hold for every fixture.
- **Root-file handling:** a repository-root file target and a docs-profile root file are root-level nodes, and `.` absorbs no root.

---

## Non-goals

- Changing suite-core membership, scope profiles or target resolution.
- Changing the `tree-codebase` profile, marker strategies or `prepareTreeCodebaseAddressedSnapshot`.
- Making Addressing runner-visible or registering it as a validator slice.
- Deciding I1–I3 for get-tree output, or fixing D3.
- Retiring Tree's private snapshot modules (a separate #39 follow-on).
