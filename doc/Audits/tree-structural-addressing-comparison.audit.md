# Tree Private Addressing vs Shared Structural Addressing Comparison Audit

Status/Authority:
- **Status:** Audit (comparison only).
- **Authority level:** Snapshot evidence for planning the Addressing → Tree migration. It changes no runtime behavior.
- **Runtime authority:** The current runtime truth remains `doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md`, the Structural Addressing specs, and the suite contract.
- **Scope:** Compares Tree's private addressed snapshot with the shared Structural Addressing `tree-codebase` output on `main` at `9796573`.

References:
- Refs #40 (parent #39)
- Executable evidence: `test/tree-structural-addressing.comparison.test.mjs`

## 1. Summary

The two implementations use the **same addressing algorithm**:
- per-parent counters;
- upper-alpha markers for folders and arabic-number markers for files, with `AA` after `Z`;
- sibling sort by name, then occurrence type, then path;
- a `.` lineage separator.

Given the same occurrence set with the same roots, they assign identical address, parent, depth and type to every occurrence. This held on fixtures, on this repository, and on `Calculogic_React_App`.

The differences that remain fall into four groups:

- **Equivalent representation (E1–E3):** a namespace root occurrence in standalone whole-scope get-tree runs (not in the embedded layout), record order, and field names. A deterministic mapping covers each.
- **Intentional differences (I1–I5):** dot directories, empty folders, and differing walk exclusions. The migration must decide these explicitly. They also shift sibling markers, so occurrences present on both sides can get different addresses. Re-addressed over the shared membership, those occurrences map exactly. Nested file targets (I4) are rooted at their containing folder in Tree but at the file in get-tree. Root-level file targets agree. The join namespace IDs differ (I5), so producers cannot be swapped without a namespace decision.
- **Defects in Tree's private snapshot (D1, D2):** a corrupt lineage and depth for root files outside every scope root, and phantom root occurrences for ancestors above a nested target. The second one shifts a target's address exactly when a phantom ancestor sorts before that target among the root occurrences. That depends on names, not on how many targets there are.
- **A defect candidate in suite-core input collection (D3):** symlinks, to directories or to files, are collected as file paths. This affects Naming too.
- **Overlapping targets (D4), defective on both sides:**
  - Tree lists each path once but detaches an inner target from the outer one.
  - get-tree lists every inner path twice, under two identities.

  The migration needs an explicit deduplication decision.

**Recommendation:** make Structural Addressing the canonical producer of occurrence identity and nesting for Tree. Keep suite-core's scoped collection as the membership authority for validation runs. In other words, build Structural Addressing's input from the same `selectedPaths` that Naming and Tree already share, rather than from get-tree's filesystem walk. The migration then fixes D1 and D2 (and D4, once nested targets are collapsed into the outermost one), makes `orderIndex` real for the consumers that already read it, and keeps validation membership unchanged. I1–I3 stay a get-tree rendering concern unless decided otherwise.

## 2. What was compared

| | Tree private snapshot | Shared Structural Addressing |
|---|---|---|
| Producer | `tree/src/tree-occurrence-snapshot.logic.mjs` (`prepareTreeOccurrenceSnapshot`), wrapped by `tree/src/tree-structural-address-snapshot.logic.mjs` | `structural-addressing/src/structural-addressing-tree-codebase.logic.mjs` (`prepareTreeCodebaseAddressedSnapshot`) with `structural-addressing-marker-strategies.logic.mjs` |
| Input | flat `selectedPaths` + `targets` + `includeRoots`; folders are derived from file paths | a nested node tree (`scopeRoots[]` with `children[]`) |
| Production caller | Tree wiring, for every Tree run and scope | `addressing:get-tree` only (`scripts/addressing-get-tree.host.mjs`), validator scope only, built from a filesystem walk |

### Method

- **Layer A, algorithm parity:** both producers address the same occurrence set. Tree receives `selectedPaths`; Structural Addressing receives the node tree built from the same paths and roots.
- **Layer B, production inputs:** Tree wiring's `structuralAddressSnapshot` compared with the get-tree host's snapshot (`buildTreeCodebaseInputFromFileSystem` followed by `prepareTreeCodebaseAddressedSnapshot`) for `--scope=validator`. Paths are compared after removing get-tree's `calculogic-validator` source namespace.

Dimensions compared: address and marker identity, parent identity, depth, occurrence type, record membership, record order, field shape, scope and target handling.

### Reproducing

- `node --test --experimental-strip-types test/tree-structural-addressing.comparison.test.mjs`, also part of `npm test`. Each finding below names its test. The last test compares the live repository. It does **not** require repository membership to stay fixed. New files and folders pass as long as every difference falls into a documented category: shared occurrences map by E1 after re-addressing over the shared membership, and unshared ones are explained by one shared classifier, `listUnclassifiedMembershipDifferences`, which the membership fixture also exercises:
  - a Tree-only path is explained by a segment get-tree excludes by name (its list is read from the get-tree source) or by a symlink;
  - a get-tree-only path is explained by being in or being a dot directory, or by being a folder with no file descendant outside a dot directory, which covers nested empty folders and folders whose files all sit under a dot directory.

  The live test therefore also passes when run from a Git worktree. It fails only on a new, unclassified *kind* of difference, which then needs a classification decision before the test is updated.
- **Detection check (mutation testing on `ce59f17`).** Each producer was broken on purpose, one change at a time, and the comparison test was run, then each file was restored:

| Injected change | Result |
|---|---|
| Tree file markers start at 2 | detected (11 tests fail, including the live test) |
| Addressing sibling sort reversed | detected (9) |
| Addressing child depth off by one | detected (6) |
| Tree depth off by one | detected (9) |
| Tree wrapper `addressPath` wrong under `tree/` | detected (4) |
| Tree wrapper drops `parentAddressPath` | detected (5) |
| Addressing drops `parentAddressPath` | detected (8) |
| Tree folder/file tie-break reversed | not detected, and harmless: a folder and a file cannot share a name in one directory, and their counters are separate |

  Before this check, the wrapper-level changes went undetected or were caught only incidentally. Production-input comparisons did not check parent identity, and the shared-membership rebuild bypassed the wrapper Tree consumers read. The comparison now rebuilds through `prepareTreeStructuralAddressSnapshot`, first asserting that it reproduces the wiring's own snapshot from the wiring's inputs. It also checks address, parent, depth and type on every production-input comparison.
- The real-repository counts in §4 came from the same two layers, run from the Validator checkout against `/home/user/calculogic-validator` and `/home/user/Calculogic_React_App` with `prepareTreeStructureAdvisorInputs` and `prepareTreeCodebaseAddressedSnapshot` / `buildTreeCodebaseInputFromFileSystem`.

## 3. Classified differences

### Equivalent representation

**E1. Namespace root occurrence in standalone whole-scope get-tree runs.** Without `--target`, get-tree emits the scope root itself as occurrence `A` (path `calculogic-validator`, depth 0) and prefixes every path with that source namespace. Tree emits no occurrence for the `.` scope root.
- Mapping: get-tree address = `A.` + Tree address, and get-tree depth = Tree depth + 1.
- This applies only to the standalone layout, where the validator scope root is `.`. In embedded development the scope root is the real folder `calculogic-validator`. Both producers then emit it as occurrence `A`, with identical descendants and paths, so E1 does not apply. Test: "the embedded validator root is a real occurrence on both sides, so E1 does not apply".
- Test: "comparison B: a whole-scope get-tree run adds a namespace root occurrence".

**E2. Record order.** Tree orders records by sorting full paths (`localeCompare`). Structural Addressing emits records in pre-order traversal of the sorted sibling lists and states that order explicitly in `orderIndex`. Identity is unaffected, but the arrays differ. For example, with `doc/a`, `doc/a-b` and `doc/A`:
- Tree: `doc/a-b/x.md` before `doc/a/x.md`;
- Addressing: each folder followed by its own children.
- Test: "comparison A: record order differs".

**E3. Field names.** Tree records carry `resolvedPath`, `actualName`, `occurrenceMarker`, `parentResolvedPath`, `lineageSegments`, `markerSegments`, `scopeRootPath`, `isScopedRoot` and `isScopeTopOccurrence`. The wrapper adds `path`, `name`, `addressPath` and `parentAddressPath`. Structural Addressing records carry `address`, `addressPath`, `displayMarker`, `name`, `path`, `parentAddressPath`, `depth` and `orderIndex`. Outside the two snapshot modules, Tree runtime reads only these Tree-only fields:
- `resolvedPath`: occurrence classification, the advisor, Naming occurrence intake and the bridge contributor;
- `actualName`: classification, the semantic-naming relationship and intake;
- `isScopedRoot`: classification;
- `isScopeTopOccurrence`: classification parity evidence.

`lineageSegments`, `markerSegments`, `scopeRootPath`, `occurrenceMarker` and `parentResolvedPath` have no runtime consumers outside the snapshot modules. They are nonetheless contract-preserved concepts in `tree-structural-address-probe-contract.spec.md`, so the migration must keep them mappable (§5.4).

### Intentional membership differences (decision required)

**I1. Dot directories.** The suite walk skips them (`skipDotDirectories: true`). get-tree walks them, except `.git`; for example it includes `.github/workflows/ci.yml`. Root dotfiles such as `.gitignore` appear in both.

**I2. Empty folders.** get-tree includes them. Tree cannot represent them, because it derives folders from file paths. This applies to any folder with no file descendants, including the parent of a nested empty folder (`empty` above `empty/nested`). Combined with I1, it also applies to a visible folder whose files all sit under a dot directory: get-tree emits `examples` for `examples/.fixtures/case.json`, but Tree never collects that file and so never derives `examples`.

**I3. Walk exclusions.**
- Tree wiring (`WALK_EXCLUDED_DIRECTORIES`): `.git`, `.next`, `.reports`, `.turbo`, `.yarn`, `coverage`, `dist`, `node_modules`.
- get-tree (`EXCLUDED_WALK_NAMES`): `.git`, `node_modules`, `.reports`, `dist`, `build`, `coverage`.
- `build` folders are excluded only by get-tree, at any depth **below a walked folder**: the get-tree walk filters every *child* of that name, as both walks do for their own lists. A target that is itself named `build` (`--target=build`) is not a child, so get-tree walks it in full, and so does Tree, because `build` is not on its list. Both producers then emit identical records and addresses, and no membership difference applies.
- More generally, get-tree excludes **every entry below a walked folder** with an excluded name, of any type and at any depth, while the suite walk applies its list to directories only. So a regular file named `dist`, `coverage`, `.reports` or `node_modules` is collected by Tree and omitted by get-tree.
- get-tree excludes any entry named `.git`, while the suite walk excludes `.git` only as a directory. A `.git` **file**, as found in a Git worktree checkout root or a submodule, is therefore collected by the suite walk and becomes a Tree file occurrence. Naming receives that path too. get-tree omits it. `.next`, `.turbo` and `.yarn` are dot directories, so I1 skips them on Tree's side anyway.
- The lists also apply at different points. The suite walk skips an excluded directory before target filtering, so an explicitly targeted excluded directory (`--target=dist`) selects no files and Tree emits only the bare target root (`dist` = `A`). get-tree applies its exclusions only to the contents of a folder it walks, so the same target is walked in full (`dist/out.js` = `A.1`, `dist/sub/b.js` = `A.A.1`). Under the recommended adapter (§5.2), suite-core decides: an excluded-directory target contributes no files. Whether suite-core should honor an explicit target of an excluded directory is a separate suite-core question.

**Effect on shared occurrences.** A membership difference is not confined to the entries one side alone includes. An extra or missing sibling folder takes a marker, so the addresses of shared occurrences shift too. In the membership fixture, `.github` and `empty` (get-tree only) and `build` (Tree only) make `src` `B` in Tree but `A.C`, not `A.B`, in get-tree. The comparison test therefore re-addresses both producers over the shared membership (`compareOverSharedMembership`). After that, every shared occurrence maps by E1 again, so the shift is fully explained by I1–I3 and D3.

Tests for I1–I3: "comparison B: membership rules differ between Tree input collection and the get-tree walk" and "intentional difference I3: an explicitly targeted excluded directory is empty in Tree but walked by get-tree".

**I4. Nested file-target rooting.** With a file target below the repository root (`--target src/index.mjs`), Tree roots the snapshot at the file's containing folder. The folder is the scope-root occurrence (`src` = `A`, depth 0) and the file is addressed beneath it (`A.1`, depth 1). get-tree roots the file itself, so the file is the only occurrence, addressed `1` at depth 0. Both identity and membership differ (the containing folder exists only in Tree's snapshot). A repository-root file target (`--target README.md`) is **not** affected. Tree's containing scope is then `.`, which emits no occurrence, so both producers emit only the file at `1`, depth 0, with no parent.
- Recommended decision: the validation adapter keeps Tree's containing-folder semantics. A file target becomes a node under its containing folder, and that folder is the root. File-target identities stay as they are today, and Tree keeps the folder context its classification reads for a target file. get-tree's file-rooted rendering stays a display choice.
- **I3 applies before I4.** A file target beneath a directory the suite walk excludes (`--target dist/out.js`) selects no file in Tree. The suite walk skips `dist` before target filtering, so `selectedPaths` is empty and Tree's snapshot holds only the containing-folder root (`dist` = `A`). get-tree roots the targeted file itself (`dist/out.js` = `1`, depth 0), so its output contains a file Tree does not validate. Recommended decision: suite-core membership is decided first, and the adapter applies I4 rooting only to file targets that suite-core selects. An excluded-ancestor file target contributes no file, exactly like an excluded-directory target (I3), so I4 never adds a file to validation.
- Tests: "intentional difference I4: a nested file target is rooted at its containing folder in Tree but at the file in get-tree", "a repository-root file target is addressed identically by both" and "I3 before I4: a file target beneath an excluded directory selects no file in Tree".

**I5. Join namespace identity.** The Naming → Tree occurrence join keys on `addressProfileId + addressedSnapshotId + occurrenceAddress`.
- Tree wiring stamps its own namespace IDs (`tree-structure-advisor-address-profile` / `tree-structure-advisor-current-snapshot`) on the Naming occurrence bridge payload and on every observation.
- Structural Addressing exposes `profileId: 'tree-codebase'` and `snapshotOutputId: 'addressedTreeSnapshot'`.
- `doc/ValidatorSpecs/cross-cutting/naming-bridge-occurrence-identity-contract.spec.md` states that `snapshotOutputId` is related to `addressedSnapshotId` but not identical by contract. It leaves open whether the durable snapshot namespace is an output id, an instance id, a digest or a source id.
- Switching producers therefore changes every join identity, even when every address is stable, unless the namespace is decided explicitly.
- Recommended decision: the migration keeps Tree's current `addressProfileId` and `addressedSnapshotId` as compatibility values, so joins are unchanged. Adopting Structural Addressing's IDs is a separate, coordinated producer/consumer change with join-parity tests, made together with the identity contract's open question.
- Test: "intentional difference I5: the join namespace IDs differ even where every address agrees".

### Defects

**D1 (Tree). A root file outside every scope root gets a corrupt lineage and depth.**
- When a scope profile includes root files beside its include roots (`--scope=docs`: `README.md` beside `doc` and `docs`), the record is attributed to the first scope root. Its lineage is then sliced from an unrelated path: `scopeRootPath: 'doc'`, `lineageSegments: ['doc', 'ME.md']`, `depth: 1`.
- Its address (`1`) and parent (`null`) are correct. Structural Addressing gives depth 0.
- Observed on both repositories under `--scope=docs`.
- Test: "known Tree defect D1".

**D2 (Tree). Ancestors above a nested target become orphan root occurrences.**
- `collectAllOccurrencePaths` adds every ancestor folder of each selected file, including folders above a target scope root. With `--target tree/src`, Tree emits `tree` as an extra root occurrence. It is not the parent of `tree/src`, it takes a root marker, and it carries the lineage of a scope root it is not inside (`['naming/src']` in the two-target case).
- **Rule.** Root occurrences sort by basename, then type, then path. A target's address, and every address under it, shifts exactly when at least one phantom ancestor sorts before that target among the root occurrences. Phantoms that sort after every target only add markers of their own. The number of targets does not decide it.

| Targets | Tree roots | Structural Addressing roots | Target identity |
|---|---|---|---|
| `tree/src` | `tree/src` = `A`, `tree` = `B` | `tree/src` = `A` | unchanged |
| `tree/zz` | `tree` = `A`, `tree/zz` = `B` | `tree/zz` = `A` | shifted |
| `tree/a`, `tree/b` | `tree/a` = `A`, `tree/b` = `B`, `tree` = `C` | `tree/a` = `A`, `tree/b` = `B` | unchanged |
| `tree/src`, `naming/src` | `naming` = `A`, `naming/src` = `B`, `tree/src` = `C`, `tree` = `D` | `naming/src` = `A`, `tree/src` = `B` | both shifted (103 of 103 shared occurrences on this repository) |

- Tests:
  - "known Tree defect D2" (layer A);
  - "D2 rule: sibling targets keep their addresses when the phantom ancestor sorts after them";
  - "a single target is addressed identically when its phantom ancestor sorts after it";
  - "known Tree defect D2: a single target shifts when its phantom ancestor sorts first".

**D3 (suite-core input collection, defect candidate). A symlink is collected as a file path.**
- The suite walk treats every non-directory `Dirent` as a file, so any symlink enters `selectedPaths` and becomes a Tree file occurrence. That covers both a symlink to a directory (collected as a file, without its contents) and a symlink to a regular file. Naming receives the same paths.
- get-tree skips symlinks and rejects targets that traverse them.
- This is outside Tree and Structural Addressing, so it needs a separate suite-core decision.
- Test: the membership test (`src-link` for a directory, `src/a-link.logic.mjs` for a file).

**D4 (Tree and get-tree). Overlapping targets.** Repeatable targets can overlap, for example `--target tree --target tree/src`.
- Tree applies union semantics and emits each path once, but treats every target as a scope root. The inner target becomes its own root (`tree/src` = `A`, parent `null`) instead of a child of `tree` (`B`), so nesting is lost.
- get-tree walks each target as a separate root and does not deduplicate, so every inner path appears twice with two identities: `tree/src` as `A` and `B.A`. On this checkout that is 49 duplicated paths.
- Neither is a correct addressed snapshot, because each path must have exactly one identity and keep its real nesting.
- Recommended decision: before addressing, collapse targets nested inside another target into the outermost one. The inner target adds no files, and its paths are addressed once under the outer root.
- Test: "known defect D4: overlapping targets get one detached identity in Tree and two in get-tree".

### Observations

- **O1:** `--scope=system` has no include roots, so each root file becomes a `dir`-kind scope root (`isScopedRoot: true` on a file occurrence). Addresses are unaffected.
- **O2:** Naming's occurrence bridge payload (`naming-occurrence-bridge-payload.logic.mjs`), Tree's Naming occurrence intake and the bridge contributor already read `orderIndex` / `occurrenceOrderIndex`. Tree's snapshot never provides it, so that value is `null` in production today. Structural Addressing provides it.
- **O3:** get-tree supports only `--scope=validator`. Tree handles every scope and target descriptors, including file targets, whose rooting differs (I4). A migration cannot reuse get-tree's input builder for validation runs as it is.

### Coverage and limits

The classification above covers the input classes this audit exercised. It is not a claim about every possible input:

- **Scopes:** `repo`, `validator`, `app`, `docs`, `system` (layer A); `validator` in the standalone and embedded layouts (layer B, the only scope get-tree supports).
- **Targets:** none; one directory (nested, with its phantom ancestor sorting after or before it); sibling directories; directories in different branches; overlapping directories; a nested file; a repository-root file; an explicitly targeted excluded directory (`dist`: membership differs; `build`: identical); a file beneath an excluded directory (`dist/out.js`: no file selected in Tree).
- **Membership:** dot directories and dotfiles, empty folders, each walk-exclusion list (including a nested `build` folder, a `.git` file and a regular file with an excluded name), nested empty folders, a visible folder whose files all sit under a dot directory, symlinks to directories and to files.
- **Names:** repeated names in different branches, case and punctuation variants, more than 26 siblings.

Review of this audit found D2's single-target and sibling cases, the membership shift on shared paths, D4, I4, the excluded-target case and the excluded-ancestor file target one at a time, which shows the input space is larger than any fixed list. The migration should therefore not rely on this list being complete. Its adapter must carry parity tests for each input class above, and treat any new input class (for example a target outside the scope, a symlinked target, or a target with a trailing slash) as unverified until a test classifies it.

## 4. Real-repository results

**Validator repository (`main` at `9796573`):**
- Layer A, every scope (`repo`, `validator`, `app`, `docs`) and the targets `tree/src`, `tree/src` + `naming/src`, `src/index.mjs`: identical address, parent and type for all records. The only exceptions are D1 under `docs` (1 record) and D2 for nested targets.
- Layer B, `--scope=validator` with no target: 369 shared occurrences. All map by E1. get-tree adds only its namespace root. The checkout has no dot directories, empty folders, `build/` or symlinks, so I1–I3 and D3 do not appear here.
- Layer B, `--target tree/src`: 49 shared and identical. The only Tree extra is the D2 ancestor `tree`, which sorts after `src` and so shifts nothing here.
- Layer B, `--target tree/src --target naming/src`: 103 shared. All addresses differ because of D2.

**`Calculogic_React_App`:**
- Layer A for `repo` (180 records), `app` (56), `docs` (80), `system` (7) and `--target src/tabs` (11): identical, except D1 under `docs` (`README.md`).
- Layer B is not available: get-tree supports only `--scope=validator` (O3).

## 5. Recommended canonical shape and migration requirements

1. **Canonical producer:** Structural Addressing's `tree-codebase` profile. The algorithm is identical, it already provides `orderIndex`, and it roots targets directly, so D2 does not exist. A root file under a docs-style profile becomes a root-level node at depth 0, so D1 does not exist either.
2. **Membership authority:** keep suite-core's scoped collection (`collectSuiteScopedSnapshotInputs`) for validation runs. An Addressing-owned adapter builds the node tree from those `selectedPaths` and the scope roots (include roots or targets), collapsing any target nested inside another target first (D4) and rooting each file target that suite-core selects at its containing folder, as Tree does today (I4). A file target suite-core does not select, such as one beneath an excluded directory, contributes no file (I3 before I4). Naming and Tree then keep validating the same file set. I1–I3 become a get-tree rendering choice and not a validation change. Changing validation membership would be a separate, explicit decision.
3. **Scope-root representation:** decide whether validation snapshots emit an occurrence for the standalone `.` scope root (E1). Recommended: they do not. Non-`.` scope roots stay occurrences exactly as today: the embedded `calculogic-validator` root, include roots such as `src`/`test`, and directory targets. That matches today's Tree addresses in every layout, so classification and findings stay stable, and get-tree keeps its namespace root for standalone display.
4. **Field contract for Tree consumers:**
   - Provide `path`, `name`, `occurrenceType`, `addressPath`, `parentAddressPath`, `depth`, `orderIndex`, plus the two scope flags (`isScopedRoot`, `isScopeTopOccurrence`) that classification reads.
   - Either migrate the `resolvedPath`/`actualName` readers to `path`/`name`, or provide them as aliases for one transition.
   - `lineageSegments`, `markerSegments`, `scopeRootPath`, `occurrenceMarker` and `parentResolvedPath` have no runtime readers outside the snapshot modules. They still **cannot simply be retired**, because `doc/ValidatorSpecs/tree-owned/tree-structural-address-probe-contract.spec.md` (contract-preserved concepts) preserves parent path, scope binding, lineage segments, marker segments and the flattened occurrence marker. It allows field renaming only while each concept stays deterministically and explicitly mappable. The migration must therefore either provide these mappings from the Structural Addressing records, or land a coordinated update to that contract before removing any field:

     | Contract concept (current field) | Deterministic mapping from Structural Addressing records |
     |---|---|
     | flattened occurrence marker (`occurrenceMarker`) | `addressPath` |
     | marker segments (`markerSegments`) | `addressPath` split on the lineage separator `.` |
     | parent path (`parentResolvedPath`) | `path` of the record whose `addressPath` equals this record's `parentAddressPath`, or `null` |
     | scope binding (`scopeRootPath`) | `path` of the record's root ancestor (the record reached by following `parentAddressPath` to `null`) **if that ancestor is a declared scope root** (include root, directory target, the containing folder the adapter synthesizes as the root of a nested file target (I4), embedded root). Otherwise `.`, because the ancestor sits directly under the omitted standalone scope root (§5.3). The adapter must therefore carry the declared scope roots alongside the records, including each synthesized containing folder: without it, a nested file target's folder would bind to `.` and lose `isScopedRoot: true`, which classification reads. |
     | lineage segments (`lineageSegments`) | for a `.` binding, the path segments themselves. Otherwise the scope binding followed by the path segments below it. This matches today's definition. |
     | scoped-root marker (`isScopedRoot`) | `path` equals the scope binding |
     | scope-top marker (`isScopeTopOccurrence`) | lineage segments have length 1 |
     | depth (`depth`) | `depth` |

     Test: "comparison A: the probe contract's occurrence concepts are deterministically mappable from Structural Addressing records" derives every row from the Structural Addressing records and compares the result with Tree's fields. It covers include roots, a nested directory target, a nested file target (its containing folder binds as the scope root, `isScopedRoot: true`), a standalone whole scope, and a repository-root file target. In the last two, top-level records bind to `.` with `isScopedRoot: false`.

     For root files outside every scope root (D1), the mapping gives the corrected lineage and depth, not today's defective values. That change is expected and must be listed with the other identity changes.
5. **Ordering:** consumers must not depend on array order. Use `orderIndex` when order matters (E2).
6. **Identity parity requirements for the migration:**
   - Default scopes with identical membership must keep every existing occurrence identity.
   - Any membership difference must be accounted for explicitly, including the sibling-marker shifts it causes on **shared** paths, not only the entries one side alone includes.
   - Nested targets may change identity deliberately, as D2 corrections, but only where the D2 rule applies, possibly with a single target. Each such change must be listed.
   - Overlapping targets must resolve to exactly one identity per path with nesting preserved (D4). The recommendation is to collapse nested targets into the outermost one.
   - File targets keep their current identities: nested ones rooted at the containing folder (I4), and root-level ones as a root file occurrence, as both producers do today. This applies only to file targets suite-core selects; a file target beneath an excluded directory keeps contributing no file (I3 before I4).
   - The adapter's parity tests cover every input class listed under Coverage and limits (§3), and any input class outside that list is treated as unverified until a test classifies it.
   - Every changed occurrence identity must be assessed for its effect on the Naming → Tree occurrence joins, not only on Tree findings. Those joins (`addressProfileId + addressedSnapshotId + occurrenceAddress`) key on these addresses.
   - The join namespace IDs must be preserved (I5). The adapter keeps `tree-structure-advisor-address-profile` / `tree-structure-advisor-current-snapshot` as compatibility values. Any change to them is a separate, coordinated producer/consumer transition with join-parity tests.
7. **Expected behavior changes, to be gated like #14 and #34 (React-app report comparison):**
   - D1: depth of root files under docs-style scopes.
   - D2: the addresses of any target that a phantom ancestor sorts before, and everything under it. Targets sorting before every phantom keep their identity, whatever the number of targets.
   - D4: overlapping targets, once the deduplication decision is applied.
   - O2: `orderIndex` becomes non-null.

   For the default scopes without targets, the addresses should not change. Building the input from suite-core's `selectedPaths` keeps membership the same, so I1–I3 cause no sibling-marker shifts.
8. **Not part of the migration:** D3 (suite-core symlink collection, which affects Naming too) should be decided in its own issue.
9. **Order of work:** Addressing-owned input adapter and parity tests, then Tree wiring switches producers behind the comparison test (flipping the D1/D2 expectations deliberately), then the private snapshot modules are retired. Shared helper extraction (parent/child/sibling lookup) follows the living document's extraction rule, once Naming is the second consumer.

## 6. Out of scope

- Any runtime change to Tree, Structural Addressing, get-tree or suite-core collection.
- Deciding I1–I3 for get-tree output.
- Fixing D3.
- The registry lifecycle (#41).
