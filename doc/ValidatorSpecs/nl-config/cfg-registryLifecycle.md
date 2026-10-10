# cfg-registryLifecycle

> [!IMPORTANT]
> This file is **supporting implementation guidance** (NL/config context) for the suite-level registry lifecycle. It is **not** the canonical contract source. The normative contract is `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md`.
>
> Paths in this file are relative to the standalone Validator repository root unless they name the validation target root (`<repo>`). This note is repository-owned development guidance; it is not part of the distributed `@calculogic/validator` package.

## 0.0 Version

Status: **partially implemented (Issue #41)**.
- Slice 2 implemented: inventories (6.1, 6.2), constants (6.3), 5.2.1–5.2.6, `init-custom` and `status` (5.3), the runner/Naming/suite-core wiring (5.4) and report provenance (7.1, 7.2).
- Slice 3 pending: `useRegistrySet` (5.2.7), the `use` command, Tree's resolved-root wiring and Tree `registryProvenance`. Until then the activation gate is closed (`CUSTOM_ACTIVATION_AVAILABLE = false`).

Sections are numbered so that implementation comments can reference them (`[5.2.3] cfg-registryLifecycle · Primitive · "…"`).

## 1.0 Purpose and Scope

### 1.1 Purpose

Let a consumer own a complete Custom registry set, choose between Builtin and Custom, and see in every report which set was used. Slices keep the meaning of their registries.

### 1.2 In scope

- Lifecycle root, state file, manifest and Baseline copy in the validation target root.
- Initialization of the Custom set, active-set selection and status.
- Whole-set resolution into one resolved registry root per slice, with completeness, version and validity checks before validation.
- Set-level and per-registry provenance.

### 1.3 Out of scope

- Interpreting registry content (slice-owned).
- Diff, edit, inherit/update, trace, import/export, preview and migrate commands (advanced management surface, follow-on).
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
  - canonical-form descriptor (set-like array paths, entry keys, omittable optional fields);
  - same-slice reference edges;
  - a slice-owned registry-set validation entry point (shape and reference checks over a given root; spec §9.3).
- **Validator package version.**
- **Internal-only root override,** for tests and package development.

### 2.2 Data and state

- `<repo>/.calculogic/registries/registry-state.json`: `{ schemaVersion, activeSet }`.
- `<repo>/.calculogic/registries/custom/registry-set.manifest.json`: `{ schemaVersion, basedOn: { registries: { [id]: { validatorVersion, version, digest } } } }`. Baseline provenance is per registry; set-level Baseline values are derived (spec §4.3).
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
- Only `use` changes `activeSet`. `init-custom` never does.
- Every lifecycle path read or written resolves by realpath inside the validation target root (spec §4.1).

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
- `baselineMismatch` for every registry the trusted manifest lists, orphans included (spec §4.4, §12.1). No current inventory descriptor describes an orphan, so its Custom file and Baseline copy are digested descriptor-free;
- Baseline copy verification against manifest digests, giving `baseline-mismatch` (spec §4.4).

#### 5.2.5 Workflow: `resolveActiveRegistrySet`

Runs 5.2.1 and 5.2.4.
- Until the activation gate holds (spec §13 slice 3), a state selecting `custom` is a lifecycle error.
- If `activeSet` is `custom` and any blocking condition holds, it raises a lifecycle error naming each failing registry and the two ways forward.
- Otherwise it returns one resolved registry root per slice, plus the provenance inputs for 7.1.

Slice-shape and reference validation failures raised by slice loaders while loading an active Custom set are reported through the same lifecycle error path.

#### 5.2.6 Workflow: `initCustomRegistrySet`

- Refuses if `custom/` exists.
- Copies every inventory registry from Builtin into `custom/<slice>/` and `custom/.baseline/<slice>/`.
- Writes the manifest.
- Writes `registry-state.json` with `activeSet: builtin` only if the file is absent.

#### 5.2.7 Workflow: `useRegistrySet` (lands with Tree adoption, spec §13 slice 3)

Gated: available only once every inventory slice's registry consumers read resolved roots (spec §6, activation gate).

- `custom`: runs the 5.2.5 checks and refuses on a blocking condition. Otherwise writes `activeSet: custom`.
- `builtin`: writes `activeSet: builtin`. Custom is never touched.

### 5.3 Container `Lifecycle commands` (`src/core/registry-lifecycle/` CLI host, bin `calculogic-validator-registry`)

- `init-custom` → 5.2.6.
- `use <builtin|custom>` → 5.2.7 (spec §13 slice 3).
- `status` → 5.2.1 + 5.2.4. Read-only.

Usage errors and lifecycle errors go to stderr with a non-zero exit. Until slice 3, `use` is answered with a notice that Custom activation is not available yet.

Repository scripts: `npm run registry:init-custom` and `npm run registry:status` (`scripts/registry-lifecycle.host.mjs`).

### 5.4 Wiring into validation runs

The runner and direct slice CLIs call 5.2.5 once per run, before slice execution. Slice wiring passes each slice its resolved root. Naming's registry-state owner, the suite-core scope-profile and exit-policy loaders, and Tree's direct loaders read from that root instead of their package-relative `_builtin/` constants.

Slice 2 state: Naming and suite core read their resolved roots. Tree receives `registryRoots` for candidate collection (suite scope profiles) but its own loaders still read Builtin; they move in slice 3, which is why the activation gate stays closed.

## 6.0 Knowledge Concern (Reference Data)

### 6.1 Slice registry inventories

- `naming/src/registries/naming-registry-inventory.knowledge.mjs`
- `tree/src/registries/tree-registry-inventory.knowledge.mjs`
- `src/registries/suite-registry-inventory.knowledge.mjs`

Each is owned by its slice and lists only that slice's registries.

### 6.2 Suite inventory aggregate

`src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs` lists the slice inventories in deterministic slice order (`naming`, `tree`, `suite`). It adds no registry entries of its own.

### 6.3 Constants

Lifecycle root segments (`.calculogic/registries`), file names, `schemaVersion` values and the `builtin` / `custom` vocabulary.

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
  registry-lifecycle-status.logic.mjs              7.2
  registry-lifecycle-cli.logic.mjs                 5.3
bin/calculogic-validator-registry.host.mjs         5.3 (package bin)
scripts/registry-lifecycle.host.mjs                5.3 (repository scripts)
naming/src/registries/naming-registry-inventory.knowledge.mjs   6.1
tree/src/registries/tree-registry-inventory.knowledge.mjs       6.1
src/registries/suite-registry-inventory.knowledge.mjs           6.1
naming/src/registries/registry-state.logic.mjs     Naming entry point (validateNamingRegistrySet)
tree/src/registries/tree-registry-set.logic.mjs    Tree entry point (validateTreeRegistrySet)
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

6. Tree loaders read resolved roots. Add `use` (5.2.7) and active-Custom resolution.

### 10.2 Export checklist

- Every module listed in 9.1 exists, with CCPP file headers linking to this note and atomic comments using its section numbers.
- Every invariant in 2.4 is covered by a test.
- Report fields match the spec §11, and status output is byte-stable for a fixed on-disk state.
- The Validator docs index, the report schema and the Naming spec are updated in the same PR as the behavior they describe.
