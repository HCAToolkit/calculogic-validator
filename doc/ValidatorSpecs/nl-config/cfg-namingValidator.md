# cfg-namingValidator

> [!IMPORTANT]
> This file is **supporting implementation guidance** (NL/config context) for the naming validator and is **not** the canonical validator contract source.
> Canonical validator-owned docs:
>
> - `doc/ConventionRoutines/NamingValidatorSpec.md`
> - `doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md`
> - `doc/ConventionRoutines/FileNamingMasterList-V1_1.md`
>
> Paths in this file are relative to the standalone Validator repository root. This note is repository-owned development guidance; it is not part of the distributed `@calculogic/validator` package.
>
> Provenance: adopted from `HCAToolkit/Calculogic_React_App` `doc/nl-config/cfg-namingValidator.md` at `2738b32` (React-app issue #713), where it was kept before the Validator was extracted.

## 0.0 Version

Current implementation target: **V0.1.24** (summary classification buckets and the four registry-listed secondary families are registry-backed and wiring-provided; the three semantic-family summary buckets are still code-owned, see §2.11).

## 1.0 Purpose

Define a deterministic V0.1 filename naming validator that runs in report mode only and classifies repository filenames against the canonical naming contract.

## 2.0 Inputs and Implementation References

### 2.1 Naming authority

Summary only: naming rules are consumed from canonical docs. For normative role/grammar policy, see `doc/ConventionRoutines/FileNamingMasterList-V1_1.md` and `doc/ConventionRoutines/NamingValidatorSpec.md`.

### 2.2 Scope mode (V0.1.11)

### 2.2.1 Target filter mode (V0.1.16)

V0.1.16 adds optional repeatable `--target` inputs for developer-convenience focused runs while preserving canonical scope semantics:

- `--target <path>` and `--target=<path>` are both accepted and can be repeated
- target may resolve to a file (exact-match) or directory (recursive prefix-match)
- target paths can be repository-relative or absolute, with deterministic normalization to repository-relative `/` form for reporting
- filtering applies after canonical scope discovery (`repo|app|docs|validator|system` remain authoritative)

Deterministic validation and safety requirements:

- each target is resolved via realpath and must remain within repository root
- nonexistent targets are deterministic CLI usage/runtime errors with non-zero exit
- target unions are deduplicated and sorted deterministically
- when target filtering is active, report metadata includes:
  - `filters.isFiltered = true`
  - `filters.targets = [sorted repo-relative targets]`
- when target filtering is inactive, metadata includes `filters.isFiltered = false` and omits `filters.targets`

Validator-internal preset clarification (V0.1.16):

- this repository's `report:naming:validator:*` scripts are validator-internal convenience presets that combine `--scope=validator` with stable target unions.
- these presets do not add built-in scope profiles; they only narrow selection inside the existing `validator` scope boundary.
- current validator-internal naming presets use deterministic ownership slices (targets relative to the validator development root):
  - entry surfaces: `bin` + `scripts`
  - naming slice: `naming`
  - tree slice: `tree`
  - docs slice: `doc`

V0.1.11 supports deterministic scope profiles selected via CLI and applied before filename classification using explicit scope path predicates:

- default/no `--scope` input resolves to `repo`
- `repo`: repository-wide reportable files.
- `app`: application-focused files (`src/` and `test/` only).
- `docs`: docs-focused files (`doc/`, `docs/`, and selected root conventional docs currently limited to `README.md`).
- `validator`: the validator development root, resolved per `doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md` §6.7: `.` in a standalone checkout, `calculogic-validator/` in embedded development, and unavailable in an installed consumer, where `--scope=validator` fails with `validator-development-root-unavailable`.
- `system`: root tooling files only (`package.json`, `package-lock.json`, `tsconfig*.json`, `eslint.config.*`, `vite.config.*`).

Scope predicates are evaluated on normalized repository-relative paths before report findings are generated. Invalid scope inputs are treated as CLI usage errors.

### 2.3 Role registry metadata (V0.1.1)

The validator uses a structured role registry. Each composed role entry has the metadata fields:

- `role`
- `category`
- `status` (`active`, `deprecated`)
- optional `notes`

The role and category vocabulary is defined by the builtin registries, not by this note, and has grown well beyond the original V0.1.1 subset. Read the current values from:

- `naming/src/registries/_builtin/roles.registry.json`: the canonical flat role list with each role's `status` (for example the active roles `host`, `logic`, `adapter`, and the deprecated historical role `view`)
- `naming/src/registries/_builtin/category-role-perspective.registry.json`: which roles belong to which category
- `naming/src/registries/_builtin/categories.registry.json`: the allowed categories, including those accepted for `naming.roles.add[].category` (for example `concern-core`, `documentation`, `surface-system`, `integration-adapter`)

How these files are composed at runtime is described in §2.6.

### 2.4 Repository layout contract (V0.1.8)

Validator implementation assets live at the root of this standalone repository:

- canonical module layout: `naming/src/{naming-validator.host.mjs,naming-validator.wiring.mjs,naming-validator.logic.mjs,naming-validator.contracts.mjs}`
- naming-owned CLI semantic area: `naming/src/cli/` (`naming-cli-args.logic.mjs`, `naming-cli-usage.logic.mjs`, `naming-report-builder.logic.mjs`, `naming-cli-runner.logic.mjs`)
- naming-owned health semantic area: `naming/src/health/` (`naming-health-check.logic.mjs`, `naming-health-check.host.mjs`)
- extension-point folders: `naming/src/registries/` and `naming/src/rules/`
- suite-core CLI semantic area: `src/core/cli/` (`validator-cli-output.logic.mjs`, `validator-cli-usage.logic.mjs`, `validator-cli-targets.logic.mjs`)
- package export barrel: `src/index.mjs`
- stable repository-root resolver shared by CLIs: `src/core/repository-root.logic.mjs`
- repo-local script entrypoints remain supported: `scripts/{validate-naming.host.mjs,validate-tree.host.mjs,validate-all.host.mjs,validator-health-check.host.mjs}`
- stable installable bin entrypoints: `bin/{calculogic-validate.host.mjs,calculogic-validate-naming.host.mjs,calculogic-validate-tree.host.mjs,calculogic-validator-health.host.mjs,calculogic-validator-report-summarize.host.mjs}` (the `bin` map in `package.json` is authoritative)
- validator tests: `test/*.test.mjs`

This repository's `package.json` scripts are the development invocation interface (`npm run validate:naming`, `npm run validate:all`, `npm run validate:tree`, `npm run health:validator`, `npm test`, and the `report:*` presets). Consumers invoke the installed package bins (`calculogic-validate`, `calculogic-validate-naming`, `calculogic-validate-tree`, `calculogic-validator-health`, `calculogic-validator-report-summarize`), for example with `npx --no-install`.

Ownership boundary rule: suite-wide cross-slice concerns belong in semantic suite-core areas under `src/core/<area>/`; naming-owned shared concerns belong in semantic naming areas under `naming/src/<area>/`. Prefer these semantic owner areas over generic catch-all helper folders when ownership is clear.

### 2.5 Health-check contract (V0.1.11)

Thin-wrapper contract for naming entrypoints: repo-local scripts and installable bins are orchestration shells only; they parse/forward CLI inputs and delegate behavior to naming-owned semantic areas (`naming/src/cli/` and `naming/src/health/`) plus suite-core CLI helpers where applicable.

Health-check entrypoint lives at `scripts/validator-health-check.host.mjs` and is exposed via this repository's `npm run health:validator` script.
Stable installable health bin entrypoint lives at `bin/calculogic-validator-health.host.mjs`.
Canonical naming-owned health implementation is split by concern: pure assertions live at `naming/src/health/naming-health-check.logic.mjs`, while process entrypoint behavior lives at `naming/src/health/naming-health-check.host.mjs`; repo-local script/bin entrypoints remain thin wrappers that delegate to the naming-owned host wrapper.

The health check resolves its context with `resolveValidatorDevelopmentContext` (`src/core/validator-development-context.logic.mjs`, per `doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md` §6.7) and uses one package root for context, scope availability, and scope runs.

Scope determinism:

- for each of `repo`, `app`, `docs`, `validator`, and `system` (in that order), a scope whose contextual status is available must resolve a profile via host API, and repeated in-process runs must keep stable summary-level outputs (`totalFilesScanned`, `counts`, `codeCounts`, `specialCaseTypeCounts`, `warningRoleStatusCounts`, `warningRoleCategoryCounts`)
- a scope that is unavailable in the context is not run; it is recorded with its reason code (in an installed consumer, `validator` is recorded with `validator-development-root-unavailable`)
- only scopes whose determinism check completed are reported as checked; a failing scope fails the health check and is never reported as checked

Documentation sanity check (bounded):

- runs only when the context has a validator development root (standalone or embedded development), and reads exactly two Validator-owned documents relative to that root:
  - `doc/ConventionRoutines/NamingValidatorSpec.md`
  - `doc/ValidatorSpecs/nl-config/cfg-namingValidator.md`
- both documents are required in a development context; a missing document fails the health check and names the path
- each document must mention every `app` scope include root from `src/registries/_builtin/scope-profiles.registry.json` (currently `src/` and `test/`) and the phrase `validator development root`
- in an installed consumer there is no validator development root, so the health check discovers and reads no documents at all; files in the consumer checkout (including a retained embedded `calculogic-validator/` tree or a consumer `doc/nl-config/` note) never affect the result
- this is a bounded consistency check, not documentation validation: it proves that the two documents still name the app scope roots and the development-root concept, not that their other content matches the implementation

Output (stdout, exit `0`):

- `OK: naming validator deterministic for <checked scopes joined by |>`
- one `SKIP: scope <scope> not checked (<reason code>)` line per unavailable scope
- `OK: docs sanity check passed (<document paths>)` in a development context, or `OK: docs sanity check not applicable (installed-consumer: no validator development root)`

Health-check behavior is fail-fast semantics: any contract violation returns non-zero exit status.

### 2.6 Validator config contract (V0.1)

Naming validator supports optional runtime config input with deterministic JSON contract:

- `version` must equal `"0.1"`
- optional `strictExit` boolean (enables strict exit semantics; see `doc/ValidatorSpecs/validator-config.spec.md`)
- optional `naming.reportableExtensions.add` array
- each extension entry must be a string starting with `.`
- optional `naming.roles.add` array of role metadata objects:
  - required `role` string
  - required `category` string, validated against `naming/src/registries/_builtin/categories.registry.json` `categories[].category`
  - required `status` from `active | deprecated`
  - optional `notes` string
- optional `naming.caseRules.semanticName.style` string
  - when provided, must be `kebab-case` for current runtime support

Normalization and merge semantics for `naming.roles.add` are deterministic and additive-only:

- role values are trimmed before validation and storage
- duplicate role entries in config are dropped by first occurrence (input-order stable)
- entries whose role already exists in built-in role registry are treated as no-op at runtime

Runtime behavior in this slice resolves naming registries via registry-state logic:

- wiring resolves inputs through `resolveNamingRegistryInputs({ config })`
- resolver computes one effective built-in registry root per call (defaulting to `naming/src/registries/_builtin`)
- built-in roles are composed from two files in that effective root (`loadBuiltinRolesPayload` in `naming/src/registries/registry-state.logic.mjs`):
  - category membership (`rolesByCategory`) comes from `category-role-perspective.registry.json` when present; only when it is absent is `rolesByCategory` read from `roles.registry.json` (legacy grouped shape)
  - each role's status comes from the flat canonical role list in `roles.registry.json` (`roles[]`: `{ role, status, definition }`), falling back to the membership entry's own `status`, then to a legacy grouped `rolesByCategory` status
  - the composed entries are flattened into `{ role, category, status, notes? }` and validated against the allowed categories
- built-in reportable extensions are loaded from that effective root `reportable-extensions.registry.json` (`reportableExtensions`)
- built-in summary-bucket policy is loaded from that effective root `summary-buckets.registry.json` (`classificationBuckets`, `secondaryBucketFamilies`) and returned by the resolver as `summaryBuckets`
- built-in allowed categories for role validation are loaded from that same effective root `categories.registry.json`
- when `activeRegistry` is `custom`, custom payload uses `_custom` roles/extensions plus builtin-backed `reportableRootFiles` and `summaryBuckets`
- resolver returns normalized arrays for `reportableExtensions` and `roles`, plus `reportableRootFiles` and `summaryBuckets`
- wiring converts arrays into runtime structures expected by naming runtime:
  - `reportableExtensions` → `Set`
  - `roles` → `{ roleMetadata: Map, activeRoles: Set, roleSuffixes: string[] }` where role suffixes are length-desc sorted
- duplicate roles remain first-wins during map conversion

Runtime output for host-wiring now includes additive registry metadata for observability:

- `registry.registryState` from registry-state selection (`builtin | custom`)
- `registry.registrySource` to indicate effective source (`builtin | custom | config`)
- `registry.registryDigests` with deterministic digest entries (`builtin`, `custom`, `resolved`)

Validator config contract includes a publishable JSON Schema for editor/tool integration:

- schema path: `src/validator-config.schema.json`
- canonical authority: this top-level schema file is the single maintained source (no independently maintained duplicate under `src/core/config`)
- schema `properties.version.const` must match runtime `VALIDATOR_CONFIG_VERSION`

Runtime and schema strictness are intentionally aligned. Unknown keys are rejected at the following levels:

- root object (except optional `$schema` editor-hint key, ignored by runtime normalization)
- `naming`
- `naming.reportableExtensions`
- `naming.roles`
- `naming.caseRules`
- `naming.caseRules.semanticName`
- each `naming.roles.add[]` entry object

### 2.7 Report metadata contract (V0.1.12)

Naming report JSON includes deterministic metadata fields for CI/debug sharing while preserving all prior fields:

- `toolVersion`: loaded from the Validator package's own `package.json` `version`.
- `configDigest`: `sha256(stableStringify(config))` when `--config` is supplied.
- `startedAt`, `endedAt`, `durationMs`: execution timing for each naming report invocation.

`stableStringify` sorts object keys recursively and preserves array order to keep digest generation deterministic across runs.

### 2.8 Walk exclusions runtime source (V0.1.17)

Naming path discovery for repository walking is sourced from builtin registry JSON at:

- `naming/src/registries/_builtin/walk-exclusions.registry.json`

Runtime walk policy fields:

- `excludedDirectories`: directory basenames skipped during recursive walk.
- `skipDotDirectories`: when `true`, dot-directories are skipped.
- `allowDotFiles`: retained registry compatibility field (loaded at runtime) for explicit dot-file entries such as `.eslintrc`; it does **not** act as a deny-by-default switch for all other dot-files.

This slice preserves default builtin walk behavior (`.git`, `.vite`, `coverage`, `dist`, `node_modules`; skip dot-directories) while allowing reportable dot-files to flow through standard reportable-file checks.

### 2.9 Semantic-name case rules runtime source (V0.1.18)

Semantic-name case validation is sourced from builtin registry JSON at:

- `naming/src/registries/_builtin/case-rules.registry.json`

Runtime currently supports the builtin `semanticName.style` value `kebab-case` only for this slice. The runtime maps that style to the existing canonical kebab-case semantic-name predicate behavior.

### 2.10 Naming runtime input ownership boundary (V0.1.24)

Wiring owns registry/default/config composition and prepares runtime-ready dependencies before invoking runtime behavior.

Prepared runtime dependency source path:

- registry resolver: `naming/src/registries/registry-state.logic.mjs`
- converter module: `naming/src/naming-runtime-converters.logic.mjs`
- wiring composition entrypoint: `naming/src/naming-validator.wiring.mjs`
- runtime consumer: `naming/src/naming-validator.logic.mjs`

Prepared runtime dependency contract:

- `namingRolesRuntime` supplied by wiring (shape: `roleMetadata`, `activeRoles`, `roleSuffixes`)
- `reportableExtensions` supplied by wiring as runtime `Set`
- `walkExclusions` supplied by wiring (shape: `excludedDirectories`, `skipDotDirectories`, `allowDotFiles`)

Ownership and precedence requirements:

- runtime does not resolve registry state and does not build builtin runtime defaults at module scope.
- runtime does not import builtin walk-exclusions registry loaders and does not own builtin fallback seams.
- runtime behavior remains responsible for scanning, scope filtering, target filtering, classification, and summarization.
- host/wiring public behavior remains unchanged; config continues to override builtin defaults via resolver + converter flow before runtime execution.

Future alignment note:

- current runtime purity for naming runtime dependencies is complete.
- `walkExclusions` are currently prepared in wiring from the builtin walk-exclusions loader path.
- future customization may align `walkExclusions` with the same registry-state/config-driven composition path used for roles and reportable extensions.
- this is an architecture alignment note only, not a current contract violation.


### 2.11 Summary bucket policy runtime source (V0.1.24)

Naming summary bucket vocabulary is sourced from builtin registry JSON at:

- `naming/src/registries/_builtin/summary-buckets.registry.json`

Runtime summary policy fields:

- `classificationBuckets`: classification keys seeded with `0` in summary `counts`. A classification that is not listed is still counted when a finding has it.
- `secondaryBucketFamilies`: which registry-backed secondary families are counted (currently `codeCounts`, `specialCaseTypeCounts`, `warningRoleStatusCounts`, `warningRoleCategoryCounts`). The summary output always includes all four keys; a family that is not listed is returned as an empty object.

Code-owned summary buckets (not registry-backed):

- `familyRootCounts`, `familySubgroupCounts`, and `semanticFamilyCounts` are always created, counted, and returned by `summarizeFindings` in `naming/src/naming-validator.logic.mjs`, whatever `secondaryBucketFamilies` lists. Removing or adding them in the registry has no effect.

Ownership boundary:

- registry resolver loads summary-bucket policy as part of naming registry inputs.
- wiring prepares and injects summary-bucket runtime dependencies into summary generation.
- runtime summary logic consumes prepared summary policy and preserves deterministic ordering/count semantics.

## 3.0 Classification Contract

### 3.1 Canonical

Classify as canonical when filename parses as `<semantic-name>.<role>.<ext>` (including `.module.css`) with kebab-case semantic name and a known role whose registry status is `active`. A known but deprecated role (for example `view`) is not canonical; it is classified invalid or ambiguous with `NAMING_DEPRECATED_ROLE` (§3.4).

### 3.2 Allowed special case

Classify as allowed special case for reserved filenames and patterns including barrel files, framework-required names, test files (`*.test.<code-ext>` / `*.spec.<code-ext>`), ambient declaration files, and README convention docs.

Runtime source of truth for builtin special-case classification is `naming/src/registries/_builtin/special-cases.registry.json`, evaluated in stable first-match order with currently-supported match forms (`basenameEquals`, `suffixEquals`, `regex`).

Allowed special-case findings include `details.specialCaseType` values:

- `ecosystem-required`
- `barrel`
- `test-convention`
- `ambient-declaration`
- `conventional-doc`

### 3.3 Legacy exception

Classify as legacy exception when file is in-scope but does not claim canonical structure and is tolerated by incremental adoption.

### 3.4 Invalid or ambiguous

Classify as invalid or ambiguous when filename appears to claim canonical intent but violates deterministic parse rules (unknown role, deprecated role, bad semantic casing, or hyphen-appended role ambiguity).

## 4.0 Findings and Reporting

### 4.1 Stable finding schema

Each finding includes code, severity, path, classification, message, ruleRef, and optional suggestedFix/details.

### 4.2 Deterministic ordering

Findings and summary output sort by normalized relative path.

### 4.3 Summary breakdowns (V0.1.2)

Report output includes deterministic summary breakdowns for:

- classification counts
- finding code counts
- special-case subtype counts
- warning role status/category counts (when metadata is present)

### 4.4 Scope-aware reporting metadata (V0.1.2)

Report output includes selected scope metadata and deterministic file-count/findings summaries within that scope.

### 4.5 Scope observability metadata (V0.1.4)

Report output includes additive scope observability metadata:

- `scopeSummary.scope`
- `scopeSummary.reportableFilesInScope`
- `scopeSummary.findingsGenerated`

This metadata is additive and does not alter legacy report-mode findings behavior.

### 4.6 Exit behavior (report mode, V0.1.13)

Summary only (canonical policy is defined in `doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md` and mirrored by `doc/ConventionRoutines/NamingValidatorSpec.md`):
Report mode prints full JSON report payload to stdout in non-usage-error flows, then exits with deterministic CI-oriented status:

- default mode: exit `2` when any finding has `severity="warn"`.
- strict mode (`--strict`): exit `2` when any warning exists; otherwise exit `1` when any finding has `classification="legacy-exception"`.
- exit `0` when neither warning criteria nor strict legacy criteria are present.

Priority order is deterministic:

1. warnings (`severity="warn"`) dominate and force exit `2`.
2. strict legacy-exception enforcement produces exit `1` only when no warnings exist.
3. otherwise success is exit `0`.

Invalid CLI usage and argument parse errors remain exit `1`.

### 4.7 Canonical envelope aliases and source snapshot metadata (V0.1.16)

Naming CLI report output remains backward compatible and additive while exposing canonical envelope aliases:

- `validatorId = "naming"`
- `validatorVersion = toolVersion` (when tool version is available)
- `sourceSnapshot` for deterministic runtime source observability with at least:
  - `source = "fs"`
  - optional git metadata when available (`gitRef = "HEAD"`, `gitHeadSha`, and `diagnostics` containing `isDirty`, `changedCount`, `untrackedCount`)

When git is unavailable or repository git metadata cannot be resolved, report output still includes `sourceSnapshot.source = "fs"` and omits git-only fields.

## 5.0 Deferred Behavior

Deferred to later slices:

- soft-fail mode
- hard-fail mode
- changed-files mode
- auto-fix/rename workflows
- provenance consistency checks
- other validators
