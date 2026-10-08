# Registry Lifecycle: Builtin and Custom Registry Sets (Issue #41)

- **Classification:** Normative target contract for the suite-level registry lifecycle. Sections marked *Current implementation reality* or *Historical* are Informative.
- **Ownership:** suite-owned lifecycle mechanics; slice-owned registry meaning (§9).
- **Status:** accepted contract, not yet implemented. Runtime behavior on `main` is unchanged until the implementation slices in §13 land. Do not describe anything in §2–§12 as current runtime behavior before its slice lands.
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

### 4.2 Layout

```text
.calculogic/registries/
  registry-state.json                 # local active selection; not part of the portable set
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

## 5) Canonical comparison and digests

Comparison decides whether Custom *differs* from Builtin rather than being merely formatted differently. Carried forward from the earlier draft:

- **Plain JSON only:** objects, arrays, strings, numbers, booleans and `null`.
- **Object keys** are sorted lexicographically at every depth (`stableStringify`, `src/core/validator-report-meta.logic.mjs`).
- **Ordered arrays** (meaningful sequences, such as priority lists or rule pipelines) keep their order.
- **Set-like arrays** (membership is the meaning) are sorted by their declared entry key, or by value for scalar arrays, with the stable-stringified item as the tie-breaker.
- **Empty optional values** that a registry declares as omittable (for example an empty `notes` string) are normalized out.
- Arrays are **ordered by default**. A registry's descriptor (§9.1) declares which array paths are set-like, their entry keys and which optional fields are omittable.

Digests are computed over canonical forms only. File formatting, key order and the order of set-like arrays never make Custom "differ".

## 6) Resolution: whole-set loading

- `activeSet: builtin` → every slice loads its registries from the package `_builtin/` directories.
- `activeSet: custom` → every slice loads every registry from `custom/<slice>/`.
- No registry is ever loaded from the other set during a run.
- The resolved set is passed to slices as **resolved registry roots**, one directory per slice. Slice loaders read their files from that root and keep their own validation, canonicalization and conversion (§9).
- **Activation gate:** Custom activation is available only when **every** registry consumer of every inventory slice reads its resolved root. A partially adopted suite would mix Custom and Builtin policy in one run and misreport provenance. Until that holds, `use custom` is not offered, and a `registry-state.json` that selects `custom` is a lifecycle error. The rollout is in §13.
- A per-run source choice may later be supplied explicitly (for example "validate against Builtin" or a candidate set for preview, §10). It changes only that run's source. It never changes `registry-state.json` and never writes Custom.

## 7) Validity of an active Custom set

### 7.1 Blocking conditions

When `activeSet: custom`, the run checks the Custom set **before any validation**. Each of these stops the run with a lifecycle error and an actionable notice. The run produces no report and exits non-zero, the same way an invalid `--config` does today:

1. **Missing set:** `customExists` is `false`.
2. **Incomplete set:** the current Builtin inventory contains a registry that Custom lacks, for example one introduced by a later Validator release.
3. **Incompatible version:** a Custom registry's `version` is not among the versions its slice declares as readable (§9.1).
4. **Invalid payload:** a Custom registry fails its slice's shape validation, or a reference between registries fails against the resolved set (§9.3).
5. **Unreadable state or manifest:** malformed `registry-set.manifest.json`. A manifest is also malformed when it lacks a `basedOn.registries` entry for any registry present in `custom/`, because every Custom registry must have authoritative Baseline provenance. A malformed `registry-state.json` blocks every run, whichever set it would select, because the active set cannot be known.

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

The update/inherit operation (part of the advanced management surface, §12) compares **Baseline**, **current Builtin** and **Custom**, per registry and per entry. Entries are identified by the entry keys each registry declares (§9.1). Each difference is classified as:

| Class | Meaning | Default treatment |
|---|---|---|
| `builtin-added` | new in Builtin since Baseline, absent from Custom | offered for inheritance |
| `builtin-changed` | changed in Builtin, unchanged in Custom | review required |
| `builtin-removed` | removed or deprecated in Builtin | review required |
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

## 9) Ownership

### 9.1 Slice-owned: the registry inventory

Every registry-bearing slice declares a registry inventory. For each registry, it declares:

- registry id and filename;
- readable `version` values (every registry in the inventory carries a `version` field);
- the canonical-form descriptor (§5): set-like array paths, entry keys and omittable optional fields;
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
- `customIssues` lists the non-blocking problems of an inactive Custom set (§7.2), sorted by `registryId` then `condition`. It is empty when there are none.
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
| `use builtin` \| `use custom` | Sets the active set. `use custom` runs the §7.1 checks first and refuses on a blocking condition. Available only once the activation gate holds (§6, §13 slice 3). | `registry-state.json` |
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
  - `customDigest` is `null` for `missing`, and for any unparseable registry, whether `invalid` or an `orphan` that also fails to parse;
  - `builtinDigest` is `null` for `orphan`;
  - `baselineDigest` is the manifest's Baseline digest whenever the manifest is readable and has an entry for the registry. That includes a `missing` registry the user deleted after initialization, so it stays distinguishable from one introduced after the Baseline. It is `null` only when there is no such entry (for example, a registry introduced after the Baseline), for `baseline-unavailable`, and whenever the manifest is malformed;
  - `detail` is present only for `invalid`, `version-incompatible`, and an `orphan` that fails to parse (carrying the parse error). An orphan is never validated by its slice, because no current inventory entry describes it.
- With `customExists: false`, `status` prints only the set-level facts and an empty per-registry list.
- When the manifest is malformed, `status` also prints a top-level `manifestError` with the parse detail. Every registry that is not class 1–4 is then `baseline-unavailable`, and `customDigest` and `builtinDigest` are still reported.
- `baselineMismatch` is reported independently of `classification` (§4.4).

**Activation rule:**
- `init-custom` creates the set and its initial state (Custom exists and does not differ). It does **not** change the active set.
- `use` is the only operation that changes the active set.
- Direct edits, command-guided edits, comparison, sync, migration and inheritance may change `customDiffers`, digests and status. They never change `activeSet`.
- Later editing commands may offer activation as an explicit prompted follow-up, never perform it silently.

### 12.2 Advanced management surface (follow-on)

Diff, edit (add, change, remove), inherit/update (§8.2), trace (references and affected slices), import/export of convention sets, candidate preview and migrate (§8.3). Their contracts are fixed by this spec; they are implemented in a follow-on tracked in #39.

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
3. **Tree adoption and Custom activation:**
   - Tree loaders read resolved roots, and Tree reports `registryProvenance`;
   - with every consumer adopted, `use custom` and active-Custom resolution become available.

   #37 decides separately between the Custom-policy route and evidence-derived repository shape.
4. **Follow-ons:**
   - the advanced management surface (§12.2);
   - the cross-slice compatibility check (§9.4).

## 14) Current implementation reality (Informative)

Until slice 2 lands:

- **Naming** resolves from three non-stacking sources (`naming/src/registries/registry-state.logic.mjs`):
  - Builtin;
  - a partial in-package `_custom/` set (`roles.registry.custom.json`, `reportable-extensions.registry.custom.json`, optional `case-rules.registry.custom.json`) selected by in-package `registry-state.json`;
  - the `--config` overlay. A supplied config is applied on top of Builtin, and the custom state is then ignored.
- **Custom roles** are validated against Builtin categories.
- **Naming emits** `registryState`, `registrySource` (`builtin | custom | config`) and `registryDigests`.
- **Tree and suite core** load Builtin only and emit no registry provenance.
- **Five Builtin registries have no `version` field:** `naming/finding-policy`, `naming/missing-role-patterns`, `naming/summary-buckets`, `tree/shim-detection-signals` and `tree/validator-owned-signals`.

## 15) Non-goals

- Enforcement modes or fix execution.
- Automatic cross-slice registry mutation of any kind.
- Writing Custom from validation runs, installs or updates.
- Network access during lifecycle operations or validation.
- A universal suite-owned policy-state layer that interprets slice registries.
