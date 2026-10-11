# Validator Suite-Owned Shared Helpers and Capabilities Inventory

Classification: Normative

## 1) Purpose

This document is the canonical implementation-facing inventory for **currently existing** suite-owned shared helpers and reusable capabilities.

It is a reuse/navigation guide for implementation work so contributors can deterministically answer:

- whether a suite-owned shared helper/capability already exists,
- where it lives, and
- when to reuse it instead of reimplementing ad hoc.

This document complements, but does not replace:

- `ValidatorHelperAreas-And-Reuse-Conventions.md`
- `ValidatorLoaderConverterRuntimeOwnership-Contract.md`

## 2) Authority and boundary note

- This inventory is for reuse/navigation guidance.
- Canonical ownership and boundary rules remain governed by the existing ownership docs listed above.
- Do **not** interpret this inventory as permission to move slice-owned behavior into suite-core.
- Similar-looking behavior is not automatically shared behavior; ownership remains concern-first.

## 3) Current suite-owned shared helper/capability inventory

Only currently real, discoverable suite-owned surfaces are listed here.

### 3.1 Entry: suite-core CLI helper area

- **Owner:** suite-core
- **Path/area:** `src/core/cli/`
- **Concern:** shared validator CLI scaffolding for usage/error output flow and repeatable CLI argument parsing.
- **Reusable capability:**
  - structured report emission helpers via `validator-cli-output.logic.mjs`
  - usage/usage-error formatting and output via `validator-cli-usage.logic.mjs`
  - repeatable `--target` parsing/normalization via `validator-cli-targets.logic.mjs`
  - scope token/order and scope usage-line helpers via `validator-cli-scopes.logic.mjs`
  - one registry lifecycle resolution per CLI invocation, shared by usage text and the run, via `validator-cli-registry-resolution.logic.mjs` (#41; a failed resolution keeps Builtin usage roots so `--help` works, and the run reports the lifecycle error)
- **When to reuse:**
  - adding/updating validator CLI entrypoints (`validate:naming`, `validate:tree`, `validate:all`, or new suite CLIs)
  - implementing repeatable `--target` argument handling
  - implementing consistent scope usage output derived from suite scope vocabulary
  - building usage text that reads a registry (pass the invocation's `usageRegistryRoots`, never Builtin directly)
  - implementing report-first stdout emission + usage/error stderr behavior
- **When not to reuse:**
  - slice-internal runtime logic that is not CLI-facing
  - slice-specific parser semantics that belong to slice-owned CLI areas
- **Reuse boundary type:** helper-area reuse

### 3.2 Entry: shared scoped snapshot/input helper boundary

- **Owner:** suite-core
- **Path/area:** `src/core/suite-scoped-snapshot-input.logic.mjs`
- **Concern:** suite-owned scope profile selection and deterministic in-scope path/input collection.
- **Reusable capability:**
  - scope-profile read
  - `includeRoots` walking
  - `includeRootFiles` inclusion
  - scope-root containment: every declared `includeRoots` / `includeRootFiles` entry is checked against the target before traversal (see 3.9)
  - normalized path collection
  - optional target filtering
  - deterministic sort/dedupe for selected path sets
- **When to reuse:**
  - any slice validator that needs suite-owned scope selection before slice interpretation
  - any cross-slice validator/composition that needs the same suite scope boundary
  - any implementation that must preserve suite-consistent scope + target semantics
- **When not to reuse:**
  - logic deciding what selected paths *mean* for a specific slice
  - slice heuristics that should remain slice-owned interpretation behavior
- **Reuse boundary type:** runtime boundary reuse (and composition boundary reuse for cross-slice composition)

### 3.3 Entry: suite-core validator candidate policy and collection helper

- **Owner:** suite-core
- **Path/area:**
  - `src/core/validator-candidate-policy.contracts.mjs`
  - `src/core/validator-candidate-policy.logic.mjs`
  - `src/core/validator-candidate-collection.logic.mjs`
- **Concern:** broad validator candidate policy contract and deterministic candidate collection mechanics before slice-owned interpretation.
- **Reusable capability:**
  - normalized candidate extension and candidate root-file policy inputs
  - walk-exclusion and skip-dot-directory inputs
  - suite scope/profile and target filtering reuse through existing suite-core scoped snapshot helpers
  - deterministic candidate path sorting and dedupe
- **When to reuse:**
  - proving or adopting shared broad candidate collection before a validator slice interprets candidate paths
  - adapting slice-owned candidate values into a suite-owned candidate collection contract without moving registry authority
- **When not to reuse:**
  - deciding what a filename, folder, semantic family, structural home, or candidate path means for a specific slice
  - moving slice-owned initial policy value authority into suite-core
- **Reuse boundary type:** contract/helper boundary reuse

### 3.4 Entry: suite-core exit policy derivation helper

- **Owner:** suite-core
- **Path/area:** `src/core/validator-exit-code.logic.mjs`
- **Concern:** deterministic suite exit-code derivation from findings and strict-mode semantics.
- **Reusable capability:**
  - derive exit code from findings (`deriveExitCodeFromFindings`)
  - derive exit code from composed runner reports (`deriveExitCodeFromRunnerReport`)
  - application of suite builtin exit policy predicates without duplicating policy checks in each CLI
- **When to reuse:**
  - any validator CLI that must map findings/report outputs to suite-consistent exit codes
  - composed suite execution paths where multiple validator findings feed one exit status
- **When not to reuse:**
  - non-validator tooling with intentionally different exit semantics
  - experimental policy behavior not yet part of suite exit policy contract
- **Reuse boundary type:** runtime boundary reuse

### 3.5 Entry: suite-core report meta + source snapshot helpers

- **Owner:** suite-core
- **Path/area:**
  - `src/core/validator-report-meta.logic.mjs`
  - `src/core/source-snapshot.logic.mjs`
  - `src/core/validator-direct-report.logic.mjs`
  - `src/core/validator-report-identity.logic.mjs`
- **Concern:** deterministic shared metadata helpers used in validator report envelopes.
- **Reusable capability:**
  - tool version lookup and stable hashing/digest helpers for config/report metadata
  - git/filesystem source snapshot metadata capture for report reproducibility context
  - direct validator report envelope mechanics for mode, validator identity, version, config digest, source snapshot, timestamps, and duration
  - bounded report identity lookup from registry report metadata when parity tests prove current emitted identity fields stay unchanged
- **When to reuse:**
  - constructing validator or runner report envelopes that require suite-consistent metadata fields
  - constructing direct validator reports that must preserve slice-owned findings and summaries while sharing suite-core envelope mechanics
  - computing deterministic config digest/fingerprint values used across validators
- **When not to reuse:**
  - slice-specific finding logic or traversal mechanics
  - policy registry canonicalization that belongs in loader/converter layers
- **Reuse boundary type:** composition boundary reuse

### 3.6 Entry: suite-core validator registry metadata surface

- **Owner:** suite-core
- **Path/area:**
  - `src/core/validator-registry.knowledge.mjs`
  - `src/core/validator-report-capture-metadata.logic.mjs`
- **Concern:** data-only slice registration metadata for current validator-suite registration surfaces.
- **Current runtime truth:** registry entries keep `id`, `description`, and `run` as the runner behavior-driving fields. Registry report metadata may drive behavior-preserving runner/direct report identity fields where parity tests prove the emitted report stays stable. Registry command metadata may drive bounded direct usage text where parity tests prove the command surface stays stable. Report-capture preset metadata records current package-script capture mechanics and may be read by tests or inspection helpers, but package scripts remain literal current runtime truth until a separately scoped behavior migration changes that. Other metadata remains inspectable registration data and does not drive runner dispatch, package scripts, package bins, exit-code behavior, Naming behavior, Tree behavior, or candidate behavior.
- **Reusable capability:**
  - canonical slice identity metadata aligned to the registry id;
  - report identity metadata aligned to current report entry id/validator id/description;
  - repo-local npm command, direct script, package-bin availability, and report-capture prefix expectations;
  - report-capture package-script presets for current Naming, Tree, validate-all, and explicitly deferred Addressing capture surfaces;
  - default `validate:all` runner inclusion and direct-runnable/runner-only capability metadata;
  - bounded bridge metadata for the current Naming semantic-family bridge contribution consumed by Tree;
  - compatibility expectation metadata for current report-mode and behavior-preserving registration.
- **When to reuse:**
  - inspecting current suite-core slice registration surfaces;
  - adding a future validator slice that needs the same bounded registration facts;
  - writing shape tests that prove command/report/bin expectations are explicit without changing scripts or bins;
  - writing report-capture preset tests that compare registry-backed metadata to literal package scripts and representative emitted reports;
  - sourcing runner/direct report identity fields when exact parity coverage proves the current report shape is preserved;
  - sourcing direct command usage text when exact parity coverage proves the command surface is preserved.
- **When not to reuse:**
  - driving runtime runner selection, broader report shape, exit policy, or package command generation before a separate behavior-migration task explicitly scopes that change;
  - treating command metadata as authority for Naming or Tree semantic interpretation;
  - treating report-capture metadata as semantic policy or as authority for finding ids, summaries, severities, Naming interpretation, Tree reasoning, Addressing behavior, or report output shape;
  - storing slice-owned semantic interpretation policy, finding policy, Naming taxonomy, Tree placement policy, or candidate value authority in suite-core metadata;
  - creating a universal plugin architecture or generic shared bucket.
- **Reuse boundary type:** data-only registration metadata boundary

### 3.7 Entry: suite-core registry lifecycle

- **Owner:** suite-core
- **Path/area:**
  - `src/core/registry-lifecycle/`
- **Concern:** Builtin/Custom registry set selection (#41): lifecycle state, Custom set initialization, assessment and activation (`use`), comparison digests, one resolution per run into resolved registry roots, and report provenance.
- **Reusable capability:**
  - `resolveActiveRegistrySet` for validator CLIs and the runner (one call per run, passed to slices as `registryResolution`); an active Custom set with a blocking condition raises one lifecycle error naming each failing registry
  - `useRegistrySet` for changing the active set (the only operation that does)
  - `extractComparisonEntries` and `classifyEntry` (`registry-lifecycle-comparison.logic.mjs`): addressed entries from a registry's slice-owned comparison identity declaration, and the three-way entry class (spec §8.2, §8.4); `buildRegistryLifecycleDiff` for the read-only `diff`
  - `buildRegistryUpdateDecisionsTemplate` and `checkRegistryUpdateDecisions` (`registry-lifecycle-decisions.logic.mjs`): the update decisions document bound per registry to the compared digests, and its strict, read-only check (spec §12.4)
  - slice inventories (registry ids, descriptors, readable versions) aggregated in deterministic slice order
- **When to reuse:**
  - any validation entry point that loads registries; slices read their resolved root instead of package `_builtin/` constants
- **When not to reuse:**
  - interpreting registry content, shape validation or runtime-form canonicalization, which stay slice-owned
- **Reuse boundary type:** runtime boundary reuse
- **Contract:** `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md`

### 3.8 Entry: suite-core registry entry-shape assertion

- **Owner:** suite-core
- **Path/area:**
  - `src/core/registry-entry-shape.logic.mjs`
- **Concern:** one bounded check for list-of-records registries: a non-empty list of objects with declared required string fields, string-list fields, optional string fields, enumerated fields and a key field unique after trimming. Shapes are closed: an undeclared field is rejected.
- **Reusable capability:**
  - `assertRegistryEntries(entries, shape)` called from slice registry loaders and registry-set validation entry points
  - `assertAllowedFields(value, allowedFields, labels)` for objects that are not list records
  - `assertRegistryRootFields(payload, rootFields, labels)` and `assertNoPaddedStrings(payload, labels)` called by each slice's registry-set validation entry point
  - `isPathSegmentName(value)` and `isSingleFileExtension(value)` for registry values the runtime compares as one path segment or with `path.extname`
- **When to reuse:**
  - a slice registry whose records need a declared shape check, so malformed Custom records are reported `invalid` (lifecycle spec §9.3)
- **When not to reuse:**
  - cross-registry reference edges, nested structures or slice meaning; the slice declares the shape and keeps those checks
- **Reuse boundary type:** loader boundary reuse

### 3.9 Entry: suite-core target-path containment

- **Owner:** suite-core
- **Path/area:**
  - `src/core/target-path-containment.logic.mjs`
- **Concern:** the one suite rule that a path the Validator treats as part of a validation target resolves by realpath inside the target. Internal symlinks are allowed; escaping, dangling or otherwise unresolvable ones are not.
- **Reusable capability:**
  - `classifyTargetPathContainment(targetRoot, candidatePath)` → `contained` / `escaping` / `unresolvable`
  - `isPathInsideTarget(targetRoot, candidatePath)`
  - `resolveRealPath(candidatePath)`, which resolves a not-yet-existing path through its nearest existing ancestor
- **Current consumers:** the scoped snapshot/input helper (scope roots and root files, 3.2) and the registry lifecycle (lifecycle paths, 3.7).
- **When to reuse:** any new place that reads or writes a target path a consumer can influence (a registry value, a profile entry, a lifecycle file).
- **When not to reuse:** CLI `--target` resolution keeps its own existence-and-escape check in `scoped-target-paths.logic.mjs`, which also requires the target to exist.
- **Reuse boundary type:** helper-area reuse

### 3.10 Entry: suite-core repository local-package evidence

- **Owner:** suite-core
- **Path/area:**
  - `src/core/repository-local-package-evidence.logic.mjs`
- **Concern:** one neutral repository fact (#37): which top-level folders the validation target's root manifest explicitly declares as local packages, where each folder also has its own contained package manifest. It reports the fact only. Deciding what the fact allows (for example a top-level folder in Tree's repo shape) belongs to the consuming slice.
- **Qualifying rule (both sides required):**
  - **Root declaration.** `<target>/package.json` is contained (3.9) and parses as a JSON object. It declares `<folder>` in one of these supported forms:
    - in `dependencies`, `devDependencies`, `optionalDependencies` or `peerDependencies` (each a JSON object), a string value that is exactly `file:<folder>` or `link:<folder>`;
    - in `workspaces`, given as an array of strings or as an object whose `packages` is an array of strings, an entry that is exactly `<folder>`.

    In both forms, `<folder>` may be written with a leading `./` and one trailing `/`.
  - **Folder manifest.** `<target>/<folder>` resolves inside the target and is a directory, and `<target>/<folder>/package.json` resolves inside the target and parses as a JSON object. Containment is checked before the manifest is read. `<folder>`, the nested `package.json` and the root `package.json` must each match a directory entry's spelling exactly, so a case-insensitive filesystem gives the same evidence as a case-sensitive one.
  - **Folder name.** `<folder>` is one path segment: not empty, no `/` or `\`, not `.` or `..`, and no glob character (`*`, `?`, `[`, `]`, `{`, `}`, `!`). The whole reference and the folder name inside it carry no surrounding whitespace; a padded reference is unsupported, not trimmed.
  - **Everything else does not qualify, and is never reinterpreted.** That includes nested paths (`file:packages/x`), parent or absolute paths, globs, other protocols, and external workspace formats such as `pnpm-workspace.yaml`. A missing or malformed root manifest yields no evidence; it is not an error, because the Validator does not validate manifests.
- **Reusable capability:**
  - `collectDeclaredLocalPackageEvidence(targetRoot)` returns records sorted by folder: `{ folder, manifestPath, declarations }`. Each declaration is sorted and is `{ field, key, value }` for a dependency or `{ field, value }` for a workspace entry.
- **Current consumers:** Tree's effective repo-shape policy (`tree/src/tree-contextual-repo-shape-policy.logic.mjs`).
- **When to reuse:** a slice that needs to know which top-level folders the repository itself declares as its own packages.
- **When not to reuse:** dependency resolution, version checks or any manifest validation. This is a fact extractor, not a package manager.
- **Reuse boundary type:** helper-area reuse

## 4) Guardrails

- Do **not** invent shared helpers in this inventory that do not currently exist.
- Do **not** treat runner/composition/runtime modules generically as "helpers" unless the reusable capability is explicit and bounded.
- Do **not** bypass slice ownership just because behavior looks similar.
- Prefer reuse of actual suite-owned capabilities above over ad hoc reimplementation when concern + owner match.

## 5) Codex-oriented usage note

Before adding new cross-slice helper logic:

1. Check this inventory first.
2. If an existing suite-owned helper/capability matches both concern and owner, reuse it.
3. If no entry matches, fall back to:
   - `ValidatorHelperAreas-And-Reuse-Conventions.md` for helper-area routing, and
   - `ValidatorLoaderConverterRuntimeOwnership-Contract.md` for loader/converter/runtime boundary ownership.

This keeps implementation ROI aligned with clear boundaries, deterministic organization, and extraction-friendly growth.
