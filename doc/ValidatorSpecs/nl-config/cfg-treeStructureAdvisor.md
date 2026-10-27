# cfg-treeStructureAdvisor

Status labeling for this NL/config note:

- **Current implementation target** = currently shipped/active runtime target for this slice.
- **Deferred Behavior** = future advisory direction, not shipped runtime behavior.
- Repo-shape examples are current-repo implementation reality, not universal published builtin requirements.

Navigation backlinks:

- Tree validator spec (runtime authority): [`calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md`](../tree-structure-advisor-validator.spec.md)
- Tree documentation map (navigation metadata): [`calculogic-validator/doc/ValidatorSpecs/tree-owned/tree-documentation-map-and-reorg-inventory.md`](../tree-owned/tree-documentation-map-and-reorg-inventory.md)
- Pointer stub at prior path: [`doc/nl-config/cfg-treeStructureAdvisor.md`](../../../../doc/nl-config/cfg-treeStructureAdvisor.md)

Canonical reading order for tree implementation work:

1. `calculogic-validator/doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md`
2. `calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md`
3. `calculogic-validator/doc/ConventionRoutines/NamingValidatorSpec.md`
4. `calculogic-validator/doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md` (this document)

## 0.0 Version

Current implementation target: **V0.1.7** (bounded occurrence-level structural class assignment over tree occurrence records, consumed in tree-core occurrence-driven file reasoning while preserving resolved-path findings output).

## 1.0 Purpose

Add a conservative tree-structure advisor validator slice that proves validator-suite multi-slice execution while remaining report-only and non-destructive.

V0.1.1 converges this slice to a canonical owned boundary under `calculogic-validator/tree/src/` to match naming-slice boundary conventions.

## 2.0 Inputs and Source of Truth

### 2.1 Scope and targets

- Uses validator suite scope resolution (`repo|app|docs|validator|system`).
- Supports optional runner-forwarded `targets` when selected through `validate-all` with deterministic validation and selection parity to suite target semantics.
- Supports the same optional repeatable target filtering when selected through dedicated `validate-tree` CLI (`--target <path>` and `--target=<path>`).
- Default scope remains `repo` via existing runner behavior.

### 2.5 Dedicated CLI surface (`validate-tree`) (V0.1.3)

`validate-tree` is a thin report-mode CLI wrapper over the validator runner with a fixed validator set containing only `tree-structure-advisor`.

Contract:

- accepts `--help`
- accepts optional `--scope=<repo|app|docs|validator|system>`
- accepts optional repeatable targets via `--target <path>` and `--target=<path>`
- preserves npm argument-forwarding guard behavior used by validator script surfaces
- emits JSON report envelope aligned with runner report conventions
- remains report-only (no fix/mutate behavior; report-first does not imply guaranteed exit `0`)

### 2.2 Repository signals

V0.1.x uses deterministic path-based and occurrence-backed signals only:

- top-level directory names in repository root
- repository-relative file paths
- filename basename patterns that strongly indicate validator ownership
- occurrence-derived structural records when `structuralAddressSnapshot.occurrenceRecords` is available

Current boundary note: shipped tree heuristics may ingest naming-derived semantic-family evidence only through a bounded prepared-input bridge projection. Tree must consume naming-owned signals and must not derive semantic-family semantics independently.

### 2.3 Initial advisory heuristics (narrow slice)

1. **Top-level unexpected-folder advisory**
   - Emit info advisory for clearly unusual non-hidden top-level folders outside known repo shape.
   - Builtin Tree-owned repo-shape policy remains bounded/deterministic and lists generic structural peers: `bin`, `doc`, `docs`, `public`, `scripts`, `src`, `test`, `tools`.
   - `calculogic-validator` is not a generic builtin entry. Tree wiring prepares an effective repo-shape policy for each run: the repo-shape policy of the run's resolved registry set (Builtin, or an active Custom set, #41) plus two contextual additions:
     - in embedded development only, the top-level folder of the explicit validator development root (standalone development and installed consumers add nothing);
     - every top-level folder with local-package evidence (#37): the root manifest explicitly declares it as a local package (an exact `file:` / `link:` dependency target or an exact `workspaces` entry), and the folder has its own contained `package.json`. Suite core extracts the evidence (capability inventory §3.10); Tree interprets it. The added folders, with the declarations that justified them, are recorded in `preparedDependencies.treeRepoShapeEvidence`.
   - The effective policy is a new prepared value; the registry policy object (cached for Builtin) is never modified.
   - `calculogic-doc-engine` is not a builtin entry. Calculogic_React_App gets it through local-package evidence, and any other repository needs the same declaration and manifest.
2. **Validator-owned-looking file outside validator tree**
   - Consume the optional validator development root resolved by suite core and emit an info advisory when a filename/path signal strongly indicates validator ownership but the file is outside that contextual root.
   - Standalone development uses the repository root, embedded development uses `calculogic-validator/`, and installed consumer context does not invent a validator development root.
3. **Owned-slice boundary drift**
   - Derive the Validator suite-core root from the same prepared validator development root: `src/` in standalone development, `calculogic-validator/src/` in embedded development.
   - Interpret the suite-core carveouts (`core/`, `compat/`, `registries/`, `index.mjs`, `validator-config.schema.json`) relative to that suite-core root, through one relative policy rather than separate standalone and embedded tables.
   - Without a validator development root (installed consumer), do not emit the advisory: a consumer's own `src/**` is never treated as Validator suite core, and an installed package location is never treated as Validator development source.

4. **Shim/compat surface advisory (hardened evidence precedence, V0.1.5)**
   - Collects deterministic shim evidence with staged evaluation (path/surface/token-first; content reads only for deterministic shim candidates) and bounded fields:
     - `artifactSurface` (`quality|docs|examples|fixtures|runtimeish`)
     - folder token signals, basename token signals
     - `thinReexportShim`, `canonicalTargetPath`, `reexportTargetCount`
     - `insideCompatSurface`
     - intentional pass-through markers (`isCanonicalHostPassThrough`, `isPublicEntryPointPassThrough`)
   - Thin re-export remains the strongest/high-confidence shim signal.
   - Token/path-only shim signals on non-runtime surfaces (`quality/docs/examples/fixtures`) are suppressed from shim-debt findings.
   - Intentional pass-through surfaces are excluded from shim debt:
     - canonical `*.host.* -> sibling *.wiring.*` forwarding inside owned slices
     - public package entrypoint barrel (`<validator development root>/src/index.mjs`, Validator development context only) including `export * from`, namespace re-export (`export * as <name> from`), and optional `export { ... } from` forms
   - Token/path-only signals on the shim detector's own implementation modules (`<validator development root>/tree/src/**` with a detector-implementation token) are suppressed in Validator development context only. Installed consumers get no Validator self-exemption; their shim reasoning otherwise runs unchanged.
   - Runtimeish token/path-only matches remain info-level observability (`TREE_SHIM_SURFACE_PRESENT`) and do not emit debt-style `TREE_SHIM_OUTSIDE_COMPAT` unless thin re-export evidence exists.


### 2.4 Input ownership split (V0.1.7)

V0.1.7 introduces a suite-core scoped snapshot/input helper boundary and migrates tree as the first consumer:

- suite-core helper owns scope profile read, includeRoots walk, includeRootFiles inclusion, normalized path collection, target filtering, and deterministic sort/dedupe
- tree wiring consumes the shared scoped snapshot input and still prepares tree-local top-level directory inventory
- tree runtime remains slice-owned for tree-core findings using prepared tree-core inputs only (`selectedPaths`, `topLevelDirectoryNames`, `targets`) and consumes occurrence-derived file-path reasoning input when `structuralAddressSnapshot.occurrenceRecords` is available (bounded fallback to `selectedPaths` when the snapshot is absent/malformed)
- tree contributor attachment now supports bounded naming-owned semantic-family bridge payloads (`namingSemanticFamilyBridge.observations[]`) for structural advisories while preserving naming ownership of semantic derivation and validity interpretation (historical since Stage 2B-iv: no default contributor reads that payload any longer)
- the bridge contributor and the shim contributor receive the prepared validator development root from Tree wiring (Refs #34): the canonical docs-authority/runtime pairing (`<root>/doc/** <-> <root>/<semantic-container>/**`) and the shim self-exemptions apply only in Validator development context, and an embedded root's top-level folder is a bridge structural root surface for that run only. The bridge's generic structural root surfaces stay Tree-owned bridge policy and are not derived from the repo-shape allowance. (Historical since Stage 2B-iv: the bridge contributor is removed; the scatter contributor reads its docs-authority root from `tree-validator-development-root.logic.mjs`.)
- occurrence-driven file reasoning now carries bounded structural class metadata on occurrence records (`structuralClass`, `structuralKind`, repo-shape allowed top-level-directory flags, scoped-root flag, subtree-partition candidate flag) for near-term tree-local interpretation
- tree-run default contributor selection is owned by a dedicated assembly/wiring module so tree wiring only prepares tree-core inputs
- shim/content-backed diagnostics are attached from a shim-owned contributor helper that prepares lazy content access (cache + selected-path guard) so tree-core runtime does not require file-content access
- naming stays on existing local collection/interpretation path in this increment (no naming behavior changes)
- Tree known-roots registry/runtime dependencies are retired in current runtime truth: `knownTopLevelDirectories` no longer controls unexpected top-level folder behavior, and `topRoots[].kind` no longer controls occurrence classification.
- Tree runtime now uses prepared replacement evidence for occurrence classification from addressed occurrences, structural-home evidence, family-root folder evidence (formerly semantic-home evidence; Stage 2C, below), and folder-kind evidence.
- Family-root folder evidence (formerly generic semantic-home preparation) consumes only family-root Naming evidence; mixed `folder-semantic-structural-composition` and ancestor `folder-semantic-context` observations stay on the relationship/ancestor-context lanes and are not family-root claims.
- Tree folder-kind preparation may emit relationship-qualified `semantic-qualified-structural-container` evidence only for aligned `semantic-qualified-structural-container` relationship records; mismatch, unresolved context, and unsupported-token records remain relationship-only evidence.
- `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` membership comes from the effective repo-shape policy alone: at `repo` scope a top-level folder is reported exactly when that policy does not allow it; occurrence classification is not consulted. The classification migration's parity and readiness chain (`treeOccurrenceClassificationParityEvidence` through `…RuntimeExecutionContract`) and its gate are retired: since known-roots retirement both sides of its comparison came from the same evidence (#118, #119), and both routes reported the same folders. Classification itself stays (Tree spec, "Classification migration machinery: retired").
- Repo-top folders outside the Tree-owned repo-shape top-level policy still emit the existing advisory with unchanged report/finding shape, even when occurrence classification identifies them as structural homes.
- Unexpected top-level folder details report the full Tree-owned allowed repo-shape policy in `details.allowedTopLevelDirectories`, not only the observed allowed top-level directory subset.
- The former guarded known-roots fallback route is historical context only and is not current runtime truth.
- Tree wiring prepares `treeSemanticHomeParameterSet` (Tree spec S2.9, calculogic-validator#102) from the run's lifecycle resolution, which the suite's Tree hook passes beside `registryRoots`. The loader (`registries/tree-semantic-home-parameter-set-loader.logic.mjs`, reached through `tree-runtime-registries.logic.mjs`) reads the resolved `semantic-home-policy` payload once, takes its source and digest from `registryProvenance`, and asks the lifecycle Baseline entry comparison for each record's `baselineComparison`. The pure converter (`tree-semantic-home-parameter-set.logic.mjs`) maps parameters by registry identity (`keyedEntryAddress`), never by position, through the explicit S2.10 identifier table, and assigns the RR4 `origin`. Without a resolution, no root or the Builtin root gives the cached Builtin set; an explicit non-Builtin root gives `not-prepared`. The set is frozen and its `conformance` is decided by Stage 2A-iii (below).
- Stage 2A-i (Tree spec S2.3–S2.7, S2.9): Tree wiring prepares `treeFolderSemanticHomeReasoning` from the Stage 1 records (`treeFolderSemanticEvidence`, `treeFolderFactEvidence`) and `treeSemanticHomeParameterSet`, all by reference. Its `status` follows the parameter set's availability one to one (`evaluated`, `configuration-unavailable`, `not-prepared`); only `evaluated` carries outcomes. Modules: `tree-semantic-home-reasoning.knowledge.mjs` (closed vocabularies), `tree-semantic-home-eligibility.logic.mjs` (the S2.5 rule, the E2 combination and the exact S2.6 corner procedure with its condition checks), `tree-semantic-home-attribution.logic.mjs` (deepest-first order and per-member reattribution, read from Stage 1 member records), `tree-semantic-home-strength-profile.logic.mjs` (S2.7 facets and same-claim corroboration) and the coordinating `tree-folder-semantic-home-reasoning.logic.mjs`. Its only reader is the Stage 2B-i `TREE_FAMILY_SCATTERED` contributor (below).
- Stage 2A-ii (Tree spec S2.8, S2.9): `tree-semantic-home-placement.logic.mjs` places every file occurrence by the five-step precedence, from placement relations (`match`, `possible-unevaluated`, `possible-root-reading`) to `eligible` and `undetermined` candidates, and evaluates the run-wide `candidateDiscovery` condition before any `no-home`. Comparisons for lineage candidates are read from Stage 1 member records; every other pair goes through `createCandidateFileComparator`, the comparison operation Stage 1 itself uses (`tree-folder-semantic-evidence.logic.mjs`), so the two cannot diverge. Wiring passes the section intake and the run scope.
- Stage 2A-iii (Tree spec RR4): `tree-semantic-home-conformance.knowledge.mjs` holds the one binding (the four Builtin values, the catalogue identity and digest, the reasoning version, source digest and results digest, and the append-only reasoning version history); `tree-semantic-home-conformance.logic.mjs` decides `passed` or `not-checked` from the four values and the installed source digest only. The parameter-set loader computes that digest once per process from the bound module files (fail closed), and the converter reports `conformance` and, when `passed`, `conformanceBinding`.
- Stage 2B-i (Tree spec S2.12, B1–B8): `contributors/tree-semantic-home-scatter-contributor.logic.mjs` (attached by `tree-semantic-home-scatter-contributor.wiring.mjs` through the contributor assembly) emits `TREE_FAMILY_SCATTERED` from `treeFolderSemanticHomeReasoning.placements` only: one finding per identical set of eligible home folders (occurrence identity), from `home-elsewhere` files, minus documents paired with every home by the R2 docs-authority rule. It reads the Stage 1 candidates and accepted bridge observations and the bridge's development-root context, and computes no eligibility, comparison or structural home. When Stage 2 was not evaluated it emits nothing, with no fallback. `tree-semantic-home-reasoning-report.logic.mjs` builds the runtime's `semanticHomeReasoning` summary, which the runner entry reports as `meta.semanticHomeReasoning`. The Naming semantic-family bridge contributor no longer emits this code; its other codes and shared spine are unchanged.
- Stage 2B-ii (Tree spec S2.12): `TREE_OBSERVED_FAMILY_CLUSTER` is retired. The bridge contributor no longer has a cluster collector; `interpretFamilyLocalFirst` still classifies `local-density-first` (threshold renamed `FAMILY_LOCAL_DENSITY_MIN_FILES`, value and behavior unchanged). Subgroup is still decided before density, and the lanes code still emits only for the two divergence lanes, so their findings are unchanged; the density lane itself no longer changes any emitted finding.
- Stage 2B-iii (Tree spec S2.12): `TREE_FAMILY_SUBGROUP_OPPORTUNITY` is retired. The bridge contributor no longer has a subgroup collector; `interpretFamilyLocalFirst` still classifies `local-subgroup-first` first (thresholds renamed `FAMILY_LOCAL_SUBGROUP_*`, values and behavior unchanged). The bridge contributor now emits only `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES`, which only the two divergence lanes can reach. Potential-subfolder discovery is recorded in S2.12 as a deferred, unauthorized capability.
- Stage 2B-iv (Tree spec S2.12): `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` is retired and the Naming semantic-family bridge contributor (`contributors/tree-naming-semantic-family-bridge-contributor.{logic,wiring}.mjs`) is removed with its local-first spine. The default contributors are the shim contributor and the Semantic Home scatter contributor; the scatter contributor's docs-authority root now comes from `tree-validator-development-root.logic.mjs` (`toValidatorDocAuthorityPathPrefix`). Wiring still accepts `namingSemanticFamilyBridge` and `preparedAddressKeyedJoinEvidence` and hands them to the contributor assembly, which no longer has a reader for them. Stage 2B is complete.
- Stage 2C (Tree spec S2.13): the legacy `semanticHome` field is retired. `treeSemanticHomeEvidence` is now `treeFamilyRootFolderEvidence` (`tree-family-root-folder-evidence.logic.mjs`): folder records only, a Naming family-root claim rather than a Semantic Home, with the same matching, repository-top relationship precedence and values (`familyRootEvidenceStrength` replaces `semanticHomeEvidenceStrength`). Folder-kind records carry `semanticFamily` and the strength `derived-from-naming-family-root-evidence`; parity and shadow records carry `replacementFamilyRootSemanticFamily`. Classification still reads the claim directly as well as through `folderKind`, so classification, parity, readiness and every runner report are unchanged. Eligible homes and placement remain Stage 2A's alone.
- Since #45, Tree wiring builds `structuralAddressSnapshot` through Structural Addressing. The chain is the Addressing-owned validation input adapter (`structural-addressing-tree-codebase-validation-input.spec.md`), then `prepareTreeCodebaseAddressedSnapshot`, then the Tree-owned projection (`tree-owned/tree-structural-address-probe-contract.spec.md`, "Addressing-backed projection"). The adapter keeps two root sets: `declaredScopeRoots` (uncollapsed, for the Tree envelope and scope binding) and `effectiveAddressingRoots` (collapsed, for addressing). The transitional `occurrenceSnapshot` alias and Tree's former private producers were retired in #49. Tree core inputs and findings are unchanged.

Target behaviors in V0.1.2:

- no targets: analyze all scoped selected paths
- file/directory targets: analyze only selected in-scope paths under target union
- invalid/nonexistent/escaping targets: deterministic failures aligned with suite target contract

## 3.0 Output Contract

### 3.1 Report shape alignment

Findings flow through the existing suite validator entry shape:

- `id = tree-structure-advisor`
- `summary.counts`
- `findings[]`
- optional `meta.filters` when `--target` is used

When shared CLI `--config=<path>` is supplied, current behavior is limited to shared config validation/normalization plus runner-envelope `configDigest`. Tree-local config semantics remain deferred.

### 3.2 Finding shape (advisory-only)

Each finding follows existing report conventions:

- `code`
- `severity` (`info` for current structural findings; `warn` is currently possible for `TREE_SHIM_OUTSIDE_COMPAT`)
- `path`
- `classification = advisory-structure`
- `message`
- optional `details`
- optional `ruleRef`

### 3.3 Determinism requirements

- normalize separators to `/`
- stable sorting by `path` then `code`
- deterministic message text and codes

## 4.0 Registration, Boundary, and Execution

- Canonical tree slice boundary lives at:
  - `calculogic-validator/tree/src/tree-structure-advisor.host.mjs`
  - `calculogic-validator/tree/src/tree-structure-advisor.wiring.mjs`
  - `calculogic-validator/tree/src/tree-structure-advisor-contributors-assembly.wiring.mjs`
  - `calculogic-validator/tree/src/tree-structure-advisor.logic.mjs`
  - shim evidence/runtime helpers: `calculogic-validator/tree/src/tree-shim-detection.logic.mjs`
  - optional contracts surface: `calculogic-validator/tree/src/tree-structure-advisor.contracts.mjs`
- Registry/index/package exports target the canonical `tree/src/` host boundary.
- Flat legacy paths under `calculogic-validator/src/tree-structure-advisor.*.mjs` remain compatibility shims only (re-export wrappers) during migration.
- Default runner execution includes both `naming` and `tree-structure-advisor` in deterministic registry order.
- Dedicated `validate-tree` execution includes only `tree-structure-advisor` while preserving shared runner scope/target semantics.
- Current dedicated CLI also accepts `--config=<path>` through shared runner plumbing, but unsupported tree-specific config surfaces are rejected by the canonical validator-config contract rather than interpreted locally by tree.
- No fix mode, no move/rename behavior.

## 5.0 Deferred Behavior (future advisory direction; not current runtime behavior)

Deferred to later slices:

- docs/runtime/test co-location drift heuristics
- mixed concern folder smell heuristics
- structural recommendation planning and move proposals
- tree-specific config semantics beyond shared config validation + digest plumbing
- any mutating or fix-mode behavior
