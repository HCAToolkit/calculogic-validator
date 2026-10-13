# Registry Lifecycle: Builtin and Custom Registry Sets (Issue #41)

- **Classification:** Normative target contract for the suite-level registry lifecycle. Sections marked *Current implementation reality* or *Historical* are Informative.
- **Ownership:** suite-owned lifecycle mechanics; slice-owned registry meaning (§9).
- **Status:** accepted contract, implemented through slice 3 (§13): suite lifecycle mechanics, `init-custom`, `status` and `use`, Naming, suite-core and Tree adoption of resolved roots, active-Custom resolution, report provenance and the config retirement. The advanced management surface and the cross-slice compatibility check remain follow-ons (§13 item 4). §14 records current reality.
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
- An escaping lifecycle root or `registry-state.json` is unreadable state (§7.1 item 5). It blocks every run and every lifecycle command, and `init-custom` refuses before writing anything.
- Inside `custom/`, an escaping path is unreadable and is reported through the existing conditions. It never blocks an inactive set (§7.2). An escaping Custom registry file is `invalid`, an escaping `.baseline/` copy is a `baseline-mismatch`, and an escaping manifest is `manifest-malformed`. The Validator does not read through an escaping path.
- Sharing one Custom set between repositories through a symlink is not supported. A portable set is copied (or, later, imported) and becomes owned by the consuming repository (§4.3), so Baseline updates never act on a directory another repository also owns.

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
- The manifest carries no registry records and no active-set choice.
- Additional descriptive fields, such as a set name or author, may be added later as optional metadata. They never affect resolution.

### 4.4 Baseline copy

`custom/.baseline/` holds a byte-for-byte copy of each registry's Baseline Builtin version. A digest only tells you *that* Builtin changed; the copy tells you *what* changed. The copy is the merge base for the three-way comparison (§8.2), and a shared set carries its own merge base.

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

Commands that change an existing Custom set write through one suite-owned **lifecycle transaction**. That is `update` (§12.5) now, and later `migrate`, `edit` and `import`. `init-custom` keeps its own protocol, because it creates `custom/` whole: it stages the set and renames the directory into place (§12.1).

A transaction replaces an ordered list of files. Its last file is the **commit point**, which is always `registry-set.manifest.json`: until the manifest names a file's digest, no lifecycle check trusts that file as Baseline.

1. **Prepare.** Every new file content is computed and checked before anything is written (for `update`, §12.5). Every target, every directory the transaction creates, and the transaction directory itself must be contained (§4.1), and each target's nearest existing ancestor must be a directory.
2. **Stage.** The transaction directory `.calculogic/registries/.lifecycle-transaction/` is created exclusively. It sits outside `custom/`, so it is never part of the portable set.
   - The new contents are written into it.
   - So is a journal. The journal lists, in commit order, each target and whether it existed, the directories to create, and the SHA-256 of the commit point's new bytes.
   - The journal is written last and renamed into place, so a transaction directory without a journal has committed nothing.
3. **Commit, in order.** For each target, an existing entry is first moved into the transaction directory as a backup, then the staged file is renamed into place. Both stay on one file system, so each rename is atomic. An existing entry is a file or a symlink; a symlink is moved, and restored, as the link itself and is never followed. A directory at a target is refused before anything is written.
   - For one registry the order is: the `.baseline/` copy, the Custom file, the manifest.
   - The manifest rename is the commit point. Before it, nothing trusts the new files; after it, the registry is fully advanced.
   - The transaction directory is then removed. Removal is always a retirement: one atomic rename takes the directory out of recovery's view (to `.lifecycle-transaction-retired-*`), then the copy is deleted. A partial deletion therefore never leaves a directory that recovery could misread, and a retired copy that cannot be deleted is swept by the next recovery. The sweep removes only what retirement produces (the exact generated name, an ordinary directory holding only the retired transaction directory) and leaves any other entry alone. This applies wherever this section removes the transaction directory.
4. **Rollback.** Any failure before the commit point undoes every completed step in reverse:
   - a backup is restored;
   - a file that did not exist before is removed;
   - a created directory is removed when empty.

   The transaction directory is then removed and the command reports the failure. The registry is exactly as it was before the command.
5. **Recovery.** A process that stops between steps (killed, crashed) leaves the transaction directory behind.
   - Every partial state is already visible. A Custom file without a manifest entry makes the manifest malformed: `status` reports it, and it blocks activation and active-Custom runs (§7.1 item 5). A `.baseline/` copy without a manifest entry is never read.
   - The next writing lifecycle command recovers first, from the journal. Every journal path is checked, lexically and by realpath (§4.1), before the commit point is read or anything is touched, and the transaction directory and its backup directory must exist as ordinary directories and the journal as an ordinary file, never symlinks. The transaction directory must hold exactly what the transaction wrote: `staged/` with regular files and `backup/` with files or symlinks, each named by a journaled step index (a backup only for a step that replaced an entry), and the journal. Both directories are created before the journal, so a journaled transaction without either has been altered, as has one with any other entry, name or type. Likewise, every step must be in a state its own commit sequence can produce: a step replacing an entry is unstarted (original and staged copy), backed up (backup and staged copy) or applied (backup and new entry); a step creating an entry is unstarted (staged copy, no entry) or applied (entry, no staged copy). Any other state has lost an original or found something else at a target, and recovery refuses rather than report a rollback it cannot make. Rollback records each step in `rolling-back/<i>` before undoing it; a marked step may also be already undone (a replaced entry restored, a created entry removed), so an interrupted rollback is resumed by repeating the marked steps, which is idempotent. A committed transaction never has `rolling-back/`. A journal or directory that fails these checks is refused and kept. If the commit point holds the journaled bytes, the transaction committed and only its directory is removed. Otherwise it is rolled back as in item 4.
   - Recovery never reads or writes `registry-state.json`.
   - Lifecycle commands are not run concurrently against one target.
6. **Scope.** One transaction advances one registry (§8.2). A command that advances several registries runs one transaction per registry, in ordinal registry-id order. A failure stops the command: earlier registries stay advanced and later ones are untouched.
7. **Outside this guarantee:** durability against power loss (fsync), and anything else modifying the repository while a lifecycle command runs. Containment (§4.1) is checked before staging and again by recovery; a symlink retargeted between that check and a rename is a concurrent modification, which no in-process check can exclude (Node offers no rename relative to a held directory handle).
8. **A committed transaction** applied every step, so recovery accepts the commit point only when nothing is left in `staged/` and every step that replaced an entry has its backup; otherwise the directory was altered and is refused and kept.

## 5) Canonical comparison and digests

Comparison decides whether Custom *differs* from Builtin rather than being merely formatted differently. Carried forward from the earlier draft:

- **Plain JSON only:** objects, arrays, strings, numbers, booleans and `null`.
- **Object keys** are sorted lexicographically at every depth (`stableStringify`, `src/core/validator-report-meta.logic.mjs`).
- **Ordered arrays** (meaningful sequences, such as priority lists or rule pipelines) keep their order.
- **Set-like arrays** (membership is the meaning) are sorted by their declared entry key, or by value for scalar arrays, with the stable-stringified item as the tie-breaker. Identical members collapse to one, since a repeated member does not change membership; keyed records that differ in any field stay distinct. Collapsing applies only to arrays the descriptor declares set-like: ordered arrays keep repetition, and keyed-record uniqueness is checked by slice validation (§9.3), never repaired by comparison.
- **Empty optional values** that a registry declares as omittable (for example an empty `notes` string) are normalized out.
- Arrays are **ordered by default**. A registry's descriptor (§9.1) declares which array paths are set-like, their entry keys and which optional fields are omittable.

Digests are computed over canonical forms only. File formatting, key order, and the order or repetition of set-like array members never make Custom "differ".

## 6) Resolution: whole-set loading

- `activeSet: builtin` → every slice loads its registries from the package `_builtin/` directories.
- `activeSet: custom` → every slice loads every registry from `custom/<slice>/`.
- No registry is ever loaded from the other set during a run.
- The resolved set is passed to slices as **resolved registry roots**, one directory per slice. Slice loaders read their files from that root and keep their own validation, canonicalization and conversion (§9).
- **Activation gate:** Custom activation is available only when **every** registry consumer of every inventory slice reads its resolved root. A partially adopted suite would mix Custom and Builtin policy in one run and misreport provenance. The gate held from slice 3 (§13), when Tree adopted resolved roots, and it stays a standing rule:
  - every new reader of registry policy (a loader, a runtime consumer, or CLI output derived from a registry, such as the scope list in usage text) reads the resolved set of the run;
  - a Builtin read is allowed only where there is no validation run to resolve (direct library calls without a resolution), and it never happens inside a run that resolved a set.
- A per-run source choice may later be supplied explicitly (for example "validate against Builtin" or a candidate set for preview, §10). It changes only that run's source. It never changes `registry-state.json` and never writes Custom.

## 7) Validity of an active Custom set

### 7.1 Blocking conditions

When `activeSet: custom`, the run checks the Custom set **before any validation**. Each of these stops the run with a lifecycle error and an actionable notice. The run produces no report and exits non-zero, the same way an invalid `--config` does today:

1. **Missing set:** `customExists` is `false`.
2. **Incomplete set:** the current Builtin inventory contains a registry that Custom lacks, for example one introduced by a later Validator release.
3. **Incompatible version:** a Custom registry's `version` is not among the versions its slice declares as readable (§9.1).
4. **Invalid payload:** a Custom registry fails its slice's shape validation, or a reference between registries fails against the resolved set (§9.3).
5. **Unreadable state or manifest:** malformed `registry-set.manifest.json`. A manifest is also malformed when it lacks a `basedOn.registries` entry for any registry that is present in `custom/` **and** in the current Builtin inventory, because every Custom registry the engine reads must have authoritative Baseline provenance. Orphan registries (§7.2) are exempt: the engine never reads them, and they stay non-blocking with or without a manifest entry. A malformed `registry-state.json` blocks every run, whichever set it would select, because the active set cannot be known.

There is **no Builtin fallback**. Builtin never fills gaps in an active Custom set. The notice names each failing registry and gives the two ways forward: reconcile Custom, or run `registry:use builtin`, which keeps Custom intact.

### 7.2 Non-blocking conditions

These are reported (§11), never blocking:

- **Builtin drift:** Custom is complete, compatible and valid, but the current Builtin content differs from Custom's Baseline. The run proceeds on Custom.
- **Orphan registry:** Custom contains a registry absent from the current Builtin inventory, for example one removed or renamed in a later release. The engine does not read it. It is listed for review.

A lifecycle check runs on every validation run, whichever set is active. It is read-only. When `activeSet` is `builtin`, problems in an existing Custom set are reported as `registrySet.customIssues` (§11.1), not blocking, because Custom is not being used. Those problems are §7.1 items 2–5, except a malformed `registry-state.json`. This way a user validating with Builtin can see why their retained Custom set could not be activated.

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

- A Builtin schema change to an existing registry (for example a new required field) is applied to Custom only through an explicit, user-run migration that the registry's `version` gates.
- The owning slice owns the migration transform, which is deterministic.
- The migration command previews the transformation and keeps the pre-migration Custom until the user accepts it.
- Content inheritance (§8.2) and shape migration are separate operations.

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
- reference edges to other registries of the same slice (§9.3);
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
- the lifecycle commands (§12).

Suite core does **not** interpret registry content. Its canonicalization is **comparison canonicalization** only (§5): descriptor-driven, used solely for digests and equality, and never handed to slices as runtime input. Runtime-form canonicalization (trimming, normalizing, deduplicating, converting) stays in slice loaders (§9.3). Suite core does not validate slice-specific shapes or decide what an entry means. This is set selection, not the universal policy-state layer that `ValidatorLoaderConverterRuntimeOwnership-Contract.md` §6.4 rules out.

### 9.3 Slice-owned: meaning

Each slice keeps:

- payload shape validation, canonicalization into runtime form, and conversion;
- reference edges between its registries, validated against the **resolved** set. For example, Naming roles reference Naming categories, so a Custom categories registry is what Custom roles are checked against;
- the **registry-set validation entry point** declared in its inventory (§9.1):
  - Given a slice registry root, it runs the slice's own shape and reference validation over that root. It returns a deterministic list of `{ registryId, detail }` failures and builds no runtime state.
  - Suite core calls it on the active root before validation (failures block, §7.1 item 4).
  - It also calls it on an existing **inactive** Custom root (failures are reported as `invalid` in `customIssues`, §7.2) and from `status`.
  - Suite core only calls the entry point. The validation rules stay with the slice;
  - A registry that passes must mean exactly what the runtime will do. The entry point therefore rejects input the runtime would silently drop, merge or reinterpret: an undeclared field on a payload root, record or nested object; a string or key with surrounding whitespace, which loaders trim; two keys that are equal in the runtime's normalized form; a value outside the vocabulary the engine interprets; a value the runtime's comparison could never match; and an entry the runtime can never reach, such as one an earlier first-match entry already covers wherever that coverage is decidable. Otherwise `status` could report a Custom edit as valid that never takes effect;
- interpretation.

Naming keeps a registry-state owner for its loader responsibilities, reading from the resolved root. Tree keeps its direct builtin loaders, pointed at the resolved root.

### 9.4 Cross-slice compatibility

- Cross-slice values flow only through bridges.
- A bridge declares the **value domain a slice can emit**, and the consuming slice declares the **domain it can interpret**. A gap is reported, never repaired, and never modifies either slice's registries.
- Naming → Tree semantic families are the first instance.
- This spec fixes the declaration shape and the report-never-repair rule. Implementing the check is a follow-on (§13).

## 10) Configuration boundary

- Configuration never carries registry records.
- Configuration may choose a **source for a single run** (Builtin, or a candidate set for preview, later). It never relocates the lifecycle root, never changes the active set and never writes Custom.
- Naming's record-carrying config surfaces are retired in the same slice in which Naming starts reading the resolved set (§13, slice 2). Whole-set loading leaves no contract-compliant way to keep applying them, and no consumer uses them. There is no overlay compatibility bridge:
  - `naming.roles.add` and `naming.reportableExtensions.add`: the customization path is editing Custom;
  - the hard-coded role `category` enum in `src/validator-config.schema.json` and `src/core/config/validator-config.logic.mjs`: categories are validated against the resolved set instead;
  - `naming.caseRules`, which accepts only `kebab-case`: the customization path is the Custom `naming/case-rules` registry.
- `strictExit` and `version` are unaffected.

## 11) Report provenance

### 11.1 Set-level: `registrySet`

The runner envelope and each direct slice report carry:

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
    "resolvedSetDigest": "<sha256-hex>"
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
  - `baseline-mismatch`: a `.baseline/` copy is missing or does not match its manifest digest (§4.4).
- `detail` for `invalid` comes from the slice's registry-set validation entry point (§9.3), or from the parse error for an unparseable registry.
- With an active Custom set, `customIssues` can contain only `baseline-mismatch`, because every other condition blocks the run (§7.1).

### 11.2 Per slice: `registryProvenance`

Each slice report carries its own registries:

```json
{
  "registryProvenance": {
    "naming/roles": { "source": "custom", "digest": "<sha256-hex>" }
  }
}
```

- `source` is always the active set. The field exists so a later per-run source choice (§10) is disclosed per registry.
- A slice reports its own inventory registries. A registry another slice reads through a bridge or projection (for example Tree reading `naming/folder-composition-patterns` through the Naming-owned folder-composition projection) is disclosed by its owning slice's provenance and by the set-level `resolvedSetDigest`; it always comes from the same resolved set.
- `digest` is the canonical digest of the resolved registry. An active registry always has one, because a registry that cannot be parsed blocks an active-Custom run (§7.1).
- The `null` digest of an unparseable registry (§3) appears only in `status` output and in the diagnostics behind `customIssues`.

### 11.3 Naming's transitional fields

Naming's `registryState`, `registrySource` and `registryDigests` stay for one transition as **derived, deprecated** fields. They are never maintained independently:

- `registryState` = `registrySet.activeSet`.
- `registrySource` = `registrySet.activeSet`. The `config` value is retired with the config record surfaces.
- `registryDigests` keeps its `{ builtin, custom, resolved }` shape, each a digest of Naming's resolved payload:
  - `builtin`: from the Builtin set; unchanged.
  - `resolved`: from the active set; unchanged for runs without a Custom set.
  - `custom`: from the consumer's Custom set when it exists and resolves validly; otherwise equal to `builtin`.

  **Documented value change:** today `custom` is the digest of the packaged in-package `_custom/` payload. Slice 2 moves that payload into test fixtures, so production keeps no hidden legacy policy just for this field. From slice 2, a run without a Custom set reports `custom` equal to `builtin`.

The transition ends in a later, deliberately scoped change. The React app captures reports, so the fields are not removed inside #41.

## 12) Commands

### 12.1 Lifecycle commands (#41)

Bin `calculogic-validator-registry`, with root npm scripts `registry:init-custom`, `registry:use` and `registry:status`. Each operates on the validation target root.

| Command | Effect | Writes |
|---|---|---|
| `init-custom` | Copies every registry of every slice inventory from Builtin into `custom/`, writes `.baseline/` and the manifest. Refuses if `custom/` already exists. | `custom/**`; `registry-state.json` only if absent (written with `activeSet: builtin`) |
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
- When the manifest is malformed, `status` also prints a top-level `manifestError` with the parse detail. Every registry that is not class 1–4 is then `baseline-unavailable`, and `customDigest` and `builtinDigest` are still reported.
- `baselineMismatch` is reported independently of `classification` (§4.4):
  - it is `true` or `false` when the manifest is readable and has an entry for the registry;
  - it is `null` when there is no trusted manifest digest to check against (a malformed manifest, or no entry, such as for a registry introduced after the Baseline), and for an orphan whose canonical-form descriptor this release does not know.
- **Retired descriptors.** The manifest digest of a registry is computed with its canonical-form descriptor (§5), so verifying a copy needs that descriptor. When a release removes or renames a registry, the slice keeps the registry's descriptor in a retired inventory. An orphan's Custom digest and Baseline copy are then canonicalized with it. An orphan without a retired descriptor, such as one from a newer release, has a `null` `customDigest` and `baselineMismatch`: the copy is unverifiable, which is never reported as a mismatch.

**Activation rule:**
- `init-custom` creates the set and its initial state (Custom exists and does not differ). It does **not** change the active set.
- `use` is the only operation that changes the active set.
- Direct edits, command-guided edits, comparison, sync, migration and inheritance may change `customDiffers`, digests and status. They never change `activeSet`.
- Later editing commands may offer activation as an explicit prompted follow-up, never perform it silently.

### 12.2 Advanced management surface (#60)

Diff, edit (add, change, remove), inherit/update (§8.2), trace (references and affected slices), import/export of convention sets, candidate preview and migrate (§8.3). Their contracts are fixed by this spec, and #60 implements them in slices:
1. `diff` (§12.3);
2. the update decisions document (§12.4);
3. `update` (§12.5), which consumes that document as its only authority for choices. It applies `registry-added` inheritance first; entry decisions, migration and the other commands follow. Interactive prompting may only generate or edit the document; it is never a separate source of decisions.

### 12.3 `diff` (read-only)

`calculogic-validator-registry diff [registryId…]` prints the three-way comparison of §8.2 as deterministic JSON. It writes nothing and never advances a Baseline.

- **Registry classes**, the first that applies:
  1. `orphan`: present in Custom, absent from the current Builtin inventory. Not compared.
  2. `registry-added`: a current Builtin registry with no Baseline entry. Its Builtin entries are listed as `builtin-added`. Custom lacks the registry; a Custom copy without a Baseline entry makes the manifest malformed (§7.1 item 5).
  3. `version-changed`: Builtin moved the registry to a `version` other than the Baseline's. Migration is required (§8.3), so entries are not compared.
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
  "schemaVersion": "1",
  "registries": [
    {
      "registryId": "naming/roles",
      "class": "differs",
      "basedOn": { "baselineDigest": "…", "builtinDigest": "…", "customDigest": "…" },
      "entries": [{ "address": "roles[role=\"adapter\"]", "class": "builtin-changed", "decision": null }]
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
  | `builtin-added`, `builtin-changed`, `builtin-removed`, `both-changed` (entry level) | `keep-custom`, `take-builtin` |
  | `custom-only`, `aligned` | none: kept, or counted as decided (§8.2); never listed |

  `null` is the only spelling of "no decision". `keep-custom` is an explicit choice, recorded the same way as `take-builtin`. The other §8.2 choices (merge selected fields, add the Builtin form alongside) are later additions to this vocabulary.
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
  | `unsupported-decision` | the decision is not one the class accepts |

- `registries` summarizes each record without a problem: `{ registryId, class, decided, undecided, complete }`. A record with a problem is never summarized, so it never reads as complete.
- `valid` is true when there is no problem. `complete` is true when the document is valid and nothing in it is undecided.

**How `update` uses it (§12.5):**
- `update` refuses a document that is not `valid`, before writing anything.
- It applies only registries whose record is complete; a registry with any `null` decision keeps its Baseline and its Custom content (§8.2 atomic advancement).
- Whether a combination of entry choices yields a valid registry (for example an order entry against the records it orders) is checked when the choices are applied, and a combination that cannot is refused before writing.
- It never changes `activeSet`.

### 12.5 `update`

`calculogic-validator-registry update <file>` applies a decisions document (§12.4). The path is resolved from the working directory. **This slice applies `registry-added` records only**; entry decisions on `differs` records are a later #60 slice.

1. **Recover** an interrupted transaction (§4.6 item 5), before the document is even read: a missing or unparseable document never leaves an interrupted transaction in place. A Custom set must exist.
2. **Check** the document exactly as `decisions-check` does, against the current comparison. A document that is not `valid` is refused before anything is written, and its problems are printed.
3. **Select.**
   - Records with `class: "registry-added"` and `decision: "inherit"` are applied, in ordinal registry-id order.
   - Every other record is listed under `skipped` with a reason:
     - `undecided`: its decision, or one of its entry decisions, is still `null`;
     - `not-yet-supported`: a complete `differs` record.

     Nothing is ever inferred from `null`.
4. **Prepare each registry** (§4.6 item 1). The registry is refused, before its transaction, unless all of these hold:
   - **Builtin source:** the Builtin file resolves inside its slice's Builtin root and parses. Its canonical digest (§5) equals the record's `basedOn.builtinDigest`, so the copied bytes are exactly the ones the document authorized. Its `version` is one this engine reads.
   - **Still added:** Custom still lacks the registry, and the manifest still lacks its entry. Otherwise the record is stale.
   - **Valid in Custom:** the slice's registry-set validation (§9.3), run over the Custom slice with the new file added, reports no failure it does not already report without it. That covers the new registry and its references to Custom's other registries.
5. **Transaction** (§4.6), in this order:
   1. `custom/.baseline/<slice>/<file>`;
   2. `custom/<slice>/<file>`. This and the `.baseline/` copy are the same Builtin bytes.
   3. The manifest, with `basedOn.registries[<id>]` set to `{ validatorVersion, version, digest }`: the current Validator version, the Builtin `version` and the canonical digest (§5), computed exactly as `init-custom` computes them. Every other entry and field is unchanged, and entries are sorted by id.
6. **Result.** After a successful `update`:
   - `diff` reports the registry `unchanged`, and `status` reports it `unchanged`;
   - no other registry, Baseline copy or manifest entry has changed;
   - `registry-state.json` is never read or written.

**Output** is JSON on stdout:
- `{ command, recovered?, applied, skipped }`. Exit 0.
- A refused document: `{ command, applied: [], problems }`. Exit 1.
- A failed registry: `{ command, recovered?, applied, skipped, failed: { registryId, detail } }`. Exit 1. `applied` lists the registries advanced before the failure; the failed registry is rolled back (§4.6 item 4).

`recovered` is present only when a transaction was found: `{ outcome: "committed" | "rolled-back" }`.

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
   - the advanced management surface (§12.2);
   - the cross-slice compatibility check (§9.4).

## 14) Current implementation reality (Informative)

After slice 3:

- **Suite lifecycle** (`src/core/registry-lifecycle/`): inventories for Naming, Tree and suite core, with canonical-form descriptors and comparison identity declarations (§8.4); canonical digests; state and manifest reading; Custom assessment and status classification; one resolution per run; and the commands `init-custom`, `use`, `status` and the read-only `diff` (§12.3), `decisions-template` and `decisions-check` (§12.4), and `update` for `registry-added` records (§12.5) through the lifecycle transaction (§4.6). The bin is `calculogic-validator-registry`, and the scripts are `registry:init-custom`, `registry:use`, `registry:status`, `registry:diff`, `registry:decisions-template`, `registry:decisions-check` and `registry:update`. Not implemented yet (#60): entry decisions in `update`, `migrate`, `edit`, `trace`, `import`/`export` and preview.
- **Activation:** `use custom` activates a valid Custom set; `use builtin` switches back without touching Custom. An active Custom set is checked before every run, and any §7.1 condition stops the run with a lifecycle error naming each failing registry.
- **Resolved roots:** Naming (its registry-state owner, walk exclusions and special cases), suite core (scope profiles, exit policy) and Tree (its direct loaders, the shim and validator-owned signal policy, and its read of `naming/folder-composition-patterns`) read every registry from the run's resolved roots. Usage text lists scopes from the resolved set; when the lifecycle cannot be resolved, usage falls back to Builtin scopes and the run itself reports the lifecycle error.
- **Builtin fallbacks outside runs:** direct library calls that pass no resolution (for example tests that build prepared inputs by hand, or `getBuiltin…` helpers) read Builtin. No validation run reaches them.
- **Registries without a runtime consumer:** `naming/agnostic-core-meanings`, `naming/category-role-perspective`, `tree/semantic-home-policy`, `tree/structural-home-signal-policy` and `tree/surface-structural-home-perspective` are part of both sets. They are validated, digested and disclosed, but no runtime consumer reads them yet, so editing them in Custom has no effect on findings until a consumer slice lands. The same holds for the field `allowDotFiles` in `naming/walk-exclusions` (#54).
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
