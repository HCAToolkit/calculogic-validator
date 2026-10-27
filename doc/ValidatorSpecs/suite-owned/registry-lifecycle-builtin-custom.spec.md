# Registry Lifecycle: Builtin and Custom Registry Sets (Issue #41)

- **Classification:** Normative target contract for the suite-level registry lifecycle. Sections marked *Current implementation reality* or *Historical* are Informative.
- **Ownership:** suite-owned lifecycle mechanics; slice-owned registry meaning (§9).
- **Status:** accepted contract, implemented through slice 3 (§13): suite lifecycle mechanics, `init-custom`, `status` and `use`, Naming, suite-core and Tree adoption of resolved roots, active-Custom resolution, report provenance and the config retirement. Of the advanced management surface (§12.2), `diff`, the update decisions document, `update` (`registry-added` inheritance, and the entry decisions `keep-custom`, `take-builtin` and merge-fields), the migration plan, `migrate`, and the edit document with `edit-check` and `edit` are implemented, as are the reference edge declarations, resolvers and resolution with the read-only `trace` (§12.11), the portable set's `export`, `import-check` and `import` (§12.12), and candidate preview (§12.13). This completes the original scope of #60. Deferred extensions are tracked separately and are not part of that scope: applying add-alongside (#78), a replacing import (#79) and optional per-run source choices (#80); the cross-slice compatibility check (§9.4) is implemented by #61. §14 records current reality.
- **Report-only note:** the lifecycle selects registry inputs and discloses them in report metadata. It adds no enforcement mode and no fix execution.
- **Issue lineage:** Refs #41; parent Refs #39. Decision record: #41 comments "Decision record (before the spec PR)", "Decision record: section 9 resolved" and "Decision record: activation, and the earlier customization draft".

> *Historical:* this file evolves `registry-customization-state-system-draft.md`, the earlier Naming-only draft. That draft placed custom files and the active switch inside the package, gave `--config` priority over the active state, left a Builtin fallback open, and switched the active set automatically from digest equality. All four are retired by §2, §6, §7 and §8. Its canonicalization and digest rules are kept in §5.

---

## 1) Purpose and model

Every registry-bearing slice ships its policy as **Builtin** registries. A consumer customizes policy by owning a **Custom** registry set, a complete, editable copy of Builtin, and choosing which of the two complete sets the Validator uses.

```text
package:   <slice>/src/registries/_builtin/*.registry.json   (Builtin set; immutable to consumers)
                │  registry:init-custom (copies every registry of every slice)
                ▼
consumer:  <repo>/.calculogic/registries/custom/            (Custom set; consumer-owned)
                │
           registry-state.json: activeSet = builtin | custom
                │
                ▼
           resolved set (loaded whole) → slice loaders/converters → slice interpretation
```

Rules that follow from the model:

- **Builtin is what Calculogic ships. Custom is what the developer owns.** Customization never modifies Builtin.
- **Custom is edited directly as JSON or through commands.** Commands are a guided, validating editor around the same files. They are never a second source of registry truth.
- **The active set is loaded whole** (§6). There is no runtime merging, overlaying or per-registry precedence.
- **A Custom set is a portable convention package** (§4.3). It can be shared, used as is, forked, compared with Builtin and brought forward through the update flow.

## 2) Vocabulary

| Term | Meaning |
|---|---|
| Registry | One policy-data file owned by one slice, for example Naming `roles` or Tree `repo-shape-policy`. |
| Registry id | `<slice>/<registry>`, for example `naming/roles`, `tree/repo-shape-policy`, `suite/scope-profiles`. The `<registry>` part is the file's basename without `.registry.json`. |
| Builtin set | Every registry in every slice inventory (§9.1), as shipped in the installed package. |
| Custom set | A consumer-owned copy of the complete Builtin set, possibly edited. |
| Baseline | The Builtin registries a Custom set is based on, recorded per registry. It starts as the exact Builtin set at initialization and advances per registry through updates (§4.3, §8.2). |
| Active set | The set a validation run uses: `builtin` or `custom`. |
| Canonical form | The comparison form of a registry payload (§5). |
| Registry digest | `sha256(stableStringify(canonicalForm))` of one registry. |
| Set digest | `sha256(stableStringify({ [registryId]: registryDigest, … }))` over registry ids in sorted order. |

## 3) Three separate facts

| Fact | Values | Derived from |
|---|---|---|
| `customExists` | `true` / `false` | presence of the `custom/` directory. Whether its manifest is readable is a separate condition (`manifest-malformed`, §7.1, §11.1). |
| `customDiffers` | `true` / `false` | `true` when any of these holds: a registry's Custom canonical digest differs from the current Builtin canonical digest; a completeness issue (§7.1); an orphan registry, meaning one present in Custom but absent from the current Builtin inventory (§7.2); or a Custom registry that cannot be parsed or canonicalized. An unparseable registry has no digest; it counts as differing, and its per-registry digest is reported as `null` in `status` output (§12.1). |
| `activeSet` | `builtin` / `custom` | `registry-state.json` (§4.2); `builtin` when the file is absent |

The facts are independent. In particular:

- `customExists: true, customDiffers: true, activeSet: builtin` is a supported state: the developer keeps their conventions while validating against Calculogic defaults.
- `customExists: true, customDiffers: false, activeSet: custom` is valid. Reports still disclose that Custom currently matches Builtin.
- `activeSet: custom` with `customExists: false` is a lifecycle error (§7).

## 4) Location and layout

### 4.1 Root

The registry lifecycle root is one conventional repo-local directory in the **validation target root**:

```text
<repo>/.calculogic/registries/
```

- Configuration does not relocate it. There is no upward search and no other discovery.
- A root override exists only as an internal API parameter for tests and package development. It is never consumer configuration.
- The root is a dot-directory, so default suite traversal does not collect it as validation candidates (Naming `walk-exclusions` `skipDotDirectories`). A Custom set that disables that rule makes its own files visible to validation, which is harmless.

**Containment.** Every lifecycle path the Validator reads or writes must resolve, after following symlinks (realpath), inside the validation target root. A symlink that stays inside the target is allowed. One that escapes it is not, and a symlink that cannot be resolved counts as escaping. Reads and writes follow the same rule:
- An escaping lifecycle root or `registry-state.json` is unreadable state (§7.1 item 5). It blocks every run that resolves the active set and every lifecycle command, and `init-custom` refuses before writing anything.
- A candidate root (§12.13) is not a lifecycle path. It is a temporary directory the Validator creates outside the repository and fills itself, from artifact bytes whose paths and hashes it has verified, for one run. Containment governs the persistent lifecycle paths a user owns; the candidate root is neither user-selected nor persistent, and is removed when the run ends.
- Inside `custom/`, an escaping path is unreadable and is reported through the existing conditions. It never blocks an inactive set (§7.2). An escaping Custom registry file is `invalid`, an escaping `.baseline/` copy is a `baseline-mismatch`, and an escaping manifest is `manifest-malformed`. The Validator does not read through an escaping path.
- Sharing one Custom set between repositories through a symlink is not supported. A portable set is copied, or exported and imported (§12.12), and becomes owned by the consuming repository (§4.3), so Baseline updates never act on a directory another repository also owns.

### 4.2 Layout

```text
.calculogic/registries/
  registry-state.json                 # local active selection; not part of the portable set
  .lifecycle-transaction/             # present only during, or after an interrupted, write (§4.6)
  custom/                             # the portable Custom set
    registry-set.manifest.json
    naming/<registry>.registry.json   # same filenames as Builtin
    tree/<registry>.registry.json
    suite/<registry>.registry.json
    .baseline/                        # exact copy of the Baseline Builtin set
      naming/<registry>.registry.json
      tree/<registry>.registry.json
      suite/<registry>.registry.json
```

- `registry-state.json` is kept apart from `custom/`, so sharing a convention set never shares someone's on/off choice.
- Custom files use the **same filenames as Builtin**. The `.registry.custom.json` suffix used inside the package today is retired.
- Slice folder names are the slice ids of the slice inventories (§9.1). Suite-core registries use `suite`.

### 4.3 `registry-set.manifest.json`

```json
{
  "schemaVersion": "1",
  "basedOn": {
    "registries": {
      "naming/roles": { "validatorVersion": "0.1.0", "version": "1", "digest": "<sha256-hex>" }
    }
  }
}
```

- `basedOn` records the Baseline **per registry**: the Validator version, registry `version` and canonical digest of the Builtin registry it was copied from. It is written by `registry:init-custom` and by later update/migration operations, never by validation runs.
- Per-registry provenance is authoritative, because a Baseline can legitimately combine registries from different Validator releases after a partial update (§8.2). Set-level values are derived from it:
  - the Baseline set digest is the set digest (§2) over the per-registry Baseline digests;
  - a single Baseline `validatorVersion` exists only when every registry shares one.
- **After a shape migration** (§8.3), a registry's entry describes the migrated Baseline B0′, never the current Builtin:
  - `validatorVersion` stays the release whose Builtin content B0′ holds. A migration changes representation, not content, so it never claims the current release;
  - `version` is the migrated version, and `digest` is B0′'s canonical digest;
  - an optional `migration` field records what B0′ was derived from: `{ "fromVersion", "fromDigest", "path" }`, the pre-migration Baseline `version` and digest and the ids of the transforms applied, in order. A later migration of the same registry keeps the original `fromVersion` and `fromDigest` and appends its transform ids to `path`.

  When `update` advances the registry's Baseline to the current Builtin (§8.2), the entry is rewritten without `migration`. `validatorVersion` never doubles as a migration marker.

  `migration`, when present, is exactly `{ fromVersion, fromDigest, path }`: `fromVersion` a non-empty string without surrounding whitespace, `fromDigest` a SHA-256 (64 lowercase hex characters), and `path` a non-empty list of such strings. Anything else makes the manifest malformed (§7.1 item 5). It is provenance only: it never changes how the entry's digest is trusted or how the registry is classified.

  ```json
  "naming/roles": {
    "validatorVersion": "0.1.0", "version": "2", "digest": "<B0′ sha256-hex>",
    "migration": { "fromVersion": "1", "fromDigest": "<B0 sha256-hex>", "path": ["roles-1-to-2"] }
  }
  ```
- The manifest carries no registry records and no active-set choice.
- Additional descriptive fields, such as a set name or author, may be added later as optional metadata. They never affect resolution.

### 4.4 Baseline copy

`custom/.baseline/` holds a byte-for-byte copy of each registry's Baseline Builtin version or, after a shape migration (§8.3), that copy migrated by the registry's declared transforms (B0′), whose derivation the manifest records (§4.3). A digest only tells you *that* Builtin changed; the copy tells you *what* changed. The copy is the merge base for the three-way comparison (§8.2), and a shared set carries its own merge base.

**Verification.** The manifest's per-registry digests (§4.3) are authoritative, and the copy is checked against them:
- **Drift detection** (§7.2) compares the current Builtin digest with the manifest digest. It never needs the copy.
- **Before any three-way comparison or Baseline advancement** (§8.2, §8.3), every expected `.baseline/` file must exist and its canonical digest must equal its manifest digest. A missing or mismatched copy is a `baseline-mismatch` for that registry, and update/migration operations refuse to proceed for it. Nothing is classified or advanced from an untrusted merge base.
- Validation runs report `baseline-mismatch` in `registrySet.customIssues` (§11.1). It never blocks a run, because resolution never reads the copy.

### 4.5 `registry-state.json`

```json
{ "schemaVersion": "1", "activeSet": "builtin" }
```

- `activeSet` is `builtin` or `custom`. Any other value is a lifecycle error.
- An absent file means `activeSet: builtin`.

### 4.6 Write protocol: lifecycle transactions

Commands that change an existing Custom set write through one suite-owned **lifecycle transaction**: `update` (§12.5), `migrate` (§12.9) and `edit` (§12.10). Commands that create a new set keep their own protocol, because they create `custom/` whole: `init-custom` (§12.1) and `import` (§12.12) stage the set inside the lifecycle root and rename the directory into place. *Correction (#60):* this section first had `import` write through the transaction. An import into an absent set creates `custom/` whole, which is the staging protocol's job; replacing an existing set would need deletions, which the transaction does not do, and is left to a later, separately scoped capability (#79).

A transaction replaces an ordered list of files. Its last file is the **commit point**. For a command that advances a Baseline (`update`, `migrate`) it is `registry-set.manifest.json`: until the manifest names a file's digest, no lifecycle check trusts that file as Baseline. A command that changes only Custom files (`edit`, §12.10) changes no manifest entry, so its commit point is its last Custom file.

1. **Prepare.** Every new file content is computed and checked before anything is written (for `update`, §12.5; for `migrate`, §12.9; for `edit`, §12.10). Every target, every directory the transaction creates, and the transaction directory itself must be contained (§4.1), and each target's nearest existing ancestor must be a directory.
2. **Stage.** The transaction directory `.calculogic/registries/.lifecycle-transaction/` is created exclusively. It sits outside `custom/`, so it is never part of the portable set.
   - The new contents are written into it.
   - So is a journal. The journal lists, in commit order, each target with the identity of the entry it replaces (`original`: a file's SHA-256 or a symlink's link text, or `null` when the target is new) and the SHA-256 of its new bytes (`sha256`), then the directories to create. The commit point's `sha256` is the commit digest.
   - The journal is written last and renamed into place, so a transaction directory without a journal has committed nothing.
3. **Commit, in order.** For each target, an existing entry is first moved into the transaction directory as a backup, then the staged file is renamed into place. Both stay on one file system, so each rename is atomic. An existing entry is a file or a symlink; a symlink is moved, and restored, as the link itself and is never followed. Any other existing entry at a target (a directory, FIFO, socket or device) is refused before anything is written.
   - For each registry the transaction advances, its `.baseline/` copy precedes its Custom file. The manifest is written once, last.
   - The manifest rename is the commit point. Before it, nothing trusts the new files; after it, the registry is fully advanced.
   - The transaction directory is then removed. Removal is always a retirement: one atomic rename takes the directory out of recovery's view (to `.lifecycle-transaction-retired-*`), then the copy is deleted. A partial deletion therefore never leaves a directory that recovery could misread, and a retired copy that cannot be deleted is swept by the next recovery. The sweep removes only what retirement produces (the exact generated name, an ordinary directory holding nothing, or only the retired transaction directory as an ordinary directory) and leaves any other entry alone. This applies wherever this section removes the transaction directory.
4. **Rollback.** Any failure before the commit point undoes every completed step in reverse:
   - a backup is restored;
   - a file that did not exist before is removed;
   - a created directory is removed when empty.

   The transaction directory is then removed and the command reports the failure. The registry is exactly as it was before the command.
5. **Recovery.** A process that stops between steps (killed, crashed) leaves the transaction directory behind.
   - Every partial state is visible. A Custom file without a manifest entry makes the manifest malformed: `status` reports it, and it blocks activation and active-Custom runs (§7.1 item 5). A `.baseline/` copy without a manifest entry is never read.
   - A partial state no manifest entry exposes is visible through the transaction itself: a Custom file already replaced for a registry whose manifest entry is unchanged (an interrupted `differs` update or migration), or any interrupted `edit`. While the transaction directory exists, the Custom set has the condition `interrupted-transaction`: `status` and validation runs report it (§11.1), and it blocks activation and active-Custom runs (§7.1 item 6) until the next writing lifecycle command recovers it. Validation runs never recover; they only read. The condition belongs to the lifecycle root, not to the files of `custom/`, so it is reported and blocks even when `custom/` is missing, and `init-custom` refuses while it holds: a new set would sit at the paths the journal names, which recovery restores or removes.
   - The next writing lifecycle command recovers first, from the journal. Every journal path is checked, lexically and by realpath (§4.1), before the commit point is read or anything is touched, and the transaction directory and its backup directory must exist as ordinary directories and the journal as an ordinary file, never symlinks. The transaction directory must hold exactly what the transaction wrote: `staged/` with regular files and `backup/` with files or symlinks, each named by a journaled step index (a backup only for a step that replaced an entry), and the journal. Both directories are created before the journal, so a journaled transaction without either has been altered, as has one with any other entry, name or type. Likewise, every step must be in a state its own commit sequence can produce, with every entry identified by the journal: an original is the journaled `original` exactly, and a new entry is a regular file holding the step's journaled `sha256`. A step replacing an entry is unstarted (original at the target, staged copy), backed up (original as the backup, staged copy) or applied (original as the backup, new entry at the target); a step creating an entry is unstarted (staged copy, no entry) or applied (new entry, no staged copy). Any other state has lost an original, or finds at a target something the journal does not identify (another entry, or a journal naming another target), and recovery refuses rather than report a rollback it cannot make or delete or overwrite an entry it did not write. Rollback records each step in `rolling-back/<i>` before undoing it; a marked step may also be already undone (the original restored at the target, a created entry removed), so an interrupted rollback is resumed by repeating the marked steps, which is idempotent. A committed transaction never has `rolling-back/`. A journal or directory that fails these checks is refused and kept. If the commit point holds its journaled `sha256`, the transaction committed and only its directory is removed. Otherwise it is rolled back as in item 4.
   - Recovery never reads or writes `registry-state.json`.
   - Lifecycle commands are not run concurrently against one target.
6. **Scope.** A transaction advances its command's atomic unit, every file of which it lists; for `update`, `migrate` and `edit` that unit is the selected registries of one slice (§12.5, §12.9, §12.10). A command that advances several units runs one transaction per unit, in a deterministic order. A failure stops the command: earlier units stay advanced and later ones are untouched.
7. **Outside this guarantee:** durability against power loss (fsync), and anything else modifying the repository while a lifecycle command runs. Containment (§4.1) is checked before staging and again by recovery; a symlink retargeted between that check and a rename is a concurrent modification, which no in-process check can exclude (Node offers no rename relative to a held directory handle). So is a journal rewritten consistently after a crash: recovery checks the journal against the entries it names, so it never deletes or overwrites an entry the journal does not identify, but a journal cannot authenticate itself; a step redirected to an absent path while its original sits in `backup/` restores that original to the path the journal names.
8. **A committed transaction** applied every step, so recovery accepts the commit point only when every step is in its applied state (item 5), checked by identity: every target, not only the commit point, is a regular file holding its step's journaled `sha256`, every replaced original is in its backup, nothing is left in `staged/`, and there is no `rolling-back/`. Otherwise the directory was altered and is refused and kept. Every journaled digest must be a SHA-256 (64 lowercase hex characters), and an `original` is exactly `{ kind: "file", sha256 }` or `{ kind: "symlink", link }`. The commit point's staged copy is consumed exactly when the commit point is applied, so a consumed staged copy with a commit point that does not hold the journaled bytes is refused rather than rolled back.

## 5) Canonical comparison and digests

Comparison decides whether Custom *differs* from Builtin rather than being merely formatted differently. Carried forward from the earlier draft:

- **Plain JSON only:** objects, arrays, strings, numbers, booleans and `null`.
- **Object keys** are sorted lexicographically at every depth (`stableStringify`, `src/core/validator-report-meta.logic.mjs`).
- **Ordered arrays** (meaningful sequences, such as priority lists or rule pipelines) keep their order.
- **Set-like arrays** (membership is the meaning) are sorted by their declared entry key, or by value for scalar arrays, with the stable-stringified item as the tie-breaker. Identical members collapse to one, since a repeated member does not change membership; keyed records that differ in any field stay distinct. Collapsing applies only to arrays the descriptor declares set-like: ordered arrays keep repetition, and keyed-record uniqueness is checked by slice validation (§9.3), never repaired by comparison.
- **Empty optional values** that a registry declares as omittable (for example an empty `notes` string) are normalized out.
- Arrays are **ordered by default**. A registry's descriptor (§9.1) declares which array paths are set-like, their entry keys and which optional fields are omittable.
- **The descriptor of a payload's version.** A payload is canonicalized with the descriptor of its own `version`: the `fromDescriptor` of the registry's migration step from that version (§8.3), and otherwise the registry's descriptor. A Baseline copy or Custom registry at an old version therefore stays verifiable against its recorded digest after a release changes the descriptor.

Digests are computed over canonical forms only. File formatting, key order, and the order or repetition of set-like array members never make Custom "differ".

## 6) Resolution: whole-set loading

- `activeSet: builtin` → every slice loads its registries from the package `_builtin/` directories.
- `activeSet: custom` → every slice loads every registry from `custom/<slice>/`.
- No registry is ever loaded from the other set during a run.
- The resolved set is passed to slices as **resolved registry roots**, one directory per slice. Slice loaders read their files from that root and keep their own validation, canonicalization and conversion (§9).
- **Activation gate:** Custom activation is available only when **every** registry consumer of every inventory slice reads its resolved root. A partially adopted suite would mix Custom and Builtin policy in one run and misreport provenance. The gate held from slice 3 (§13), when Tree adopted resolved roots, and it stays a standing rule:
  - every new reader of registry policy (a loader, a runtime consumer, or CLI output derived from a registry, such as the scope list in usage text) reads the resolved set of the run;
  - a Builtin read is allowed only where there is no validation run to resolve (direct library calls without a resolution), and it never happens inside a run that resolved a set.
- A per-run source choice may be supplied explicitly. It changes only that run's source, never changes `registry-state.json` and never writes Custom. The one implemented is a **candidate set** (§12.13): the run's slices read their registries from a temporary copy of a verified portable-set artifact, the candidate root, loaded whole like any set. A per-run "validate against Builtin" choice may follow later (§10, #80).

## 7) Validity of an active Custom set

### 7.1 Blocking conditions

When `activeSet: custom`, the run checks the Custom set **before any validation**. Each of these stops the run with a lifecycle error and an actionable notice. The run produces no report and exits non-zero, the same way an invalid `--config` does today:

1. **Missing set:** `customExists` is `false`.
2. **Incomplete set:** the current Builtin inventory contains a registry that Custom lacks, for example one introduced by a later Validator release.
3. **Incompatible version:** a Custom registry's `version` is not among the versions its slice declares as readable (§9.1).
4. **Invalid payload:** a Custom registry fails its slice's shape validation, or a reference between registries fails against the resolved set (§9.3).
5. **Unreadable state or manifest:** malformed `registry-set.manifest.json`. A manifest is also malformed when it lacks a `basedOn.registries` entry for any registry that is present in `custom/` **and** in the current Builtin inventory, because every Custom registry the engine reads must have authoritative Baseline provenance. Orphan registries (§7.2) are exempt: the engine never reads them, and they stay non-blocking with or without a manifest entry. A malformed `registry-state.json` blocks every run that resolves the active set, whichever set it would select, because the active set cannot be known. A candidate run (§12.13) does not use the active set and never reads the file.
6. **Interrupted transaction:** a lifecycle transaction directory exists (§4.6 item 5). Some Custom files may hold a command's new content while others do not, so the set is not one any command produced. The next writing lifecycle command recovers it first; `registry:use builtin` remains the way back meanwhile. It is reported alongside a missing set (item 1) when `custom/` is gone.

There is **no Builtin fallback**. Builtin never fills gaps in an active Custom set. The notice names each failing registry and gives the two ways forward: reconcile Custom, or run `registry:use builtin`, which keeps Custom intact.

### 7.2 Non-blocking conditions

These are reported (§11), never blocking:

- **Builtin drift:** Custom is complete, compatible and valid, but the current Builtin content differs from Custom's Baseline. The run proceeds on Custom.
- **Orphan registry:** Custom contains a registry absent from the current Builtin inventory, for example one removed or renamed in a later release. The engine does not read it. It is listed for review.

A lifecycle check runs on every validation run, whichever set is active. It is read-only. When `activeSet` is `builtin`, problems in an existing Custom set are reported as `registrySet.customIssues` (§11.1), not blocking, because Custom is not being used. Those problems are §7.1 items 2–6, except a malformed `registry-state.json`. This way a user validating with Builtin can see why their retained Custom set could not be activated.

## 8) Builtin updates and Custom inheritance

### 8.1 Rule

- **Builtin** advances automatically with the Validator package.
- **Custom** advances only by explicit user choice. No install, update or validation run writes Custom.
- When Custom is active and Builtin has drifted from Custom's Baseline, runs report the drift (§7.2) and change nothing.

### 8.2 Three-way classification

The update/inherit operation (part of the advanced management surface, §12) compares **Baseline**, **current Builtin** and **Custom**, per registry and per entry. Entries and their addresses come from each registry's comparison identity declaration (§8.4). Each difference is classified as:

| Class | Meaning | Default treatment |
|---|---|---|
| `builtin-added` | new in Builtin since Baseline, absent from Custom | offered for inheritance |
| `builtin-changed` | changed in Builtin, unchanged in Custom | review required |
| `builtin-removed` | removed from Builtin (a deprecation that keeps the entry is a `builtin-changed` entry whose values show the new status) | review required |
| `custom-only` | changed or added only in Custom | kept |
| `aligned` | changed identically in Builtin and Custom | no action; counts as decided |
| `both-changed` | changed differently in both | reconciliation required |
| `registry-added` | a whole new Builtin registry (blocking per §7.1 until resolved) | offered for inheritance |
| `version-changed` | Builtin moved a registry to a new `version` | migration required (§8.3) |

For each item the user chooses: keep theirs, take Builtin, merge selected fields, or add the Builtin form alongside theirs where the registry allows it. Nothing is overwritten without that choice.

**Baseline advancement is atomic per registry.**
- A registry's Baseline advances only when every difference in that registry has a recorded choice.
- It then advances to the current Builtin as a whole: its `.baseline/` copy and its `basedOn.registries` entry are rewritten together.
- A declined Builtin change stays in Custom as a deliberate Custom difference (`custom-only`) relative to the new Baseline. It is not offered again until Builtin changes that entry again.
- Registries the user has not reviewed keep their previous Baseline. A Baseline mixing releases is therefore expected, and per-registry provenance (§4.3) describes it exactly.

### 8.3 Shape migrations

- A Builtin schema change to an existing registry (for example a new required field, a renamed or a removed field) is applied to Custom only through an explicit, user-run migration that the registry's `version` gates.
- The owning slice owns the migration transform, which is deterministic.
- The migration plan (§12.8) previews the transformation, and the pre-migration Custom stays as it is until the user accepts the plan and applies it.
- Content inheritance (§8.2) and shape migration are separate operations.

**Model.** For a registry the comparison classifies `version-changed` (§12.3), let **B0** be its verified Baseline copy (§4.4) and **C0** its Custom registry, both at the manifest's `version` v0, and **B1** the current Builtin at v1.
- The registry's one declared path from v0 to v1 (below) is applied to **both** B0 and C0, giving **B0′** and **C0′** at v1. B0′ is derived from the Baseline copy, never from Builtin.
- **Invariant: migration changes representation and schema, not the user's content decision history.** B0′ is the Builtin content the Custom set was based on, in the new shape; C0′ is the user's content, in the new shape. A difference between B0 and C0 survives as a difference between B0′ and C0′, unless the shape change itself removes what differed (a dropped field).
- **The Baseline never advances to B1 because of a migration.** Afterwards B0′/B1/C0′ is an ordinary same-version three-way comparison (§8.2): a Builtin content change that shipped with the shape change is listed by `diff` against B0′ and decided through the decisions document and `update` (§12.4, §12.5), like any other content change. A shape-only release (B0 migrated equals B1) leaves no drift.

**Ownership.** The owning slice declares the path and owns each step's transform: a deterministic, pure function from a payload at the step's `from` version to a payload at its `to` version. It reads no file, no state and no `activeSet`, and it never sees Builtin. Defaults for a new required field, renames, and how an old shape maps to the new one are decided by the transform, never by suite core. Suite core only discovers the path, binds it to its inputs, runs it mechanically, checks its output, previews it and, once accepted, commits it. It never infers a default, a rename or a mapping, and never copies a Builtin value into a migrated payload.

**Declaration.** A registry's inventory entry (§9.1) lists `migrations`, a list of steps `{ from, to, transform, fromDescriptor }`:
- `from` and `to` are distinct, non-empty `version` strings without surrounding whitespace;
- `transform` is the id of the step's transform, a non-empty string without surrounding whitespace (versions and ids become manifest provenance, §4.3) in the slice's transforms. Transforms are code, so they live in the slice's migration module, which suite core reaches through a static bridge, the same way it reaches slice validation (§9.3);
- `fromDescriptor` is the canonical-form descriptor (§5) of payloads at version `from`, so a Baseline copy or Custom registry at that version stays verifiable.

The versions a registry can be migrated from (the `from` of its steps) are separate from its `readableVersions`, which the runtime reads. The declaration is checked against the slice's transforms, and each of these is a programming error:
- two steps from the same version (an ambiguous path);
- a cycle;
- a transform id the slice does not provide;
- a chain that ends at a version outside `readableVersions` (a missing intermediate step, or a target the engine cannot read).

So exactly one ordered chain leads from each declared version. The **path** from v0 to v1 follows that chain from v0 and stops at v1; a direct step is a path of one. The registry has no path when v0 is not a declared `from`, or when its chain never reaches v1.

**Running a path.** Each step receives a deep-frozen copy of the previous payload, and must return a plain JSON object whose `version` is the step's `to`. A throw (an attempted mutation included), a non-JSON value or a wrong `version` is a failed transform. The final payload must yield the comparison entries of the registry's declaration (§8.4).

**Sequencing.** The migration plan (§12.8) is read-only. `migrate` (§12.9) applies its accepted records: it writes B0′ to `.baseline/`, C0′ to Custom and the manifest entry of §4.3, through a lifecycle transaction (§4.6). The slice's registry-set validation (§9.3) gates the migrated Custom image only: C0′ is the runtime policy being created, while B0′ is a merge base and provenance, checked mechanically against the plan (§12.9 item 4) but never validated as a usable set.

### 8.4 Entry identity: comparison declarations

A three-way comparison needs to know what an **entry** of a registry is, and how to address it the same way in all three inputs. That is a separate concern from canonicalization (§5): the canonical-form descriptor says how a payload is normalized for digests; it does not say what is independently comparable. Each registry therefore declares a **comparison identity declaration** in its slice inventory (§9.1). It is slice-owned, and identity is never inferred from set-like canonicalization paths.

A declaration is a list of collections. Together they cover every root field of the payload except `version`, each exactly once. A path is a dot-separated field path, and only its last segment may be `*`, which stands for every property of a map.

| Kind | Meaning | Entries and addresses |
|---|---|---|
| `value` | One whole value: a scalar, an object, or an ordered list without a stable key. | One entry per path: `outcomes["canonical"]`, `semanticName`. With a final `*`, each map property is one entry. |
| `keyed` | Records identified by a stable key field. `ordered: true` marks first-match or otherwise order-significant collections. | One entry per record: `roles[role="adapter"]`. An ordered collection adds one order entry, `missingRolePatterns#order`, whose value is the key sequence. With a final `*` (a map of keyed lists), each map property is also a group-presence entry, `rolesByCategory["concern-core"]`, so an empty group stays visible. |
| `members` | A set of scalars. Membership is the meaning. | One entry per member: `reportableExtensions[".ts"]`. |

- Addresses are deterministic. Map keys and member values are written as JSON strings, and the key field is named in keyed addresses.
- Every input is canonicalized with the registry's descriptor (§5) before entries are extracted, so formatting, key order and set-like order never produce a difference.
- Two entries compare equal when their canonical values are equal.

## 9) Ownership

### 9.1 Slice-owned: the registry inventory

Every registry-bearing slice declares a registry inventory. For each registry, it declares:

- registry id and filename;
- readable `version` values (every registry in the inventory carries a `version` field);
- the canonical-form descriptor (§5): set-like array paths, their sort keys and omittable optional fields;
- the comparison identity declaration (§8.4): what an entry is and how it is addressed;
- the reconciliation capability declaration (§12.7): which comparison collections accept the entry choices merge-fields and add-alongside, and on which terms;
- the migration declaration (§8.3): the steps from older `version` values, each naming a transform of the slice's migration module and the descriptor of its source version;
- the reference edge declaration (§12.11): the entries of other registries of the same slice that its entries name, each edge with an id, a target registry and a target `keyed` collection, interpreted by the slice's reference resolver;
- a **registry-set validation entry point**, slice-owned (§9.3).

The inventory is the only list of registries the lifecycle knows. A slice that adds a registry adds it to its inventory, and the registry then belongs to both sets automatically. Slices with few registries today are expected to gain more as policy moves from code into registries; the lifecycle needs no change for that.

### 9.2 Suite-owned: lifecycle mechanics

Suite core (`src/core/registry-lifecycle/`, a new semantic area) owns:

- the root, layout, state file and manifest;
- the complete-set copy for initialization, including the Baseline;
- canonicalization driven by slice descriptors, plus digests (reusing the suite digest helpers);
- the three facts, completeness and version checks, and drift detection;
- whole-set resolution into resolved registry roots;
- the report provenance shape (§11);
- the lifecycle commands (§12);
- the mechanics of reference edges (§12.11): checking declarations and resolver output, forming target addresses, joining references to target entries, indexing and reporting. It never reads a field to find a reference.

Suite core does **not** interpret registry content. Its canonicalization is **comparison canonicalization** only (§5): descriptor-driven, used solely for digests and equality, and never handed to slices as runtime input. Runtime-form canonicalization (trimming, normalizing, deduplicating, converting) stays in slice loaders (§9.3). Suite core does not validate slice-specific shapes or decide what an entry means. This is set selection, not the universal policy-state layer that `ValidatorLoaderConverterRuntimeOwnership-Contract.md` §6.4 rules out.

### 9.3 Slice-owned: meaning

Each slice keeps:

- payload shape validation, canonicalization into runtime form, and conversion;
- reference edges between its registries, validated against the **resolved** set. For example, the Naming category-role perspective names Naming categories (its `rolesByCategory` keys), so a Custom categories registry is what the Custom perspective is checked against;
- the reference resolver (§12.11), which turns its declared edges into references from a source payload alone, and whose output its validation must agree with;
- the **registry-set validation entry point** declared in its inventory (§9.1):
  - Given a slice registry root, it runs the slice's own shape and reference validation over that root. It returns a deterministic list of `{ registryId, detail }` failures and builds no runtime state.
  - Suite core calls it on the active root before validation (failures block, §7.1 item 4).
  - It also calls it on an existing **inactive** Custom root (failures are reported as `invalid` in `customIssues`, §7.2) and from `status`.
  - Suite core only calls the entry point. The validation rules stay with the slice;
  - A registry that passes must mean exactly what the runtime will do. The entry point therefore rejects input the runtime would silently drop, merge or reinterpret: an undeclared field on a payload root, record or nested object; a string or key with surrounding whitespace, which loaders trim; two keys that are equal in the runtime's normalized form; a value outside the vocabulary the engine interprets; a value the runtime's comparison could never match; and an entry the runtime can never reach, such as one an earlier first-match entry already covers wherever that coverage is decidable. Otherwise `status` could report a Custom edit as valid that never takes effect;
- interpretation.

Naming keeps a registry-state owner for its loader responsibilities, reading from the resolved root. Tree keeps its direct builtin loaders, pointed at the resolved root.

### 9.4 Cross-slice compatibility

**Bridges.** Cross-slice values flow only through bridges. The emitting slice declares a bridge on the registry whose values it emits, as one item of `bridges`:

```js
bridges: [{ bridgeId: 'naming/folder-composition-structural-role-token', perspective: 'semantic-qualified-structural-container', consumer: 'tree/structural-role-tokens' }]
```

- `bridgeId` is a provenance string, written `<emittingSliceId>/<name>`, unique across all inventories.
- `perspective` names the one relationship perspective whose values take part. Suite core passes it to both resolvers and never interprets it.
- `consumer` is a registry of another slice's current inventory. A relationship within one slice is a reference edge (§12.11).

The consuming slice opts in on that registry with `interprets: [{ bridgeId }]`. Every bridge has exactly one interpretation, and every interpretation names a declared bridge. Nothing else is declared.

**Domains.** Each slice resolves its own side through a pure, source-only resolver, reached by a static bridge as in §8.3 and §12.11. The emitting slice's resolver receives the deep-frozen payload of its own registry and returns the values it can emit for the perspective, each with the keyed entry that emits it. The consuming slice's resolver returns the values it can interpret for the perspective. Each resolver selects with the same predicate its slice's runtime uses, so a reported domain is the domain that runs. Suite core checks declarations and resolver output mechanically and compares values by exact string equality. It never reads a registry field, interprets a perspective, or decides what a value means.

**Potential, not observed.** The comparison describes what one resolved registry set allows. It is independent of the validated repository's contents and of whether either slice ran. Its states mean:
- `compatible`: the resolved registries agree on the bridge's vocabulary for the perspective. It does not mean that any occurrence was interpreted, or interpreted correctly. Slice-level evidence about individual occurrences is separate and unchanged.
- `gaps`: at least one value the emitter can emit is not one the consumer can interpret. Each such value is listed with every entry that emits it. A gap describes a mismatch and assigns no fault; it may be an intentional Custom extension.
- `unavailable`: a bridge registry is not available in the set described, so no comparison is made. A side is available exactly when its `status` classification (§12.1) is not `missing`, `invalid` or `version-incompatible`. Each unavailable side is reported with that classification and its detail. An unavailable side is never treated as an empty domain, and is never replaced by Builtin or Baseline values.

Interpretable values that are never emitted are not reported.

**Reporting.** The comparison is computed once per described set by suite core and reported as `registrySet.bridgeCompatibility` (§11.1). Every surface carries that result and none recomputes it:
- a run describes its resolved set (`builtin`, `custom` or `candidate`), never an inactive Custom set;
- `status` describes the repository's Custom set, active or not, and omits the record when no Custom set exists (§12.1).

**Never repair, never block.** A gap or an unavailable bridge is never repaired, never blocks, is never a finding, and never modifies either slice's registries (§15). Whether a set may run is decided by §7.1 alone.

**Builtin is gap-free.** Every declared bridge is `compatible` over the Builtin set.

**First instance:** `naming/folder-composition-structural-role-token`, from `naming/folder-composition-patterns` to `tree/structural-role-tokens`, perspective `semantic-qualified-structural-container` (#61). The semantic-family bridge first named here carries values derived from filenames, which Tree treats as identities without a finite interpretable domain, so it has nothing to compare.

## 10) Configuration boundary

- Configuration never carries registry records.
- A **source for a single run** may be chosen: today a candidate set, by the `--registry-candidate` option (§12.13); a configuration-file choice, and a per-run Builtin choice, may follow later (#80). It never relocates the lifecycle root, never changes the active set and never writes Custom.
- Naming's record-carrying config surfaces are retired in the same slice in which Naming starts reading the resolved set (§13, slice 2). Whole-set loading leaves no contract-compliant way to keep applying them, and no consumer uses them. There is no overlay compatibility bridge:
  - `naming.roles.add` and `naming.reportableExtensions.add`: the customization path is editing Custom;
  - the hard-coded role `category` enum in `src/validator-config.schema.json` and `src/core/config/validator-config.logic.mjs`: categories are validated against the resolved set instead;
  - `naming.caseRules`, which accepts only `kebab-case`: the customization path is the Custom `naming/case-rules` registry.
- `strictExit` and `version` are unaffected.

## 11) Report provenance

### 11.1 Set-level: `registrySet`

The runner envelope and each direct slice report carry the block below. A candidate run carries its own form of it, described after the field rules.

```json
{
  "registrySet": {
    "activeSet": "builtin",
    "customExists": true,
    "customDiffers": true,
    "basedOn": { "builtinSetDigest": "<sha256-hex>", "validatorVersions": ["0.1.0"] },
    "builtinDriftSinceBaseline": false,
    "orphanRegistries": [],
    "customIssues": [
      { "registryId": "naming/roles", "condition": "invalid", "detail": "<slice validation message>" }
    ],
    "resolvedSetDigest": "<sha256-hex>",
    "bridgeCompatibility": {
      "set": "builtin",
      "bridges": [
        {
          "bridgeId": "naming/folder-composition-structural-role-token",
          "perspective": "semantic-qualified-structural-container",
          "emitter": { "sliceId": "naming", "registryId": "naming/folder-composition-patterns" },
          "consumer": { "sliceId": "tree", "registryId": "tree/structural-role-tokens" },
          "state": "compatible",
          "uninterpretable": []
        }
      ]
    }
  }
}
```

- `basedOn` and `builtinDriftSinceBaseline` are present only when `customExists` is `true` **and** the manifest is readable. With a malformed manifest they are omitted, and `customIssues` carries `manifest-malformed`.
- `basedOn.builtinSetDigest` is the derived Baseline set digest (§4.3), and `basedOn.validatorVersions` is the sorted list of distinct per-registry Baseline Validator versions.
- `customIssues` lists the non-blocking problems of an inactive Custom set (§7.2), sorted by `registryId` then `condition`, with a `null` `registryId` sorting before every string. The list is empty when there are none.
- `condition` is one of:
  - `missing`: a current Builtin registry is absent from Custom;
  - `version-incompatible`;
  - `invalid`: a shape or reference failure;
  - `manifest-malformed`: `registryId` is `null`;
  - `baseline-mismatch`: a `.baseline/` copy is missing or does not match its manifest digest (§4.4);
  - `interrupted-transaction`: `registryId` is `null`; a lifecycle transaction directory exists (§4.6 item 5, §7.1 item 6). It is the one condition reported when `customExists` is `false`, because it belongs to the lifecycle root rather than to the set's files.
- `detail` for `invalid` comes from the slice's registry-set validation entry point (§9.3), or from the parse error for an unparseable registry.
- With an active Custom set, `customIssues` can contain only `baseline-mismatch`, because every other condition blocks the run (§7.1).
- `bridgeCompatibility` is the cross-slice compatibility of the run's resolved set (§9.4), never of an inactive Custom set:
  - `set` is derived from the same source as the enclosing block: `activeSet`, or `candidate` for a candidate run. It is never chosen on its own.
  - `bridges` lists every declared bridge, sorted by `bridgeId`: `{ bridgeId, perspective, emitter: { sliceId, registryId }, consumer: { sliceId, registryId }, state }`, plus `uninterpretable` for `compatible` and `gaps`, or `unavailable` for `unavailable`.
  - `uninterpretable` is `[{ value, emittedBy }]`, sorted by `value`. `emittedBy` lists every emitting entry as a canonical keyed entry address (the §12.11 address form), sorted ordinally. It is `[]` when `compatible`.
  - `unavailable` is `[{ side, registryId, condition, detail }]`, `emitter` before `consumer`. `condition` and `detail` are the side's `status` classification and detail (§12.1); `detail` is `Absent from the Custom set.` for `missing`.
  - It never changes `customIssues`, a registry's classification, findings, the exit status or `resolvedSetDigest`. A run's resolved set is never blocked by its bridges, so in a run `state` is `compatible` or `gaps`.
- **Candidate run** (§12.13): `registrySet` is `{ source: "candidate", candidate: { artifactSha256, exportedBy }, customDiffers, basedOn?, builtinDriftSinceBaseline?, orphanRegistries, customIssues, resolvedSetDigest }`. Every assessment field describes the candidate, by the rules above; `customIssues` can contain only `baseline-mismatch`, as for an active Custom set. `bridgeCompatibility` (with `set: "candidate"`) describes the candidate's bridges. `activeSet` and `customExists` are omitted, because they describe the repository's lifecycle state, which the run does not use. Runs of the active set keep the shape above, unchanged.

### 11.2 Per slice: `registryProvenance`

Each slice report carries its own registries:

```json
{
  "registryProvenance": {
    "naming/roles": { "source": "custom", "digest": "<sha256-hex>" }
  }
}
```

- `source` is the run's source: the active set, or `candidate` for a candidate run (§12.13).
- A slice reports its own inventory registries. A registry another slice reads through a bridge or projection (for example Tree reading `naming/folder-composition-patterns` through the Naming-owned folder-composition projection) is disclosed by its owning slice's provenance and by the set-level `resolvedSetDigest`; it always comes from the same resolved set.
- `digest` is the canonical digest of the resolved registry. An active registry always has one, because a registry that cannot be parsed blocks an active-Custom run (§7.1).
- The `null` digest of an unparseable registry (§3) appears only in `status` output and in the diagnostics behind `customIssues`.

### 11.3 Naming's transitional fields

Naming's `registryState`, `registrySource` and `registryDigests` stay for one transition as **derived, deprecated** fields. They are never maintained independently:

- `registryState` = the run's source: `registrySet.activeSet`, or `candidate` for a candidate run (§12.13).
- `registrySource` = the run's source, the same value. The `config` value is retired with the config record surfaces.
- `registryDigests` keeps its `{ builtin, custom, resolved }` shape, each a digest of Naming's resolved payload:
  - `builtin`: from the Builtin set; unchanged.
  - `resolved`: from the run's resolved set: the active set, or the candidate in a candidate run; unchanged for runs without a Custom set.
  - `custom`: from the consumer's Custom set when it exists and resolves validly; otherwise equal to `builtin`. A candidate run does not read the repository's Custom set, so there it equals `builtin`.

  **Documented value change:** today `custom` is the digest of the packaged in-package `_custom/` payload. Slice 2 moves that payload into test fixtures, so production keeps no hidden legacy policy just for this field. From slice 2, a run without a Custom set reports `custom` equal to `builtin`.

The transition ends in a later, deliberately scoped change. The React app captures reports, so the fields are not removed inside #41.

### 11.4 Baseline entry comparison for a resolved registry (slice-facing)

A slice may need to know how each entry of a resolved registry relates to the Baseline the run's assessment verified. One example is a per-parameter provenance (Tree spec, Stage 2 S2.10 RR4).

**Ownership.** The lifecycle owns this comparison, because it owns Baseline verification (§4.4) and entry identity (§8.4). A slice never reads `.baseline/` copies or the manifest itself, and never re-verifies digests. The interface is generic: it uses only comparison declarations and has no slice vocabulary.

**Inputs.** The run's resolution (Builtin, Custom or candidate), one registry of the run's resolved set, and that registry's resolved payload. The source is the registry's own `registryProvenance` source (§11.2). A Custom or candidate resolution also carries an opaque Baseline reference, the lifecycle paths and inventory its assessment used, which slices hand back unread. A Builtin resolution carries none.

**Output.** For each entry the registry's comparison declaration identifies in the resolved payload, in ordinal address order, one of five states, decided in this order:

| State | When |
| --- | --- |
| `not-applicable` | The run's source is Builtin. There is no comparison Baseline |
| `unverifiable` | No comparison can be claimed. A diagnostic reason is returned with it: `baseline-version-undescribed` (the manifest version has no descriptor in this release), `baseline-mismatch` (the copy is missing, unreadable, escapes the target, or its digest differs from the manifest), or `baseline-not-comparable` (the verified copy cannot be addressed under the registry's current comparison declaration, for example a field a later version removed) |
| `matches` | The verified Baseline has an entry with the same identity and an identical canonical value |
| `differs` | The verified Baseline has an entry with the same identity and a different value |
| `absent` | The verified Baseline has no entry with that identity, for example a record added by a later version of the registry |

`unverifiable` is never turned into `matches`, `differs` or `absent`.

**Comparison basis.** Each payload is canonicalized with the descriptor of its own `version` (§5) and addressed under the registry's current comparison declaration (§8.4). The Baseline is never migrated first: a record a later version added is `absent`, not a value a transform would supply. Two entries match when their canonical values are identical. A resolved payload the current declaration cannot address is a programming error in the slice's declarations, never a comparison state.

**Read-only.** The comparison verifies the Baseline copy's digest against the manifest again as it reads it, with the assessment's own rule. It writes nothing, and never changes a payload, Baseline copy, manifest or lifecycle state.

**Which Baseline.**
- **Custom run:** the Custom set's manifest and `.baseline/` copies.
- **Candidate run (§12.13):** the candidate artifact's own manifest and `.baseline/` copies (§12.12), never the repository's Custom set.

No Baseline is ever manufactured, and current Builtin is never used as one.

**Reachability.** Under §7.1, a missing manifest, or a manifest without an entry for a present registry, blocks the run, so a slice never sees those cases. `baseline-mismatch` and an undescribed manifest version do not block (§7.2; `import-check`'s refusal of an unverifiable Baseline does not apply to runs). So `unverifiable` is reachable in successful runs.

**Status.** Implemented as `compareResolvedRegistryWithBaseline` (calculogic-validator#102). Tree's Semantic Home parameter loader consumes it (Tree spec S2.9).

## 12) Commands

### 12.1 Lifecycle commands (#41)

Bin `calculogic-validator-registry`, with root npm scripts `registry:init-custom`, `registry:use` and `registry:status`. Each operates on the validation target root.

| Command | Effect | Writes |
|---|---|---|
| `init-custom` | Copies every registry of every slice inventory from Builtin into `custom/`, writes `.baseline/` and the manifest. Refuses if `custom/` already exists, a lifecycle transaction is pending (§4.6 item 5), or `registry-state.json` selects `custom` (below). | `custom/**`; `registry-state.json` only if absent (written with `activeSet: builtin`) |
| `use builtin` \| `use custom` | Sets the active set. `use custom` runs the §7.1 checks first and refuses on a blocking condition, naming each failing registry. `use builtin` needs no check: it is always the way back, also when Custom is missing or invalid. A contained but malformed `registry-state.json` is replaced; an escaping one is refused (§4.1). | `registry-state.json` only; never `custom/` |
| `status` | Prints the three facts, completeness, version compatibility, drift, orphans and `customIssues`, with one classification per registry (below). Deterministic JSON on stdout. | nothing |

**`status` per-registry entries** have the shape `{ registryId, classification, customDigest, builtinDigest, baselineDigest, baselineMismatch, detail? }`.

`classification` is the first of these that applies:

| # | Classification | Applies when |
|---|---|---|
| 1 | `missing` | the registry is absent from Custom |
| 2 | `orphan` | the registry is absent from the current Builtin inventory |
| 3 | `invalid` | the registry is unparseable (`customDigest: null`) or fails the slice's registry-set validation (§9.3); `detail` carries the reason |
| 4 | `version-incompatible` | the registry's `version` cannot be read by the current engine |
| 5 | `baseline-unavailable` | the manifest is malformed (§7.1 item 5, which includes a missing entry for a registry present in `custom/`), so no Baseline digest is trusted (`baselineDigest: null`) |
| 6 | `aligned` | Custom and Builtin have the same canonical digest, but both differ from the Baseline, for example after a manual adoption of an upstream change. There is no conflict; an update advances the Baseline without asking. |
| 7 | `both-changed` | Custom and Builtin both differ from the Baseline, and from each other |
| 8 | `custom-modified` | only Custom differs from the Baseline |
| 9 | `builtin-changed` | only Builtin differs from the Baseline |
| 10 | `unchanged` | none of the above |

- Classes 6–10 compare canonical digests against the manifest's Baseline digests.
- **Nullable fields.** `customDigest`, `builtinDigest` and `baselineDigest` are always present, and are `null` exactly when there is no value:
  - `customDigest` is `null` for `missing`, for any unparseable registry, whether `invalid` or an `orphan` that also fails to parse, and for an `orphan` without a retired descriptor;
  - `builtinDigest` is `null` for `orphan`;
  - `baselineDigest` is the manifest's Baseline digest whenever the manifest is readable and has an entry for the registry. That includes a `missing` registry the user deleted after initialization, so it stays distinguishable from one introduced after the Baseline. It is `null` only when there is no such entry (for example, a registry introduced after the Baseline), for `baseline-unavailable`, and whenever the manifest is malformed;
  - `detail` is present only for `invalid`, `version-incompatible`, and an `orphan` that fails to parse (carrying the parse error). An orphan is never validated by its slice, because no current inventory entry describes it.
- With `customExists: false`, `status` prints only the set-level facts and an empty per-registry list.
- **`bridgeCompatibility`** (top level, §9.4) describes the repository's Custom set, active or not, with `set: "custom"` and the bridge shape of §11.1. It is omitted with `customExists: false`; it never describes Builtin in place of a missing set. Because `status` meets sets that cannot run, availability is decided per side from that side's classification in this same output, and no other way:
  - a side whose classification is `missing`, `invalid` (including a registry that parses but fails the slice's validation, §9.3) or `version-incompatible` is unavailable. A `baseline-unavailable` side is available, because its condition concerns the manifest, not the payload;
  - with either side unavailable, the bridge is `unavailable`, listing each unavailable side. No resolver runs for that bridge, the available side's domain is not reported, and nothing is filled from Builtin or the Baseline. Missing information is never an empty domain;
  - with a malformed manifest the registries keep their payload classes or become `baseline-unavailable`, so the comparison is made; the manifest problem is reported as before (`manifestError`, `customIssues`);
  - while a lifecycle transaction is pending (`interrupted-transaction`, §4.6 item 5), the comparison is made over the files as they are, as `trace` does, and the block carries `interruptedTransaction: true`. It is diagnostic evidence about those files, never a statement that the set is valid or committed: the transaction condition keeps its authority, and the comparison neither clears it nor enables activation.
- The block never decides activation. `use custom` and active-Custom runs are decided by §7.1 alone: an `unavailable` bridge comes with its registry's own blocking condition, and a bridge with `gaps` blocks nothing.
- When the manifest is malformed, `status` also prints a top-level `manifestError` with the parse detail. Every registry that is not class 1–4 is then `baseline-unavailable`, and `customDigest` and `builtinDigest` are still reported.
- `baselineMismatch` is reported independently of `classification` (§4.4):
  - it is `true` or `false` when the manifest is readable and has an entry for the registry;
  - it is `null` when there is no trusted manifest digest to check against (a malformed manifest, or no entry, such as for a registry introduced after the Baseline), for an orphan whose canonical-form descriptor this release does not know, and when the manifest entry's `version` is one this release has no descriptor for: neither readable nor a declared migration source (§5, §8.3). Such a copy is unverifiable, which is never reported as a mismatch.
- **Retired descriptors.** The manifest digest of a registry is computed with its canonical-form descriptor (§5), so verifying a copy needs that descriptor. When a release removes or renames a registry, the slice keeps the registry's descriptor in a retired inventory. An orphan's Custom digest and Baseline copy are then canonicalized with it. An orphan without a retired descriptor, such as one from a newer release, has a `null` `customDigest` and `baselineMismatch`: the copy is unverifiable, which is never reported as a mismatch.

**Activation rule:**
- `init-custom` creates the set and its initial state (Custom exists and does not differ). It does **not** change the active set.
- **No activation by creation.** A command that creates a new Custom set (`init-custom`, `import`, §12.12) refuses, writing nothing, while `registry-state.json` selects `custom`. Such a state names a set that does not exist, so every run stops (§7.1 item 1); a set created under it would be used by the next run without `use custom` having checked it, which bypasses the activation gate although `activeSet` is never written. `use builtin` first, then create the set and activate it with `use custom`. *Correction (#60):* `init-custom` first lacked this refusal, which only `import` had.
- `use` is the only operation that changes the active set.
- Direct edits, command-guided edits, comparison, sync, migration and inheritance may change `customDiffers`, digests and status. They never change `activeSet`.
- Later editing commands may offer activation as an explicit prompted follow-up, never perform it silently.

### 12.2 Advanced management surface (#60)

Diff, edit (add, change, remove), inherit/update (§8.2), trace (declared references and their direct dependents, §12.11), import/export of convention sets, candidate preview and migrate (§8.3). Their contracts are fixed by this spec, and #60 implements them in slices:
1. `diff` (§12.3);
2. the update decisions document (§12.4);
3. `update` (§12.5), which consumes that document as its only authority for choices. It applies `registry-added` inheritance and the entry decisions `keep-custom`, `take-builtin` and merge-fields (§12.6, §12.7). add-alongside has its contract and capability declaration (§12.7) and is applied once a slice declares it (#78);
4. the migration declaration (§8.3), the read-only migration plan (§12.8) and `migrate` (§12.9), which applies its accepted records;
5. the edit document, `edit-check` and `edit` (§12.10);
6. reference edges and `trace` (§12.11): first the contract, then the slice declarations and resolvers with their conformance tests, then `trace` (all implemented);
7. the portable set: `export`, `import-check` and `import` (§12.12);
8. candidate preview (§12.13): a run whose registry source is a portable-set artifact.

Interactive prompting may only generate or edit these documents; it is never a separate source of decisions.

### 12.3 `diff` (read-only)

`calculogic-validator-registry diff [registryId…]` prints the three-way comparison of §8.2 as deterministic JSON. It writes nothing and never advances a Baseline.

- **Registry classes**, the first that applies:
  1. `orphan`: present in Custom, absent from the current Builtin inventory. Not compared.
  2. `registry-added`: a current Builtin registry with no Baseline entry. Its Builtin entries are listed as `builtin-added`. Custom lacks the registry; a Custom copy without a Baseline entry makes the manifest malformed (§7.1 item 5).
  3. `version-changed`: Builtin moved the registry to a `version` other than the Baseline's. Migration is required (§8.3, §12.8), so entries are not compared.
  4. `not-comparable`: no trusted three-way input exists. `reason` is the registry's `status` condition: `missing`, `invalid`, `version-incompatible`, `baseline-unavailable`, or `baseline-mismatch` (the `.baseline/` copy does not match its manifest digest, §4.4). Nothing is classified from an untrusted merge base.
  5. `differs`: at least one entry differs. Only differing entries are listed.
  6. `unchanged`.

  A malformed manifest leaves no trusted Baseline, so every non-orphan registry is then `not-comparable` with reason `baseline-unavailable`.
- **Entries** have the shape `{ address, class, baseline?, builtin?, custom? }`, where `class` is one of the §8.2 entry classes. Each value field holds the entry's canonical value in that input and is omitted when the entry is absent there.
- **Ordering:** registries are sorted by id and entries by address, in ordinal order. Each registry and the whole output carry counts per class.
- With `customExists: false`, the output carries only the set-level facts and an empty registry list.
- Registry ids given as arguments restrict the output to those registries. An unknown id is a usage error.

### 12.4 Update decisions document (read-only)

The choices `update` will apply (§8.2) are recorded in a plain JSON document that the user keeps, reviews and passes to the command. The lifecycle never reads it implicitly and never stores it under `.calculogic/registries/`. Two read-only commands support it:
- `decisions-template [registryId…]` prints the document for the current comparison, with every decision `null`. Ids restrict it as they restrict `diff`; an unknown id is a usage error.
- `decisions-check <file>` checks a document against the current comparison and prints the result. It exits 1 when there is any problem. The path is resolved from the working directory.

Both need a Custom set and write nothing.

**Shape:**

```json
{
  "kind": "calculogic-registry-update-decisions",
  "schemaVersion": "2",
  "registries": [
    {
      "registryId": "naming/roles",
      "class": "differs",
      "basedOn": { "baselineDigest": "…", "builtinDigest": "…", "customDigest": "…" },
      "entries": [
        {
          "address": "roles[role=\"adapter\"]",
          "class": "builtin-changed",
          "choices": ["keep-custom", "take-builtin", { "kind": "merge-fields", "fieldGroups": [["definition"], ["status"]] }],
          "decision": null
        }
      ]
    },
    {
      "registryId": "naming/new-thing",
      "class": "registry-added",
      "basedOn": { "baselineDigest": null, "builtinDigest": "…", "customDigest": null },
      "decision": null
    }
  ]
}
```

- **Decidable registries.** A registry is in the template when the current `diff` (§12.3) classifies it:
  - `registry-added`: one registry-level `decision`, and no `entries`;
  - `differs`, with at least one entry Builtin changed (any class but `custom-only`): `entries` lists each entry whose class takes a decision, and may be empty when every Builtin change is `aligned`. Its Baseline can then advance with nothing to decide.

  Every other registry has nothing to decide: `unchanged`, `differs` with only `custom-only` entries, `version-changed` (migration, §8.3), `not-comparable` and `orphan`.
- **Decisions.**

  | Applies to | Decisions |
  |---|---|
  | `registry-added` (registry level) | `inherit` |
  | `builtin-added`, `builtin-removed` (entry level) | `keep-custom`, `take-builtin` |
  | `builtin-changed`, `both-changed` (entry level) | `keep-custom`, `take-builtin`, and where the entry's collection declares them (§12.7), `{ "kind": "merge-fields", "takeBuiltin": [field…] }` and `{ "kind": "add-alongside", "key": … }` |
  | `custom-only`, `aligned` | none: kept, or counted as decided (§8.2); never listed |

  `null` is the only spelling of "no decision". `keep-custom` is an explicit choice, recorded the same way as `take-builtin`. A structured decision (merge-fields, add-alongside) is an object with exactly the fields shown, and is valid only in schema version `"2"`.
- **Schema versions.** The template writes `"2"`. The check also reads `"1"`, the schema before structured decisions: in a `"1"` document every decision is a string or `null` and entries have no `choices`.
- **`choices`** (template only, informative): every decision the check would accept for the entry, with each merge-fields offer listing the field groups that differ (§12.7). The check ignores it, and a document without it is equally valid. It is never an authority.
- **Identity.** Registries are named by id and entries by their §8.4 comparison address, never by array position or file layout. Document order carries no meaning; the template and every check result are in ordinal order.
- **Binding.** `basedOn` records the canonical digests of the three inputs the record was made against: the Baseline digest from the manifest, the current Builtin digest and the Custom digest, as `status` reports them (`null` where there is none). The binding is per registry: a record whose digests no longer match is `stale`, while other registries' records stay usable.
- **Independence of the active set.** The document has no `activeSet`, and neither command reads or changes it (§12.1 activation rule). Neither reads `registry-state.json`, so a malformed state file does not stop them; `diff` and `status`, which print `activeSet`, still report it.

**Check result:** `{ valid, complete, problems, registries }`.
- `problems` holds `{ registryId, address?, problem, detail }`, sorted by registry id (`null`, for the document itself, first), then address and problem. `problem` is one of:

  | Problem | Meaning |
  |---|---|
  | `malformed` | the document, a registry record or an entry does not have the shape above; unknown fields included, so a misspelled field never reads as "no decision" |
  | `unknown-registry` | the id is neither a current Builtin registry nor an orphan of this Custom set |
  | `duplicate-registry` | the registry is listed more than once |
  | `not-decidable` | the registry has nothing to decide now; `detail` names its current `diff` class |
  | `stale` | the record was made for another registry class, or for other input digests; `detail` names the changed inputs |
  | `unknown-entry` | the address is not a decidable entry of the current comparison |
  | `duplicate-entry` | the address is listed more than once |
  | `missing-entry` | a decidable entry is absent; undecided entries are recorded as `null`, not omitted |
  | `entry-class-mismatch` | the entry's recorded class differs from its current class |
  | `unsupported-decision` | the decision is not one the class accepts, or a structured decision the entry's collection does not declare (§12.7) |
  | `invalid-decision` | a structured decision whose data does not fit the entry (§12.7) |

- `registries` summarizes each record without a problem: `{ registryId, class, decided, undecided, complete }`. A record with a problem is never summarized, so it never reads as complete.
- `valid` is true when there is no problem. `complete` is true when the document is valid and nothing in it is undecided.

**How `update` uses it (§12.5):**
- `update` refuses a document that is not `valid`, before writing anything.
- It applies only registries whose record is complete; a registry with any `null` decision keeps its Baseline and its Custom content (§8.2 atomic advancement).
- Whether a combination of entry choices yields a valid registry (for example an order entry against the records it orders) is checked when the choices are applied, and a combination that cannot is refused before writing.
- It never changes `activeSet`.

### 12.5 `update`

`calculogic-validator-registry update <file>` applies a decisions document (§12.4). The path is resolved from the working directory. It applies `registry-added` records (`inherit`) and `differs` records (`keep-custom`, `take-builtin`, merge-fields). Same-version content only: a registry whose `version` changed needs migration (§8.3).

1. **Recover** an interrupted transaction (§4.6 item 5), before the document is even read: a missing or unparseable document never leaves an interrupted transaction in place. A Custom set must exist.
2. **Check** the document exactly as `decisions-check` does, against the current comparison. A document that is not `valid` is refused before anything is written, and its problems are printed.
3. **Select.**
   - Every complete record is selected: a `registry-added` record decided `inherit`, and a `differs` record with every entry decided, including one with no entries (every Builtin change `aligned`).
   - Every other record is listed under `skipped` with a reason, and is never pulled into an update:
     - `undecided`: its decision, or one of its entry decisions, is still `null`. Nothing is ever inferred from `null`;
     - `not-yet-supported`: a complete record with an add-alongside decision. Its contract is fixed (§12.7); no current collection declares it, and applying it is tracked by #78, starting once a collection declares it. None of the record's other decisions is applied either.
   - Selected records are grouped by their owning slice. **The slice is the unit of update:** its registry-set validation (§9.3) decides whether its registries are valid together, so its selected registries are validated and committed together. Slices are applied in ordinal slice-id order, and the registries within one in ordinal registry-id order.
4. **Prepare each slice** (§4.6 item 1). The slice is refused, before its transaction, unless every selected registry passes its own checks and the slice passes as a whole. Per registry:
   - **Builtin source:** the Builtin file resolves inside its slice's Builtin root and parses. Its canonical digest (§5) equals the record's `basedOn.builtinDigest`, so the bytes written are exactly the ones the document authorized. Its `version` is one this engine reads.
   - For a `registry-added` record, **still added:** Custom still lacks the registry, and the manifest still lacks its entry. Otherwise the record is stale.
   - For a `differs` record, **the decided inputs:**
     - the manifest entry, the `.baseline/` copy and the Custom file are the ones the record was made against: the manifest digest and the `.baseline/` copy's canonical digest equal `basedOn.baselineDigest`, and the Custom file's equals `basedOn.customDigest`. Both files resolve inside the Custom set and parse;
     - the Builtin `version` equals the manifest entry's and the Custom file's `version`, so the update stays within one version;
     - the candidate (§12.6) is constructed without a refusal.
   Then, for the slice:
   - **Valid together:** the slice's registry-set validation (§9.3) runs once over the slice's final image: every selected registry's new Custom file (the inherited Builtin bytes or the candidate) in place, and every other registry's current Custom file unchanged. It must report no failure that it does not already report for the current Custom slice. Coordinated changes across the slice's registries (a category removed together with its group, a category renamed in both registries, a role added in both) are therefore valid together whatever their order. A change that is valid only together with an undecided record's change is refused for the whole slice.
5. **Transaction** (§4.6): one per slice, in this order:
   1. for each selected registry, `custom/.baseline/<slice>/<file>`: the current Builtin bytes, whole. The Baseline advances to the current Builtin even where an entry was decided `keep-custom` (§8.2);
   2. for each selected registry, `custom/<slice>/<file>`: for `registry-added`, the same Builtin bytes; for `differs`, the candidate (§12.6). A candidate equal to the Custom payload is not written, so Custom keeps its bytes;
   3. the manifest, once, with `basedOn.registries[<id>]` set to `{ validatorVersion, version, digest }` for every selected registry: the current Validator version, the Builtin `version` and the canonical digest (§5), computed exactly as `init-custom` computes them. Every other entry and field is unchanged, and entries are sorted by id.

   Within a slice, every selected registry advances or none does. A failed slice stops the command; earlier slices stay advanced, later ones are untouched.
6. **Result.** After a successful `update`:
   - a `registry-added` registry is `unchanged` in `diff` and in `status`;
   - in a `differs` registry, against the new Baseline, every entry decided `take-builtin` and every `aligned` entry no longer differs; every entry decided `keep-custom` or merge-fields is `custom-only` (a merged entry differs only in the field groups kept from Custom), as are the `custom-only` entries before; with nothing left, the registry is `unchanged`;
   - no other registry, Baseline copy or manifest entry has changed;
   - `registry-state.json` is never read or written.

**Output** is JSON on stdout:
- `{ command, recovered?, applied, skipped }`. Exit 0.
- A refused document: `{ command, applied: [], problems }`. Exit 1.
- A failed slice: `{ command, recovered?, applied, skipped, failed: { sliceId, registryIds, detail } }`. Exit 1. `registryIds` are the slice's selected registries, none of which advanced; the slice is rolled back (§4.6 item 4). `applied` lists, by registry id, the registries of the slices committed before it.

`recovered` is present only when a transaction was found: `{ outcome: "committed" | "rolled-back" }`.

### 12.6 Update candidate (entry decisions)

For a complete `differs` record, `update` constructs the **candidate**: the Custom payload the decisions describe. Construction is pure: from the Baseline, current Builtin and current Custom payloads, the registry's comparison declaration (§8.4) and the record, with no file access. Suite core applies the declaration mechanically and never interprets registry content (§9.2).

1. **The record.** Every decidable entry (§12.4) of the three-way comparison has a decision, and every decision names a decidable entry of that class. Otherwise the candidate is refused.
2. **Start** from the Custom payload as parsed. `keep-custom` changes nothing, so a `builtin-added` entry stays absent, a `builtin-removed` entry stays, and a `builtin-changed` or `both-changed` entry keeps its Custom form. `custom-only` and `aligned` entries are not touched. A merge-fields decision must pass the §12.7 rules (the same check `decisions-check` applies); an add-alongside decision is refused, since `update` skips such records (§12.5 item 3).
3. **`take-builtin`** makes the entry's location hold its current Builtin form, read from the Builtin payload at the same location, or makes it absent where Builtin lacks it:
   - `value`: the value is set, or removed;
   - `members`: the member is appended, or every occurrence is removed;
   - `keyed` record: the record is replaced in place, or appended, or removed;
   - group-presence entry: the map property is created as an empty list, or removed with whatever it still holds.

   A container that is not an entry itself (an object on the path, an unordered list, a list of members) is created when an addition needs it, and an emptied one stays as an empty container: the comparison identity does not distinguish it from an absent one.

   **merge-fields** (a record or an object value, §12.7) changes the Custom form in place: each field `takeBuiltin` lists is set to its Builtin form (read from the Builtin payload at the same site), or removed where Builtin lacks it. Every other field stays exactly as Custom has it, and a record's key field is never listed, so a record keeps its identity and its position.
4. **Order entries** apply last. Each ordered collection's records are arranged in the decided sequence: Builtin's for `take-builtin`, otherwise Custom's. A collection whose decided order is absent is removed when it is empty.
5. **Exact image.** The candidate is extracted (§8.4) and must hold exactly the decided entries: at every address, the Builtin value for `take-builtin`, the merged value for merge-fields (the Custom value with the listed fields taken from the Builtin value, by the same rule as item 3), and the Custom value otherwise, present or absent alike. A combination of individually valid choices that cannot produce that image is refused, naming each address that differs. Examples: an order taken from Builtin that lists a record decided `keep-custom` absent, records kept in a group decided removed, or a record added to a group decided absent. A candidate is never repaired.

Nothing else is created, merged or reordered.

### 12.7 Reconciliation capabilities: merge-fields and add-alongside

`keep-custom` and `take-builtin` mean the same thing for every entry. The other two §8.2 choices do not: whether two forms of an entry can be combined, or can coexist, is registry meaning. So it is **slice-owned**, declared per comparison collection in the slice inventory, and suite core only records, checks and (later) applies what a slice declares. Suite core never infers mergeable fields, never invents an identity and never reinterprets registry content. A collection without a declaration accepts neither choice.

**Declaration.** A registry's `reconciliation` lists `{ path, mergeFields?, addAlongside? }`, where `path` names one of its comparison collections (§8.4):
- `mergeFields`: the collection's **field groups**, a list of disjoint, non-empty lists of field names. A group is the unit of a merge: fields that only make sense together (a matcher and what it matches, a severity and its classification) form one group. The keyed collection's key field is never in a group. Allowed on a `keyed` collection (its records) and on a `value` collection whose values are objects.
- `addAlongside: true`: the Builtin form of a record may be added next to the Custom form under a new key. Allowed on an unordered `keyed` collection only.

Never declarable: `members` entries (membership has no fields and no second form), order entries (a sequence has one form), group-presence entries, `value` entries for add-alongside (a path holds one value), and add-alongside on an ordered collection (the new record would have no decided position). The declaration is checked against the comparison declaration; an invalid one is a programming error.

**merge-fields** `{ "kind": "merge-fields", "takeBuiltin": [field…] }`, on a `builtin-changed` or `both-changed` entry whose collection declares `mergeFields`. The result is the Custom form with the listed fields taken from Builtin:
- both forms are objects, and every field either form has (the key aside) belongs to a declared group: a field outside every group cannot be decided by a merge;
- `takeBuiltin` lists field names in ordinal order without repetition, and consists of whole groups: a group is taken whole or not at all;
- each taken group differs between Builtin and Custom, and at least one differing group stays Custom. Taking every differing group is `take-builtin` and taking none is `keep-custom`; those are recorded as such, so one outcome has one spelling;
- a field absent from the side a group is taken from is absent from the result.

**add-alongside** `{ "kind": "add-alongside", "key": … }`, on a `builtin-changed` or `both-changed` record whose collection declares `addAlongside`. The Custom record stays as it is, and the Builtin record is added with its key field set to `key`:
- `key` is a scalar of the record key's type (a non-empty string for a string key), present in neither the Builtin nor the Custom collection it would join. The user supplies it; suite core never derives one.
- Keys requested by add-alongside decisions are unique per collection. This is a constraint on the collection, not on one entry: when several decisions request the same key, **every** one of them is `invalid-decision`, so the result does not depend on document order.

**Untrusted input.** The document is user data. A structured decision's `kind`, and a record's `class`, select a shape only when they name one; any other string, `__proto__` and `constructor` included, is an unknown value reported as `malformed`, never a crash.

**Applied** by `update` (§12.5, §12.6): merge-fields within the candidate, in any mix with `keep-custom` and `take-builtin`; add-alongside not yet (its record is skipped as `not-yet-supported`; #78).

**Checked when.** `decisions-check` (and `update`'s check) refuses a structured decision the class or collection does not accept (`unsupported-decision`), and one whose data does not fit the entry (`invalid-decision`), before anything is written. Whether the resulting registry is valid (for example a new key's references, or a merged record's own rules) is decided by the slice's registry-set validation when the decision is applied (§12.5 item 4).

**After the update.** Against the new Baseline, a merged entry differs only in the groups kept from Custom and is `custom-only`; with add-alongside, both the kept record and the added one are `custom-only`.

**Current declarations.** The inventory audit (`doc/Audits/registry-reconciliation-capabilities.audit.md`) records the decision for every collection of every registry. merge-fields is declared on the keyed collections whose records separate descriptive fields from matching or identity fields, and on two value maps. No current collection declares add-alongside: every keyed collection either keys records by a vocabulary term other registries or loaders refer to, constrains another field to be unique, or is ordered.

### 12.8 Migration plan (read-only)

The shape migrations (§8.3) the user accepts are recorded in a plain JSON **migration plan**, which the user keeps, reviews and passes back. Like the decisions document (§12.4), it is never read implicitly and never stored under `.calculogic/registries/`. Two read-only commands support it:
- `migrate-plan [registryId…]` prints the plan for the current state, with every decision `null`. Ids restrict it as they restrict `diff`; an unknown id is a usage error.
- `migrate-check <file>` checks a plan against the current state and prints the result. It exits 1 when there is any problem. The path is resolved from the working directory.

Both need a Custom set and write nothing. Neither reads or changes `activeSet` and neither reads `registry-state.json` (§12.1 activation rule), so a malformed state file does not stop them. Interactive tooling may only produce a plan or record its acceptance; it is never a separate source of decisions.

**Shape:**

```json
{
  "kind": "calculogic-registry-migration-plan",
  "schemaVersion": "1",
  "registries": [
    {
      "registryId": "naming/roles",
      "fromVersion": "1",
      "toVersion": "2",
      "path": [{ "from": "1", "to": "2", "transform": "roles-1-to-2" }],
      "basedOn": { "baselineDigest": "…", "builtinDigest": "…", "customDigest": "…" },
      "result": { "baselineDigest": "…", "customDigest": "…" },
      "preview": { "class": "differs", "counts": { "builtin-changed": 1 }, "entries": [], "baseline": {}, "custom": {} },
      "decision": null
    }
  ],
  "notMigratable": [{ "registryId": "tree/folder-kinds", "reason": "no-migration-path", "detail": "…" }]
}
```

- **Registries.** The plan covers every registry the current `diff` classifies `version-changed` (§12.3). One that can be migrated has a record; any other is listed in `notMigratable` with the first reason that applies:

  | Reason | Applies when |
  |---|---|
  | `no-migration-path` | the declaration (§8.3) has no path from the Baseline version to the Builtin version. Without one, this release also has no descriptor for the Baseline's version (§5), so its copy is unverifiable rather than mismatched. |
  | `baseline-mismatch` | the `.baseline/` copy is missing, escapes the target, does not match its manifest digest (§4.4), or is not at its manifest entry's `version`, which selects the path. Nothing is migrated from an untrusted merge base. |
  | `missing` | Custom lacks the registry |
  | `invalid` | the Custom registry cannot be read or parsed |
  | `custom-version-mismatch` | the Custom registry's `version` is not the Baseline's: B0 and C0 must take the same path |
  | `transform-failed` | a step failed on the Baseline or the Custom payload, or the result has no valid comparison entries; `detail` names the input, the step and the reason |

- **`fromVersion`, `toVersion`, `path`:** the manifest's Baseline `version`, the current Builtin `version`, and the path's steps `{ from, to, transform }` in order.
- **Binding.** `basedOn` holds the canonical digests of the three inputs, as `status` reports them (§12.1): the manifest's Baseline digest (its copy verified against it), the current Builtin digest and the Custom digest, each payload canonicalized with the descriptor of its version (§5). `result` holds the canonical digests of B0′ and C0′. Since the transforms are deterministic, `result` also binds the plan to what the transforms produce.
- **`preview`** (informative): what B0′/B1/C0′ will look like, in `diff`'s terms: the registry `class` after the migration (`differs` or `unchanged`), its `counts` and differing `entries` (§12.3), and the migrated payloads `baseline` (B0′) and `custom` (C0′). The check ignores it.
- **`notMigratable`** (informative): the check ignores it.
- **`decision`:** `null` (undecided) or `"accept"`.
- Registries are named by id; document order carries no meaning; the plan and every check result are in ordinal order.

**Check result:** `{ valid, complete, problems, registries }`.
- `problems` holds `{ registryId, problem, detail }`, sorted by registry id (`null`, for the document itself, first), then problem. Each record has at most one problem, the first that applies:

  | Problem | Meaning |
  |---|---|
  | `malformed` | the document or a record does not have the shape above; unknown fields included |
  | `unknown-registry` | the id is not a current Builtin registry |
  | `duplicate-registry` | the registry is listed more than once |
  | `not-migratable` | the registry has nothing to migrate now, or cannot be migrated; `detail` names its current `diff` class or its `notMigratable` reason |
  | `stale` | the record no longer matches the current state; `detail` names what changed: the inputs (`baseline`, `builtin`, `custom`) and the `path` (its versions or steps), or, when all of those still match, the `result`: the transforms now produce another payload |
  | `unsupported-decision` | the decision is neither `null` nor `"accept"` |

- `registries` summarizes each record without a problem: `{ registryId, fromVersion, toVersion, accepted }`.
- `valid` is true when there is no problem. `complete` is true when the plan is valid and every record in it is accepted.

**Applying it** is `migrate` (§12.9). It refuses a plan that is not valid, before writing anything, migrates only accepted records, and never changes `activeSet`.

### 12.9 `migrate`

`calculogic-validator-registry migrate <file>` applies a migration plan (§12.8). The path is resolved from the working directory. The plan is the only authority for what is migrated.

1. **Recover** an interrupted transaction (§4.6 item 5), before the plan is even read. A Custom set must exist.
2. **Check** the plan exactly as `migrate-check` does, against the current state. A plan that is not `valid` is refused before anything is written, and its problems are printed.
3. **Select.** Every record decided `"accept"` is selected. Every record decided `null` is listed under `skipped` with reason `undecided`; nothing is ever inferred from `null`, and the plan need not be complete. Selected records are grouped by owning slice: **the slice is the unit of migration**, as it is of `update` (§12.5 item 3), in the same order.
4. **Prepare each slice** (§4.6 item 1). The slice is refused, before its transaction, unless every selected registry passes these checks and the slice passes as a whole. Per registry:
   - **The authorized inputs.** The manifest entry has the record's `basedOn.baselineDigest` and its `version` is the record's `fromVersion`; the `.baseline/` copy and the Custom file are contained, parse, have the record's Baseline and Custom digests (§5: each canonicalized with the descriptor of its version) and are at `fromVersion`; the Builtin file is contained in its slice's Builtin root, parses, has the record's Builtin digest and is at `toVersion`, a version this engine reads.
   - **The authorized path.** The declared path from `fromVersion` to `toVersion` (§8.3) is the record's `path`.
   - **Recomputed results.** The slice's transforms run again, separately, over the authorized Baseline copy and the authorized Custom file (§8.3 "Running a path"). The plan's `preview` is never read for this: what is written comes from the same pure machinery that made the plan. B0′ and C0′ must each have the record's `result` digest.

   Otherwise the record is stale. Then, for the slice:
   - **Valid together:** the slice's registry-set validation (§9.3) runs once over the slice's final Custom image: every selected registry's C0′ in place, every other registry's current Custom file unchanged. It must report no failure it does not already report for the current Custom slice. A migration that is valid only together with an undecided record's migration is refused for the whole slice; the undecided record is never pulled in. B0′ is not validated as a set: it is the historical merge base, not policy any run will use.
5. **Transaction** (§4.6): one per slice, in this order:
   1. for each selected registry, `custom/.baseline/<slice>/<file>`: B0′;
   2. for each selected registry, `custom/<slice>/<file>`: C0′;
   3. the manifest, once, with each selected registry's entry as §4.3 describes: its previous `validatorVersion`, `version` `toVersion`, B0′'s canonical digest, and `migration`, extending an earlier migration's provenance. Every other entry and field is unchanged.

   B0′ and C0′ are written as two-space JSON with a final newline. Within a slice, every selected registry migrates or none does. A failed slice stops the command; earlier slices stay migrated, later ones are untouched.
6. **Result.** After a successful `migrate`, a migrated registry is no longer `version-changed`: `diff` compares B0′, the current Builtin and C0′ as an ordinary same-version registry (§8.3 "Model"). A shape-only migration is `unchanged`; a Builtin content change that shipped with the new shape is offered by `decisions-template`, and `update` reconciles it like any other, rewriting the manifest entry without `migration`. `registry-state.json` is never read or written.

**Output** is JSON on stdout, shaped as `update`'s (§12.5): `{ command, recovered?, applied, skipped }` and exit 0; a refused plan, `{ command, recovered?, applied: [], problems }` and exit 1; a failed slice, with `failed: { sliceId, registryIds, detail }` and exit 1.

### 12.10 Edit document, `edit-check` and `edit`

Direct JSON editing stays a first-class way to change Custom (§1). The edit document makes the same change addressable, bound and checked before anything is written: a plain JSON document listing **operations** on entries of the Custom set, which the user, or a tool acting for them, writes, reviews and passes back. Like the decisions document (§12.4), it is never read implicitly and never stored under `.calculogic/registries/`. Two commands use it:
- `edit-check <file>` checks the document against the current Custom set, including the final Custom image of every slice it touches, and prints the result. It writes nothing and exits 1 when there is any problem.
- `edit <file>` applies a document that passes the same check.

Interactive editors, CLI helpers or a registry management UI may only produce an edit document; none of them is a separate way to write Custom. There is no generated plan: the document already states the intended operations, so the check is its only gate.

**Shape:**

```json
{
  "kind": "calculogic-registry-edit",
  "schemaVersion": "1",
  "registries": [
    {
      "registryId": "naming/roles",
      "basedOn": { "customDigest": "…" },
      "operations": [
        { "op": "change", "address": "roles[role=\"adapter\"]", "value": { "role": "adapter", "status": "active", "definition": "…" } },
        { "op": "add", "address": "roles[role=\"gateway\"]", "value": { "role": "gateway", "status": "active", "definition": "…" } },
        { "op": "remove", "address": "roles[role=\"legacy\"]" }
      ]
    }
  ]
}
```

- **Editable registries.** A record names a current Builtin registry whose Custom registry is present, contained, parses, yields its comparison entries (§8.4), and is at a `version` this engine reads (§9.1). A registry at another version is migrated first (§12.8); one absent from Custom is inherited first (§12.4). Orphans are not editable. A Custom registry that currently fails its slice's validation is editable: an edit may be how the user repairs it.
- **Operations per record.** `operations` is a non-empty list: a record names a registry because it changes it. Together with the rules below (no `change` to the current value, the exact image), every Custom file an edit writes differs from its current bytes, so a transaction's commit point is never a file that already holds its new content (§4.6 item 8).
- **Binding.** `basedOn.customDigest` is the Custom registry's canonical digest, as `status` reports it (§12.1). Every operation of a record shares that one binding. A record whose Custom digest changed is stale, while other records stay usable. An edit never reads the Baseline or Builtin into the result and never writes them, so they are not bound.
- **Addresses.** An operation names exactly one entry by its comparison address (§8.4), the same addresses `diff` and the decisions document use; there is no other addressing. An address for an entry that does not exist yet must still be one the registry's comparison declaration produces: a declared collection, the kind that collection has, and for a record the declared key field. `version` is not an entry and is never edited; changing it is a migration (§8.3).
- **Operations.** `op` is one of:

  | `op` | Entry kinds | Precondition in the current Custom registry | Result |
  |---|---|---|---|
  | `add` | record, member, value, group | the entry is absent | the entry is present, with `value` |
  | `change` | record, value, order | the entry is present | the entry holds `value` |
  | `remove` | record, member, value, group | the entry is present | the entry is absent |

  An operation on a kind its `op` does not list is unsupported: a member has no other form to change to, a group has no value, and an order entry exists exactly while its collection does.
- **Values.**
  - record (`add`, `change`): an object whose key field equals the address's key. A record's identity never changes: a rename is a `remove` and an `add`;
  - value (`add`, `change`): any JSON value;
  - order (`change`): the collection's complete key sequence, in the new order;
  - member and group (`add`), and every `remove`: no `value`. The address names the member, and a group is added empty.

  A `change` whose value equals the current value changes nothing and is refused: one outcome has one spelling. A value is written as given; the comparison canonicalizes it (§5).
- **Document boundaries.**
  - Registries and operations are identified by id and address. Document order carries no meaning. Operations apply in one fixed order, the update candidate's (§12.6): group additions; then records, members and values; then order entries; then group removals.
  - One operation per address per registry. When several operations name one address, **every** one of them is refused, whatever their order (as for add-alongside keys, §12.7). No operation silently overwrites another.
  - Nothing is implied. Removing a group never removes its records, adding a record never creates its group, and an order is never rearranged to fit.
  - **Ordered collections.** An order entry is the collection's key sequence, so adding or removing a record of an ordered collection changes it. The document must then also `change` the order entry to the complete final sequence: the position of a new record is never inferred. An order entry exists exactly while its collection does. Adding a group of an ordered map brings its order entry, empty, and removing the group removes it; neither is a separate operation. Such an **implied order entry** is part of the exact image below: present with the empty sequence after a group `add`, absent after a group `remove`. An order entry a group `add` brings counts as present for a `change` in the same record, so records added to a new group are placed by changing its order. One a group `remove` takes away cannot also be operated: that is `inconsistent-operations`.
  - **Exact image** (as §12.6 item 5): the edited Custom payload is extracted, and every operated address must hold its `value` (`add`, `change`) or be absent (`remove`), every implied order entry of an added or removed group must be as stated above unless the record changes it, and every other address keeps its current value. Operations that cannot produce that image together are refused, naming each address that differs. Examples: records left in a removed group, a record added to an absent group, a record added to or removed from an ordered collection without a `change` of its order, an order that does not list exactly the collection's final keys. Nothing is repaired.
- **The final slice image.** For each slice the document touches, the slice's registry-set validation (§9.3) runs once over its final Custom image: every edited registry in place, every other registry's current Custom file unchanged. It must report no failure it does not already report for the current Custom slice, the same rule as `update` and `migrate`. A slice whose edits are valid only together is checked together.
- **Classification stays with `diff`.** An edit changes Custom only; the Baseline, the manifest and Builtin are untouched. Afterwards the comparison (§8.2) classifies each edited entry against them as it would any Custom change. It may be `custom-only`; `both-changed` where Builtin changed the entry too; `aligned` where the edit matches a Builtin change; or no longer differing when the edit restores the Baseline value. The edit document and its commands never classify.
- **Independence of the active set.** The document has no `activeSet`, and neither command reads or changes `registry-state.json` (§12.1 activation rule).

**Check result:** `{ valid, problems, registries }`.
- `problems` holds `{ registryId, address?, problem, detail }`, sorted as the decisions check sorts them (§12.4). `problem` is one of:

  | Problem | Meaning |
  |---|---|
  | `malformed` | the document, a record or an operation does not have the shape above, unknown fields, an unknown `op` and an empty `operations` list included |
  | `unknown-registry` | the id is not a current Builtin registry |
  | `duplicate-registry` | the registry is listed more than once |
  | `not-editable` | the Custom registry is absent, unreadable, has no valid comparison entries or is at a version this engine does not read; `detail` names which |
  | `stale` | the Custom registry's digest is not `basedOn.customDigest` |
  | `invalid-address` | the address is not one the registry's comparison declaration produces |
  | `unsupported-operation` | the `op` does not apply to the entry's kind |
  | `duplicate-address` | another operation of the record names the same address; every one of them is reported |
  | `absent-entry` | a `change` or `remove` names an entry the current Custom registry lacks (an order entry brought by a group `add` of the same record counts as present) |
  | `present-entry` | an `add` names an entry the current Custom registry has |
  | `invalid-value` | the `value` is missing, present where none is taken, does not fit the entry (a record whose key field differs from the address, an order that is not a list of keys), or changes nothing |
  | `inconsistent-operations` | the operations, each valid alone, cannot produce the exact image together |
  | `invalid-result` | the slice's registry-set validation reports a failure the current Custom slice does not; `registryId` is the registry it names |

  A record with a record-level problem (`malformed`, `unknown-registry`, `duplicate-registry`, `not-editable`, `stale`) has no operation checked. Operation problems are collected per operation. `inconsistent-operations` and `invalid-result` are checked only when no other problem is reported for the record or the slice.
- `registries` summarizes each record without a problem: `{ registryId, operations }`, the count of its operations.
- `valid` is true when there is no problem. Nothing in an edit document is undecided, so there is no `complete`.

**`edit <file>`** applies the document:
1. **Recover** an interrupted transaction (§4.6 item 5), before the document is even read. A Custom set must exist.
2. **Check** the document exactly as `edit-check` does. A document that is not `valid` is refused before anything is written, and its problems are printed.
3. **Select.** Every record is applied; there is nothing undecided to skip. Records are grouped by owning slice: **the slice is the unit of edit**, in the same order as `update` (§12.5 item 3).
4. **Prepare each slice** (§4.6 item 1): each Custom file contained, parsed and still at `basedOn.customDigest`; the edited payload constructed, by the same pure construction the check used, with the exact image; then the slice's validation over its final Custom image. Otherwise the slice is refused before its transaction.
5. **Transaction** (§4.6): one per slice, writing each edited Custom file as two-space JSON with a final newline, in ordinal registry-id order. The last one is the commit point; no manifest entry and no `.baseline/` copy changes. Within a slice, every edited registry changes or none does. A failed slice stops the command; earlier slices stay edited, later ones are untouched.

**Output** is JSON on stdout, shaped as `update`'s (§12.5): `{ command, recovered?, applied }` and exit 0; a refused document, `{ command, recovered?, applied: [], problems }` and exit 1; a failed slice, with `failed: { sliceId, registryIds, detail }` and exit 1.

### 12.11 Reference edges and `trace`

A registry can name an entry of another registry of the same slice: a perspective names a category, a role, a meaning. These relationships are slice semantics (§9.3), already enforced by each slice's registry-set validation. This section makes them **declared, addressable and reportable**, so that `trace` and later consumers can show them without decoding registry content and without taking over validation. The declarations, the resolvers, the suite-owned resolution and `trace` are implemented (§14).

**Ownership.**

| Responsibility | Owner |
|---|---|
| Declaring which relationships exist | the slice, in its inventory (§9.1) |
| Interpreting fields, composite identities and conditions into references | the slice, in its reference resolver |
| Checking declarations and resolver output mechanically, forming canonical addresses, joining references to target entries, indexing and reporting | suite core |
| Deciding whether a reference makes a registry set invalid | the slice's registry-set validation (§9.3), never `trace` |

Suite core never reads a registry field to find a reference, never infers a relationship from shapes, names or validation code, and never decides what a category, role or meaning is.

**Declaration.** An edge is declared on its **source** registry's inventory entry, as one item of `references`:

```js
references: [{ edgeId: 'naming/perspective-category', to: 'naming/categories', targetCollection: 'categories' }]
```

- `edgeId` is a provenance string (non-empty, no surrounding whitespace), written `<sliceId>/<name>` and unique across all inventories.
- The source registry is the entry the declaration sits on. `to` is a registry of the **same** slice's current inventory; it may be the source registry itself. Relationships between slices are cross-slice compatibility (§9.4, #61), not edges.
- `targetCollection` is the path of a `keyed` collection of the target registry's comparison declaration (§8.4). Every target is a keyed record: `value`, `members`, group-presence and order entries are not targets.
- Nothing else is declared. There is no field pattern, cardinality or optionality: whether a reference exists and how many there are is resolver output, and the slice's validation decides what an absent target means. A treatment such as a fallback target is a later contract extension, made only when a real edge needs it.

**Resolver.** Each slice that declares an edge provides one reference resolver, reached through a static bridge as the migration transforms are (§8.3):

```text
resolveReferences({ registryId, payload }) → [{ edgeId, source: { collection, groups, key? }, target: { groups, key } }]
```

- **Pure and source-only.** It receives the parsed source payload, deep-frozen, and nothing else: never the target registry, another registry, the file system or the active set. The same payload always gives the same references. It handles every `version` the slice declares readable for the source registry: the resolver lists the versions it reads, and suite core refuses a declaration whose source registry has a readable version the resolver does not list.
- **Output.** One item per reference, at most once per `(edgeId, source, target)`. A payload may repeat an identical record, which comparison canonicalization collapses into one entry; the resolver still emits its references once:
  - `edgeId` is declared on this registry;
  - `source` identifies the referring entry, an entry the payload has, relative to `collection`, a `keyed` collection of the source registry's comparison declaration. `groups` holds one string per `*` in its path, as for the target. With `key`, a string, it names a record; without `key`, it names the group-presence entry, which exists only where the path ends in `*`. Suite core forms the source address with the comparison grammar and checks that the entry exists. These are the source forms the current edges need. A source of another entry kind (a `value`, a member) is a later contract extension, made when a real edge needs one;
  - `target` identifies the target entry relative to `targetCollection`. `groups` holds one string per `*` in the collection path, in order (so §8.4 allows zero or one), and `key` is the record's key-field value, a string. Suite core forms the target address from them with the comparison grammar (§8.4), for example `{ groups: ["concern-core"], key: "build" }` in `rolesByCategory.*` with key field `role` is `rolesByCategory["concern-core"][role="build"]`.
- **Interpretation stays here.** Which field holds a reference, how a composite value such as `inheritsFrom: { category, role }` becomes `{ groups, key }`, that a value listed in several fields of one record is one reference, and when a reference exists at all (an absent optional field emits none) are the slice's decisions.
- **Identity, not syntax.** Source and target are both structured identities until suite core turns them into canonical addresses. A slice never builds, parses or imports address syntax: the comparison module is the one owner of the grammar (§8.4), and slices never import lifecycle modules. *Correction (#60):* the contract as first written (#72) had the resolver emit `source` as a ready address string. A source-only resolver could produce it only by writing the grammar a second time in the slice, or by importing the comparison module against the dependency direction, so the source became a structured identity like the target.

**Reference states.** References are resolved over **one whole set**, Builtin or Custom, never mixing registries across sets (§6). For each emitted reference, suite core looks up its target address among the target registry's comparison entries:
- **resolved:** the target entry exists;
- **unresolved:** the target entry does not exist.

*Not emitted* is not a state: an entry the resolver emits no reference for has no edge, and appears in no forward or reverse list. Keys are compared exactly, as addresses are; the slice's validation already rejects keys the runtime would normalize (§9.3).

An unresolved reference is a fact about the data, not a verdict. It is reported so that a broken relationship in an invalid Custom set can be inspected; whether the set is invalid is decided by the slice's validation and reported by `status` (§7.2), never by `trace`.

**Availability.** An edge is evaluated only when both its source and target registries are present, contained, parsed, at a readable version (§9.1) and yield their comparison entries. Otherwise the edge is **unavailable**, with the registry that is not and why (the `status` condition, §12.1), and none of its references are listed: an unreadable target is never reported as a set of unresolved references. Unavailability is a fact about an edge, not a reference state.

**Declaration problems are programming errors.** They are never data findings and never part of `trace` output: suite core refuses to evaluate the slice, and the conformance tests below fail. They are:
- a malformed declaration, or an `edgeId` that is not a provenance string, not prefixed by its slice id or not unique;
- `to` not a registry of the same slice's current inventory, or `targetCollection` not a `keyed` collection of it;
- a slice that declares edges without a resolver;
- a resolver whose versions do not cover a readable version of a registry it resolves;
- resolver output with another shape, naming an `edgeId` not declared on the registry, a `source` whose `collection` is not a `keyed` collection of the source registry, whose `groups` count does not match its path, whose `key` is missing where the path has no `*`, or which names no entry the payload has, a `target` whose `groups` count does not match the collection path, any identity value that is not a string, or the same reference twice.

There is no ambiguous target: a keyed collection with a duplicate key yields no comparison entries (§8.4), so its registry is unavailable, never ambiguous.

**Views.** `trace` reports declared relationships only, in three views, sorted by edge id, then source address, then target address, in ordinal order:
- **direct:** for an entry, the references whose `source` it is, each with its target address and state;
- **reverse:** for an entry address, present or not, the references whose target address it is, each with its source and state. The reverse view of an absent address lists the references left unresolved by its absence;
- **potential impact:** for an entry, the distinct source entries of its reverse view, one step only. These are the entries a change could affect through a declared relationship; they are not a prediction that validation fails. Whether a change breaks them stays the slice's decision. Transitive impact is not part of this contract.

**`trace`** (read-only): `calculogic-validator-registry trace --set <builtin|custom> [<registryId> <address>]` prints one set's declared references as deterministic JSON. It observes; it never validates, activates or modifies.
- **`--set` is required.** `trace` never reads `registry-state.json`, so its result never depends on the active set.
- **Inputs.** Builtin registries are read from the package. Custom registries are read through the assessment's containment-checked reader (§4.1): an absent file is `missing`; a file that does not parse, or resolves outside the validation target and is therefore never read, is `invalid`. Versions and comparison extraction are then checked as for every edge (above). A Custom registry that fails its slice's validation but parses and extracts is traced like any other: tracing invalid data is part of the purpose, and a resolved reference never says a set is valid.
- **Pending transaction.** With `--set custom`, `interruptedTransaction` is `true` while a lifecycle transaction directory exists (§4.6 item 5), detected as the assessment detects it: the traced files may be an intermediate state, which neither command nor output ever presents as consistent. `trace` still reads the files and never recovers. It is always present, `false` otherwise; with `--set builtin` it is always `false`, because transactions never write Builtin.
- **Whole set** (no entry): `{ command: "trace", set, interruptedTransaction, edges }`. Each edge is `{ edgeId, from, to, targetCollection }` with either `counts: { resolved, unresolved }` and `references: [{ source, target, state }]`, or `unavailable: { registryId, condition, detail }`.
- **One entry:** `<registryId>` is a registry of the current inventory, and `<address>` one its comparison declaration can produce (§8.4), whether or not the entry exists, so an absent target can be traced in reverse. The output is `{ command: "trace", set, interruptedTransaction, entry, direct, reverse, impact, unavailable }`:
  - `entry` is `{ registryId, address, present }`: `true` when the registry is readable and has the entry, `false` when it is readable and lacks it, and `null` when it cannot be inspected (absent, unreadable, at an unreadable version or not extractable), with `unavailable: { condition, detail }`. An unavailable registry is never reported as an absent entry;
  - `direct` lists `{ edgeId, target: { registryId, address }, state }` for the references whose source is the entry, `reverse` lists `{ edgeId, source: { registryId, address }, state }` for those whose target is the address, and `impact` the distinct `{ registryId, address }` sources of `reverse`. All three are `null` when `present` is `null`, rather than results made from nothing;
  - `unavailable` lists `{ edgeId, from, to, registryId, condition, detail }` for every edge into or out of the registry that could not be evaluated, so no view is silently incomplete.

  Both forms are drawn from one resolution of the set: the entry form only selects from it.
- **Ordering:** edges by edge id; references and views by address, then edge id and the other address; `impact` by registry id, then address; all ordinal.
- **Exit status.** 0 for every completed trace, unresolved references and unavailable edges included. A usage error (a missing or unknown `--set`, an unknown registry id, an address the declaration cannot produce, other arguments) and a lifecycle error (`--set custom` without a Custom set, or a lifecycle root or `custom/` resolving outside the validation target) go to stderr with exit 1. It writes nothing.

**Conformance.** Each declared edge has fixture-backed tests owned with its slice's declarations:
- a **resolved** case: the fixture's references of that edge are all resolved, and the slice's validation passes;
- an **unresolved** case: removing one target leaves exactly the expected references unresolved, and the slice's validation rejects the set;
- over the Builtin set, every edge is available and every reference resolved, and Builtin passes validation.

Resolver and validation must agree on each fixture. No test tries to discover references from validation code: the declarations are maintained with the slice, and their fixtures are the contract.

**The initial edges.** The edges are exactly those the slices enforce today, recorded with their validation evidence in `doc/Audits/registry-reference-edges.audit.md`:

| Edge | Source entry | Target |
|---|---|---|
| `naming/perspective-category` | `category-role-perspective` group `rolesByCategory["c"]` | `categories` · `categories`, `{ groups: [], key: c }` |
| `naming/perspective-role-definition` | `category-role-perspective` record | `roles` · `roles`, `{ groups: [], key: role }` |
| `naming/perspective-meaning` | `category-role-perspective` record, one reference per distinct value of `agnosticCoreMeanings`, `baseMeanings` and `overlayMeanings` | `agnostic-core-meanings` · `meanings`, `{ groups: [], key: meaning }` |
| `naming/perspective-inherits-from` | `category-role-perspective` record with `inheritsFrom` | `category-role-perspective` · `rolesByCategory.*`, `{ groups: [category], key: role }` |
| `tree/perspective-structural-home` | `surface-structural-home-perspective` record | `structural-homes` · `structuralHomes`, `{ groups: [], key: structuralHome }` |

Every one requires its target: Naming's and Tree's validation reject each unresolved case. None has an alternative target.

**Supersession of the informative edge lists.** Before the declarations, `NAMING_REGISTRY_REFERENCE_EDGES` and `TREE_REGISTRY_REFERENCE_EDGES` described these five relationships as `{ from, to, via }`, with `via` as prose, and nothing read them. The declaration slice replaced each list with the `references` declarations and the resolver in one change and removed the `via` prose. One description exists per relationship: its declaration, and the resolver that interprets it.

*Runtime tolerance (Informative).* Naming's role loader keeps three compatibility paths: a perspective entry's own `status`, a `roles` file in the older grouped `rolesByCategory` shape, and `roles` as the membership source when the perspective file is missing. The lifecycle rejects all three: Naming's registry-set validation allows no `status` on a perspective entry, requires a `roles` array and requires a `roles` entry for every perspective role, and completeness requires the perspective registry (§7.1 item 2). That validation runs on the active root before every run (§7.1). So no validated set reaches them, and they are not reference alternatives. They stay unchanged and outside the reference model.

### 12.12 Portable set: `export`, `import-check` and `import`

A Custom set is a portable convention package (§1, §4.2). These commands move one between repositories as a single file, keeping its exact bytes and its own merge base (§4.4), so it arrives as the same set: owned by the receiving repository, never shared with the source (§4.1). Moving a set is separate from judging it and from using it: importing installs files, `status` and the slices judge them, and only `use custom` activates them (§12.1 activation rule).

**Artifact.** One JSON document; schema `"1"`:

```json
{
  "kind": "calculogic-registry-set",
  "schemaVersion": "1",
  "exportedBy": { "validatorVersion": "0.1.0" },
  "files": [
    { "path": "registry-set.manifest.json", "text": "…", "sha256": "<sha256-hex>" },
    { "path": "naming/roles.registry.json", "text": "…", "sha256": "<sha256-hex>" },
    { "path": ".baseline/naming/roles.registry.json", "text": "…", "sha256": "<sha256-hex>" }
  ]
}
```

- **Exact bytes.** `text` is a file's content decoded as UTF-8, and `sha256` the SHA-256 of its exact bytes. Nothing is normalized: no reformatting, no newline conversion, no JSON reserialization. Importing encodes `text` as UTF-8 and writes those bytes, so an export and import round trip is byte-identical. A file that is not valid UTF-8 cannot be represented and is not exported.
- **Integrity, not authenticity.** The hashes detect corruption. They do not prove who made the artifact; there is no signature.
- **Paths.** Each `path` is relative to `custom/` and one of: `registry-set.manifest.json`; `<slice>/<name>.registry.json`; `.baseline/<slice>/<name>.registry.json`. `<slice>` is a slice id of the current inventories (§9.1), and `<name>` lowercase letters and digits in hyphen-separated words. Anything else, a path given twice, or a directory, is refused, so no path can leave `custom/`. Registries of no current inventory travel as orphans (§7.2).
- **Opaque content.** The artifact never interprets a registry: the files are judged only by the lifecycle's own checks and the slices' validation, below.
- `exportedBy.validatorVersion` is provenance only. The set's Baseline provenance travels inside its manifest (§4.3).
- `files` is in ordinal `path` order; an export is deterministic.

**`export`** (read-only) prints the Custom set as an artifact on stdout. It writes nothing. It refuses, as a lifecycle error, when:
- no Custom set exists, or the lifecycle root or `custom/` resolves outside the validation target;
- a lifecycle transaction is pending (§4.6 item 5): the files may be an intermediate state, which an artifact would preserve as if it were a set;
- `custom/` holds an entry outside the layout above, an entry that resolves outside the validation target, or a file that is not valid UTF-8.

Every file is read through containment checks (§4.1). The set need not be valid: sharing work in progress is supported, and the receiving repository checks what it gets.

**`import-check <file>`** (read-only) checks an artifact against the receiving repository and prints `{ valid, problems, environment, status }`. Exit 0 when the artifact can be imported here, else 1.
- `problems` are the **artifact's** blocking problems, in this order: `malformed` (the document, a file record or `exportedBy` does not have the shape above), `unsupported-schema`, `unexpected-path` (a path outside the layout, or given twice), `integrity` (a `sha256` does not match its text); then, from the lifecycle's assessment of the set as it would be installed, `manifest-malformed` (§7.1 item 5), `baseline-mismatch` (§4.4), and `baseline-unverifiable`: a current-inventory registry whose Baseline copy cannot be verified because this release has no descriptor for its manifest `version` (§12.1). An untrusted merge base defeats a portable set, so these block. An orphan's merge base is never used, so an unverifiable orphan does not block.
- `environment` lists conditions of the **receiving repository** that would refuse `import`: `custom-set-exists`, `transaction-pending`, and `custom-selected` (`registry-state.json` selects `custom`, so installing a set would activate it without `use custom`; `use builtin` first).
- `status` is what `status` will report for the installed set: `{ customDiffers, orphanRegistries, customIssues, registries }` as §12.1 and §11.1 define them. It is produced by the lifecycle's own assessment and the slices' validation, run over a temporary copy of the set outside the repository and removed afterwards. Any temporary path in a detail is reported as the receiving repository's path, and nothing depends on the active set. Everything here other than `problems` is reported, never blocking: a `missing` registry (an older artifact; `update` inherits it, §12.4), a `version-incompatible` one (`migrate` brings it forward, §12.8, with the merge base that travelled with it), an `invalid` one (slice validation fails), and orphans.

`valid` is true when there are no `problems`. The receiving repository is never written.

**`import <file>`** installs the set as `custom/`. It refuses, writing nothing, when a Custom set exists, a transaction is pending, `registry-state.json` selects `custom`, or `import-check` reports a problem. It never replaces or merges into an existing set: a replacing import is a separate, later capability (#79). Otherwise it writes every file's exact bytes into a staging directory inside the lifecycle root and renames it into place, the protocol `init-custom` uses for a new set (§4.6); a failure removes the staging directory and leaves no `custom/`. It never writes `registry-state.json`, never migrates and never activates. It prints `{ command, installed: true, activated: false, status }`, exit 0, or with `installed: false` and the `problems` or `environment` that refused it, exit 1. Installed means the files are in place, not that the set is valid or compatible: `status` says that, and `use custom` remains the only way to activate it.

### 12.13 Candidate preview

A candidate preview is an ordinary validation run whose registry source is a **candidate set** instead of the active set (§6, §10). It answers one question: what would the Validator report if this set were installed and active? It changes only which registries the run reads: the same runner, slices, loaders, validation and exit policy run as for any run. It writes nothing, activates nothing and installs nothing. A successful preview is never permission to activate: that stays `import` (§12.12) followed by `use custom` (§12.1).

**Candidate.** The candidate is a portable-set artifact (§12.12), and nothing else: not a directory, and not an edit, update or migration document.

**Option.** The Validator commands (`calculogic-validate`, `calculogic-validate-naming`, `calculogic-validate-tree`, and the scripts `validate:all`, `validate:naming` and `validate:tree`) accept `--registry-candidate <artifact.json>` (or `--registry-candidate=<artifact.json>`), a path resolved from the working directory. It is taken from the arguments before the run's registry source is resolved, so usage text, including its scope lists, comes from the candidate, and the slices' own argument parsers never see it. Every other argument keeps its meaning: the validation target, `--scope`, `--target`, `--config`, `--validators` and `--strict`.

**Resolution.** For a candidate run, the run's resolution (§6) is built from the candidate:
1. the artifact file is read once; its exact bytes give `artifactSha256`;
2. the artifact is checked as `import-check` checks it (§12.12): shape, schema, paths and integrity. Any problem refuses the run;
3. its files are written to one temporary copy, the **candidate root**, under the operating system's temporary directory, and the lifecycle's assessment runs over it (§7, §12.1);
4. the run is refused on every condition that blocks an active Custom set (§7.1): `missing`, `version-incompatible`, `invalid` and `manifest-malformed`. These are the rules of an active set, not import's more permissive ones. `baseline-mismatch` and orphans are reported and never block (§7.2);
5. otherwise every slice reads its registries from `<candidate root>/<slice>/`, and the run proceeds as any other. No registry is read from Builtin, from the repository's Custom set or from anywhere else: the candidate is loaded whole, so a missing registry refuses the run and never falls back.

The candidate root lives for that one run, and is removed when the run ends, whether it succeeds, fails or is refused.

**Independence from the repository's lifecycle state.** A candidate run never reads `registry-state.json`: a malformed one, or one that selects `custom`, does not affect it. It never reads or writes the repository's Custom set, and a pending lifecycle transaction in the repository neither affects it nor is recovered.

**Refusals** go through the run's existing lifecycle-error path: a message on stderr naming each problem or blocking condition, and exit 1, before any report. A candidate file that cannot be read or parsed is refused the same way. Details never name the candidate root.

**Report.** The report has its usual shape, with the provenance of the candidate (§11):
- `registrySet` is `{ source: "candidate", candidate: { artifactSha256, exportedBy }, customDiffers, basedOn?, builtinDriftSinceBaseline?, orphanRegistries, customIssues, resolvedSetDigest }`, every assessment field describing the candidate. `activeSet` and `customExists`, which describe the repository's lifecycle state, are omitted: the run did not use it;
- `registrySet.bridgeCompatibility` (§9.4) describes the candidate set's bridges, read from the candidate root, never the repository's Custom set;
- every `registryProvenance` entry has `source: "candidate"`, and its `digest` is the registry's canonical digest (§5), as for any run;
- `artifactSha256` identifies the artifact file's exact bytes; `resolvedSetDigest` is the set digest (§2) of the candidate's canonical registry digests. They describe different things and are never compared.

**Exit status.** Findings decide the exit status as in any run, using the candidate's own exit policy (`suite/exit-policy`), because that is what the set would do once active. A refused candidate exits 1.

**Equivalence.** A candidate run reports the same findings as a run of the same set imported (§12.12) and activated (`use custom`), apart from provenance and fields that describe the environment rather than the set (timestamps, the source snapshot, `registrySet`'s source fields and Naming's transitional fields, §11.3).

## 13) Implementation slices

1. **Spec/NL (this document):** `nl-config/cfg-registryLifecycle.md` and aligned specs.
2. **Suite lifecycle mechanics, Naming and suite adoption, config retirement:**
   - slice inventories and descriptors for Naming, Tree and suite core;
   - `version` added to the Builtin registries that lack it;
   - `src/core/registry-lifecycle/`;
   - `init-custom` and `status`;
   - Naming and suite-core registry consumers (scope profiles, exit policy) reading resolved roots;
   - `registrySet` and `registryProvenance`;
   - removal of the config record surfaces, the hard-coded enums, `naming.caseRules` and Naming's `overlay-capabilities` registry, which describes only those surfaces.

   Custom activation is **not** available in this slice (activation gate, §6), because Tree still reads Builtin.

   Acceptance:
   - runs without a Custom set keep their findings and existing report fields unchanged, except the documented `registryDigests.custom` change (§11.3), and gain only the new provenance fields;
   - the config-overlay tests are replaced by tests that the retired surfaces are rejected;
   - Naming's in-package `_custom/` set and `registry-state.json` become test fixtures, and a fixture Custom set equivalent to today's custom mode resolves to the same Naming payload digest through the internal resolution API.
3. **Tree adoption and Custom activation (landed):**
   - Tree loaders read resolved roots, and Tree reports `registryProvenance`;
   - Tree's read of the Naming folder-composition registry and the usage-text scope lists read the resolved set too;
   - with every consumer adopted, `use custom` and active-Custom resolution became available.

   Acceptance:
   - Builtin-active runs keep their findings and report fields, gaining only Tree's `meta.registryProvenance`;
   - an initialized, valid Custom set can be activated, is used by Naming, Tree and suite core in one run, and switching back to Builtin leaves Custom unchanged;
   - an active Custom set with any §7.1 condition stops the run before validation.

   #37 decides separately between the Custom-policy route and evidence-derived repository shape.
4. **Follow-ons:**
   - the advanced management surface (§12.2): #60, whose original scope is implemented (§14). Its deferred extensions are separate issues: applying add-alongside (#78), a replacing import (#79) and optional per-run source choices (#80);
   - the cross-slice compatibility check (§9.4): #61, implemented (§14).

## 14) Current implementation reality (Informative)

After the original scope of #60 (through #77):

- **Suite lifecycle** (`src/core/registry-lifecycle/`): inventories for Naming, Tree and suite core, with canonical-form descriptors and comparison identity declarations (§8.4); canonical digests; state and manifest reading; Custom assessment and status classification; one resolution per run; and the commands `init-custom`, `use`, `status` and the read-only `diff` (§12.3), `decisions-template` and `decisions-check` (§12.4), `update` (§12.5) for `registry-added` records and the entry decisions `keep-custom`, `take-builtin` and merge-fields (§12.6) through the lifecycle transaction (§4.6), the read-only `migrate-plan` and `migrate-check` (§12.8), `migrate` (§12.9), and `edit-check` and `edit` (§12.10), through the same transaction. The bin is `calculogic-validator-registry`, and the scripts are `registry:init-custom`, `registry:use`, `registry:status`, `registry:diff`, `registry:decisions-template`, `registry:decisions-check`, `registry:update`, `registry:migrate-plan`, `registry:migrate-check`, `registry:migrate`, `registry:edit-check`, `registry:edit`, `registry:trace`, `registry:export`, `registry:import-check` and `registry:import`. The reconciliation capability declarations (§12.7) are in every slice inventory, the decisions document (schema `"2"`) records and checks merge-fields and add-alongside, and `update` applies merge-fields; it skips add-alongside records as `not-yet-supported`. Every inventory entry carries a migration declaration (§8.3); all are empty, because every current registry is at `version` `"1"` and no release has changed a registry's shape, so the slices' transform maps are empty too and the migration plan and `migrate` are exercised by synthetic test registries only. A pending lifecycle transaction is reported as `interrupted-transaction` (§4.6 item 5, §7.1 item 6) by `status` and every run, with or without a Custom set, blocks activation and active-Custom runs, and makes `init-custom` refuse, until the next writing command recovers it. `init-custom` and `import` also refuse while `registry-state.json` selects `custom`, so creating a set never activates it (§12.1 "No activation by creation", #77). Every inventory entry carries a `references` declaration (§12.11): the five Naming and Tree edges on their source registries, empty elsewhere. Naming and Tree provide reference resolvers, reached through `registry-lifecycle-slice-references.logic.mjs`, and `resolveRegistryReferences` resolves every declared edge over one whole set given as an input function (with `builtinReferenceInputs` for the Builtin set); over Builtin every edge is available and every reference resolves. The read-only `trace` (§12.11) prints that resolution for the Builtin or the Custom set, whole or for one entry, with `customReferenceInputs` reading Custom through the assessment's containment-checked reader; the script is `registry:trace`. `export`, `import-check` and `import` (§12.12) move a Custom set as one artifact of exact file bytes; `import` installs into an absent set through the staging protocol `init-custom` uses, never activating it; the scripts are `registry:export`, `registry:import-check` and `registry:import`. Candidate preview (§12.13): the Validator commands accept `--registry-candidate <artifact.json>`, and the run's slices read a temporary copy of the verified artifact, refused on any condition that blocks an active Custom set, with `source: "candidate"` provenance; `registry-state.json`, the repository's Custom set and its pending transactions are never read or touched. Deferred extensions, outside the original scope of #60 and not implemented: applying add-alongside (#78; no collection declares it), a replacing import (#79), and per-run Builtin or configuration-file source choices (#80). The cross-slice compatibility check (§9.4) followed as #61.
- **Activation:** `use custom` activates a valid Custom set; `use builtin` switches back without touching Custom. An active Custom set is checked before every run, and any §7.1 condition stops the run with a lifecycle error naming each failing registry.
- **Resolved roots:** Naming (its registry-state owner, walk exclusions and special cases), suite core (scope profiles, exit policy) and Tree (its direct loaders, the shim and validator-owned signal policy, and its read of `naming/folder-composition-patterns`) read every registry from the run's resolved roots. Usage text lists scopes from the resolved set; when the lifecycle cannot be resolved, usage falls back to Builtin scopes and the run itself reports the lifecycle error.
- **Builtin fallbacks outside runs:** direct library calls that pass no resolution (for example tests that build prepared inputs by hand, or `getBuiltin…` helpers) read Builtin. No validation run reaches them. One exception keeps a reported source honest: Tree's Semantic Home parameter set, given an explicit non-Builtin Tree root without a resolution, is `not-prepared` rather than Builtin, because its provenance needs the resolution (Tree spec S2.9).
- **First declared migration:** `tree/semantic-home-policy` moved from version `"1"` to `"2"` (calculogic-validator#102), adding its `semanticHomeParameters` section. Both versions are readable. The Tree transform `semantic-home-policy-v1-to-v2` was the first entry in the slice migration transforms, and a lifecycle test migrates a real version-1 Custom set with it.
- **First retiring migration:** `naming/walk-exclusions` moved from version `"1"` to `"2"` (calculogic-validator#54), retiring the field `allowDotFiles`, which no run read. Only version `"2"` is readable, so a version-1 Custom registry is `version-incompatible` (§7.1) until `migrate` applies the Naming transform `walk-exclusions-v1-to-v2`, the first entry of Naming's slice migration transforms. The transform keeps the walk policy the runtime reads, including a consumer's edits, and drops the retired field, so a difference confined to it is discarded (§8.3). Naming's slice validation keys this registry's root fields by version, as Tree does for `semantic-home-policy`: a version-2 payload carrying `allowDotFiles` is invalid, and a version-1 payload is left to the version check instead of being reported as invalid. A lifecycle test migrates a real version-1 Custom set end to end and runs Naming on the result.
- **Cross-slice bridge compatibility** (§9.4, #61): one declared bridge, `naming/folder-composition-structural-role-token`. Naming's resolver shares the folder-composition projection's pattern selection (`selectEmittingFolderCompositionPatterns`) and Tree's shares the relationship's token selection (`selectInterpretableStructuralRoleTokens`). Suite core compares them in `registry-lifecycle-bridge-compatibility.logic.mjs`, reached through `registry-lifecycle-slice-bridge-domains.logic.mjs`. The result is `registrySet.bridgeCompatibility` in every run report, including candidate runs, and the top-level `bridgeCompatibility` of `status` for the Custom set. Over Builtin the bridge is `compatible`. Tree's per-folder `structural-token-not-registered-for-this-perspective` relationship evidence is unchanged and separate.
- **Registry responsibilities are separate.** Every registry of both sets is validated by its slice (§9.3), digested and disclosed. A registry may also be a source or target of a reference edge (§12.11), which `trace` resolves. Neither of those is runtime use. A registry has a runtime consumer only when a validation run reads it to prepare what the slices check.
  - **Read at run time:** `naming/category-role-perspective`. Naming's roles loading (`loadRolesPayload`, `naming/src/registries/registry-state.logic.mjs`) takes each role's category membership from it whenever the file is present, so editing it in Custom changes the categories a run uses. It is also the source of the four Naming reference edges. *Correction (#60):* this section first listed it among the registries without a runtime consumer.
  - **Read at run time, no finding yet:** `tree/semantic-home-policy`. Tree's parameter loader prepares `treeSemanticHomeParameterSet` from it in every run, with per-parameter provenance from the Baseline entry comparison (§11.4; Tree spec S2.9). Nothing decides with it until Stage 2A, so editing it in Custom changes the prepared set but no finding.
  - **No runtime consumer yet:** `naming/agnostic-core-meanings` (target of the perspective-meaning edge), `tree/structural-home-signal-policy` and `tree/surface-structural-home-perspective` (source of the perspective-structural-home edge). No validation run reads them, so editing them in Custom has no effect on findings until a consumer slice lands. *Correction (#54):* this list also named the field `allowDotFiles` of `naming/walk-exclusions`; registry version `"2"` retired it, so it is no longer part of any readable registry.
- **Reports** carry `registrySet` (runner envelope and Naming report) and `registryProvenance` (Naming report and runner Naming entry `meta`; Tree runner entry `meta`; suite-core registries on the runner envelope). Naming's transitional fields are derived (§11.3).
- **Retired:** Naming's config record surfaces (`naming.*` in config), the `overlay-capabilities` registry, and the in-package `_custom/` set and `registry-state.json`, which are now test fixtures under `naming/test/fixtures/registry-lifecycle/legacy-in-package-custom-set/`.
- **Before slice 3:** the activation gate was closed. `use` was not offered, a state file selecting `custom` was a lifecycle error, and Tree loaded its registries from Builtin and emitted no `registryProvenance`.
- **Before slice 2:** Naming resolved from Builtin, a partial in-package `_custom/` set selected by in-package `registry-state.json`, or the `--config` overlay. It emitted `registrySource` values `builtin | custom | config`. Tree and suite core loaded Builtin only and emitted no provenance. Five Builtin registries had no `version` field.

## 15) Non-goals

- Enforcement modes or fix execution.
- Automatic cross-slice registry mutation of any kind.
- Writing Custom from validation runs, installs or updates.
- Network access during lifecycle operations or validation.
- A universal suite-owned policy-state layer that interprets slice registries.
