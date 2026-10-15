# cfg-registryLifecycle

> [!IMPORTANT]
> This file is **supporting implementation guidance** (NL/config context) for the suite-level registry lifecycle. It is **not** the canonical contract source. The normative contract is `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md`.
>
> Paths in this file are relative to the standalone Validator repository root unless they name the validation target root (`<repo>`). This note is repository-owned development guidance; it is not part of the distributed `@calculogic/validator` package.

## 0.0 Version

Status: **implemented through slice 3 (Issue #41)**.
- Slice 2: inventories (6.1, 6.2), constants (6.3), 5.2.1–5.2.6, `init-custom` and `status` (5.3), the runner/Naming/suite-core wiring (5.4) and report provenance (7.1, 7.2).
- Slice 3: active-Custom resolution (5.2.5), `useRegistrySet` (5.2.7) and the `use` command (5.3), Tree's resolved-root wiring and Tree `registryProvenance` (5.4, 7.1), and usage-text scope lists from the resolved set (5.4). The activation gate holds.
- #60 slice 1: comparison identity declarations in every slice inventory (6.1) and the read-only `diff` (5.2.9, 5.3).
- #60 slice 2: the update decisions document, its template and its check (5.2.10, 5.3, 6.3). Read-only.
- #60 slice 3: the lifecycle transaction (5.2.11) and `update` for `registry-added` inheritance (5.2.12, 5.3). The first command that changes an existing Custom set.
- #60 slice 4: entry decisions `keep-custom` and `take-builtin` in `update`, through the pure update candidate (5.2.13) and the lifecycle transaction (5.2.12).
- #60 slice 5: reconciliation capability declarations in every slice inventory (6.1, 5.2.14), and the decisions document's schema `"2"` with structured merge-fields and add-alongside decisions, checked read-only (5.2.10).
- #60 slice 6: `update` applies merge-fields through the update candidate (5.2.13), with `mergeFieldsForm` (5.2.14) as the one merge rule; add-alongside records stay skipped as `not-yet-supported`.
- #60 slice 7: migration declarations in every slice inventory (6.1), the slice transforms bridge and the declaration check (5.2.15), the version-aware descriptor (5.2.15) used wherever a payload is digested, and the read-only migration plan with `migrate-plan` and `migrate-check` (5.2.16, 5.3). No migration is written.
- #60 slice 8: `migrate` applies the accepted records of a checked migration plan (5.2.18, 5.3) through the slice-atomic application mechanics it shares with `update` (5.2.17); the manifest reader accepts the optional `migration` provenance (5.2.1).
- Follow-ons: the rest of the advanced management surface (#60): applying add-alongside and the other commands; and the cross-slice compatibility check (#61).

Sections are numbered so that implementation comments can reference them (`[5.2.3] cfg-registryLifecycle · Primitive · "…"`).

## 1.0 Purpose and Scope

### 1.1 Purpose

Let a consumer own a complete Custom registry set, choose between Builtin and Custom, and see in every report which set was used. Slices keep the meaning of their registries.

### 1.2 In scope

- Lifecycle root, state file, manifest and Baseline copy in the validation target root.
- Initialization of the Custom set, active-set selection and status.
- Whole-set resolution into one resolved registry root per slice, with completeness, version and validity checks before validation.
- Set-level and per-registry provenance.
- From the advanced management surface (#60): `diff`, the update decisions document, and `update` for `registry-added` inheritance and the entry decisions `keep-custom`, `take-builtin` and merge-fields, with the lifecycle transaction it writes through; and the read-only migration plan (`migrate-plan`, `migrate-check`).

### 1.3 Out of scope

- Interpreting registry content (slice-owned).
- The rest of the advanced management surface (follow-on): applying add-alongside, and the `edit`, `trace`, `import`/`export` and preview commands.
- The cross-slice compatibility check (follow-on).

### 1.4 Concerns present

Logic, Knowledge and Results. There is no Build, BuildStyle or ResultsStyle concern; this is a non-UI suite configuration.

## 2.0 Configuration Contracts

### 2.1 Inputs

- **Validation target root:** resolved the same way validator CLIs resolve it today.
- **Slice registry inventories:** one per registry-bearing slice (Naming, Tree, suite core). Each declares:
  - registry id;
  - Builtin file path;
  - readable `version` values;
  - canonical-form descriptor (set-like array paths, their sort keys, omittable optional fields);
  - comparison identity declaration (what an entry is and how it is addressed; spec §8.4);
  - reconciliation capability declaration (which collections accept merge-fields or add-alongside, with their field groups; spec §12.7);
  - migration declaration (steps `{ from, to, transform, fromDescriptor }` from older versions; spec §8.3);
  - same-slice reference edges;
  - a slice-owned registry-set validation entry point (shape and reference checks over a given root; spec §9.3).
- **Slice migration transforms:** each slice's map of transform ids to pure functions, reached through the static bridge `registry-lifecycle-slice-migrations.logic.mjs` (5.2.15). Empty for every slice today.
- **Validator package version.**
- **Internal-only root override,** for tests and package development.

### 2.2 Data and state

- `<repo>/.calculogic/registries/registry-state.json`: `{ schemaVersion, activeSet }`.
- `<repo>/.calculogic/registries/custom/registry-set.manifest.json`: `{ schemaVersion, basedOn: { registries: { [id]: { validatorVersion, version, digest } } } }`. Baseline provenance is per registry; set-level Baseline values are derived (spec §4.3). After a migration an entry also carries `migration: { fromVersion, fromDigest, path }` (spec §4.3), read strictly: exactly those fields, a non-empty `fromVersion`, a lowercase SHA-256 `fromDigest` and a non-empty list of transform ids; anything else makes the manifest malformed.
- `<repo>/.calculogic/registries/custom/<slice>/<registry>.registry.json` and `custom/.baseline/<slice>/<registry>.registry.json`.

### 2.3 Dependencies

- `src/core/validator-report-meta.logic.mjs` (`stableStringify`, `sha256Hex`). These are reused; they are not reimplemented.
- `src/core/repository-root.logic.mjs`.
- Slice inventories (Knowledge), imported by the suite inventory aggregate. Dependency direction is suite lifecycle → slice inventory declarations. Slices never import lifecycle internals; they receive resolved roots through wiring.

### 2.4 Invariants

- Builtin is never written.
- Validation runs never write Custom, the manifest or the state file.
- The active set is loaded whole. No registry is read from the non-active set during a run.
- An active Custom set that is missing, incomplete, version-incompatible or invalid stops the run before validation. There is no Builtin fallback.
- Only `use` changes `activeSet`. `init-custom`, `update` and `migrate` never do; `update` and `migrate` never even read `registry-state.json`.
- Only `update` and `migrate` change an existing Custom set, and only through a lifecycle transaction (5.2.11): the selected registries of one slice advance completely or not at all.
- Every lifecycle path read or written resolves by realpath inside the validation target root (spec §4.1).
- `migrate-plan` and `migrate-check` write nothing, never read `registry-state.json`, and never advance a Baseline. A migration transform is pure: it receives a deep-frozen payload and nothing else.

## 3.0 Build Concern (Structure)

Not applicable: this is a non-UI suite configuration with no structural anchors (see 1.4).

## 4.0 BuildStyle Concern (Visual Styling of Structure)

Not applicable (see 1.4).

## 5.0 Logic Concern (Workflow)

### 5.1 Container `Registry lifecycle resolution` (`src/core/registry-lifecycle/`)

#### 5.2.1 State management: `readRegistryLifecycleState`

Reads `registry-state.json`, the existence of `custom/` and the manifest, if present (`registry-lifecycle-state.logic.mjs`):
- `resolveRegistryLifecyclePaths` derives every lifecycle path from the validation target root (or the internal root override);
- `readRegistryLifecycleState` returns `{ activeSet, stateFileExists }`. An absent state file means `builtin`. A malformed state file is a lifecycle error (`RegistryLifecycleError`);
- `customSetExists` reports whether `custom/` exists;
- `readRegistrySetManifest` returns `{ manifest }` or `{ manifestError }`; manifest problems are returned, not thrown, so the caller decides whether they block.
- `isLifecyclePathContained` checks that a lifecycle path resolves by realpath inside the containment root (the validation target root, or the internal root override). A path that does not exist yet resolves through its nearest existing ancestor; a symlink that cannot be resolved does not count as contained. An escaping lifecycle root or state file is a lifecycle error; escaping paths under `custom/` are reported by 5.2.4 (spec §4.1 "Containment").

#### 5.2.2 Derived value: `canonicalizeRegistryPayload`

Applies a registry's canonical-form descriptor: sorted object keys, set-like arrays sorted by entry key, ordered arrays preserved, omittable empty optionals dropped. It does not interpret the payload.

#### 5.2.3 Derived value: `digestRegistrySet`

Computes per-registry digests of the canonical forms and the set digest (sorted registry ids).

#### 5.2.4 Workflow: `assessCustomRegistrySet`

Compares Custom with the current Builtin inventory and the Baseline. Produces:
- completeness: missing and orphan registries;
- version compatibility;
- `customDiffers`;
- `builtinDriftSinceBaseline`;
- the per-registry status classification;
- `customIssues` for an inactive Custom set, using each slice's registry-set validation entry point for `invalid` (spec §7.2, §9.3, §11.1);
- Custom paths that escape the target (spec §4.1) as unreadable: a registry file is `invalid`, a `.baseline/` copy is a `baseline-mismatch`, the manifest is `manifest-malformed`; escaping files are never read, escaping directories are never listed, and a slice with an escaping registry file is not passed to its slice validation;
- `baselineMismatch` for every registry the trusted manifest lists, orphans included (spec §4.4, §12.1). An orphan is canonicalized with its slice's retired descriptor; an orphan without one has a `null` digest and `baselineMismatch` (unverifiable, never a mismatch);
- Baseline copy verification against manifest digests, giving `baseline-mismatch` (spec §4.4).

Every current-inventory payload (Builtin, Custom, `.baseline/`) is digested with the descriptor of its own `version` (`descriptorForPayload`, 5.2.15; spec §5), so an old-version Baseline copy stays verifiable. A copy whose manifest `version` this release has no descriptor for (`isVersionDescribed`, 5.2.15) is not verified: `baselineMismatch` is `null`, unverifiable rather than mismatched.

#### 5.2.5 Workflow: `resolveActiveRegistrySet`

Runs 5.2.1 and 5.2.4.
- `builtin`: returns the package Builtin root of every slice. An existing Custom set is assessed and reported (`customIssues`), never read.
- `custom`: the blocking conditions are a missing set and every `customIssues` condition except `baseline-mismatch` (`missing`, `version-incompatible`, `invalid`, `manifest-malformed`; spec §7.1). If any holds, it raises a lifecycle error naming each failing registry and the two ways forward (5.2.8). Otherwise it returns `custom/<slice>` for every slice, Custom digests as the resolved digests, and provenance with `source: custom`.
- In both cases it returns one resolved registry root per slice, plus the provenance inputs for 7.1.

Slice-shape and reference validation failures raised by slice loaders while loading an active Custom set are reported through the same lifecycle error path.

#### 5.2.6 Workflow: `initCustomRegistrySet`

- Refuses if `custom/` exists.
- Copies every inventory registry from Builtin into `custom/<slice>/` and `custom/.baseline/<slice>/`.
- Writes the manifest.
- Writes `registry-state.json` with `activeSet: builtin` only if the file is absent.

#### 5.2.7 Workflow: `useRegistrySet`

`registry-lifecycle-use.logic.mjs`.
- The lifecycle root and state file must be contained (5.2.1); an escaping one is refused before anything is written.
- `custom`: runs the 5.2.5 blocking checks and refuses on a blocking condition with the same notice (5.2.8). Otherwise writes `activeSet: custom`.
- `builtin`: writes `activeSet: builtin` without checks, so it is always the way back.
- A contained but malformed state file is replaced, so `use` is also the way to repair it.
- It writes only `registry-state.json`, through a temporary file renamed into place. Custom is never touched.
- It returns `{ activeSet, previousActiveSet, stateFileCreated }`; `previousActiveSet` is `null` when the replaced state file was malformed.

#### 5.2.8 Derived value: active-Custom blocking notice

Shared by 5.2.5 and 5.2.7 (`registry-lifecycle-resolution.logic.mjs`). One `RegistryLifecycleError` whose message lists each blocking condition as `<registryId or "registry-set manifest">: <condition>: <detail>`, then the two ways forward: reconcile Custom (`registry:status` shows each registry), or run `registry:use builtin`, which keeps Custom intact. The error's `conditions` carry the blocking issues.

#### 5.2.9 Workflow: `buildRegistryLifecycleDiff` (read-only)

`registry-lifecycle-comparison.logic.mjs` and `registry-lifecycle-diff.logic.mjs` (spec §8.2, §8.4, §12.3).
- **Extraction** (`extractComparisonEntries`) canonicalizes a payload with the registry's descriptor (5.2.2), then turns it into a map from address to canonical value, following the comparison identity declaration. A payload with a root field the declaration does not cover, or with a duplicate key, cannot be extracted. The comparison is then not trusted, and the registry is reported `not-comparable`.
- **Entry sites** (`walkComparisonEntries`) is the one owner of the address grammar: it yields each entry with its address, canonical value and **site**, the structured location the address names (`{ kind, container, … }`, where `kind` is `value`, `member`, `record`, `group` or `order` and `container` is the field path to the node, a wildcard map property included). Extraction is a map over it; the update candidate (5.2.13) uses the sites to read and write a payload at an address without parsing it.
- **Entry diff** (`summarizeEntryDiff({ baseline, builtin, custom })`, maps from address to canonical value): the differing entries in ordinal address order with their counts per class. `diff` uses it per registry, and the migration plan's preview (5.2.16) uses it for B0′/B1/C0′.
- **Registry class** in spec order: `orphan`, `registry-added`, `version-changed`, `not-comparable` (status condition or `baseline-mismatch`), `differs`, `unchanged`. Baseline payloads are read only from verified `.baseline/` copies (§4.4).
- **Entry class** (`classifyEntry(baseline, builtin, custom)`, each a canonical value or absent):
  - all equal → no entry;
  - only Builtin changed → `builtin-added`, `builtin-removed` or `builtin-changed`;
  - only Custom changed → `custom-only`;
  - both changed → `aligned` when Custom equals Builtin, otherwise `both-changed`.
- **Output:** deterministic JSON with ordinal ordering and counts per class. Nothing is written.

#### 5.2.10 Workflow: update decisions document (read-only)

`registry-lifecycle-decisions.logic.mjs` (spec §12.4). Both functions take the comparison from `compareRegistryLifecycle` (5.2.9), which returns the comparison together with the assessment's per-registry status entries, so the bound digests and the classes come from one assessment. It never reads `registry-state.json`; only `buildRegistryLifecycleDiff` reads it, to add `activeSet`.
- **Decidable registries:** `registry-added`, and `differs` with at least one entry that is not `custom-only`. A `registry-added` record has a registry-level `decision`; a `differs` record lists its entries whose class is in `ENTRY_DECISIONS_BY_CLASS` (6.3).
- **`buildRegistryUpdateDecisionsTemplate`:** the document (schema `"2"`) with every decision `null`, `basedOn` set from the status digests, and each entry's informative `choices` from `entryChoices` (5.2.14).
- **`checkRegistryUpdateDecisions`:** strict shape check (schema `"1"` or `"2"`; a record's `class` selects a shape only as an own key of the shape table), then per registry: known id, no duplicate, decidable now, same class and `basedOn` digests (otherwise `stale`), then per entry: known decidable address, no duplicate, same class, a decision the class accepts or `null`, and no decidable entry missing. A structured decision (schema `"2"` only) is checked by `checkStructuredDecision` (5.2.14): `unsupported-decision` when the class or collection does not accept its kind, `invalid-decision` when its data does not fit the entry. `choices` is accepted and ignored. Problems are collected, never thrown, and sorted ordinally. Only records without a problem are summarized.
- Neither reads nor writes `activeSet`, so a malformed state file does not stop them, and nothing is written.

#### 5.2.11 Workflow: lifecycle transaction

`registry-lifecycle-transaction.logic.mjs` (spec §4.6). `runLifecycleTransaction({ paths, writes })` replaces `writes` (`[{ targetPath, contents }]`) in order; the last is the commit point.
- **Stage:** create `.calculogic/registries/.lifecycle-transaction/` exclusively (an existing one is an interrupted transaction). Write `staged/<i>` for every write, then the journal (`journal.json`, written to a temporary name and renamed):
  - `steps: [{ target, original, sha256 }]`, with targets relative to the lifecycle root, `original` the identity of the entry the step replaces (`{ kind: "file", sha256 }` or `{ kind: "symlink", link }`, never following the link; `null` for a new target), and `sha256` the SHA-256 of the step's new bytes (the last step's is the commit digest);
  - `createdDirectories`.
- **Commit:** create the missing directories. For each step: if an entry exists at the target (a file, or a symlink, which is moved as the link itself), rename it to `backup/<i>`, then rename `staged/<i>` onto it. Any other existing entry at a target (directory, FIFO, socket, device) is refused before staging.
- **Rollback**, on any failure before the last rename, in reverse order:
  - restore each backup;
  - remove each target that did not exist;
  - remove each created directory that is empty;
  - remove the transaction directory.

  If the rollback itself fails, the directory is kept for recovery.
- **Removing the transaction directory** always retires it first: `retireTransactionDirectory` renames it into a fresh `.lifecycle-transaction-retired-*` directory, then deletes that, so a partial recursive deletion can never leave a journal-less directory that recovery would misread. Recovery sweeps leftover retired directories first, removing only exact `mkdtemp` names that are ordinary directories holding nothing, or only the retired transaction directory as an ordinary directory (a file or symlink by that name is left alone).
- **After the commit point** nothing reports a failure. A transaction directory that cannot be removed is a committed transaction.
- **`recoverLifecycleTransaction(paths)`** returns `null` when there is no transaction directory. Otherwise:
  - no journal → nothing was committed, so the directory is removed (`rolled-back`);
  - the commit point holds its journaled `sha256` and every step is in its applied state (each target a regular file holding its own step's `sha256`, each replaced original in its backup, no staged copy left) with no `rolling-back/` → `committed`, and the directory is retired (a commit-point match with any other state is refused as altered). Rollback and the committed check share one per-step state classifier;
  - otherwise → rollback (`rolled-back`), but only while the commit point's `staged/<last>` is still present; a consumed commit-point staged copy without the journaled bytes is refused as altered. Every journaled digest must be 64 lowercase hex characters and every `original` exactly one of the two identity shapes.

  Every journal path is resolved and checked, lexically and by realpath, before the commit point is read. The transaction directory, `staged/` and `backup/` must exist as ordinary contained directories, and `assertTransactionShape` (run after the journal-path check and before the commit point is read, for both outcomes) refuses any entry the transaction did not write (top level: `staged`, `backup`, `journal.json`; `staged/<i>` regular files; `backup/<i>` files or symlinks, only for steps that replaced an entry), and every step must be in a state its commit can produce (replacing: unstarted, backed up or applied; creating: unstarted or applied), or, when marked in `rolling-back/<i>` (written before rollback undoes that step), already undone; otherwise recovery refuses. Each state is checked by identity, not presence: an original at the target or in `backup/<i>` must be the journaled `original` exactly, and a new entry must be a regular file holding the step's `sha256`, so a rollback never deletes or overwrites an entry the journal does not identify. A resumed rollback repeats the marked steps idempotently and `journal.json` an ordinary file, never symlinks (a dangling journal link is refused, not taken for no journal); a backup entry itself may be a link, which is moved and never followed. A malformed journal, or one naming a path outside the lifecycle root or outside the target, is a lifecycle error, and nothing is touched.
- Every target, created directory and the transaction directory must be contained (spec §4.1), and each target's nearest existing ancestor must be a directory; otherwise the transaction is refused before staging.
- **Test seam:** an `onStep(name)` hook is called at each boundary (`staged`, `journaled`, `directories-created`, `step-<i>:backed-up`, `step-<i>:applied`, `committed`). An error carrying `LIFECYCLE_TRANSACTION_SIMULATED_CRASH` stops the transaction without rollback, as a killed process would. Neither is consumer-facing.

#### 5.2.12 Workflow: `applyRegistryUpdateDecisions` (`update`)

`registry-lifecycle-update.logic.mjs` (spec §12.5).
1. Check that the lifecycle root and `custom/` are contained, then recover (5.2.11). Only then read the document through the caller's `loadDocument`, so a document that cannot be read never blocks recovery.
2. Check the document (5.2.10). If it is not valid, return its problems.
3. Select records:
   - complete records → apply: `registry-added` + `inherit`, and `differs` with every entry decided (an empty `entries` list included);
   - any `null` → skipped as `undecided`; never pulled into an update;
   - a complete record with an add-alongside decision → skipped as `not-yet-supported`, with none of its decisions applied. merge-fields decisions apply.

   Group the selected records by owning slice (ordinal slice id; registries in ordinal id order). The slice is the unit of update.
4. For each slice (`applyBySlice`, 5.2.17): prepare every selected registry (`prepareRegistryInheritance` or `prepareRegistryReconciliation`, returning its Baseline write, its Custom write when it changes Custom, and its manifest entry), validate the slice once (`assertSliceImageValid`, 5.2.17), then run one transaction:
   - **both:** Builtin file contained in its slice's Builtin root, parsed, its digest equal to `basedOn.builtinDigest`, and a readable `version`;
   - **`registry-added`:** Custom file and manifest entry still absent;
   - **`differs`:** manifest entry digest, `.baseline/` copy digest and Custom file digest equal to the record's `basedOn` digests (both files contained and parsed); Builtin `version` equal to the manifest entry's and the Custom file's; the candidate (5.2.13) constructed without a refusal;
   - **slice:** validation over one scratch copy of the Custom slice with every selected registry's new Custom file in place reports no failure the current Custom slice does not already report (`newSliceFailures` with every changed file at once);
   - **transaction:** every selected registry's `.baseline/` copy (the whole current Builtin), then every changed Custom file (the Builtin bytes, or the candidate as two-space JSON with a final newline, omitted when the candidate equals the Custom payload), then the manifest once with every selected entry advanced. Manifest entries are built like `init-custom` builds them, from the current Validator version and `digestRegistryPayload`.

   Within a slice all selected registries advance or none does. The first failed slice stops the command, reported as `failed: { sliceId, registryIds, detail }`; slices committed before it stay applied, and `applied` lists their registry ids.

#### 5.2.13 Derived value: `buildRegistryUpdateCandidate`

`registry-lifecycle-update-candidate.logic.mjs` (spec §12.6). Pure: `({ entry, baselinePayload, builtinPayload, customPayload, decisions })` → the candidate Custom payload, where `entry` is the registry's inventory entry (descriptor and comparison declaration) and `decisions` maps each decided address to `keep-custom` or `take-builtin`. No file access and no registry-specific knowledge.
1. Extract the three inputs (5.2.9) and classify every address. The decided addresses must be exactly the decidable ones (classes in `ENTRY_DECISIONS_BY_CLASS`), each with a string decision its class accepts or a merge-fields decision `checkStructuredDecision` (5.2.14) accepts; an add-alongside decision is refused here, since `update` never passes one. Otherwise `RegistryUpdateCandidateError`.
2. Copy the Custom payload. For each `take-builtin` address, at its site (`walkComparisonEntries` over Builtin and Custom): group additions first; then values, members and records (set or replace from the Builtin payload at the same site, append, or remove), and merge-fields records and object values (`mergeFieldsForm` over the raw Custom and Builtin forms at the site, replacing the Custom form in place); then group removals. Properties are written as own properties, so a map key such as `__proto__` stays data. Containers that are not entries are created on the way; a group is never created implicitly.
3. Order entries: arrange each ordered collection by its decided sequence (Builtin's for `take-builtin`, else Custom's) when its records are exactly that sequence's keys; remove it when the decided order is absent and it is empty. Anything else is left for step 4.
4. Exact image: extract the candidate; every address must hold the Builtin value (`take-builtin`), the merged value (merge-fields: `mergeFieldsForm` over the canonical Custom and Builtin values) or the Custom value (otherwise), present or absent alike. Any difference throws `RegistryUpdateCandidateError` listing each `{ address, expected, actual }`. Nothing is repaired.

Returns `{ payload, changed }`, where `changed` is false when the candidate equals the Custom payload exactly.

#### 5.2.14 Derived value: reconciliation capabilities

`registry-lifecycle-reconciliation.logic.mjs` (spec §12.7). Suite core records and checks what slices declare; it never infers mergeable fields or invents keys.
- **`assertReconciliationDeclaration(entry)`:** every `{ path, mergeFields?, addAlongside? }` names a comparison collection of the entry, at most once; `mergeFields` only on `keyed` or `value` collections, as disjoint non-empty groups of field names without the key field; `addAlongside: true` only on an unordered `keyed` collection. Throws on anything else (a programming error, covered by the inventory tests).
- **`entryChoices({ entry, address, entryClass, sites, builtin, custom })`:** the decisions the check accepts for one diff entry: `keep-custom` and `take-builtin`, plus for `builtin-changed` and `both-changed` a record or object value in a declaring collection: merge-fields when both forms are objects, every field is in a group and at least two groups differ (offered with the differing groups), and add-alongside on a declaring record. The template's `choices` and the check share it.
- **`mergeFieldsForm({ custom, builtin, takeBuiltin })`:** the one merge rule (spec §12.7): a copy of the Custom object in which each listed field holds its Builtin form, or is absent where Builtin lacks it; every other field as Custom has it. Fields are written as own properties. The candidate uses it both to write the raw payload and to compute the expected canonical value.
- **`checkStructuredDecision(...)`:** the spec §12.7 rules for one structured decision on its own, returning `{ problem, detail }` or null. Its `kind` selects a shape only when it is an own key of the shape table (document input: `__proto__` or `constructor` is an unknown kind, `malformed`). add-alongside keys are checked against the keys of the Builtin and Custom collection the record would join (sites from `walkComparisonEntries`, which carry `collectionPath`).
- **Collection-wide add-alongside keys:** `checkRegistryUpdateDecisions` gathers every add-alongside decision that passes on its own, groups them by `alongsideKeyGroup` (collection and key), and reports every member of a group with more than one decision as `invalid-decision`, with one detail naming all of them. Document order never decides which one fails.

#### 5.2.15 Derived value: migration declarations and paths

`registry-lifecycle-migration.logic.mjs` (spec §8.3, §5). Suite core reads the slice's declaration and runs its transforms; it never infers a default, a rename or a mapping.
- **Transforms bridge** (`registry-lifecycle-slice-migrations.logic.mjs`): `SLICE_MIGRATION_TRANSFORMS`, a static map from slice id to that slice's transforms (`{ [transformId]: payload => payload }`), like the slice validation bridge. Every slice's map is empty today; a slice adds its `<slice>-registry-migrations.logic.mjs` module here with its first migration. Plan and check take the map as an option, so tests supply synthetic transforms.
- **`assertMigrationDeclaration(entry, transforms)`:** `migrations` is a list of `{ from, to, transform, fromDescriptor }` with nothing else; versions are distinct non-empty strings and transform ids non-empty strings, all without surrounding whitespace (they become manifest provenance); `fromDescriptor` is an object; each `transform` is an own function of `transforms`; no two steps share a `from`; following the steps from any `from` ends, without revisiting a version, at a version in `readableVersions`. Throws on anything else (a programming error).
- **`descriptorForPayload(entry, payload)`:** the descriptor of the payload's `version`: the `fromDescriptor` of the step from that version, else the registry's descriptor. The assessment (Builtin, Custom and `.baseline/` digests), `init-custom` and `update` digest every payload through it, so one rule decides which descriptor canonicalizes a payload.
- **`isVersionDescribed(entry, version)`:** whether a descriptor exists for the version: a readable version or a declared `from`.
- **`migrationPath(entry, fromVersion, toVersion)`:** the steps from `fromVersion` up to `toVersion` along the one chain, or null when there is none.
- **`runMigrationPath(path, transforms, payload)`:** runs each step on a deep-frozen structured clone of the previous payload and checks its output: a plain JSON value (objects with a plain prototype, arrays, strings, finite numbers, booleans, `null`) that is an object whose `version` is the step's `to`. Returns `{ payload }` or `{ failure: { step, detail } }`; a throw is a failure, never an escape.
- **`migrateRegistryPayload({ entry, path, transforms, payload, label })`:** one input run along the path, then its comparison entries extracted (`walkComparisonEntries`); `{ payload, walked }` or `{ failure }`. The plan (5.2.16) and `migrate` (5.2.18) both use it, so what is applied is what was planned.

#### 5.2.16 Workflow: migration plan (read-only)

`registry-lifecycle-migration-plan.logic.mjs` (spec §12.8).
- **`buildRegistryMigrationPlan`:** asserts every inventory entry's declaration (5.2.15), compares (5.2.9) and, for each `version-changed` registry, either a record or a `notMigratable` item, by the spec's reason precedence: a path (5.2.15) from the manifest's version to the Builtin's; the status entry's `baselineMismatch`, and the copy's payload at the manifest entry's `version`; the Custom file present, contained and parsed; its `version` equal to the manifest's; both runs successful (`migrateRegistryPayload`, 5.2.15). `basedOn` comes from the status digests; `result` digests B0′ and C0′ with the registry's descriptor; `preview` is the `diff` of B0′/B1/C0′ (`summarizeEntryDiff`, 5.2.9) with the migrated payloads. Every decision is `null`.
- **`checkRegistryMigrationPlan`:** strict shape check, then per record: known Builtin registry, no duplicate, a current record for it (otherwise `not-migratable`, naming the current `diff` class or reason), same `basedOn` digests and path (otherwise `stale`, naming each), then the same `result` (otherwise `stale`: `result`), then a decision of `null` or `"accept"`. One problem per record; problems are collected, never thrown, and sorted ordinally. `preview` and `notMigratable` are accepted and ignored.

Neither reads `registry-state.json` or writes anything.

#### 5.2.17 Workflow: slice-atomic application

`registry-lifecycle-slice-apply.logic.mjs` (spec §4.6, §12.5, §12.9). The mechanics `update` and `migrate` share, so the slice is applied one way:
- **`openLifecycleWrite(paths, command)`:** the lifecycle root and `custom/` contained, then recovery (5.2.11).
- **`readAuthorizedBuiltin`, `readBoundLifecycleFile`:** a Builtin file, or a `.baseline/` copy or Custom file, with the digest a document authorized (each payload canonicalized with the descriptor of its version, 5.2.15), or a refusal naming the document as stale.
- **`assertSliceImageValid`:** the slice's registry-set validation once over a scratch copy of the Custom slice, before and after placing every new Custom file; only failures it introduces refuse the slice. Only Custom files are placed: a Baseline copy is never validated as a set.
- **`manifestBytesWith`:** the manifest with the given entries replaced, sorted by id.
- **`applyBySlice`:** groups selected records by slice (ordinal slice ids, ordinal registry ids within), and per slice calls the command's `prepareSlice` and runs one transaction. Returns `{ applied, failed? }`; a failed slice stops the command, and a simulated crash (the transaction's test seam) is rethrown.

#### 5.2.18 Workflow: `applyRegistryMigrationPlan` (`migrate`)

`registry-lifecycle-migrate.logic.mjs` (spec §12.9).
1. `openLifecycleWrite`, then read the plan through `loadDocument`.
2. Check it (`checkRegistryMigrationPlan`, 5.2.16). If it is not valid, return its problems.
3. Select records decided `"accept"`; every other record is skipped as `undecided`.
4. For each slice (`applyBySlice`): prepare every selected registry (`prepareRegistryMigration`): the manifest entry with the record's Baseline digest and `fromVersion`; the `.baseline/` copy, Custom file and Builtin file bound to the record's digests (`readBoundLifecycleFile`, `readAuthorizedBuiltin`), so they are the bytes whose versions and path the check verified moments before; then `migrateRegistryPayload` (5.2.15) over the Baseline copy and over the Custom file, each result's digest equal to the record's `result`. The plan's `preview` is never read. Then `assertSliceImageValid` with every C0′, and one transaction: every B0′, every C0′, the manifest last.
5. The manifest entry (`migratedManifestEntry`): the previous `validatorVersion`, `toVersion`, B0′'s digest, and `migration` with the previous provenance's `fromVersion` and `fromDigest` (or the previous entry's `version` and `digest` for a first migration) and its `path` extended by the applied transform ids.

`migrationTransforms`, `validateSlice` and `onTransactionStep` are options; the last two are internal test seams.

### 5.3 Container `Lifecycle commands` (`src/core/registry-lifecycle/` CLI host, bin `calculogic-validator-registry`)

- `init-custom` → 5.2.6.
- `use <builtin|custom>` → 5.2.7.
- `status` → 5.2.1 + 5.2.4. Read-only.
- `diff [registryId…]` → 5.2.9. Read-only. An unknown registry id is a usage error.
- `decisions-template [registryId…]` → 5.2.10. Read-only; prints the document on stdout. An unknown registry id is a usage error; no Custom set is a lifecycle error.
- `decisions-check <file>` → 5.2.10. Read-only. The path is resolved from the working directory. Prints the check result on stdout and exits 1 when it has problems; an unreadable or unparseable file is an error on stderr.
- `update <file>` → 5.2.12. Prints `{ command, recovered?, applied, skipped }`, or with `problems` or `failed` and exit 1. The path is resolved from the working directory.
- `migrate-plan [registryId…]` → 5.2.16. Read-only; prints the plan on stdout. An unknown registry id is a usage error; no Custom set is a lifecycle error.
- `migrate-check <file>` → 5.2.16. Read-only. The path is resolved from the working directory. Prints the check result on stdout and exits 1 when it has problems; an unreadable or unparseable file is an error on stderr.
- `migrate <file>` → 5.2.18. Prints `{ command, recovered?, applied, skipped }`, or with `problems` or `failed` and exit 1. The path is resolved from the working directory.

Usage errors and lifecycle errors go to stderr with a non-zero exit.

Repository scripts: `npm run registry:init-custom`, `npm run registry:use -- <builtin|custom>`, `npm run registry:status`, `npm run registry:diff`, `npm run registry:decisions-template`, `npm run registry:decisions-check`, `npm run registry:update`, `npm run registry:migrate-plan`, `npm run registry:migrate-check` and `npm run registry:migrate` (`scripts/registry-lifecycle.host.mjs`).

### 5.4 Wiring into validation runs

The runner and direct slice CLIs call 5.2.5 once per run, before slice execution. Slice wiring passes each slice its resolved root. Naming's registry-state owner, the suite-core scope-profile and exit-policy loaders, and Tree's direct loaders read from that root instead of their package-relative `_builtin/` constants.

- **Tree** (slice 3): `tree/src/registries/tree-runtime-registries.logic.mjs` loads every runtime-consumed Tree registry from the resolved Tree root through the direct loaders (`load…FromRegistryRoot`). The Builtin root is cached; a Custom root is read per run, because its files are user-editable. Tree wiring passes the loaded registries into prepared dependencies and the shim diagnostics contributor; the Tree runtime and shim detection hold no module-level registry state. Tree's read of `naming/folder-composition-patterns` uses the resolved Naming root.
- **Usage text:** the validator CLI hosts resolve once per invocation and build usage text, including scope lists, from that resolution's roots. When resolution fails, usage uses Builtin roots so `--help` still works, and the run reports the lifecycle error.
- **Builtin fallbacks:** prepared-input and loader helpers called without a resolution (direct library calls and unit tests) read Builtin. No validation run reaches them.

## 6.0 Knowledge Concern (Reference Data)

### 6.1 Slice registry inventories

- `naming/src/registries/naming-registry-inventory.knowledge.mjs`
- `tree/src/registries/tree-registry-inventory.knowledge.mjs`
- `src/registries/suite-registry-inventory.knowledge.mjs`

Each is owned by its slice and lists only that slice's registries. Every entry carries a canonical-form `descriptor` (spec §5), a `comparison` identity declaration (spec §8.4), a `reconciliation` capability declaration (spec §12.7, possibly empty) and a `migrations` declaration (spec §8.3, empty for every current registry); they are separate concerns, identity is never inferred from `descriptor.setLike`, and capabilities are never inferred from either. The reasons behind each declaration are recorded in `doc/Audits/registry-reconciliation-capabilities.audit.md`. Each also exports a retired inventory: the registry id and canonical-form descriptor of every registry a release removed or renamed, so orphan Baseline copies stay verifiable (spec §12.1 "Retired descriptors"). It is empty until a registry is retired.

### 6.2 Suite inventory aggregate

`src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs` lists the slice inventories and retired inventories in deterministic slice order (`naming`, `tree`, `suite`). It adds no registry entries of its own.

### 6.3 Constants

Lifecycle root segments (`.calculogic/registries`), file names, `schemaVersion` values and the `builtin` / `custom` vocabulary; the comparison kinds and entry and `diff` registry classes; and the update decisions document's `kind`, `schemaVersion`, decisions by class (`REGISTRY_DECISIONS_BY_CLASS`, `ENTRY_DECISIONS_BY_CLASS`) and problem codes; the lifecycle transaction's directory, journal name, schema version and outcomes; the entry decisions and structured decision kinds; the `update` skip reasons (`undecided`, `not-yet-supported`); the migration plan's `kind`, `schemaVersion`, decision, problem codes and not-migratable reasons; and the `migrate` skip reason (`undecided`).

## 7.0 Results Concern (Outputs)

### 7.1 Report provenance

- `registrySet` in the runner envelope and in each direct slice report.
- `registryProvenance` per slice report.
- Naming's derived transitional `registryState`, `registrySource` and `registryDigests`, as defined in the spec §11.

### 7.2 Status output

Deterministic JSON with:
- the three facts and the Baseline;
- drift and orphans;
- per-registry classification and digests.

The same on-disk state always gives byte-identical output.

### 7.3 Lifecycle notices

Human-readable stderr messages for blocking conditions. Each names the condition, the registries involved, and both ways forward (reconcile Custom, or `registry:use builtin`).

## 8.0 ResultsStyle Concern (Output Styling)

Not applicable: outputs are JSON report fields, JSON status output and plain-text stderr notices (see 7.0).

## 9.0 Assembly Pattern

### 9.1 File structure

```text
src/core/registry-lifecycle/
  registry-lifecycle.contracts.mjs                 6.3
  registry-lifecycle-inventory.knowledge.mjs       6.2
  registry-lifecycle-state.logic.mjs               5.2.1
  registry-lifecycle-canonical-digest.logic.mjs    5.2.2, 5.2.3
  registry-lifecycle-slice-validation.logic.mjs    5.2.4 (calls each slice's entry point)
  registry-lifecycle-assessment.logic.mjs          5.2.4
  registry-lifecycle-resolution.logic.mjs          5.2.5
  registry-lifecycle-init.logic.mjs                5.2.6
  registry-lifecycle-use.logic.mjs                 5.2.7
  registry-lifecycle-comparison.logic.mjs          5.2.9 (entry extraction and classification)
  registry-lifecycle-diff.logic.mjs                5.2.9
  registry-lifecycle-decisions.logic.mjs           5.2.10
  registry-lifecycle-transaction.logic.mjs         5.2.11
  registry-lifecycle-update.logic.mjs              5.2.12
  registry-lifecycle-update-candidate.logic.mjs    5.2.13
  registry-lifecycle-reconciliation.logic.mjs      5.2.14
  registry-lifecycle-migration.logic.mjs           5.2.15
  registry-lifecycle-slice-migrations.logic.mjs    5.2.15 (each slice's transforms)
  registry-lifecycle-migration-plan.logic.mjs      5.2.16
  registry-lifecycle-slice-apply.logic.mjs         5.2.17
  registry-lifecycle-migrate.logic.mjs             5.2.18
  registry-lifecycle-status.logic.mjs              7.2
  registry-lifecycle-cli.logic.mjs                 5.3
bin/calculogic-validator-registry.host.mjs         5.3 (package bin)
scripts/registry-lifecycle.host.mjs                5.3 (repository scripts)
naming/src/registries/naming-registry-inventory.knowledge.mjs   6.1
tree/src/registries/tree-registry-inventory.knowledge.mjs       6.1
src/registries/suite-registry-inventory.knowledge.mjs           6.1
naming/src/registries/registry-state.logic.mjs     Naming entry point (validateNamingRegistrySet)
tree/src/registries/tree-registry-set.logic.mjs    Tree entry point (validateTreeRegistrySet)
tree/src/registries/tree-runtime-registries.logic.mjs   Tree runtime registries from one resolved root (5.4)
src/registries/suite-registry-set.logic.mjs        suite entry point (validateSuiteRegistrySet)
```

### 9.2 Assembly logic

- The resolution module (5.2.5) is the single entry point validation runs call.
- The CLI host (5.3) composes 5.2.1, 5.2.4, 5.2.6 and 5.2.7.
- There is no barrel file. Callers import the module they need.

### 9.3 Integration

- The runner and direct slice CLIs integrate through 5.4: one resolution call per run, then resolved roots are passed through slice wiring.
- Slices integrate only by declaring their inventories (6.1) and accepting a resolved root.

## 10.0 Implementation Passes

### 10.1 Pass mapping

Spec §13 slice 2:
1. Inventories and descriptors for Naming, Tree and suite core, plus `version` on the five unversioned Builtin registries (data-only change, then registry shape tests).
2. Canonical digest, state, assessment and resolution, with unit tests on fixture roots.
3. `init-custom` and `status`.
4. Naming and suite-core consumers (scope profiles, exit policy) read resolved roots. Add provenance fields and the transitional field derivation.
5. Remove the config record surfaces, the hard-coded enums, `naming.caseRules` and `overlay-capabilities`. Convert the in-package Naming `_custom/` set and `registry-state.json` into test fixtures.

Spec §13 slice 3:

6. Tree loaders read resolved roots, Tree reports `registryProvenance`, and usage text reads the resolved set. Add `use` (5.2.7) and active-Custom resolution (5.2.5, 5.2.8).

### 10.2 Export checklist

- Every module listed in 9.1 exists, with CCPP file headers linking to this note and atomic comments using its section numbers.
- Every invariant in 2.4 is covered by a test.
- Report fields match the spec §11, and status output is byte-stable for a fixed on-disk state.
- The Validator docs index, the report schema and the Naming spec are updated in the same PR as the behavior they describe.
