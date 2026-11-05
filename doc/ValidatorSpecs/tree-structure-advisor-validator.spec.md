# Tree Structure Advisor Validator Spec (Report-Only Advisory, V0.1.7)

## Purpose and Scope (Status: Current runtime behavior)

This document defines a **Tree Structure Advisor** validator slice whose output is **advisory**:

- it analyzes repository **folder structure** using prepared tree-core inputs
- it emits **advisory findings** for currently implemented structural and shim-compat checks
- contributor-backed diagnostics are optional and attached outside tree core
- it never renames or moves files
- it is report-only in the non-mutating/report-first sense, not in the sense of guaranteed exit `0`

This slice exists to reduce “tree drift” as additional validators beyond naming are added. Current exit behavior still follows the shared suite policy after report emission, so warning-level tree findings can still produce exit `2`.

### Suite-core vs owned-slice boundary principle

Tree advisor structural reasoning also includes an ownership-boundary principle aligned with current repo architecture:

- `src/**` under the validator development root is suite-core/shared infrastructure and compat-boundary surface (`src/**` in a standalone checkout; `calculogic-validator/src/**` in embedded development)
- validator-owned slices with their own internal growth path belong in slice roots outside suite-core `src/` (for example `calculogic-validator/naming/src/**`, `calculogic-validator/tree/src/**`)
- continued owned-slice growth inside suite-core `src/` is structural drift because it predicts avoidable future extraction/shim/refactor debt

This principle is advisory and architecture-oriented; it does not mean one universal folder layout is required for every repo.

## Tree Implementation Canonical Reading Path (Status: Current implementation guidance)

Read these first before tree implementation work (runtime, wiring, or contracts):

1. Suite contract and scope boundary: [`ValidatorSuite-Contracts-And-Modes.md`](../ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md)
2. Tree validator spec (this document): runtime behavior + bounded modeling notes
3. Naming boundary context: [`NamingValidatorSpec.md`](../ConventionRoutines/NamingValidatorSpec.md)
4. Tree NL/config implementation note: [`calculogic-validator/doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md`](./nl-config/cfg-treeStructureAdvisor.md)
5. Tree documentation map (navigation metadata): [`tree-documentation-map-and-reorg-inventory.md`](./tree-owned/tree-documentation-map-and-reorg-inventory.md)

Status interpretation used in this document:

- **Current runtime behavior**: implemented or currently enforced report behavior.
- **Bounded modeling note**: current architecture interpretation guidance that intentionally does not claim new runtime behavior.
- **Future advisory direction**: planned or deferred direction, not shipped behavior.
- **Dogfooding/current-repo reality**: currently observed repo-specific shape that should not be overgeneralized into package-wide builtin truth.

## Suite Contract Alignment (Status: Current runtime behavior)

This slice follows the shared suite contract in [`ValidatorSuite-Contracts-And-Modes.md`](../ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md): the validator suite is modular, configurable, policy-driven, and report-first by default. Tree advisor V0.1.7 remains report-only even though additional policy modes exist suite-wide.

### In scope (V0.1.7 hardened subset)

- Tree-core structural checks over prepared `selectedPaths` + `topLevelDirectoryNames` + `targets`
- Optional contributor composition through `findingContributors[]` prepared by wiring/assembly
- Shim/compat diagnostics attached through the tree contributor assembly default (`tree-shim-diagnostics`)
- Report-only output with deterministic sorting and no filesystem mutation

### Out of scope (V0.1.7)

- Applying any filesystem changes (no auto-move, no auto-fix)
- Enforcing a single “correct tree” (recommendations are heuristic + explainable)
- Import graph analysis (deferred; optional future enhancement)
- Structural addressing validation of NL/code atoms (not this slice)
- Semantic correctness of code behavior (not this slice)

---

## Source-of-Truth References

- Deterministic address grammar + concern slot semantics:
  - `calculogic-validator/doc/ConventionRoutines/DeterministicStructuralAddressingSpec-Draft.md`
- Canonical filename grammar + role registry categories/status:
  - `calculogic-validator/doc/ConventionRoutines/FileNamingMasterList-V1_1.md`
- Naming validator conventions (classification shape, determinism expectations):
  - `calculogic-validator/doc/ConventionRoutines/NamingValidatorSpec.md`

---

## Conceptual Model (Status: Current architectural/modeling guidance)

This validator treats **folders as scope roots** (host-like boundaries), and filenames as potential **lane signals**:

- **Scope roots** (host-like boundaries):
  - `bin/`, `scripts/`, `src/`, `test/`, `tools/<tool>/...` (example surfaces)
- **Current shipped heuristic substrate**:
  - deterministic path/basename signals
  - scope + target filtering from the shared suite boundary
  - occurrence-derived structural records when available
- **Lanes / semantic families**:
  - remain valid modeling concepts for tree work
  - should be treated as partially deferred concepts until explicit runtime consumption is documented below

Goal: surface emergent patterns and recommend a structure that makes those patterns obvious without overstating what current runtime already emits.

### Naming-signal consumption boundary (Status: Current runtime boundary)

Tree advisor consumes naming-shaped metadata only across an explicit slice boundary; it does **not** derive naming semantics independently.

**Current shipped runtime posture:**

- tree runtime now supports a bounded naming→tree prepared-input bridge for contributor-backed semantic-family advisory consumption
- consumed bridge payload is naming-owned evidence projection only (not raw naming runtime internals)
- shipped semantic-family tree advisories remain report-first and deterministic
- tree findings continue to be driven by deterministic path/basename/scope/target/shim/occurrence signals plus naming bridge evidence staged by the shared runner when tree executes through normal runner paths
- tree heuristics that need semantic-family or role information must consume naming-derived signals rather than re-implement naming interpretation locally

Bounded consumable naming bridge surfaces include:

- `path`
- `semanticName`
- `familyRoot`
- `semanticFamily`
- optional `familySubgroup`
- optional `ambiguityFlags[]`
- optional `splitFamilyFlags[]`

Ambiguity facts and evidence strength (#82): Naming supplies `ambiguityFlags[]` and `splitFamilyFlags[]` as separate source facts. Every preparation of Naming evidence for Tree keeps both unchanged, so preparing prepared evidence again yields the same record, and it carries no Naming-authored strength (the bridge identity contract rejects Naming-authored `evidenceStrength`). The occurrence bridge payload is built from Naming's source observations, never from prepared evidence. Tree derives the strength of Naming evidence for its own reasoning with one Tree-owned rule (`deriveTreeNamingEvidenceStrength`, `tree/src/tree-naming-evidence-strength.logic.mjs`) that lists each limiting fact separately: today either fact limits the evidence to `bounded`, and evidence with neither is `high`. Semantic-home and relationship evidence strengths use that rule. *Correction (#82):* prepared Naming evidence first replaced both flags with one `splitMarkers` list and a Naming-derived `evidenceStrength`; the default Tree path prepared it twice, which dropped the ambiguity and reported ambiguous evidence as `high`.

Tree advisor does **not** re-own naming validity judgments. Naming validity remains owned by naming conventions/specs and the naming validator slice.

Tree now also consumes repository-top folder observations from that same Naming-owned evidence surface when Naming supplies semantic-family-root evidence for folder occurrences. Tree does not parse those folder names into semantic identity. Tree evaluates a Tree-owned relationship perspective between the Naming evidence and the folder occurrence context.

Active relationship perspective for current runtime truth:

```text
Naming perspective: semantic-family-root
+ Tree perspective: repository-top folder
+ Tree condition: not a retained structural repository-top home
+ Tree repo-shape condition: allowed top-level directory
→ Tree relationship perspective: semantic-repository-top-family-home
```

The relationship registry is Tree-owned because it describes Tree interpretation of folder role, repository-top position, structural-home status, and repo-shape context. It contains reusable relationship conventions only; it must not contain named semantic-home facts such as package-folder-name → semantic home. Naming remains the owner of `semanticName`, `familyRoot`, `semanticFamily`, and optional `familySubgroup`.

Repo-shape allowance remains separate from classification: an allowed top-level directory can be structurally classified, semantically classified through this relationship, or remain unspecified if the required Tree/Naming evidence is absent.

Current repository-top relationship explanations are scoped to repository-top folder occurrences that are not already classified by retained structural-home evidence; nested folders, files, and structural folders do not receive explanation records from this perspective.

Current runtime truth also includes a separate triggered folder-only relationship perspective named `semantic-qualified-structural-container`. It activates only when Tree receives addressed Naming evidence with `semanticEvidenceKind: folder-semantic-structural-composition`, `folderCompositionKind: semantic-qualified-structural-container`, a Naming-owned `semanticQualifier`, and a Naming-owned `structuralRoleToken`; the occurrence is a folder; Addressing supplies the exact occurrence identity and parent/ancestor lineage; and Tree can evaluate that token against the Tree-owned structural-role token registry. This perspective does not scan every folder, does not emit non-applicability explanations for folders without Naming composition evidence, does not apply to files, and does not make an embedded token such as `src` equivalent to a direct repo-top structural-home folder named `src`. Whether the Naming-owned composition patterns can emit a token that the Tree-owned registry cannot interpret is reported separately, at the registry level, by the suite's cross-slice bridge compatibility (lifecycle spec §9.4); that record does not depend on any folder occurring and does not change this perspective's per-folder interpretations.

Current runtime truth consumes the approved downstream folder-kind evidence from that perspective in occurrence classification through an exact-address-only route. A folder occurrence may receive `structuralClass: relationship-qualified-structural-container` and `structuralKind: implementation-container` only from Tree-owned `treeFolderKindEvidence` carrying `folderKind: semantic-qualified-structural-container`, `relationshipQualified: true`, `relationshipPerspective: semantic-qualified-structural-container`, and `relationshipInterpretation: semantic-qualified-structural-container-aligned` for the same Addressing-owned `addressPath` as the current occurrence. This contribution is Tree-owned, prepared-evidence-driven, exact-occurrence-scoped, non-semantic-home, and non-reporting. It does not consume raw Naming composition observations, does not consume raw relationship records as classification authority, does not use path-only fallback identity for this route, and does not make the folder a generic semantic root or generic structural root.

Current runtime truth may then apply a Tree-owned structural-context assessment to an already approved relationship-qualified occurrence classification. The assessment consumes only the current occurrence classification record and a Tree-owned assessment-policy registry; it does not consume raw Naming evidence, raw relationship evidence, raw folder-kind evidence, path segments, or folder names. The initial registry policy matches the exact classification selectors `structuralClass`, `structuralKind`, `relationshipQualified`, `classificationEvidenceKind`, `relationshipPerspective`, and `relationshipInterpretation` for the approved `semantic-qualified-structural-container-aligned` route and prepares one non-reporting `coherent` assessment for that exact occurrence-local `addressPath`. No policy match produces no assessment record, not a negative conclusion. This coherent structural-context assessment is internal prepared Tree evidence and does not create findings, alter report policy, alter finding codes or counts, change severity/confidence/suppression behavior, or change exit behavior.

For the initial route, Tree uses Addressing lineage only to locate relevant ancestor occurrences, then compares the Naming-owned semantic qualifier with explicit addressed ancestor semantic-context evidence supplied through the Naming evidence bridge. Tree does not treat raw ancestor folder names, raw path segments, or parent labels as semantic truth. Matching addressed context yields `semantic-qualified-structural-container-aligned`; a different explicit addressed context yields `semantic-qualified-structural-container-semantic-context-mismatch`; missing addressed context yields `semantic-qualified-structural-container-context-unresolved`; and an unregistered embedded structural token yields `structural-token-not-registered-for-this-perspective`. Mixed folder-composition observations are relationship input, not family-root folder evidence (formerly generic semantic-home evidence, S2.13). A composition semantic qualifier is not itself a semantic-home assertion about that folder occurrence. Relationship outcomes remain internal prepared evidence and do not change finding codes, counts, severity, suppression, confidence policy, exit behavior, or report-envelope schema.

Only Tree-approved relationship outcomes may emit relationship-qualified downstream folder-kind evidence. Current runtime truth supports that emission only for `relationshipPerspective: semantic-qualified-structural-container` with `relationshipInterpretation: semantic-qualified-structural-container-aligned` when the relationship path is present in the current addressed occurrence scope and the Addressing-owned `addressPath` identity matches the current occurrence. Relationship records suppress generic folder-kind fallback only for that same current `addressPath` identity; mismatch, unresolved context, unregistered-token, and out-of-scope aligned outcomes remain relationship-only evidence and do not emit semantic-home evidence or relationship-qualified folder-kind evidence.

Current implementation reality: the normal runner path stages package-root folder observations in the Naming-owned semantic-family bridge when Naming sees package-manifest evidence for a repository-top package folder. Those observations carry folder occurrence type, semantic identity fields, explicit `semanticEvidenceKind: semantic-family-root-folder`, explicit `familyRootQualification: package-root-folder`, and provenance back to the Naming finding that justified the observation. Tree consumes the addressed form of that bridge evidence after Addressing has supplied occurrence identity and lineage.

When a folder remains unclassified in the internal prepared classification path, Tree may attach a bounded `classificationExplanation` object. That explanation is internal evidence, not a new finding or report-envelope change. Current reason codes include `missing-required-naming-observation`, `naming-observation-not-qualified-as-family-root`, `no-active-relationship-perspective-match`, `ambiguous-or-conflicting-evidence`, and `unknown-or-unmodeled-folder-relationship`.


### Naming occurrence bridge intake boundary (Status: Current implementation reality)

Tree has a neutral intake boundary for a staged sibling `namingOccurrenceBridge` payload when that payload is explicitly supplied to Tree wiring or attached beside the path-keyed semantic-family bridge payload in tests/helper transport. The boundary recognizes address-keyed join identity tuples made from `addressProfileId` + `addressedSnapshotId` + `occurrenceAddress`; it preserves or summarizes Naming-originated bridge diagnostics and compatibility diagnostic counts; and the intake summary remains non-finding evidence that does not replace current Tree findings, placement reasoning, scatter/cluster logic, drift/advisory logic, structural-home reasoning, semantic-home reasoning, or folder-kind interpretation.

Current implementation reality includes a guarded Tree-owned prepared-evidence join helper for callers that explicitly provide both the staged Naming occurrence bridge and addressed occurrence records under the same full identity tuple. The helper may copy Naming semantic fields from bridge observations, but it must not re-derive Naming semantic-family interpretation from filenames. Missing, invalid, mismatched, ambiguous, or diagnostic-bearing identity state produces explicit skipped-join status/diagnostics instead of clean joins.

Current runner transport passes the path-keyed `namingSemanticFamilyBridge` to Tree and does not make address-keyed joins the only Tree path. Current Tree behavior remains path-keyed through the semantic-family bridge, and Tree must not re-derive Naming semantic-family interpretation from filenames or from occurrence bridge observations.

Current implementation reality since Stage 1A (calculogic-validator#95): the runner also transports the Naming semantic-evidence enrichment source (N1) and a Naming-owned folder-label interpreter (N2), and Tree validates both sections and records their availability as non-finding prepared evidence (`treeNamingSectionIntake`). The next section defines that contract; its candidate, containment and facet parts (Stage 1B) are not current runtime truth.

### Folder-level semantic-home evidence, Stage 1 (Status: Contract, calculogic-validator#93; S1.1, S1.2 and the S1.3 run and record levels are current implementation reality since calculogic-validator#95; the S1.3 fact level and S1.8 since calculogic-validator#97 Stage 1B-i; S1.4–S1.7 and S1.9 since calculogic-validator#97 Stage 1B-ii)

This section is the contract for Tree Stage 1 of folder-level Semantic Home development (tracking: calculogic-validator#85). It defines how Tree receives the two Naming evidence sections on its default execution path, how Tree validates them, how Tree records evidence availability, and how Tree assembles folder-level **evidence**: candidates, composition observations, candidate-relative containment relationships and counts-only facets.

Stage 1 makes no Semantic Home eligibility, strength, placement or finding decision. Those belong to Stage 2. Tree findings, finding codes, counts, severity, report payload and exit behavior are unchanged by every Stage 1 slice.

Sources this section builds on:

- Naming bridge occurrence identity contract (`doc/ValidatorSpecs/cross-cutting/naming-bridge-occurrence-identity-contract.spec.md`): §4.4 envelope sections, §4.5 `namingSemanticEvidenceEnrichment` (N1), §4.6 `namingFolderLabelObservations` (N2), §6.3 N2 fields.
- Naming semantic interpretation spec (`doc/ValidatorSpecs/naming-owned/naming-semantic-family-and-interpretation.spec.md`) §13: folder-label interpretation.

#### S1.1 Transport on the default Tree path

Before Stage 1A, the suite runner ran Naming without an addressed occurrence namespace (Tree builds the addressed snapshot itself) and staged only the path-keyed semantic-family bridge (R1) into Tree. Tree wiring built its own bridge payload without an N1 source or a folder-label interpreter, so neither section reached Tree on the default path. The runner still runs Naming without an addressed occurrence namespace.

Stage 1 adopts this route (implemented in Stage 1A by `prepareNamingTreeStagingInputs`, exposed through the Naming host):

1. **Naming prepares the staging inputs.** A Naming-owned staging function, exposed by Naming wiring, takes the staged Naming run output and the `registryResolution` of the run and returns three opaque values:
   - `namingSemanticFamilyBridge`: R1, exactly as staged today (`projectNamingSemanticFamilyBridge`);
   - `namingSemanticEvidenceEnrichment`: the N1 source records (`projectNamingSemanticEvidenceEnrichment`, `naming/src/naming-semantic-evidence-enrichment-projection.logic.mjs`);
   - `interpretFolderLabel`: a function from a folder label to a folder-label interpretation, built by Naming around `interpretNamingFolderLabel` (`naming/src/rules/naming-rule-interpret-folder-label.logic.mjs`).
2. **The case-rule authority is the Naming run.** `interpretFolderLabel` is bound to the case-rules runtime that Naming prepares from the same `registryResolution` the runner gave the Naming run, so a custom registry set produces the same folder-label interpretation on the Naming path and the Tree path. Naming builds that binding; neither the runner nor Tree receives, inspects or constructs a case-rules runtime. Only that case-rules resolution is deferred to the interpreter's first call, so a run that interprets no folder loads no case rules; R1 and the N1 source records are prepared when the staging function runs.
3. **The runner only transports.** The runner passes the three values to Tree unchanged. It does not interpret, filter, merge or derive anything from them.
4. **Tree wiring calls the Naming-owned producer.** Tree wiring passes `namingSemanticEvidenceEnrichment` and `interpretFolderLabel`, with its own addressed occurrence namespace, to `createNamingOccurrenceBridgePayload` (`naming/src/naming-occurrence-bridge-payload.logic.mjs`) when it builds its internal bridge payload. That call is the only place the sections are produced on the default path.
5. **Tree never interprets Naming material itself.** Tree must not call `interpretNamingFolderLabel`, `splitSemanticTokens` or any other Naming rule, must not build a case-rules runtime, must not tokenize labels or semantic names, and must not substitute its own interpretation when a staging input is missing.
6. **Caller-supplied bridge.** When a caller supplies a complete `namingOccurrenceBridge` payload (current intake option), Tree uses it as supplied, including any sections it carries, instead of building one. Tree validates the supplied sections normally (S1.2), so a valid supplied section is `available` whether or not the runner staged anything. A section the supplied payload lacks is `section-absent`, never `not-staged`, and Tree never supplements a supplied payload with separately staged N1 or N2 evidence.
7. **Standalone Tree.** When Tree runs without staged Naming input (for example, a direct `runTreeStructureAdvisor` call without staging), the sections are not produced. That is run-level unavailability (S1.3), not an error.
8. **Unchanged.** R1 staging and every current R1 consumer were unchanged by this route. (Of those consumers, the Naming semantic-family bridge contributor was retired in Stage 2B-iv, S2.12; the legacy semantic-home evidence continues as the family-root folder evidence since Stage 2C, S2.13.)

Why this route: the addressed snapshot is built once, by Tree; occurrence identity stays with Structural Addressing through that snapshot; Naming stays the sole producer of both sections; and the runner gains only opaque transport.

**Lexical-identity section (calculogic-validator#150; emitted with an active language profile, not consumed).** The bridge contract §4.7 adds a third Naming section, `namingTokenLexicalIdentities`, produced by Naming on this same route. With an active profile, Naming's staging function returns the prepared Linguistic Foundation profile as a fourth opaque value, `lexicalProfile`. The runner passes it unchanged, and Tree wiring passes it to `createNamingOccurrenceBridgePayload`. Items 3–5 apply to it unchanged: Tree never calls the foundation's resolution or comparison functions, builds records or inspects readings (Linguistic Foundation shared contract §8.5). Until calculogic-validator#153, Tree intake did not support `naming-token-lexical-identity.v1`, and a payload carrying it was read exactly as without it (bridge contract §4.4 rule 2). Stage 1A still reads it that way: the section's intake is the separate one below.

**Lexical-identity consumption (Current, calculogic-validator#153).** Tree supports `naming-token-lexical-identity.v1` (S1.2, S1.3) and reads it in exactly one place, Stage 3 positional lineage expression (S3.2). The transport above is unchanged. Items 3–5 are narrowed for consumption only, and nothing else changes:
- Tree still never calls `resolveSurfaceForm`, never loads or reads a language profile or lexicon, never builds lexical records, and never transforms a token.
- Tree reads the readings of section records **it has accepted** at intake, and relates two of them only through the foundation's lexeme-comparison relation (foundation contract §6.2), by calling the foundation's `compareLexicalResolutions`.
- **One Tree module owns the section**, the Tree lexical-identity evidence module (for example `tree/src/tree-lexical-identity-evidence.logic.mjs`):
  - It performs the section's intake (S1.2) into its own prepared record, `treeLexicalIdentityIntake`.
  - It imports only two foundation functions: `compareLexicalResolutions`, and the read-only feature-map predicate `isFoundationFeatureMap` that the §4.7 invalid-record-shape check needs (the foundation keeps its feature vocabulary; Tree never copies it). It turns accepted records into comparable resolutions, with the section's `lexicalProfile` as their provenance.
  - It exposes one Tree-facing operation: the relation between a lineage folder's label token and a member's token at one position.
  - No other Tree module imports from the foundation.
- **Kept outside Stage 1 and Stage 2.** The module is not part of the Stage 1A intake (`treeNamingSectionIntake`), the Stage 1 fact, candidate or semantic-evidence modules, or Stage 2. The intake record they read is therefore byte-identical with and without the section. Neither the Stage 2 conformance binding's bound modules nor its `sourceDigest` (S2.10) change.
- Lexical identity is never evidence of ownership, placement or conformance: Stage 1 (S1.4–S1.9) and Stage 2 never read the section.

**Repository-package label section (Current, calculogic-validator#159; bridge contract §4.8).** Tree wiring obtains the suite-core repository package identity fact (capability inventory §3.11) and passes it unchanged to `createNamingOccurrenceBridgePayload` as `repositoryPackageIdentity`, with the folder-label interpreter it already passes. Naming produces the payload-level section `namingRepositoryPackageLabels`; Tree never reads the manifest, tokenizes a segment or interprets a label.
- **One Tree module owns the section**, `tree/src/tree-repository-package-evidence.logic.mjs`. It performs the section's intake into its own prepared record, `treeRepositoryPackageIntake`, and gives Stage 3 the accepted package elements. It imports no Stage 1A module.
- **Kept outside Stage 1 and Stage 2**, as the lexical-identity module is: `treeNamingSectionIntake`, every Stage 1 and Stage 2 record, and the Stage 2 conformance binding's bound modules and `sourceDigest` (S2.10) are unchanged by it.
- **No occurrence.** The section is payload-level (bridge contract §4.4 rule 9). Its records carry no identity tuple, never pass through an occurrence-identity check or join, and the addressed snapshot is unchanged: no repository-root occurrence is created.

**Role-category vocabulary section (Contract, calculogic-validator#162; current since its evidence-only implementation slice; bridge contract §4.9).** Naming's staging function derives the run's producible role-category vocabulary from the same registry resolution as the run and returns it as an opaque staged value; the runner passes it unchanged and Tree wiring passes it to `createNamingOccurrenceBridgePayload`, which emits `namingRoleCategoryVocabulary`. Tree never reads Naming's registries or registry state to obtain, check or complete it.
- **One Tree module owns the section** (`tree/src/tree-role-category-vocabulary-evidence.logic.mjs`), outside `treeNamingSectionIntake` and every Stage 1 and Stage 2 module, so the Stage 2 conformance binding's bound modules and `sourceDigest` (S2.10) are unchanged. `prepareTreeRoleCategoryVocabularyIntake` performs the section's intake into its own prepared record, `treeRoleCategoryVocabularyIntake`, added to the prepared dependencies only when the payload carries the section. It imports no registry module and reads Stage 1A's record only for the consistency check.
- **`bridgeOrigin` (execution origin).** Wiring passes the intake how the payload actually entered the run: `tree-built` when Tree invoked the Naming producer itself, `caller-supplied` when a payload was supplied. It is derived from the execution branch that already sets Stage 1A's `bridgeSource` argument, and it is a separate parameter of the new intake. The intake **never** reads the payload's own `bridgeSource` field (`calculogic-validator/naming`), which only names the claimed producer and is caller-controlled.
- **`vocabularyOrigin` (derivation origin).** Tree building the payload makes Tree the producer's caller, not the vocabulary's source: a caller of Tree wiring can hand it any `roleCategoryVocabulary`. Wiring therefore passes, as a second parameter, `naming-derived` only when the staged value is the exact value Naming's derivation returned for **this run's `registryResolution` object** (`isNamingDerivedRoleCategoryVocabulary`, which reads no registry; Naming's factory resolves the roles runtime from that resolution itself and accepts none from its caller), and `caller-supplied` otherwise: a hand-built, copied or edited value, or one staged under another resolution. Naming deep-freezes the staged value, so it cannot be edited and keep its origin.
- **Run provenance.** Wiring passes the run's suite-provided registry provenance for `naming/category-role-perspective` (registry lifecycle spec §11.2), or nothing when the run has no registry resolution.
- **Stage 3 is unchanged by the intake.** Until a separately authorized slice implements the S3.6 rule below, Stage 3 keeps `joiningFileCanLeaveClassUnresolved: true` and reads nothing from the intake.

**Version 2 of the section (Contract, calculogic-validator#162, v2 contract; current since its evidence-only implementation slice; bridge contract §4.9.1).** It replaces v1 in emission and in Tree's intake.
- **Transport is unchanged.** The staged value is the same Naming-derived, frozen, origin-bound value, extended with `rolesDigest` and `admissibleCategories`. Tree passes it to the producer exactly as for v1, and never supplies or edits the bound itself.
- **Run provenance.** Wiring additionally passes the run's provenance for `naming/roles`, or nothing when the run has no registry resolution.
- **Trust.** Both origins apply unchanged. `bridgeOrigin` is wiring's execution branch. `vocabularyOrigin` is `naming-derived` only for Naming's own value for the run's `registryResolution`, and it covers the bound, since the bound travels inside that value.
- **No status interpretation.** Tree reads no role status, finding-policy label or admission rule. It takes the bound as Naming states it.
- **Stage 3 stays unchanged by v2 as well.** Only a separately authorized S3.6 slice may read the bound.

#### S1.2 Section intake (consumer side)

Tree validates each section exactly as the bridge contract specifies for supporting consumers: §4.4 rules 2–4 and 6 for the envelope (a malformed supported section is invalid as a whole), §4.5 consumer identity rules for N1, and §4.6 consumer identity rules for N2. Field groups are validated separately from identity. There is no path fallback.

Intake produces Tree-owned **intake diagnostics** that name the section, the rejection reason and the identity tuple when one exists. Intake diagnostics are prepared evidence. They are not Tree findings and do not affect report counts or exit behavior.

**Lexical-identity section (Current, calculogic-validator#153).** Tree validates `namingTokenLexicalIdentities` as a supporting consumer, exactly as bridge contract §4.7 specifies:
- the envelope by §4.4 rules 2–4 and 6, plus a valid `lexicalProfile`; a malformed envelope makes the whole section invalid;
- each record after N1 and N2 intake, against the **accepted** N1 and N2 records, by the §4.7 consumer cases in table order (identity cases, invalid record shape, unmatched record, token-count mismatch, surface mismatch, status-readings disagreement, lexeme outside the profile). A rejected record is dropped on its own, and the section's other records are unaffected;
- the accepted N1 and N2 records are read from the Stage 1A intake record, which is never changed;
- rejections become intake diagnostics with section `naming-token-lexical-identity`, the rejection reason and the identity tuple when one exists. They live only in the lexical intake record (`treeLexicalIdentityIntake`, S1.1), never in `treeNamingSectionIntake`. They are prepared evidence: never a finding, a report field or a `meta` entry, and never an input to a Stage 1 or Stage 2 comparison.

**Repository-package label section (Current, calculogic-validator#159).** Tree validates `namingRepositoryPackageLabels` as a supporting consumer, exactly as bridge contract §4.8 specifies:
- the envelope by §4.4 rules 3 and 9: a plain object of the supported version, with no `identityTupleFields`, a `records` array and a matching `recordCount`. A malformed envelope makes the whole section invalid; another version is unsupported;
- each record by the §4.8 consumer cases in table order: an unknown `element` (invalid record shape); duplicate element, counted over every record with a known element whether or not the rest of it is valid (every record carrying it is dropped); an empty `segment` or not exactly one §6.3 parse field group (invalid record shape); element order (a `scope` after the `name`: both are dropped). A rejected record drops only the records the case names;
- rejections and section diagnostics name the section `naming-repository-package-label`, the reason and the element when known. They live only in `treeRepositoryPackageIntake`: never a finding, a report field, a `meta` entry or a Stage 3 field.

Only accepted `parsed` records become **package elements**. A `not-parsed` record is accepted evidence with no element, and leaves no trace in Stage 3 or the report.

**Dropped records.** A dropped record makes lexical identity unavailable for its occurrence. Structural reasoning, candidate outcomes and every non-lexical record are then exactly what they would be for that occurrence without the section. Only the intake diagnostics and the lexical availability metadata (S1.3, S3.7) record that it was dropped.

**Role-category vocabulary section (Contract, calculogic-validator#162; current since its evidence-only implementation slice).** Tree validates `namingRoleCategoryVocabulary` as a supporting consumer, in this order; the first failing check decides the state (S1.3):
1. **Presence and version.** No section: nothing is recorded. Another contract version: `unsupported`.
2. **Envelope and records** (bridge contract §4.9 consumer rules, §6.6 value shapes): any malformed envelope field (including a `registrySource` other than `builtin`, `custom` or `candidate`), malformed record (including a field other than `category` and `roles`), unsorted or duplicate category, or `recordCount` mismatch makes the whole section `invalid`. Records are never dropped one by one: a vocabulary missing a category is the unsafe direction.
3. **Origin.** `bridgeOrigin` is not `tree-built` (`caller-supplied`, or any other value), or `vocabularyOrigin` is not `naming-derived`: `untrusted`, whatever the payload claims. Completeness is Naming's guarantee (bridge contract §4.9), and only a payload Tree's own wiring had the Naming producer build carries it into the run; a trust contract for caller-supplied vocabularies may be defined later and is not assumed.
4. **Provenance (strict).** The run's registry provenance for `naming/category-role-perspective` is unavailable, or its digest differs from `categoryRolePerspectiveDigest`, or `registrySource` differs from the run's: `mismatched`. A Tree-built vocabulary without independent run provenance is never usable.
5. **Consistency.** Some accepted §4.5 role-fact group (read from `treeNamingSectionIntake`, never changed) carries a `roleCategory` the vocabulary lacks: `inconsistent`. This detects a vocabulary that disagrees with the run's own evidence; it does **not** prove completeness, since a category no accepted record uses can be missing unnoticed. That limit is why check 3 rests trust on the producer path.
6. Otherwise: `usable`.

Diagnostics name the section `naming-role-category-vocabulary` and the state's reason; they live only in `treeRoleCategoryVocabularyIntake`, never in `treeNamingSectionIntake`, Stage 3 output, a report field, a `meta` entry or a finding.

**Version 2 checks (Contract, calculogic-validator#162, v2 contract; current since its evidence-only implementation slice).** Same order, same states. The first failing check decides:
1. **Presence and version.** No section: nothing is recorded. v2 is the supported version. Once v2 is implemented, any other version, v1 included, is `unsupported` (`unsupported-version`). A v1 section is never read as admissibility evidence.
2. **Envelope and records.** The v1 rules apply, plus:
   - `rolesDigest` must be a non-empty string;
   - `admissibleCategories` must be an array of non-empty strings, sorted and duplicate-free, each the `category` of a record (`invalid-admissible-bound`).
   An empty `admissibleCategories` is valid. Any defect makes the whole section `invalid`.
3. **Origin.** Both origins, as for v1 (`caller-supplied`, `vocabulary-not-naming-derived`).
4. **Provenance (strict).** As for v1, plus: the run's provenance for `naming/roles` is unavailable (`run-provenance-unavailable`), or its digest differs from `rolesDigest` (`roles-digest-mismatch`): `mismatched`.
5. **Consistency.** Some accepted §4.5 `roleCategory` is missing from `admissibleCategories`: `inconsistent` (`observed-category-missing`), with the missing categories. This covers a declared but non-admissible category, such as a staged §4.5 source carrying `deprecated`. Checking against `admissibleCategories` rather than the declared records is stricter, since the bound is a subset of the records.
6. Otherwise: `usable`.

#### S1.3 Evidence availability

Availability is recorded at three levels, so that a comparison that was not performed, or could not be performed, is never represented as one that was performed and found nothing.

**Run level, per section (N1 and N2) and for the v1 bridge itself:**

| State | Meaning |
| --- | --- |
| `available` | The section was received and its envelope is valid |
| `not-staged` | No Naming input reached Tree for this run: no bridge payload at all, or a Tree-built payload for which the staged input that section needs (R1 for the v1 bridge, the N1 source for N1, the folder-label interpreter for N2) was not supplied. A caller-supplied payload is never `not-staged` (S1.1 item 6) |
| `section-absent` | A bridge payload reached Tree without this section although nothing was missing on Tree's side: the producer emitted no section (for example, an invalid namespace or no records), or a caller-supplied payload does not carry it |
| `section-unsupported` | A section with an unsupported contract version was received |
| `section-invalid` | A supported section with a malformed envelope was received |

**Lexical-identity section (Current, calculogic-validator#153).** Its availability is recorded only when the payload carries the section:
- **Absent: nothing is recorded.** On the ordinary run without a selected profile, Naming omits the section (bridge contract §4.7 producer rules). Tree prepares no `treeLexicalIdentityIntake` record, records no availability state, record list or diagnostic for it, and every prepared Tree record is byte-identical to before this amendment. There is no `not-staged` or `section-absent` state for this section.
- **Present:** the `treeLexicalIdentityIntake` record carries the state (`available`, `section-unsupported` or `section-invalid`, with the meanings of the table above), the section's `lexicalProfile` when `available`, the accepted and rejected record lists, and the diagnostics. An unsupported or invalid section is recorded with its diagnostic and yields no lexical expression anywhere.
- `treeNamingSectionIntake` and its `availability` keys never change for this section (S1.1).

**Repository-package label section (Current, calculogic-validator#159).** As for the lexical-identity section, availability is recorded only when the payload carries the section:
- **Absent: nothing is recorded.** Without an identity fact (no manifest, or one that is malformed or declares no supported `name`), Naming omits the section. Tree prepares no `treeRepositoryPackageIntake` record, and every prepared Tree record is byte-identical to before calculogic-validator#159.
- **Present:** `treeRepositoryPackageIntake` carries the state (`available`, `section-unsupported` or `section-invalid`), the accepted and rejected records, and the diagnostics.
- **Compatibility boundaries:** the bridge payload gains the section whenever a fact exists, and the intake record exists exactly when the section does. The Stage 3 record and the Tree report are byte-identical whenever **no package element is accepted**, whatever the section's state; with accepted elements they change only through `repository-package` steps (S3.2).

**Role-category vocabulary section (Contract, calculogic-validator#162; current since its evidence-only implementation slice).**
- **States** (S1.2 order):

  | State | Meaning | Vocabulary available to S3.6 |
  |---|---|---|
  | `absent` | the payload carries no section; **no intake record and no prepared dependency** | no |
  | `unsupported` | another contract version | no |
  | `invalid` | malformed envelope, record, duplicate or count | no |
  | `untrusted` | well-formed, but the payload was caller-supplied, or the vocabulary is not the run's Naming derivation | no |
  | `mismatched` | trusted origins, but run provenance is unavailable or differs | no |
  | `inconsistent` | trusted origins, provenance matches, but an accepted §4.5 category is missing from it | no |
  | `usable` | Tree-built, Naming-derived, valid, provenance matches, consistent | yes, once S3.6 consumes it |

  `untrusted` and `invalid` are distinct states though both are conservative: one is evidence Tree does not trust, the other evidence that is broken. Every state except `usable` keeps the conservative assumption; no state is ever read as proof that every category is mapped.
- **Intake record** (`treeRoleCategoryVocabularyIntake`, present for every state except `absent`): `source`, `state`, `bridgeOrigin`, `vocabularyOrigin`, `vocabulary` and `diagnostics`. `vocabulary` (`registrySource`, `categoryRolePerspectiveDigest`, `records`) is non-null **only** when the state is `usable`; `toTreeUsableRoleCategoryVocabulary(intake)` returns it, or `null` for every other state, and is the one accessor a future S3.6 slice would read. Every non-`usable` state carries exactly one diagnostic `{ section: 'naming-role-category-vocabulary', state, reason }`, plus `missingCategories` for `inconsistent`; reasons: `invalid-envelope`, `invalid-record`, `unsorted-or-duplicate-category`, `record-count-mismatch` (`invalid`); `caller-supplied`, `vocabulary-not-naming-derived` (`untrusted`); `run-provenance-unavailable`, `source-mismatch`, `digest-mismatch` (`mismatched`); `observed-category-missing` (`inconsistent`); `unsupported-version` (`unsupported`).
- **Limits stated by the contract:** a matching digest identifies the registry the vocabulary came from, not that the list is complete, and not that a caller-supplied payload's other sections came from the same run; the consistency check bounds disagreement with observed evidence and proves nothing about unobserved categories.
- **Behavior preservation (the evidence-only implementation slice):** with the intake implemented and Stage 3 unchanged, the Stage 3 record and every Tree finding and report are byte-identical to before, for every state; the bridge payload gains the section whenever a vocabulary input exists, and the intake record exists exactly when the section does.
- **Implementation acceptance** (the evidence-only slice; tests: `naming/test/naming-role-category-vocabulary.logic.test.mjs`, `tree/test/tree-role-category-vocabulary-evidence.logic.test.mjs`, `tree/test/tree-role-category-vocabulary.wiring.test.mjs`):
  1. **Caller-supplied spoofing:** a payload entering through the caller-supplied branch with a well-formed vocabulary, matching declared provenance, matching run provenance and `bridgeSource: 'calculogic-validator/naming'` is `untrusted`, and nothing is made available to S3.6.
  2. **Tree-built positive:** a payload Tree's wiring built through the Naming producer, with matching run provenance and consistent records, is `usable`.
  3. **Absent:** no section, no intake record and no prepared dependency; Stage 3 and the report byte-identical.
  4. **Unsupported:** another contract version is `unsupported`.
  5. **Malformed:** each envelope and record defect (missing provenance field, empty category, empty or unsorted or duplicate roles, duplicate category, count mismatch, identity tuple fields present) makes the whole section `invalid`, never a partial vocabulary.
  6. **Incomplete, observed:** a Tree-built vocabulary missing a category that an accepted §4.5 record carries is `inconsistent`.
  7. **Incomplete, unobserved:** a vocabulary missing a category no accepted record carries is not detected by consistency; the test records this documented limit (trust then rests on the producer path).
  8. **Mismatched:** a Tree-built vocabulary whose digest or source differs from the run's, and one in a run without registry provenance, are `mismatched`.
  9. **Producer completeness:** the derivation function returns exactly the categories and roles of the resolved roles runtime, including deprecated roles, for the Builtin set and for a Custom set adding a category and a role; the producer omits the section rather than emit a partial one.
  10. **Independence:** `treeNamingSectionIntake`, every Stage 1 and Stage 2 record and the semantic-home conformance result are byte-identical with and without the section; the §4.5 section is unchanged.
  11. **Behavior preservation:** Stage 3 and findings byte-identical in every state; `joiningFileCanLeaveClassUnresolved` is still `true`.
  12. **No registry access:** the Tree intake module imports nothing from `naming/src/registries/`.
  13. **Directly supplied vocabulary:** with no caller-supplied payload, a `roleCategoryVocabulary` given to Tree wiring that is not Naming's value for the run (incomplete in a category no accepted record carries, with matching provenance; a complete copy; the Naming value under another resolution object) is `untrusted` (`vocabulary-not-naming-derived`). Added after review of the first implementation commit: Tree building the payload does not establish the completeness guarantee.

**Version 2 (Contract, calculogic-validator#162, v2 contract; current since its evidence-only implementation slice; bridge contract §4.9.1).**
- **States:** the seven states above, decided by the v2 checks (S1.2).
- **Usable view.** For `usable`, `toTreeUsableRoleCategoryVocabulary` exposes the declared `records`, `admissibleCategories`, `registrySource` and both digests. A future S3.6 slice reads only `admissibleCategories`.
- **Unavailable versus empty.** These are distinct, and never conflated:
  - **Unavailable:** no `usable` v2 vocabulary. That covers `absent`, `unsupported` (v1 included), `invalid`, `untrusted`, `mismatched` and `inconsistent`. S3.6 keeps its conservative assumption.
  - **Empty:** a `usable` v2 vocabulary with `admissibleCategories: []`, which is evidence that no category can be canonically admitted.
  - The accessor returns `null` only for unavailable, and the usable view for empty. The declared records are never offered as the bound.
- **Behavior preservation (v2 evidence-only slice).** The Stage 3 record, every Tree finding and every report are byte-identical to before, for every state. `joiningFileCanLeaveClassUnresolved` stays `true`. The bridge payload carries v2 in place of v1 whenever a staged v2 value exists. The intake record exists exactly when the section does.
- **Implementation acceptance (v2; tests: `naming/test/naming-role-category-vocabulary.logic.test.mjs` for 1–4 and 10, `tree/test/tree-role-category-vocabulary-evidence.logic.test.mjs` for the module checks, `tree/test/tree-role-category-vocabulary.wiring.test.mjs` for trust, provenance, consistency, independence and behavior preservation).** *Soundness* tests check inclusion. *Precision* tests are labelled as such, and a precision failure is never reported as a soundness failure.
  1. **Builtin derivation.** The declared records equal the category-role perspective, `deprecated` included. `admissibleCategories` equals the categories of `activeRoles`, so `deprecated` is excluded. `rolesDigest` and `categoryRolePerspectiveDigest` equal the run's provenance entries.
  2. **Custom sets.**
     - A Custom set adding a category whose only roles are deprecated: the category is declared but not admissible.
     - A Custom set deprecating one role inside an otherwise active category: the category stays admissible.
     - A Custom set adding an active role: its category is admissible.
  3. **Custom finding-policy relabelling.** A Custom set labelling the deprecated-role outcome `canonical` leaves `admissibleCategories` unchanged, and §4.5 still carries no non-admissible category.
  4. **Canonical-admission probes (soundness, regression).** For every role in the resolved runtime, Builtin and Custom, run the real classifier and the §4.5 projection on a probe file with a **multi-token** semantic name and a reportable extension (for example `probe-file.<role>.mjs`), first asserting it is not a special case.
     - **Non-vacuity first.** For every probe whose role is in `activeRoles`, assert that the probe actually produces a §4.5 role fact. A single-token name such as `probe.<role>.mjs` reaches the canonical outcome but gets no semantic-family details, so it produces no §4.5 record and would make the probe vacuous.
     - **Inclusion.** Every category that reaches §4.5 through a probe must be in `admissibleCategories`.
     - A separately named *precision* check may assert equality.
     - The probes cover the role dimension of the current structural dependency. They do not prove every filename or context, and say so.
  5. **Malformed bound.** The whole section is `invalid` for: a missing `admissibleCategories` or `rolesDigest`; an unsorted list, duplicate, non-string or empty string; a category without a record. An empty list is valid.
  6. **Unavailable versus empty.**
     - An empty bound is `usable`, and the accessor returns its view.
     - No section is `absent`; a v1 section is `unsupported`. The accessor returns `null` for both.
     - Neither unavailable case is read as empty, and the declared records are never read as the bound.
  7. **Provenance.** A `rolesDigest` mismatch, a run without `naming/roles` provenance, and the v1 perspective-digest and source cases are all `mismatched`.
  8. **Trust.**
     - Caller-supplied payload: a v2 payload through the caller-supplied branch, matching everything and claiming `bridgeSource: 'calculogic-validator/naming'`, is `untrusted`.
     - Directly supplied vocabulary: with no caller-supplied payload, each of the following is `untrusted` (`vocabulary-not-naming-derived`):
       - a hand-built v2 value with a narrowed bound and matching provenance;
       - a copy of Naming's value;
       - Naming's value with its bound edited (rejected as frozen) or replaced;
       - Naming's value under another resolution object.
  9. **Consistency.** A staged §4.5 source carrying a declared but non-admissible category, with Naming's own v2 value, is `inconsistent`, naming that category.
  10. **Producer.**
      - v2 is emitted whenever a complete staged v2 value exists, on the Tree-built and the direct `projectNamingOccurrenceBridge` paths.
      - v1 and v2 are never emitted together.
      - A malformed staged bound omits the section.
      - The factory returns no value without either digest.
  11. **Independence.** Stage 1A, Stage 1, Stage 2, the conformance result and §4.5 are byte-identical with and without the section.
  12. **Behavior preservation.** Stage 3, findings and reports are byte-identical in every state, and the fixed `true` remains.
  13. **No registry or status access.** The Tree intake imports nothing from `naming/src/registries/` and reads no role status.

**Record level:** each record is `accepted` or `rejected` with its intake reason (S1.2).

**Fact level, per occurrence:**

| Fact | States |
| --- | --- |
| Folder label (N2) | `parsed`; `not-parsed` (with Naming's reasons); `absent`, with the reason: `run-unavailable`, `record-rejected` or `no-record` |
| File semantic identity (v1 observation) | `semantic-observation`; `no-semantic-observation`; `rejected`; `unavailable` |
| File tokens (N1 token group) | `available`; `not-provided`; `invalid`; `rejected`; `unavailable` |
| File role facts (N1 role-fact group) | `available`; `not-provided`; `invalid`; `rejected`; `unavailable` |

- `no-semantic-observation` means the v1 bridge is available and accepted for the run and contains no observation for this file. Until the deferred Naming evaluation-status track on #85 lands, it merges "Naming evaluated the file without producing a semantic identity" with "the file was outside Naming's scan".
- N1 availability is recorded **per field group**, because bridge contract §4.5 lets an accepted record carry either group without the other and validates field groups separately from identity:
  - `not-provided` means N1 is available for the run and the group is missing for this file, with one of two reasons kept on the state: `no-record` (N1 has no record for the file) or `group-omitted` (N1 has an accepted record that omits this group, for example a record with role facts but no tokens);
  - `invalid` means the file's record was accepted but this field group was dropped as invalid at intake. The record's other group is unaffected: an invalid token group never discards valid role facts, and the reverse.
- `unavailable` means the run-level state for the source is anything but `available`.
- `rejected` means the occurrence's whole record was rejected at intake (an identity or envelope-level reason), so every field group of that record is `rejected`.

**Fact sources (calculogic-validator#97, D1).** Facts are read only from the Stage 1A intake record. The intake exposes the v1 observations exactly as its association rule accepts or rejects them (valid and unique tuple in the payload namespace, matching an occurrence in Tree's addressed namespace, no path fallback), so there is one v1 acceptance rule for all Stage 1 evidence. A file's semantic identity is `rejected` when its v1 observation was rejected, with the intake reasons kept on the fact; a rejection without an identity tuple cannot be attributed to an occurrence and stays visible only in the intake.

**Folder bridge observation.** Each folder also carries the state of its own v1 observation: `accepted` (with its `semanticEvidenceKind`), `none`, `rejected` (with the intake reasons) or `unavailable`. This keeps a rejected folder observation visible, including the case in which two v1 observations share one folder's tuple and the duplicate rule rejects both (#85 non-blocking track); the folder is never treated as though it had no observation.

**Comparison rule.** A comparison is `evaluated` only when every fact it needs is available. Otherwise it is `not-evaluated` with one reason, chosen in this order: run-level unavailability, then record rejection, then an invalid field group, then a missing fact (`no-semantic-observation`, or `not-provided` with its `no-record` or `group-omitted` reason). For example, a `prefix` comparison for a file whose accepted N1 record carries role facts but no tokens is `not-evaluated` with reason `not-provided` / `group-omitted`; it is never foreign evidence. A `not-evaluated` comparison is never counted as a match or as foreign evidence, and never as contradiction.

#### S1.4 Candidates

A candidate is permission to investigate one interpretation of one folder. It is not evidence that the interpretation is correct, and file contents never propose one.

**Sources (closed list):**

| `candidateSource` | Proposed from | `labelObservationRef` |
| --- | --- | --- |
| `naming-folder-label` | An accepted N2 record with `parseOutcome: parsed` | The folder occurrence's identity tuple |
| `naming-folder-semantic-context` | An accepted Naming `folder-semantic-context` observation | That observation's identity tuple |
| `naming-package-root` | An accepted Naming `semantic-family-root-folder` observation with `familyRootQualification: package-root-folder` | That observation's identity tuple; the candidate is always `bounded` |
| consumer-supplied context | Reserved; not produced in Stage 1 | Defined when introduced |

A folder whose label is `not-parsed` gets no `naming-folder-label` candidate. It still gets a composition observation (S1.8) and can still receive candidates from other sources.

**Identity and fields.** A candidate is identified by `(folderAddressPath, candidateSource, labelObservationRef)`. Each candidate records:

- its identity;
- `lexicalRoot` and, for `naming-folder-label`, `labelTokens`, both copied from the Naming record: `labelRoot` for `naming-folder-label`, and the observation's `familyRoot` for `naming-folder-semantic-context` and `naming-package-root`, with no further derivation (calculogic-validator#97, D4);
- `rootAncestry`: `anchored` when an ancestor folder has a candidate with the same `lexicalRoot`, otherwise `unanchored`;
- references to other candidates on the same folder and to Tree's existing folder-kind and structural evidence for the folder, recorded alongside and never used to suppress the candidate. Other candidates are referenced by candidate identity; Tree's existing evidence by that evidence's own record identity, which is Tree-owned and introduces no Naming join. No Stage 1 rule reads these references (calculogic-validator#97, D5).

Multiple candidates may coexist on one folder.

#### S1.5 Matching channels

Each candidate is compared with each member file occurrence (S1.6) on two channels, recorded separately:

| Channel | Comparison | Needs | Applies to |
| --- | --- | --- | --- |
| `root` | The file's v1 `familyRoot` equals the candidate's `lexicalRoot` | File semantic identity | Every candidate |
| `prefix` | The file's N1 `semanticTokens` begin with the candidate's `labelTokens` | File semantic identity and the N1 token group | `naming-folder-label` candidates with two or more label tokens |

Each comparison is `match`, `foreign` or `not-evaluated` (S1.3). Ambiguity facts on the file's v1 observation are carried into the facet counts. They do not change the comparison. A match is `ambiguous` when the file's accepted v1 observation carries a non-empty `ambiguityFlags`, otherwise `singular`; `splitFamilyFlags` is not used (calculogic-validator#97, D3).

#### S1.6 Candidate-relative containment

Relationships describe a member's relation to one candidate. They are not properties of a folder, and they are kept separate from evidence availability.

**Members.** The members of candidate C at folder F are the file occurrences in F's subtree, from the addressed snapshot. A member's **lineage** relative to C is the ordered list of folders strictly below F down to and including the member's parent folder; for a direct member it is empty.

**Boundary facts.** For each folder f in a lineage, relative to C:

| Fact | Established when | Status in Stage 1 |
| --- | --- | --- |
| `terminate` | f has an accepted `naming-package-root` observation | Established |
| `narrow` | f has a `naming-folder-label` candidate whose `lexicalRoot` equals C's | Established, as attribution only |
| `provisional-redirect` | f has a candidate whose `lexicalRoot` differs from C's | Provisional |
| (role-category redirect) | Deferred: needs the Naming decision on which role categories are named by subject (#85) | Not produced |

Why a nested foreign candidate is only provisional: every parsed folder label proposes a candidate, including labels such as `src`, `test`, `registries`, `rules` and `cli`. Whether a nested candidate genuinely redirects meaning depends on whether it is supported, which is a Stage 2 question. Treating it as an established redirect in Stage 1 would, for example, redirect every member of `naming/` behind `naming/src` and `naming/test` (S1.10).

**Per-member algorithm.** For candidate C and member m:

1. Collect every boundary fact on m's full lineage relative to C, in order from F downward. Evaluation never stops at the first fact found.
2. If any `terminate` fact exists, m's relationship to C is `terminated`, established at the shallowest `terminate` folder. Every other fact on the lineage, including any redirect above or below it, is kept as provenance.
3. Otherwise, if an established redirect fact exists, the relationship is `redirected`. No established redirect basis exists in Stage 1.
4. Otherwise, the relationship is `preserved`, with status `provisional`. The member record lists its `narrow` attributions and its `provisional-redirect` boundaries.

A deeper `terminate` therefore always overrides a redirect found higher on the lineage.

**Several facts on one folder (calculogic-validator#97, E3).** A lineage folder may carry several boundary facts relative to C. For example, a folder with a `naming-folder-label` candidate sharing C's `lexicalRoot` and a candidate from another source with a different root carries both `narrow` and `provisional-redirect`. Each is recorded; neither hides the other.

**Terminated members stay visible (calculogic-validator#97, E1).** A `terminated` member's channel comparisons are still recorded on its member record, for provenance, with the relationship beside them. They contribute nothing to C's `match`, `foreign` or `not-evaluated` counts. Termination has its own counts (S1.7, S1.9).

**Traversal safeguard (calculogic-validator#97, E4).** Every walk over structural relationships (the subtree view, member collection, lineage, and the ancestor walk for `rootAncestry`) records the folders it has visited by occurrence identity and does not revisit one. An acyclic Addressing snapshot is unaffected. A malformed snapshot whose parent or child references form a cycle still terminates, with each folder counted once. This is a defensive guard, not structural validation, and it emits no diagnostic: acyclicity remains an Addressing invariant.

**Relationship is not support.** `preserved (provisional)` only records that no stronger relationship was established. It never counts as support by itself. Only an evaluated channel `match` is evidence for a candidate, and every count keeps the member's relationship and its provisional boundaries visible, so Stage 2 can decide what they mean.

Containment and comparison are independent dimensions. A member whose relationship is `preserved (provisional)` still contributes its independently evaluated `root` or `prefix` comparison: a `match` counts as matching evidence and a `foreign` as foreign evidence, with the member's provisional containment status kept on the count. Only `terminated` members are excluded from a candidate's matches and foreign evidence (S1.7).

#### S1.7 Accounting

- A member contributes to candidate C at most once per channel. `terminated` members are counted separately and never as matches, foreign evidence or not-evaluated comparisons for C; per channel, `match` + `foreign` + `not-evaluated` equals C's non-terminated member count.
- Every count is attributed to the **branch**: the immediate child folder of F on the member's lineage, or `direct` for a direct member. Branch counts sum to the candidate's totals.
- A member below a `narrow` folder counts once for C and once for the narrowing candidate, with the narrowing candidate recorded on C's branch row. It is never counted twice within one candidate.

#### S1.8 Composition observations

There is one logical composition observation per addressed folder occurrence, whether or not the folder has a candidate. It records:

- direct-member tallies by v1 `familyRoot`, by N1 `roleCategory` (from the role-fact group, counting its availability states separately), and by the fact-level availability states in S1.3;
- the folder's label state (`parsed`, `not-parsed` or `absent`);
- references to its child folders' composition observations.

Subtree tallies are a deterministic **derived view** over these records, not stored duplicates. Member-level facts are held once, keyed by occurrence identity.

Each observation also carries the folder's bridge observation state (S1.3). Direct members are the file occurrences whose parent is the folder in Tree's addressed snapshot. A file with no parent folder occurrence (for example a repository-root file at `repo` scope, since the current addressed snapshots do not represent the repository root as an occurrence) belongs to no composition observation; its facts are still recorded. Fact-level tallies are keyed by state, qualified by the reason where S1.3 keeps one on the state (for example `not-provided:group-omitted`).

#### S1.9 Facets and output

**Facets per candidate are counts only:**

- per channel: `match` (singular or ambiguous, direct or descendant), `foreign` by root and by branch, and `not-evaluated` by reason; `foreign` counts are keyed by the member's v1 `familyRoot` on both channels (calculogic-validator#97, E2);
- `terminated` members by terminating folder;
- `provisional-redirect` boundaries, each with the nested candidate's reference and the number of members behind it;
- `narrow` attributions;
- corroboration references (S1.4).

No ratio, threshold, eligibility, strength or placement value is produced in Stage 1.

**Output.** The evidence is one Tree-owned prepared-evidence record, `treeFolderSemanticEvidence`, in Tree's prepared dependencies, next to the existing Tree evidence. It holds run-level availability, intake diagnostics, candidates with facets, member relationship records and composition observations. Availability and intake diagnostics are taken unchanged from the Stage 1A intake record, and fact-level facts and composition observations from the Stage 1B-i record (S1.11), never recomputed (calculogic-validator#97, D2). It is not part of the report payload and does not change findings. All collections are sorted deterministically by occurrence identity, then by `candidateSource`.

**Legacy evidence.** The former `semanticHome` field (the occurrence's own `semanticFamily`) was retired in Stage 2C (S2.13). Its folder records continue, unchanged in value, as `treeFamilyRootFolderEvidence` (`tree/src/tree-family-root-folder-evidence.logic.mjs`). Stage 1 references folder-kind evidence by record identity only (D5) and reads neither.

#### S1.10 Worked examples (this repository at `repo` scope, `main` at `cd6b2c0`)

These counts were computed from the merged Naming producers against Tree's own addressed snapshot. They illustrate the contract; they are not stored expectations. There are no package-root observations in this repository, so no member is `terminated`.

| Folder | Label | Candidates | `root` channel | `prefix` channel | Not evaluated | Lineage boundaries |
| --- | --- | --- | --- | --- | --- | --- |
| `tree` | parsed, root `tree` | `naming-folder-label`, `naming-folder-semantic-context` | 42 match (32 ambiguous), 11 foreign, all through `tree/src` (the `_builtin` payloads, for example roots `structural` 4 and `semantic` 2) | n/a (single token) | 27 (`no-semantic-observation`; test files) | `provisional-redirect` at `tree/src` (53 members), `tree/src/registries` (25), `tree/src/contributors` (3), `tree/test` (27) |
| `naming` | parsed, root `naming` | `naming-folder-label`, `naming-folder-semantic-context` | 33 match (20 ambiguous), 12 foreign, all through `naming/src` (registry payloads and `registry-state`) | n/a | 28 (`no-semantic-observation`) | `provisional-redirect` at `naming/src` (47), `naming/test` (26), `naming/src/registries` (23), and others |
| `src/core/registry-lifecycle` | parsed, tokens `registry`, `lifecycle`; `unanchored` | `naming-folder-label` | 31 match (10 ambiguous), 0 foreign | 31 evaluated, 31 match | 0 | none; all 31 members are direct |
| `doc/ValidatorSpecs/tree-owned` | parsed, tokens `tree`, `owned` | `naming-folder-label` | 7 match (4 ambiguous), 2 foreign (`validator`, direct) | 9 evaluated, 0 match | 3 (`no-semantic-observation`) | none |
| `structural-addressing` | parsed, tokens `structural`, `addressing` | `naming-folder-label` | 5 match (4 ambiguous), 0 foreign | 5 evaluated, 5 match | 6 (`no-semantic-observation`) | `provisional-redirect` at `structural-addressing/src` (5), `structural-addressing/test` (6) |
| `doc/Audits` | not-parsed (`label-has-uppercase`) | none from labels | n/a | n/a | n/a | Composition observation only |
| `naming/src/registries/_builtin` | not-parsed (`label-has-unsupported-character`) | none from labels | n/a | n/a | n/a | Composition observation only; no boundary fact, so its members stay `preserved (provisional)` relative to `naming` |

What the examples show:

- **`tree-owned`:** the two channels disagree (7 root matches, 0 prefix matches). Stage 1 records both; what an owner-qualified label means is a Stage 2 question.
- **`naming` and `tree`:** most of their members sit behind folders whose labels propose other candidates. Recording those folders as provisional keeps their evidence visible to Stage 2 instead of redirecting it away in Stage 1.
- **`_builtin`:** a not-parsed folder creates no boundary, so its foreign roots stay visible in `naming`'s foreign counts on the `naming/src` branch.

#### S1.11 Implementation slicing

Stage 1 is implemented in two bounded slices. Each keeps Tree findings byte-identical at `repo`, `validator` and `app` scope.

| Slice | Delivers |
| --- | --- |
| **Stage 1A** | The Naming-owned staging function, runner transport, Tree wiring's call to the Naming producer (S1.1); section intake and intake diagnostics (S1.2); run- and record-level availability (S1.3). No candidate or facet model. |
| **Stage 1B** | Fact-level availability (S1.3), candidates, channels, the containment algorithm, accounting, composition observations, facets and the output record (S1.4–S1.9). |

Stage 1A gives an independent checkpoint: both sections can be verified to reach Tree correctly before Tree assembles any folder-level evidence from them.

Stage 1A implementation (calculogic-validator#95): Tree records intake as the prepared-evidence entry `treeNamingSectionIntake` (`tree/src/tree-naming-section-intake.logic.mjs`). It carries the payload's `bridgeSource` (`tree-built` or `caller-supplied`), the run-level availability of the v1 bridge, N1 and N2, the accepted and rejected records of each section (N1 accepted records carry per-field-group states `accepted`, `omitted` or `invalid`), and the intake diagnostics, all in deterministic identity-tuple order. No finding, candidate or facet reads it yet. Since Stage 1B-i it also exposes `bridgeObservations` (accepted and rejected v1 observations, S1.3 fact sources); its earlier fields are unchanged.

Stage 1B is delivered in two slices (calculogic-validator#97, D7):

- **Stage 1B-i** (current implementation reality): the prepared-evidence entry `treeFolderFactEvidence` (`tree/src/tree-folder-fact-evidence.logic.mjs`). It holds `availability` (the Stage 1A record itself, not a copy), `occurrenceFacts` (one record per addressed occurrence: `folderLabel` and `bridgeObservation` for folders; `semanticIdentity`, `tokens` and `roleFacts` for files) and `compositionObservations` (one per addressed folder, direct members only). The S1.3 comparison rule and the S1.8 subtree view are exported functions over this record, not stored values. It holds no candidate, comparison, relationship or facet.
- **Stage 1B-ii** (current implementation reality): `treeFolderSemanticEvidence` (S1.9), built by `tree/src/tree-folder-candidates.logic.mjs` (S1.4) and `tree/src/tree-folder-semantic-evidence.logic.mjs` (S1.5–S1.7, S1.9). It holds the Stage 1A availability and diagnostics and the Stage 1B-i composition observations by reference, reads fact states from the Stage 1B-i record, evaluates every comparison with its comparison rule, and reads a Naming field value only when the matching fact says it is usable. It never builds a second fact or composition model.

### Folder-level Semantic Home reasoning, Stage 2 (Status: Contract, calculogic-validator#102. Stage 2A (candidate reasoning, placement and the conformance binding) is implemented as prepared evidence. Stage 2B is complete: `TREE_FAMILY_SCATTERED` is its only finding reader, and the other three family codes are retired. The S2.10 values are Builtin registry data (`semantic-home-policy` version 2), loaded as `treeSemanticHomeParameterSet`)

This section is the contract for Tree Stage 2 of folder-level Semantic Home development (tracking: calculogic-validator#85; scoping and approved directions F1–F6: calculogic-validator#102). It defines how Tree moves from the Stage 1 evidence (S1.1–S1.11) to three kinds of decision:

- which candidates qualify as Semantic Homes (eligibility);
- how members are attributed when candidates are nested (resolved attribution);
- how each file relates to the qualifying homes (placement).

It also proposes, code by code, what each existing family finding should become.

**Principle.** Stage 1 preserves what is observed; Stage 2 must justify what can be concluded from those observations. Every Stage 2 conclusion names the evidence that justifies it. Where the evidence does not justify a conclusion, the result is `undetermined`, never a guess in either direction.

**What is fixed here and what is not.** This contract fixes the rule *shape*: which evidence enters, how each kind of evidence can move an outcome, the evaluation order, the precedence, and the output records.

It also records the **selected policy values** for the four S2.10 parameters, from the Stage 2 policy decision record on calculogic-validator#102 (D1–D8), with their rationales and limitations. Their status:
- **Adopted as data.** The values are Builtin registry data in `semantic-home-policy` version 2 (S2.10, S2.14 step 3).
- **Loaded, not active.** The parameter loader prepares them as `treeSemanticHomeParameterSet` (S2.9), but no reasoning reads them. They take effect only when the separately authorized Stage 2A runtime consumes them (S2.14).

**What Stage 2 does not decide.** Semantic Home reasoning is one dimension of Tree's folder and placement interpretation. It does not replace the others:

- **Eligibility is not folder meaning.** A folder can carry structural meaning, semantic meaning, both or neither. A candidate that is `not-eligible` says only that the folder is not a Semantic Home for that candidate's claim. It says nothing about whether the folder is structurally meaningful. For example, `tree/src` is a meaningful structural container even though its `src` label candidate has no support. Folder-kind classification and Structural Home evidence stay separately owned. Stage 2 references them as corroboration (S2.7) and never overwrites them.
- **Semantic Home placement is not a placement verdict.** The S2.8 states say how a file relates to eligible Semantic Homes. They are one future contributor to whole-placement reasoning, which may also weigh structural-home alignment, containment, sibling patterns and referenced roles. `inside-home` does not mean a file is correctly placed. `home-elsewhere` and `no-home` do not mean it is misplaced. Whole-placement confidence is outside this contract, and any later model that consumes Stage 2 placement must keep it as a distinct input rather than treat it as the verdict.

#### S2.1 Inputs and ownership

Stage 2 reads only the Stage 1 prepared evidence, by reference:

- `treeFolderSemanticEvidence` (S1.9): candidates, facets, member relationship records and boundary facts;
- `treeFolderFactEvidence` (S1.11): fact states and composition observations;
- `treeNamingSectionIntake` (S1.11): run- and record-level availability, and the accepted records whose values Stage 1 already reads.

Stage 2 never reinterprets Naming material. It never tokenizes, derives roots or families, or calls a Naming rule. Every comparison Stage 2 needs is a Stage 1 channel comparison (S1.5), gated by the Stage 1 comparison rule (S1.3). For placement (S2.8), Stage 2 applies the same channel definition to file and candidate pairs that are not members of one another. This adds no new kind of comparison.

Stage 1 records are never modified. Stage 2 conclusions sit in their own record (S2.9), next to the observations they are drawn from.

Every Stage 2 join uses addressed occurrence identity, as Stage 1 does. Filesystem paths are descriptive context only. Older registry or blueprint wording that describes evidence "by path" does not license a path-keyed join in Stage 2.

#### S2.2 Outcomes (F1)

Each candidate receives exactly one outcome, with one or more reasons from a closed vocabulary:

| Outcome | Meaning |
| --- | --- |
| `eligible` | The candidate's own evidence, after attribution (S2.6), justifies treating the folder as a Semantic Home for the candidate's claim (S2.3). |
| `not-eligible` | The candidate's evaluated evidence justifies concluding that the folder is not such a home. |
| `undetermined` | The evidence does not justify either conclusion: too little was evaluated, the evaluated evidence is mixed, the outcome depends on an undetermined nested candidate, or what the label claims is itself unresolved (S2.3). |

`undetermined` is never treated as `not-eligible`, and never as `eligible`. It propagates to placement (S2.8) and never produces a finding by itself (S2.12).

Reasons:

| Reason | Outcome |
| --- | --- |
| `supported` | `eligible` |
| `contradicted` | `not-eligible` |
| `no-active-members` | `undetermined` |
| `insufficient-evaluated-coverage`, with the not-evaluated reasons and counts from S1.3 | `undetermined` |
| `insufficient-support` | `undetermined` |
| `mixed-evidence` | `undetermined` |
| `depends-on-undetermined-nested-candidate`, with the nested candidates' identities | `undetermined` |
| `claim-unresolved`, with the alternative root reading's S2.5 outcome, reason and counts (S2.3) | `undetermined` |

A `channel-disagreement` note (S2.4) and a `bounded` note (S2.5) may accompany any outcome. Notes never change an outcome.

#### S2.3 The candidate's claim and its governing channel

A candidate claims one interpretation of its folder. The channel that tests that interpretation is the candidate's **governing channel**:

| Candidate | Claim | Governing channel |
| --- | --- | --- |
| `naming-folder-label` with one label token | Files whose `familyRoot` is the label root | `root` |
| `naming-folder-label` with two or more label tokens | Files whose `semanticTokens` begin with the full label token sequence | `prefix` |
| `naming-folder-semantic-context` | Files whose `familyRoot` is the observation's `familyRoot` | `root` |
| `naming-package-root` | Files whose `familyRoot` is the observation's `familyRoot` | `root` |

Only the governing channel decides eligibility. The other channel, where it applies, is recorded beside it (S2.4).

Why the prefix channel governs a compound label: a compound label such as `registry-lifecycle` names a narrower interpretation than its first token. If root-channel matches decided its eligibility, the folder would be treated as a home for every `registry*` file, including `registry-state` and `registry-entry-shape`, which the label does not name. The root-level question for root `R` is answered by candidates whose claim *is* `R`: single-token labels, semantic-context and package-root candidates.

Owner- or qualifier-style labels (for example `tree-owned`) are compound labels under this rule, and the alternative root reading below keeps them from being wrongly rejected. Whether a label token such as `owned` is a qualifier rather than part of the claim is a Naming decision. It is not currently made: Naming does not classify label tokens (calculogic-validator#85, deferred role-category track). If Naming later publishes such a classification, the claim of an affected candidate is redefined by a contract amendment, not by Tree interpretation. The planned shared Linguistic Foundation layer (calculogic-validator#85 living document) is the intended source of reusable token identities that Naming could build such a classification on. It is future work with its own authorization, and Tree would consume it only through Naming-owned or explicitly shared projections.

**Alternative root reading (E2; calculogic-validator#102, D1).** Until Naming classifies label qualifiers, a multi-token label has two admissible readings:
- the **prefix reading**, which is its claim as defined above;
- the **root reading**: files whose `familyRoot` is the label root.

The prefix reading still decides `eligible`. `not-eligible` requires **both** readings to be contradicted. The root reading is evaluated by the same S2.5 rule, on the same decision members, on the root channel:

| Prefix reading | Root reading | Outcome |
| --- | --- | --- |
| `eligible` | any | `eligible` |
| `undetermined` | any | `undetermined`, with the S2.5 reason |
| `not-eligible` | `eligible` | `undetermined` (`claim-unresolved`) |
| `not-eligible` | `undetermined` | `undetermined` (`claim-unresolved`) |
| `not-eligible` | `not-eligible` | `not-eligible` |

**Constraints:**
- **The root reading never becomes a home.** For a `claim-unresolved` candidate, a file matching on the root channel only *possibly matches* (S2.8). It can be placed `undetermined`, never `inside-home` or `home-elsewhere`.
- **The outcome keeps the root reading's own S2.5 outcome, reason and counts**, so these stay distinguishable:
  - a supported root reading (`eligible`);
  - support below eligibility (`mixed-evidence`, `insufficient-support`);
  - a root reading unresolved by availability. Invariant E2-I1 shows this cannot be the sole cause.

**Rationale.** E2 separates two questions:
- is there enough evidence to *establish* a home? (the eligibility bar);
- is there enough evidence to *reject every plausible claim*? (the contradiction bar).

It applies the same principle S2.6 applies to nested candidates: decide only what holds under every admissible reading. In this repository, the subject compounds `src/core/registry-lifecycle` (prefix 31 of 31) and `structural-addressing` (5 of 5 evaluated) lose no member to the prefix rule. The owner-qualified `doc/ValidatorSpecs/tree-owned` (0 prefix matches, 7 root-only) and `naming-owned` (0 prefix matches, 4 root-only) would lose every legitimate member without E2.

**Invariant E2-I1.**
- **The invariant:** E2 cannot produce `claim-unresolved` solely because the root channel lacks evaluated coverage.
- **Proof:**
  - The prefix channel needs a file's semantic identity and its N1 tokens; the root channel needs only the identity (S1.5).
  - Both readings use the same decision members, so prefix coverage is never greater than root coverage.
  - A `not-eligible` prefix reading means prefix coverage passed (S2.5 step 2), so root coverage passes.
  - With zero root matches, the root share is 0, so the root reading is `not-eligible`.
  - `claim-unresolved` therefore always rests on actual root support.
- **Obligations:** the invariant is pinned by catalogue case C29, and must be re-examined if channel availability semantics change.

**Rejected alternatives (D1):**
- **Prefix only:** owner-qualified folders become `not-eligible`, and their documents read as `home-elsewhere` spread evidence.
- **Root only:** `src/core/registry-lifecycle` would claim every `registry` file.
- **Prefix and root as two independent candidates:** the root candidate on `src/core/registry-lifecycle` is eligible on 31 of 31, so `registry-lifecycle` again claims every `registry` file.
- **`claim-unresolved` only when the root reading is `eligible` (E1):** this ties uncertainty about the claim to the eligibility threshold.
- **A separate significance parameter:** it adds a value needing its own justification, while the existing contradiction bar already does the job.

**End state.** Naming classifies label qualifiers, and the affected claims are redefined by amendment.

#### S2.4 Evidence classes (Q1)

Evaluated coverage is necessary for a decision, but it is not sufficient. Each evidence class enters the decision in a defined way:

| Evidence class | Source (Stage 1) | Can move toward `eligible` | Can move toward `not-eligible` | Can move toward `undetermined` |
| --- | --- | --- | --- | --- |
| **Support:** an evaluated `match` on the governing channel, after attribution | S1.5, S1.9 match counts | yes | no | no |
| **Contradiction:** an evaluated `foreign` on the governing channel, after attribution | S1.5, S1.9 `foreignByRoot` | no | yes | yes (through `mixed-evidence`) |
| **Missing:** a `not-evaluated` comparison, whatever its reason | S1.3 comparison rule | no | **never** | yes (through coverage) |
| **Ambiguity:** a match whose v1 observation carries `ambiguityFlags` | S1.5 `ambiguous` counts | as support (see below) | no | no |
| **Channel disagreement:** the non-governing channel compares differently | S1.5, the other channel's counts | no | no | only through the alternative root reading of a multi-token label (S2.3, `claim-unresolved`); otherwise recorded as a note and a strength facet only |
| **Terminated members** | S1.6, S1.7 | no | no | no; excluded from the candidate's counts (S2.5) |
| **Boundary facts:** `narrow`, `provisional-redirect` | S1.6 | through attribution only (S2.6) | through attribution only | through attribution only |
| **Corroboration:** same-folder candidates and Tree folder-kind and structural references | S1.4 references | no | no | no; strength facet only |

**Missing evidence is never contradiction.** A `not-evaluated` comparison can only lower coverage. Its reason is kept on the outcome, so an `undetermined` caused by a run-level gap (`run-unavailable`) stays distinguishable from one caused by files without a semantic observation (`no-semantic-observation`).

**Ambiguous matches count as support (calculogic-validator#102, D2).** The only ambiguity flag Naming emits, `family-boundary-heuristic`, records a heuristic choice of the *family boundary* (`semanticFamily`) for connector-free names of four or more tokens. `familyRoot` is the first token either way, and the token sequence is unchanged. Naming's own aggregates already apply this distinction: `familyRootCounts` include flagged evidence, and only family- and subgroup-level aggregates require singular evidence (`doc/ConventionRoutines/NamingValidatorSpec.md`, aggregate inclusion and `ambiguityFlags`; `doc/ValidatorSpecs/naming-owned/naming-semantic-family-and-interpretation.spec.md`, observational markers). Root and prefix comparisons compare `familyRoot` and token sequences, not the family boundary, so a flagged match is full support on either channel. The ambiguous share stays visible as a strength facet (S2.7).

Ambiguity qualifies the specific fact that is uncertain, not every fact derived from the same name. A flagged observation gives full support to a root or prefix comparison, whose compared values the flag does not qualify. Its `semanticFamily` and `familySubgroup` stay uncertain. No Stage 2 rule, and no Stage 2B finding change, may count a flagged observation as family- or subgroup-level evidence, matching Naming's singular-only rule for those aggregates. This refines the general principle that ambiguity limits evidence strength; it does not set that principle aside.

**How the strength limitation is carried.** The Naming–Tree bridge requires ambiguity to limit Tree's evidence strength. The Tree blueprint requires it to limit or downgrade Semantic Home evidence strength (calculogic-validator#85 living document, bridge contract and Tree registry blueprint). Stage 2 meets this claim by claim, not by a blanket reduction:

| Evidence | Effect of `family-boundary-heuristic` |
| --- | --- |
| `familyRoot` | Remains usable for root matching |
| `semanticTokens` | Remain usable for prefix matching |
| `semanticFamily` | The boundary remains uncertain |
| `familySubgroup` | Cannot be promoted to reliable subgroup evidence |
| Strength profile (S2.7) | Preserves the qualification: the ambiguous share of support, per candidate |

No Semantic Home strength or eligibility is reduced merely because the ambiguous share is nonzero, and no ambiguity weighting is defined. Any future consumer of Semantic Home strength must respect exactly which evidence the flag qualifies. Such consumers include Stage 2B findings and whole-placement confidence. Family- and subgroup-level conclusions must not treat flagged observations as singular evidence. Introducing a weighting rule would need its own justified amendment.

The rule is also supported by every flagged observation in this repository: 119 of 254 accepted observations at `repo` scope and 15 of 71 at `app` (`main` at 9cd27d9). In each one, `familyRoot` equals the first N1 token and the tokens equal the semantic name's split; only the family differs from the root. Discounting or excluding flagged matches was rejected: no evidence justifies a weight, and 35 of `tree`'s 46 matches are flagged.

An absent flag does not mean Naming's root is semantically correct:
- A modifier or product prefix taken as the root is unflagged. For example, `post-hardening-validator-shim` gives root `post`, and `calculogic-validator-*` names give root `calculogic`.
- Depending on the candidate compared, this can cost a candidate support or give it false support.
- Tree consumes Naming's declared root faithfully. Modifier-versus-subject interpretation is Naming's descriptive-token policy, and Tree does not compensate for it.

If Naming adds a flag that qualifies `familyRoot` or the token sequence, this rule is revisited by amendment.

**Channel disagreement does not decide.** For example, `doc/ValidatorSpecs/tree-owned` has 7 root matches and 0 prefix matches among its evaluated members. Under S2.3 the prefix channel governs, so its prefix reading is decided on 0 of 9: `not-eligible`. The 7 root matches are recorded as a `channel-disagreement` note with both channels' counts. They never make the folder a home for root `tree`. They do keep it from being rejected: the root reading (7 of 9) is not contradicted, so the candidate is `claim-unresolved` (S2.3).

#### S2.5 Eligibility rule shape (Q1, Q2, Q9)

For candidate C, after attribution (S2.6), on C's governing channel:

- `A`: C's **decision members**. These are the active (non-`terminated`) members, minus those reattributed away from C (S2.6).
- `M`: support, the evaluated matches among `A`, singular and ambiguous together (S2.4).
- `F`: contradiction, the evaluated foreign comparisons among `A`.
- `N`: missing, the not-evaluated comparisons among `A`, so `M + F + N = |A|`.
- **Coverage** is `(M + F) / |A|`. **Support share** is `M / (M + F)`.

The conditions are applied in order; the first that holds decides:

1. `|A| = 0` → `undetermined` (`no-active-members`). This covers a candidate whose members are all terminated or reattributed: it has no evidence of its own.
2. Coverage below `P_COVERAGE` → `undetermined` (`insufficient-evaluated-coverage`).
3. Support share at or below `P_NOT_ELIGIBLE_SHARE` → `not-eligible` (`contradicted`).
4. Support share at or above `P_ELIGIBLE_SHARE` and `M ≥ P_MIN_SUPPORT` → `eligible` (`supported`).
5. Support share at or above `P_ELIGIBLE_SHARE` but `M < P_MIN_SUPPORT` → `undetermined` (`insufficient-support`).
6. Otherwise, with the share strictly between the two thresholds → `undetermined` (`mixed-evidence`).

For a multi-token label candidate, a `not-eligible` result from these steps is final only if the alternative root reading is also `not-eligible` (S2.3). Otherwise the candidate is `undetermined` (`claim-unresolved`).

The share thresholds compare the **support share** `M / (M + F)`, never a count of foreign files. For example, "at or below 0.25" means at most a quarter of the evaluated members support the claim, whatever the folder's size.

The parameters must satisfy `0 ≤ P_NOT_ELIGIBLE_SHARE < P_ELIGIBLE_SHARE ≤ 1`, `0 < P_COVERAGE ≤ 1` and `P_MIN_SUPPORT ≥ 1`. The band between the two share thresholds is deliberate: evidence that is neither clearly supporting nor clearly contradicting is `undetermined`.

A candidate is never compared with another candidate to pick a winner. Raw counts are never compared across candidates, and no candidate's matches count as another candidate's support.

**Termination is not eligibility (Q5, Q9).**
- A `terminate` boundary (S1.6) does two things only: it bounds the relevant lineage for placement (S2.8), and it removes the members behind it from outer candidates' counts, as Stage 1 already does.
- It never establishes that the terminating folder is an eligible home.
- A `naming-package-root` candidate is evaluated by this same rule on its own members, which are not terminated relative to itself. Its outcome carries the `bounded` note, and its eligibility is a conclusion from its evidence like any other.

**Several candidates on one folder (F4).**
- Each candidate is evaluated independently. A folder may hold several eligible interpretations, and no choice is forced.
- Agreement between same-folder candidates, such as the `tree` label and the `tree` semantic context, is recorded as corroboration (S2.7). It never adds to either candidate's counts.

#### S2.6 Evaluation order and per-member reattribution (F3, Q3)

**Order.** Candidates are evaluated deepest-first: every candidate on a folder below C's folder is decided before C. A nested candidate's outcome never depends on its ancestors, so the order is acyclic. Same-depth candidates are independent. The Stage 1 traversal safeguard (S1.6, E4) applies to every Stage 2 walk.

**Which boundaries resolve.**
- `narrow` facts (a nested label candidate with C's `lexicalRoot`) remain attribution only, as in S1.7. The member counts for both candidates and is never reattributed.
- A `provisional-redirect` fact is resolved per member, as follows.

**Per-member reattribution (Option B, approved).** Let m be an active member of C behind one or more `provisional-redirect` boundaries, and let D range over the nested candidates at those boundaries.

1. If m's governing-channel comparison for at least one `eligible` D is `match`, m is **reattributed** away from C. It is attributed to the deepest such D, and every other eligible matching D is listed. m leaves C's decision members, so it is neither support, contradiction nor missing for C.
2. Otherwise, if at least one `undetermined` D possibly claims m, m is **attribution-undetermined** relative to C (see below). D possibly claims m when:
   - m's governing-channel comparison for D is `match`; or
   - D is `claim-unresolved` (S2.3) and m's root-channel comparison for D is `match`, because D's admissible root reading supports the claim.
3. Otherwise m is **retained** by C, with its own comparison unchanged:
   - a member that matches C remains support for C, even when it sits behind an eligible nested home;
   - a member that matches neither remains contradiction for C;
   - a member whose comparison was not evaluated remains missing for C.

A nested home explains only the members it actually matches. It never removes evidence for another candidate's claim. This is the property that whole-subtree reattribution (Option A) would break: behind `tree/src`, 46 of the 57 members match `tree` (S2.11, repository profile).

**Missing evidence is not a possible claim.** A `not-evaluated` comparison for D never makes m attribution-undetermined, whatever D's outcome, and neither does a `foreign` one. m is then retained by C with its own comparison unchanged (step 3). Uncertainty supported by an admissible reading is kept apart from the absence of an evaluated reading:

| m's comparison for nested candidate D | Treatment relative to C |
| --- | --- |
| governing-channel `match`, D `eligible` | reattributed (step 1) |
| governing-channel `match`, D `undetermined` | attribution-undetermined (step 2) |
| root-channel `match` only, D `claim-unresolved` | attribution-undetermined (step 2) |
| `not-evaluated` | retained, C's comparison unchanged |
| `foreign` | retained, C's comparison unchanged |

**Attribution-undetermined members.**
- **Admissible resolutions (Definition 1, calculogic-validator#102).** Each attribution-undetermined member is independently kept by C or removed from C; with k such members, all 2^k combinations are admissible. Correlation between members that depend on the same nested candidate is deliberately not modelled: this is an exact decision over a deliberately broader uncertainty model, not an approximation of a correlated one. It needs no hypothetical decision about any nested candidate.
- If C has attribution-undetermined members, C is decided `eligible` or `not-eligible` only when that outcome holds in every admissible resolution.
- Each S2.5 quantity moves in one direction when a member of a given kind is removed:
  - removing a member with an evaluated comparison for C raises or keeps the support share, and lowers or keeps coverage. Such a comparison is always `foreign`, because the member matches a nested candidate whose root differs from C's, and Naming's `familyRoot` is the first semantic token;
  - removing a member whose comparison for C is not evaluated raises or keeps coverage.
  So Tree tests each condition of an outcome at that condition's least favourable resolution, chosen by member kind. This is sound, and needs no enumeration of combinations.
- **Corner procedure (exact).** An outcome is a conjunction of conditions, each of which must hold in every admissible resolution, so each condition is tested on its own:
  - `eligible`: `|A| > 0`, coverage at least `P_COVERAGE`, support share at least `P_ELIGIBLE_SHARE`, and `M` at least `P_MIN_SUPPORT`;
  - `not-eligible`: `|A| > 0`, coverage at least `P_COVERAGE`, and support share at most `P_NOT_ELIGIBLE_SHARE`.

  A resolution is described by how many attribution-undetermined members of each kind (support, contradiction, missing, on the reading tested) are removed. Each quantity moves in one direction along each of those counts, so each condition's least favourable value lies at a corner, where each kind is removed entirely or not at all. The procedure does not rely on the argument above that a removed member is always `foreign`: it stays exact if a removed member supports C. There is no single worst resolution. Deciding from one resolution, or from the two reference resolutions below, is wrong (catalogue case C30).
- **Two readings (S2.3).** For a multi-token label candidate, `eligible` is decided on the prefix reading alone; `not-eligible` needs both readings `not-eligible` in every admissible resolution, which is tested reading by reading. A shared resolution changes nothing, because each condition must hold everywhere.
- Otherwise C is `undetermined` with reason `depends-on-undetermined-nested-candidate`, listing the nested candidates involved. This reason is used whenever C has attribution-undetermined members and is not decided, whatever S2.5 would give under any one resolution. Different resolutions can leave C undetermined for different S2.5 reasons, so no single S2.5 reason is claimed.
- Beside that reason, the outcome records the S2.5 outcome and reason at two fixed reference resolutions:
  - every attribution-undetermined member retained by C;
  - every such member removed from C.

  For a multi-token label candidate, each reference result holds the combined E2 outcome and reason and each reading's own S2.5 outcome and reason. This keeps the dependency inspectable without enumerating combinations.
- **Decision evidence.** Every candidate outcome records the condition checks behind it: for each reading tested and each condition of `eligible` and `not-eligible`, the bound, the least favourable corner (how many members of each kind it removes), the value there and whether the condition holds. With no attribution-undetermined member the only corner removes nothing. The checks explain the decision; they never change it, and no member subset is stored.

**Member attribution record (Q3).** For every member of C behind at least one `provisional-redirect` boundary, Stage 2 records:

| Field | Content |
| --- | --- |
| `originalComparison` | A reference to the Stage 1 member relationship record and its channel comparison for C, unchanged |
| `resolvedAttribution` | `retained`, `reattributed` or `attribution-undetermined` |
| `attributedTo` | For `reattributed`: the deepest eligible matching nested candidate, plus the other eligible matching nested candidates. For `attribution-undetermined`: the undetermined matching nested candidates |
| `reason` | `matches-eligible-nested-candidate`; `matches-undetermined-nested-candidate`; or, for `retained`, `no-eligible-matching-nested-candidate`, with each nested candidate's outcome listed |

Raw observations are never altered. The Stage 1 counts remain the record of what was observed. The attribution records and the S2.5 decision counts are the record of what was concluded.

#### S2.7 Strength profile

Every candidate outcome carries a strength profile. It is a set of facets, never a single score, and it is never compared across candidates:

- coverage and support share on the governing channel (S2.5);
- the singular and ambiguous split of support;
- the direct and descendant split of support, and how many branches carry support (S1.7);
- the non-governing channel's counts and any `channel-disagreement` note. The note is present when at least one decision member matches on exactly one of the two channels; a candidate whose other channel does not apply has no note;
- reattributed and attribution-undetermined member counts (S2.6);
- corroboration: same-folder candidates with the same claim, and their outcomes. Two candidates make the same claim when they have the same governing channel and the same claim value: the `lexicalRoot` for a root claim, the full `labelTokens` sequence for a prefix claim. Corroboration is descriptive: it never adds to support counts, never changes an outcome, and never counts one candidate's members for another;
- `rootAncestry` (S1.4) and the `bounded` note;
- for a `claim-unresolved` candidate, the root reading's S2.5 outcome, reason and counts (S2.3).

The profile describes an outcome; it never changes one. Future rules that read a facet must be added to S2.5 by amendment. The ambiguous share is the qualification S2.4 requires consumers to respect. It is kept so that no consumer can mistake ambiguous family evidence for singular evidence; it is not a discount.

#### S2.8 Placement (Q5)

Placement is decided for each file occurrence in the addressed snapshot of the run.

**A file whose semantic identity is not evaluated** (S1.3 fact `no-semantic-observation`, `rejected` or `unavailable`) is `undetermined`, with that state as its reason.

**For a file f with an evaluated semantic identity:**
- A candidate C **matches** f when C's governing-channel comparison for f is `match`.
- C **possibly matches** f when that comparison is `not-evaluated`, for example when the prefix channel lacks f's N1 tokens. C also possibly matches f when C is `claim-unresolved` (S2.3) and C's root-channel comparison for f is `match`.

**Placement relations (calculogic-validator#102, P1, P2).** For each `eligible` or `undetermined` candidate C, f has exactly one relation to C, decided in this order:
- `match`: C's governing-channel comparison for f is `match`;
- `possible-unevaluated`: that comparison is `not-evaluated`, whatever its reason;
- `possible-root-reading`: C is `claim-unresolved` and C's root-channel comparison for f is `match`;
- none: otherwise, for example a `foreign` governing comparison.

A candidate with no relation to f takes no part in any step, whatever its outcome: an undetermined candidate whose comparison for f is `foreign` never blocks `no-home`. A `not-eligible` candidate takes no part either. Only `match` with an `eligible` candidate can give `inside-home` or `home-elsewhere`.

**Why missing evidence is a possible match here but not in attribution (P1).** The two rules answer different questions with the same standard of evidence. Attribution (S2.6) asks whether a nested candidate may take a member away from C, which needs positive evidence, so a `not-evaluated` comparison for the nested candidate is no claim. Placement asks whether a file can be denied a home, which needs every relevant comparison to have been made, so a `not-evaluated` comparison keeps the candidate possible. Neither rule turns missing evidence into a conclusion. The rule is not narrowed to files whose root equals the candidate's label root: that would rest on the Naming property that `familyRoot` is the first semantic token, which Stage 1 does not check (S2.6, Q3).

**Comparisons (P8).** For a candidate on f's relevant lineage, f is one of its Stage 1 members, and the comparison is read from the Stage 1 member relationship record. For any other candidate, Tree compares f with the same Stage 1 comparison operation (S1.5, `createCandidateFileComparator`), which Stage 1 itself uses for every member: the same fact gate (S1.3), the same accepted Naming values and the same result vocabulary. It reads nothing from paths, labels or file names, and it records no direct or descendant position for a pair that is not a member pair.

The **relevant lineage** of f is the folders from f's parent upward. It stops at the first folder carrying a `terminate` boundary (a `naming-package-root` candidate, exactly the S1.6 fact); that folder is included, and folders above it are beyond the boundary (P6). A file with no parent folder occurrence, such as a repository-root file at `repo` scope, has an empty relevant lineage: steps 1 and 2 never apply and steps 3–5 do (P7).

Precedence (first match wins):

1. An `eligible` candidate on the relevant lineage matches f → `inside-home`. Record the nearest such home, and list every eligible matching home on the relevant lineage. The nearest home is the nearest folder carrying at least one eligible matching candidate, with every such candidate on that folder: none is chosen over another (P3).
2. Otherwise, on the relevant lineage, an `undetermined` candidate matches or possibly matches f, or an `eligible` candidate possibly matches f → `undetermined` (`home-on-lineage-undetermined`). An unknown home nearby is never read as absent.
3. Otherwise, an `eligible` candidate anywhere else in the snapshot matches f, including beyond a termination → `home-elsewhere`. List every such home.
4. Otherwise, anywhere in the snapshot, an `undetermined` candidate matches or possibly matches f, or an `eligible` candidate possibly matches f → `undetermined` (`home-elsewhere-undetermined`).
5. Otherwise → `no-home`, **only if the no-home evidence condition holds**; if it does not, `undetermined` (`candidate-discovery-incomplete`).

Every placement records the full evidence, not only the deciding step (P2): every eligible matching home on the relevant lineage and elsewhere, and every candidate with a possible relation or an undetermined outcome that relates to f, with its relation and location. `decidedAtStep` names the step that decided (1–5); `0` means the semantic-identity gate above, not a precedence step.

**No-home evidence condition.** `no-home` asserts that the available evidence permits concluding that no eligible matching home exists. That requires every potential candidate to have been discovered and decided:

- the v1 bridge and N2 are `available` for the run (S1.3); and
- every addressed folder's candidate discovery is determined. That means its label fact is `parsed` or `not-parsed`, and its bridge observation is `accepted` or `none`. A folder whose label is `absent` or whose observation is `rejected` could hide a candidate with f's claim.

**Effect of `claim-unresolved` on placement.** A `claim-unresolved` candidate is `undetermined`, so its possible matches reach steps 2 and 4:
- A file inside such a folder that matches on the root stops at step 2 (`undetermined`), even when an eligible home for its root exists elsewhere.
- A file of that root outside the folder still reaches step 3 (`home-elsewhere`) before step 4, so an unresolved claim never hides a real home.
- A file in an eligible subject compound that matches only on the root is not affected, because that candidate is never `claim-unresolved`. The file is placed against its own root's candidates.

**Recording the condition (P4).** The condition is evaluated once per run, all or nothing, as `candidateDiscovery: { complete, unmet }`. `unmet` lists each failed clause with what identifies it: the run-level availability state of the v1 bridge or of N2 when not `available`, and each folder whose label is `absent` for a folder-level reason, `no-record` or `record-rejected` (with its occurrence identity, the reason and any intake rejection reasons), or whose bridge observation is `rejected` (with its occurrence identity and the intake reasons). A run-level unavailability is listed once, as its run-level clause, not once per folder. It is not narrowed to the folders that could hide f's claim: what an undiscovered candidate would claim is exactly what is unknown.

Steps 2 and 4 already keep any undetermined matching candidate from becoming `no-home`. `no-home` is relative to the run's addressed snapshot, so the placement record carries the run's scope; a home outside a narrower scope is not visible to it.

**Several eligible homes** never force a choice: every one is listed. `home-elsewhere` is evidence, not a finding, and spread is not misplacement (calculogic-validator#85 living document §4). Findings derive from placement only as S2.12 decides per code.

#### S2.9 Output

Stage 2 adds one Tree-owned prepared-evidence record, `treeFolderSemanticHomeReasoning`, in Tree's prepared dependencies, next to the Stage 1 records. It holds:

- `status`, from the parameter set's `availability` (S2.9 below), one to one:
  - `evaluated`: the parameter set is `available`, and candidate reasoning and placement have completed for every file (P5). An `undetermined` placement is an evaluated result, not an incomplete one;
  - `configuration-unavailable`: the resolved registry has no parameter section (RR5);
  - `not-prepared`: the parameter set could not be prepared (an explicit registry root without a resolution).

  In both unavailable states Stage 2 did not run, and the `parameterSet` reference carries the reason. Every other field below except `parameterSet` is present only when `status` is `evaluated`;
- `semanticEvidenceSource`: a reference to the Stage 1 record;
- `parameterSet`: the loaded parameter set, `treeSemanticHomeParameterSet` (below), held by reference;
- `candidateOutcomes`: one per candidate, with the candidate identity, governing channel, outcome, reasons, notes, decision counts (`|A|`, `M` split singular and ambiguous, `F` by root, `N` by reason, over the members C definitely holds, with the attribution-undetermined members counted separately by kind), decision evidence (S2.6), strength profile, the nested candidates the outcome depends on with the two reference-resolution results (S2.6), and, for `claim-unresolved`, the root reading's outcome, reason and counts (S2.3);
- `memberAttributions`: the S2.6 records;
- `placements`: one per file occurrence, with the file identity, state, reason, `decidedAtStep`, nearest home (folder and candidates), the homes on its relevant lineage, the homes elsewhere, the candidates consulted (each with outcome, reason, relation and location), and the run scope;
- `candidateDiscovery`: the no-home evidence condition (S2.8, P4), once per run;
- `scope`: the run scope.

When `status` is `configuration-unavailable` or `not-prepared`, Stage 2 did not run: there are no candidate outcomes, member attributions or placements, not even `undetermined` ones. An absent configuration is never read as evidence about any folder or file.

**Stage 2A record (current implementation reality).** `tree/src/tree-folder-semantic-home-reasoning.logic.mjs` prepares the full record: `status`, `parameterSet` and `semanticEvidenceSource` (both by reference), `candidateOutcomes`, `memberAttributions` (2A-i), and `placements`, `candidateDiscovery` and `scope` (2A-ii, `tree/src/tree-semantic-home-placement.logic.mjs`). Its only reader is the `TREE_FAMILY_SCATTERED` contributor (Stage 2B-i, S2.12), which reads `placements`; the record itself is not part of the report payload.

**The parameter set, `treeSemanticHomeParameterSet`.** A Tree loader prepares it, before and separately from reasoning, as a frozen prepared dependency. It is not part of the report payload; the Tree entry's `meta.semanticHomeReasoning` reports its status, conformance and registry provenance (S2.12, B6).

**What the loader reads:**
- the run's resolved Tree registry root, and nothing else: it never searches Builtin or Custom directories itself;
- the resolved registry's provenance (`registryProvenance`, lifecycle §11.2);
- the Baseline entry comparison (lifecycle §11.4).

**What it holds:**

| Field | Content |
| --- | --- |
| `registry` | The registry identity (`tree/semantic-home-policy`), its `version`, its `source` (`builtin`, `custom` or `candidate`) and its canonical digest, all as the run's lifecycle resolution reports them |
| `availability` | `available` when the resolved registry carries the parameter section; `configuration-unavailable` for a readable version-1 registry (RR5), with `reason: parameter-set-absent`; `not-prepared` when the preparation inputs are incomplete (below), with `reason: registry-resolution-absent`. Never Builtin values in place of a missing section |
| `parameters` | Only when `available`. Keyed by S2.5 name (`P_COVERAGE`, `P_MIN_SUPPORT`, `P_NOT_ELIGIBLE_SHARE`, `P_ELIGIBLE_SHARE`) through the explicit S2.10 identifier table. Each entry holds `parameterId`, `value`, `catalogueCases`, `baselineComparison` and `origin` (RR4), and `baselineComparisonReason` (the lifecycle's `baseline-mismatch`, `baseline-version-undescribed` or `baseline-not-comparable`) only when `baselineComparison` is `unverifiable`. `rationale` stays in the registry: it is not converted, but it is part of the record the Baseline comparison judges, so a rationale-only change is `override` (`differs`) |
| `conformance` | RR4 (Stage 2A-iii): `passed` only when `available`, the four values equal the bound values and the installed reasoning modules match the bound source digest; otherwise `not-checked`. Never `failed` |
| `conformanceBinding` | Only when `conformance` is `passed`: `{ catalogue: { id, version, digest }, reasoning: { version, sourceDigest } }` (RR4) |

**Availability is not reasoning status.** `availability: available` says only that parameters were loaded. Stage 2A sets `status: evaluated` only after its reasoning has completed; `configuration-unavailable` and `not-prepared` carry through unchanged as the record's `status`. The loader computes no eligibility, attribution or placement.

**Preparation inputs.** The loader never reports a registry it did not read, or provenance it cannot establish:
- **A lifecycle resolution** (every validation run, candidate runs included): the resolution's Tree root, its `registryProvenance` and its Baseline comparison, as above.
- **No resolution and no registry root** (a direct library call): Builtin, as Tree's other registry loaders do (registry lifecycle spec §14). The source is `builtin`, and the digest is computed with the lifecycle's own canonical digest. An explicit registry root that is the Builtin root is the same case.
- **An explicit, non-Builtin registry root without a resolution:** the loader neither reads the root nor substitutes Builtin. The set is `availability: not-prepared` with `reason: registry-resolution-absent`, and holds only `availability`, `reason` and `conformance`: no `registry` block and no `parameters`. This is a preparation state, not a claim about the registry: unlike `configuration-unavailable`, it says nothing about whether the registry carries a parameter section. Stage 2A decides, under its own authorization, how it reports a set that was not prepared.

Stage 1 availability and records are held by reference, never copied or recomputed. All collections are sorted deterministically by occurrence identity, then by candidate identity. The record is not part of the report payload. Only findings decided under S2.12 reach the report.

#### S2.10 Parameters (F2)

Parameters are Tree-owned policy data in the existing `semantic-home-policy` registry (`tree/src/registries/_builtin/semantic-home-policy.registry.json`), in a versioned parameter section beside the current descriptive input lanes. The section's shape, lifecycle behavior and provenance are defined under **Registry architecture** below. A value that cannot be justified against the catalogue is not adopted. Adding the section was a registry migration (S2.14 step 3). It followed the AGENTS.md sequence: the data-only payload and shape tests are in place; the runtime step belongs to the loader and Stage 2A, under their own authorization. This contract assumes one parameter set per run. Scoped or per-profile parameter sets are not proposed. They would be added by amendment only if contrast cases show that different structures need different values, and the versioned section leaves room for that.

**Selected policy values (calculogic-validator#102, D7).**
- **Adopted as data.** These values are the Builtin records of `semanticHomeParameters` in `semantic-home-policy` version 2.
- **No runtime configuration.** The loader prepares them (S2.9); nothing decides with them until the separately authorized Stage 2A runtime consumes them (S2.14).
- Each value was checked, together with the others, against the full catalogue (S2.11).

| Parameter | Role (S2.5) | Selected value | Justification | Limitation |
| --- | --- | --- | --- | --- |
| `P_COVERAGE` | Minimum share of decision members evaluated | 0.50 | At least half of the decision members have usable comparison evidence | Placed between `structural-addressing` (0.45, intended `undetermined`) and `naming` (0.61, intended to pass) by intended outcomes, not by a repository optimum |
| `P_MIN_SUPPORT` | Minimum evaluated support for `eligible` | 2 | Two distinct supporting occurrences make the smallest observable grouping (C17, C20) | Synthetic evidence only: no repository candidate has one to three matches |
| `P_NOT_ELIGIBLE_SHARE` | Maximum support share for `not-eligible`; also the significance bar for the E2 root reading (S2.3) | 0.25 | Symmetric with `P_ELIGIBLE_SHARE`, leaving an explicitly undecided middle band (C21–C23) | Synthetic evidence only: no repository candidate has a governing-channel share strictly between 0 and 0.73 |
| `P_ELIGIBLE_SHARE` | Minimum support share for `eligible` | 0.75 | Symmetric band: `P_NOT_ELIGIBLE_SHARE = 1 − P_ELIGIBLE_SHARE` (C4, C6, C10, C24) | Symmetry is a policy choice, not a mathematical necessity. The full catalogue supports it, but symmetry alone does not prove 0.75 |

Comparisons are inclusive at the boundaries:
- a support share at or below 0.25 is `not-eligible`;
- a share at or above 0.75 is `eligible` when minimum support is met;
- coverage below 0.50 is `undetermined`.

**Registry identifiers.** Each parameter has a registry `parameterId`. The mapping is explicit; runtime code must not infer it:

| Parameter (S2.5) | `parameterId` | Catalogue cases recorded with the Builtin value |
| --- | --- | --- |
| `P_COVERAGE` | `coverage` | C3, C18, C19 |
| `P_MIN_SUPPORT` | `minimum-support` | C17, C20 |
| `P_NOT_ELIGIBLE_SHARE` | `not-eligible-share` | C21, C22, C23, C25 |
| `P_ELIGIBLE_SHARE` | `eligible-share` | C4, C6, C10, C24 |

No ambiguity parameter is needed (S2.4, D2).

**Values are not chosen to compensate for Naming evidence gaps (D3).** Two known gaps push candidates in this repository toward `undetermined`:
- **Special-case test files arrive as missing evidence.** Naming classifies them `allowed-special-case`, and Tree receives them as `no-semantic-observation`, indistinguishable from never-evaluated files. This is the #85 evaluation-status track.
- **Subject-named registry payloads arrive as contradiction.** They are almost all of `tree`'s and `naming`'s foreign evidence (the #85 payload-naming track).

Lowering coverage or share thresholds to offset either gap was rejected: it would tune the values to a temporary defect and hide the information loss. The affected candidates stay honestly `undetermined`. The two Naming tracks are evidence dependencies for resolving those particular outcomes. They are not prerequisites for Stage 2A, which must produce honest `undetermined` results with the evidence available.

**Future evaluation status (D4).** When Naming reports that it affirmatively evaluated a file as making no family claim, such files may leave the coverage denominator. That happens **only through an explicit, versioned contract rule** that keeps them countable under their own state, so "evidence does not apply" stays traceable and distinct from "evidence is missing". Tree must not exclude files by structural folder (for example `test`) instead.

**Sensitivity.**
- Under these values, `tree` passes the eligibility bar by 0.06 (share 0.81) and `naming` misses it by 0.02 (0.73). Both sit near the bar only because of the payload gap.
- A later change from `undetermined` to `eligible` after Naming improves its evidence is expected, not a regression. An unexplained change is a reason to investigate.
- Stage 2A must give both explicit regression coverage. The S2.9 `parameterSet` version and evidence provenance must make the cause of any change inspectable.

**Registry architecture (registry reconciliation).** Each responsibility has one authority:
- **This specification** defines the rules.
- **The registry** supplies the values a consumer may legitimately choose.
- **The registry lifecycle** establishes which values a run actually used.

Anything in `semantic-home-policy` is consumer-editable, because the registry belongs to the Builtin set that a repository may copy into its own Custom set (registry lifecycle spec, `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md`, §4). So a field belongs in the registry only if a consumer may choose it differently without redefining what Stage 2's rules mean.

**RR1. The Tree blueprint's policy booleans are contract invariants, not registry fields.** The Tree blueprint sketches six booleans for this registry (calculogic-validator#85 living document). Each is either redundant with this contract, or a switch that would let a Custom set contradict it. Registries hold policy data, not reasoning mechanics (AGENTS.md).

| Blueprint field | Disposition | Where the rule lives |
| --- | --- | --- |
| `allowSemanticRootHome` | Invariant: root claims are part of the claim model | S2.3 |
| `allowSemanticSubhome` | Invariant: nested homes, per-member attribution and `narrow`. They are separated from structural subfolders by evidence, not by folder kind | S2.6, C6, C16 |
| `ambiguityLimitsEvidence` | Invariant: the claim-specific rule. A future weighting would be a numeric parameter added by amendment, not a boolean | S2.4 (D2) |
| `semanticFamilyAloneDoesNotImplyGrouping` | Permanent invariant (Naming–Tree bridge contract and this contract), enforced by Stage 2B fixtures: no finding arises from family membership without an eligible home | S2.8, S2.12 |
| `consumeNamingOutputs` | Invariant: Stage 2 is defined on Naming evidence | S2.1 |
| `deriveSemanticHome` | Not registry policy. If a switch for running Stage 2 is ever needed, it belongs to Tree configuration or rollout modes | — |

**RR2. The descriptive input lanes are kept, and their current use is defined here.**
- A lane describes an available class of evidence.
- This table is the only authority on what that evidence may currently do. Widening a lane's role needs a contract amendment.
- Each lane keeps `status: active` in the registry, because the lane exists. Its current use is recorded here, not in a registry field.
- Lane text that claims more than this table allows is reconciled through a separate data-only step (S2.14).

| Lane | Evidence class | Current Stage 2 use |
| --- | --- | --- |
| `folder-context` | Folder token and local folder context | Decision input: label and semantic-context candidates (S1.4, S2.3) |
| `parent-lineage` | Parent chain context | Decision input: lineage, boundary facts and deepest-first attribution (S1.6, S2.6). `rootAncestry` is a strength facet only (S2.7) |
| `naming-bridge` | Naming bridge outputs | Decision input: the v1, N1 and N2 evidence behind every channel comparison (S1.3, S1.5) |
| `structural-home-boundary` | Structural Home context | Corroboration only: it never moves an outcome (S2.4) |
| `structural-signal-boundary` | Weak and contextual structural-home signals | Deferred: not read by Stage 2. Such signals feed whole-placement reasoning, which is outside this contract |
| `repo-top-structural-boundary` | Repo-top structural-home context | Deferred: not read by Stage 2 |

**RR3. Parameter records are atomic.**
- **Shape.** The parameter section, `semanticHomeParameters`, is a keyed set by `parameterId`. It holds exactly the four records in the identifier table above. Each record holds `value`, `rationale` and `catalogueCases`.
- **One unit of justification.** The three fields are never merged separately: the section declares no lifecycle merge-fields. An update choice per parameter is therefore `keep-custom`, which keeps the whole record, or `take-builtin`, which adopts the whole Builtin record. A consumer's value can never be paired with a rationale written for a different value.
- **What validation checks** (`tree/src/registries/tree-semantic-home-policy-registry.logic.mjs`):
  - exactly the four `parameterId` values, each once, and no other record field;
  - each `value` a finite number, within the S2.5 constraints:
    - `0 < P_COVERAGE ≤ 1`;
    - `P_MIN_SUPPORT` is an integer of at least 1;
    - both shares lie in `[0, 1]`;
    - `P_NOT_ELIGIBLE_SHARE < P_ELIGIBLE_SHARE`, so equal shares are invalid;
  - a non-empty `rationale`;
  - a non-empty `catalogueCases` list of unique case identifiers (`C` followed by a number);
  - version `"2"` requires the section, and version `"1"` must not carry it.

  A payload that breaks these is invalid, and an invalid active Custom registry blocks the run (registry lifecycle spec §7.1). Validation checks structure, never whether a rationale is convincing.

**RR4. Provenance and conformance are reported separately.**

`registry.source` (S2.9) says where the run's data came from: `builtin`, `custom` or `candidate`. Per parameter, two further fields say how each record relates to its comparison Baseline:

| `baselineComparison` (lifecycle §11.4) | `origin` (Tree) | Meaning |
| --- | --- | --- |
| `not-applicable` | `builtin` | A Builtin record; there is no comparison Baseline |
| `matches` | `baseline` | Identical to the record in a verified Baseline |
| `differs` | `override` | The verified Baseline has a record with this identity, and it is not identical |
| `absent` | `override` | The verified Baseline has no record with this identity |
| `unverifiable` | `unverified` | The Baseline's integrity or version cannot be established, so no comparison is claimed |

**What the values mean:**
- **`override`** means the resolved record is not identical to an existing, verified Baseline record. It does not mean the consumer deliberately edited it. A record added in a version transition, absent from an older Baseline, is also `override`, and `baselineComparison: absent` keeps that difference visible.
- **`unverified`** is never shown as `baseline` or `override`. Under the current lifecycle a successful run can reach it, because a Baseline mismatch and an undescribed Baseline version do not block a run (lifecycle §7.1, §11.4). The lifecycle's diagnostic reason travels with it.
- **`baseline`** does not mean the value matches the current Builtin policy or passes the current catalogue: a Baseline may be older.

**The comparison Baseline** is the one the run's own lifecycle assessment verified:
- for a Custom run, the Custom set's manifest and `.baseline/` copies;
- for a candidate run, **the candidate artifact's own** manifest and `.baseline/` copies (lifecycle §12.12, §12.13), never the repository's Custom set.

No Baseline is ever manufactured. Current Builtin is never used as a historical reference, and a candidate without a manifest cannot resolve (lifecycle §7.1 item 5).
- **`conformance`, for the whole parameter set, says whether the resolved values satisfy the catalogue (S2.11).** It is judged for the set, because the values are justified together:
  - `not-checked`: the value of every set that is not bound (below), and of every set whose binding cannot be verified at run time. Origins never change conformance: an `override` or `unverified` record removes no right and proves no failure.
  - `passed` or `failed`: recorded with the catalogue version checked. Only a mechanical evaluation of S2.11 against the resolved values may produce these. For the Builtin set, that evaluation is the Stage 2A fixture suite, which must pass for the Builtin values in every release.
  - **Binding (Stage 2A).** A `passed` result inherited at run time must bind together:
    - the complete set of four values;
    - the S2.11 catalogue version;
    - the reasoning implementation the catalogue was evaluated against.

    Matching values alone are not enough once the catalogue or the reasoning has changed. The binding is independent of source: a Builtin set and a Custom or candidate set with identical bound values get the same result.
  - **Checking any other parameter set** is a separate, read-only facility that evaluates S2.11 and reports per-case results. Its results are not written into the registry, and runs do not read them back.
  - **The binding (Stage 2A-iii, implemented; calculogic-validator#102, K1–K7).** `tree/src/tree-semantic-home-conformance.knowledge.mjs` holds one binding, for the Builtin values (K7):
    - `values`: the four values, keyed by S2.5 name. Only these are bound (K6): `rationale` and `catalogueCases` are not, and neither is any provenance field.
    - `catalogue`: `{ id, version, digest }`. The digest is SHA-256 of the canonical JSON of the declarative catalogue (S2.11), cases and expected results together.
    - `reasoning`: `{ version, sourceDigest, resultsDigest }`. `sourceDigest` is SHA-256 over the bound reasoning modules (the Stage 1 intake, fact, candidate and semantic-evidence modules and the Stage 2 reasoning modules: the complete local import closure, listed explicitly), each as its package-relative path and its bytes with line endings normalized to LF. `resultsDigest` is SHA-256 of the canonical JSON of the actual results of every catalogue case under the bound values: each candidate's outcome and reason and each file's placement state, reason, deciding step and nearest home, keyed by case id and occurrence identity.
    - An append-only history of reasoning versions, each with its `resultsDigest`. A new results digest needs a new version; a source change that leaves the results unchanged keeps the version.

    **How the binding is earned.** `npm test` runs the whole catalogue against the bound values and checks every expected result; recomputes the three digests and compares them with the binding; checks that the declared module list equals the actual import closure; checks the version history for consistency; checks that the bound values equal the Builtin registry values; and checks that the spec, the catalogue table and the binding name the same catalogue version and the same case ids. A binding can only be updated from a tree where all of that passes. This repository has no CI workflow: the guarantee is the test suite that every delivery runs (K1), not an automatic check by GitHub. The results digest identifies the behaviour recorded over C1–C30; it does not prove that two implementations agree on every repository.

    **At run time** a set's conformance is `passed`, with `conformanceBinding: { catalogue: { id, version, digest }, reasoning: { version, sourceDigest } }`, only when its four values equal the bound values exactly **and** the source digest of the reasoning modules actually installed equals the bound `sourceDigest` (K2). The installed digest is computed once per process from the package's own files. If any bound module is missing or unreadable, or the digest differs, conformance is `not-checked` (fail closed). Runs never evaluate the catalogue, so they never report `failed`. Conformance is decided from the values alone: it never reads `origin`, `baselineComparison`, `rationale` or the source, and a `passed` result never stands in for missing or unverified provenance.

    **Independent changes.** A Custom set with different values is `not-checked`; one with the bound values is `passed` whatever its origin. Editing the Builtin values, any catalogue case or expectation, or any bound module makes `npm test` fail until the catalogue passes again and the binding is updated; a catalogue change also raises the catalogue version in this spec, and a behaviour change appends a reasoning version.
- **No self-attestation.** No registry field lets a consumer declare conformance.

**RR5. A legacy registry without parameters is readable, and Stage 2 then reports `configuration-unavailable`.**
- Adding the parameter section raises the registry's `version` from `"1"` to `"2"`, with `readableVersions` covering both (lifecycle §7.1 item 3, §8.3).
- A version-1 Custom registry therefore stays valid, and every other part of the run proceeds as before. A readable version-1 registry never means Stage 2 silently uses the Builtin version-2 values: the Custom set's own parameter section is the only source. Stage 2 alone reports `status: configuration-unavailable` (S2.9), with reason `parameter-set-absent` and the registry identity, source and version.
- Stage 1 evidence, unrelated Tree findings, and findings not migrated to Stage 2 are unaffected. During Stage 2A all findings remain byte-identical, as S2.14 already requires.
- **Rejected:**
  - candidate-level `undetermined` (it would claim an evaluation that never ran);
  - making version 1 unreadable (it would stop all validation for an unmigrated consumer);
  - an optional section without a version change (it would bypass the lifecycle's migration and `diff` reporting).

**RR6. The version-1-to-2 migration implements the selected policy; it is not a separate authority.**
- The Tree-owned deterministic transform adds the parameter section using its own constants, because a transform may never copy Builtin values (lifecycle §8.3). Those constants are the S2.10 selected values with their rationales and catalogue references, and they stay traceable to S2.10.
- **Test obligation.** Migrating an unmodified version-1 Custom registry must produce parameter records equal to the version-2 Builtin records: values, rationales and catalogue references. The transform must never silently diverge from the Builtin defaults.
- **Implementation.**
  - **Transform:** `semantic-home-policy-v1-to-v2`, in `tree/src/registries/tree-registry-migrations.logic.mjs`.
  - **Declaration:** the Tree registry inventory declares it as the one step from version `"1"` to `"2"`, with `readableVersions` `"1"` and `"2"`.
  - **What it does:** copies the descriptive lanes unchanged and adds the four records from its own constants.
  - **Tests:** `tree/test/tree-registry-migrations.logic.test.mjs` checks it against the Builtin file. A lifecycle test migrates a real version-1 Custom set, checking both the migrated Baseline and the migrated Custom file.

#### S2.11 Contrast catalogue (F6, Q10)

Each case is a deliberately contrasting synthetic tree with its expected outcome under the selected values (S2.10) and E2 (S2.3). The expected outcomes of C1–C29 were agreed on calculogic-validator#102 (D8), from a scratchpad evaluation of these rules. Each case is an executable fixture (`tree/test/fixtures/semantic-home-catalogue/`): candidate outcomes since Stage 2A-i and placements since Stage 2A-ii, so that the contract and the tests cannot drift.

**Catalogue identity.** Catalogue `semantic-home-catalogue`, version `2`: C1–C30. Version `1` was C1–C29 (D8); version `2` adds C30 (calculogic-validator#102, Q3). The version is raised whenever a case or an expected outcome changes, in this table first. The cases and their expected results are also held as one declarative table (`tree/test/fixtures/semantic-home-catalogue/semantic-home-catalogue-cases.fixture.mjs`) whose content digest the conformance binding cites (RR4); a test checks that this table and this spec name the same version and the same case ids. The per-case catalogue tests keep their own trees and assertions, independent of the table, so changing a case's tree and its expectation together in the table alone cannot make the suite pass.

Counts are written `a/b` to mean `a` matching members out of `b` evaluated members on the stated channel. Support share is `a/b`; coverage is evaluated members divided by decision members `|A|`.

Unless stated otherwise:
- every file has an evaluated semantic identity and N1 tokens;
- the label of every named folder is parsed;
- no file is ambiguous;
- `x(n)` means n files whose `familyRoot` is `x`.

| Case | Tree | Exercises | Expected outcome |
| --- | --- | --- | --- |
| C1 Clear home | `pricing/`: `pricing`(6) direct | Baseline | `pricing` eligible. All six files `inside-home` |
| C2 All foreign | `src/`: `alpha`(3), `beta`(3), `gamma`(2) | Contradiction | `src` not-eligible (`contradicted`, share 0) |
| C3 All unevaluated | `tests/`: 6 files without a semantic observation | Missing is not contradiction (Q1) | `tests` undetermined (`insufficient-evaluated-coverage`, `no-semantic-observation` 6). The files are `undetermined` |
| C4 Mixed | `shared/`: `shared`(4), `other`(4) | The mixed band | `shared` undetermined (`mixed-evidence`, share 0.5) |
| C5 Generic nested folder with outer-matching members | `billing/`: `billing`(1) direct; `billing/src/`: `billing`(6) | Nested foreign candidate not eligible; no reattribution | `src` not-eligible (0 of 6). `billing` eligible on 7 of 7. All seven files `inside-home` at `billing`. Repository analogue: `tree/src`, `naming/src` |
| C6 Eligible nested candidate, per member | `app/`: `app`(3) direct; `app/pricing/`: `pricing`(8), `app`(1) | Q3 Option B | `pricing` eligible (8 of 9). The 8 `pricing` files are reattributed to it; the `app` file inside `app/pricing/` is retained by `app`. `app` eligible on 4 of 4. The `pricing` files are `inside-home` at `pricing`; the four `app` files are `inside-home` at `app`. Under Option A the nested `app` file would wrongly leave `app` |
| C7 Undetermined nested candidate | `ledger/`: no direct files; `ledger/audit/`: `audit`(5), `ledger`(5) | Attribution-undetermined members | `audit` undetermined (`mixed-evidence`, 0.5, per C4). For `ledger`, the five `audit` files are attribution-undetermined: resolved one way `ledger` is 5 of 5 (`eligible`), the other way 5 of 10 (`mixed-evidence`). So `ledger` is undetermined (`depends-on-undetermined-nested-candidate`, `audit`). The `ledger` files are `undetermined` (`home-on-lineage-undetermined`) |
| C8 Compound label, prefix unsupported | `docs/tree-owned/`: 7 files with root `tree` whose tokens do not begin `tree, owned`, plus `other`(2); a separate `tree/`: `tree`(6) | S2.3 governing channel; E2; channel disagreement | `tree-owned`: prefix reading 0/9, `not-eligible`; root reading 7/9 (0.78), `eligible`. So the candidate is `undetermined` (`claim-unresolved`), with a `channel-disagreement` note and the root reading's outcome and counts. `tree` eligible (6/6). The 7 files are `undetermined` (`home-on-lineage-undetermined`), never `home-elsewhere`. Repository analogue: `doc/ValidatorSpecs/tree-owned` |
| C9 Same-folder agreement | `tree/`: label and semantic-context candidates, both root `tree`; `tree`(5) | F4 corroboration | Both candidates eligible, each corroborating the other. The counts are never pooled. Files list both homes |
| C10 Same-folder candidates with different roots | `kit/`: label `kit` and a semantic-context candidate with root `toolkit`; `kit`(6), `other`(1) | Independence on one folder | `kit` eligible (6 of 7). `toolkit` not-eligible (0 of 7). Neither outcome reads the other |
| C11 Home behind a termination | `platform/`: `platform`(5) direct; `platform/pkg/` is a package root (root `pkg`) with `platform`(4) | Relevant lineage; termination is not eligibility | The `pkg` members are terminated relative to `platform`, which is eligible on 5 of 5. `pkg` is evaluated on its own members and is not-eligible (0 of 4), noted `bounded`: the termination does not make it a home. The four `platform` files in `pkg/` are `home-elsewhere` (`platform` lies beyond the termination), never `inside-home` |
| C12 Two eligible homes for one root | `services/billing/`: `billing`(4); `apps/billing/`: `billing`(4); `shared/`: `billing`(1) | Listing without a forced choice | Both `billing` candidates eligible. Files in each are `inside-home` at their own home. The `shared` file is `home-elsewhere`, listing both. `shared` is not-eligible |
| C13 Candidate discovery incomplete | C2's tree with N2 `not-staged`; one file with root `delta` | No-home evidence condition (Q5) | No label candidates are discovered, so the `delta` file is `undetermined` (`candidate-discovery-incomplete`), never `no-home`. Variant: N2 available, but one folder's N2 record is rejected. Same result |
| C14 Ambiguity-heavy folder | `registry-lifecycle/`: 10 files named `registry-lifecycle-<a>-<b>`, all flagged `family-boundary-heuristic` | S2.4 ambiguity rule | `registry-lifecycle` eligible (prefix 10 of 10). The ambiguous share 10 of 10 is recorded in the strength profile. Repository analogue: `src/core/registry-lifecycle` |
| C15 Bounded package root | `packages/`: no direct files; `packages/ui/` is a package root (root `ui`) with `ui`(6) | Q9 bounded candidate | `ui` eligible, noted `bounded`. `packages` undetermined (`no-active-members`: all its members are terminated). Files `inside-home` at `ui` |
| C16 Narrowing compound label | `billing/`: `billing`(3) direct; `billing/billing-api/` (label `billing-api`): 4 files whose tokens begin `billing, api` | `narrow` is not reattribution | Both eligible. The 4 files count for both candidates. They are `inside-home`, with nearest home `billing-api` and both listed |
| C17 Single matching file | `ops/`: `ops`(1) | `P_MIN_SUPPORT` | `ops` undetermined (`insufficient-support`, 1/1): one file shows a relationship, not yet a grouping |
| C18 Prefix not evaluable | `structural-addressing/`: 5 files whose tokens begin `structural, addressing`; one more file with root `structural` whose N1 token group is `not-provided` | Possible match in placement | The candidate is eligible on its 5 evaluated members (prefix 5/5, coverage 5/6 = 0.83). The sixth file possibly matches, so it is `undetermined`, never `no-home` |
| C19 Genuinely unobservable folder | `reports/`: `reports`(3), plus 7 files with no semantic observation that are not special cases | Coverage gate (D4) | `reports` undetermined (`insufficient-evaluated-coverage`, coverage 3/10 = 0.30), although all 3 evaluated files match |
| C20 Two-file grouping | `ops/`: `ops`(2), two distinct file occurrences | `P_MIN_SUPPORT` (D5) | `ops` eligible (2/2). The fixture asserts that each occurrence counts once per channel (S1.7), so one file cannot supply both matches |
| C21 Incidental overlap | `lib/`: `lib`(1), `other`(9) | Contradiction bar (D6) | `lib` not-eligible (`contradicted`, 1/10 = 0.10) |
| C22 Minority at the contradiction bar | `cache/`: `cache`(1), `other`(3) | Inclusive contradiction bar (D6) | `cache` not-eligible (`contradicted`, 1/4 = 0.25) |
| C23 Substantial minority | `queue/`: `queue`(4), `other`(6) | Mixed band (D6) | `queue` undetermined (`mixed-evidence`, 4/10 = 0.40) |
| C24 Majority at the eligibility bar | `auth/`: `auth`(3), `other`(1) | Inclusive eligibility bar (D6) | `auth` eligible (3/4 = 0.75; minimum support met) |
| C25 Compound label, incidental root overlap | `docs/tree-owned/`: 1 file with root `tree` whose tokens do not begin `tree, owned`, plus `other`(8) | E2 significance | Prefix reading 0/9, root reading 1/9 = 0.11: both `not-eligible`, so `tree-owned` is not-eligible. Incidental overlap does not open the claim |
| C26 Subject compound with a root-only stray | `billing-api/`: 8 files whose tokens begin `billing, api`, 1 `billing-core` file, `other`(1); a separate `billing/`: `billing`(4) | E2 does not swallow subject compounds | `billing-api` eligible (prefix 8/10 = 0.80); never `claim-unresolved`. The stray `billing-core` file is placed against its own root's candidates: `home-elsewhere` (`billing`) |
| C27 Single-file ownership folder | `ops-owned/`: `ops`(1), whose tokens do not begin `ops, owned` | E2 with insufficient root support | Prefix reading 0/1, `not-eligible`; root reading 1/1, `undetermined` (`insufficient-support`). So `ops-owned` is `claim-unresolved`, consistent with C17. The file is `undetermined` |
| C28 Unresolved claim and a real home elsewhere | C8's tree, plus `docs/tree-notes` with root `tree` directly in `docs/` | E2 placement order | Files inside `docs/tree-owned/` stop at S2.8 step 2 (`undetermined`). `docs/tree-notes` reaches step 3: `home-elsewhere` (`tree`). An unresolved claim never hides a real home |
| C29 Invariant E2-I1 | `audit-owned/`: `other`(4) with N1 tokens, `other`(4) whose N1 token group is `not-provided`; no file with root `audit` | E2-I1 | Prefix reading 0/4 evaluated (coverage 4/8 = 0.50), `not-eligible`; root reading 0/8, `not-eligible`. So `audit-owned` is not-eligible: zero root matches never produce `claim-unresolved`, and root coverage (8/8) is never below prefix coverage |
| C30 Opposite-direction removal | `ledger-sync/`: `other`(1) direct, with N1 tokens; `ledger-sync/queue/` (label `queue`): `queue`(2), one with N1 tokens and one whose N1 token group is `not-provided`, plus `other`(1) whose N1 token group is `not-provided` | S2.6 corner procedure (Q3) | `queue` undetermined (`mixed-evidence`, 2/3 = 0.67). For `ledger-sync`, both `queue` files are attribution-undetermined. Every member kept: prefix 0/2 evaluated of 4 (coverage 0.50), root 0/4, so `not-eligible`. Every one removed: prefix 0/1 of 2 (coverage 0.50), root 0/2, so `not-eligible`. Removing only the `queue` file with tokens leaves prefix coverage 1/3 = 0.33, `undetermined`. So `ledger-sync` is undetermined (`depends-on-undetermined-nested-candidate`, `queue`), with both reference resolutions `not-eligible`; its decision evidence names prefix coverage at the corner that removes the one contradicting member and no missing one. A procedure deciding from the two reference resolutions alone would wrongly say `not-eligible` |

**Repository profile (`repo` scope, `main` at 9cd27d9), under the selected values and E2.** This profile is evidence about this repository, not a stored expectation:

| Candidates | Governing channel: match / foreign / not-evaluated | Outcome under the selected values |
| --- | --- | --- |
| `src/core/registry-lifecycle` (prefix) | 31 / 0 / 0 | eligible |
| `tree` label and context (root) | 46 / 11 / 31 | eligible (coverage 0.65, share 0.81) |
| `naming` label and context (root) | 33 / 12 / 29 | undetermined (`mixed-evidence`, share 0.73; payload-naming gap, D3) |
| `structural-addressing` (prefix) | 5 / 0 / 6 | undetermined (`insufficient-evaluated-coverage`, 0.45; evaluation-status gap, D3) |
| `doc/ValidatorSpecs/tree-owned`, `naming-owned` (prefix) | 0 / 9 / 3, 0 / 4 / 0 | `claim-unresolved`: root readings 7/9 and 4/4 are both `eligible` |
| `doc/ValidatorSpecs/cross-cutting`, `suite-owned` (prefix) | 0 / 3 / 0, 0 / 2 / 0 | not-eligible: no root match, so both readings are contradicted |
| `src`, `src/core`, `tree/src`, `naming/src`, `doc`, the `registries` and `cli` folders, `scripts`, `bin` and the other generic folders (root) | 0 matches in every case; for example `src` 0 / 70 / 1, `tree/src` 0 / 57 / 0 | not-eligible |
| `naming/test`, `tree/test`, `structural-addressing/test`, `doc/ValidatorSpecs/nl-config`, `test`, `test/fixtures` and the other fixture folders | 0 / 0 / n, or nearly so (`test` 0 / 1 / 57) | undetermined (`insufficient-evaluated-coverage`) |

Totals: 3 eligible, 16 undetermined and 19 not-eligible at `repo` scope; 1, 4 and 5 at `app` scope (`src/core/registry-lifecycle` eligible, the test folders undetermined). No nested candidate in this repository is eligible, so no member is reattributed here. C6, C7 and C16 supply those cases. Candidate discovery is complete at `repo`, `validator` and `app` scope: every folder label is `parsed` or `not-parsed`, and every folder observation is `accepted` or `none`.

#### S2.12 Findings decisions (Q6), proposed per code

Each code is decided individually. These are proposals until their 2B slice is implemented. Changing any finding's code, severity, counts, report payload or exit behavior needs explicit approval for that code in its own Stage 2B pull request. That pull request carries before/after tables at `repo`, `validator` and `app` scope and the catalogue cases it relies on. All four codes were `info` and came from the Naming semantic-family bridge contributor (`tree/src/contributors/tree-naming-semantic-family-bridge-contributor.logic.mjs`). Stage 2B-i re-based `TREE_FAMILY_SCATTERED` on placement; Stage 2B-ii to 2B-iv retired the other three, and with the last of them the bridge contributor itself. No decision changed severity.

**`TREE_FAMILY_SCATTERED`: changed in Stage 2B-i (implemented; calculogic-validator#102, B1–B8).**
- **Before:** a semantic family was scattered when its files spanned at least 2 structural homes and at least 3 files, after the local-first and broader-spread layers. There was no folder-level home model, and the thresholds were literals with no recorded rationale.
- **Basis:** placement `home-elsewhere` (S2.8), read from `treeFolderSemanticHomeReasoning.placements`. That placement is positive evidence: the file has a semantic observation, no eligible or undetermined candidate on its relevant lineage takes precedence, and at least one `eligible` candidate elsewhere matches it on its governing channel.
  - `inside-home`, `no-home` and every `undetermined` placement (`home-on-lineage-undetermined`, `home-elsewhere-undetermined`, `candidate-discovery-incomplete`, `no-semantic-observation`) never emit. A file with no eligible home is not "scattered from" anything. Candidate outcomes count only through placement; the emitter never re-reads them.
  - Family membership alone never emits (RR1, `semanticFamilyAloneDoesNotImplyGrouping`): the unit is the home, not `semanticFamily`.
  - The finding says that files sit outside a supported home. It is not a misplacement claim (S2.15), and it stays `info`.
- **B1. Grouping.** A home is the home folder's identity tuple (`addressProfileId`, `addressedSnapshotId`, `occurrenceAddress`), never its display path. Several eligible candidates on one folder are one home; two folders are two homes, even with the same claim. A file's home set is the distinct folders of the eligible candidates in its `elsewhereHomes`. Files with an identical home set form one finding: a file matching homes A and B never shares a finding with a file matching only A. Findings are ordered by their first file's path, then by home set; the finding's `path` is its first file by path.
- **B2. Documentation pairing (R2).** The existing canonical docs-authority/runtime pairing is kept and restated in Stage 2 evidence. A `home-elsewhere` file f is paired with an eligible home H when:
  1. f lies under the validator development root's `doc/` (the bridge's `docAuthorityRootPrefix`);
  2. H lies under the validator development root, outside its `doc/`;
  3. S, the top-level folder of the validator development root that contains H, equals f's Naming `familyRoot` (the Stage 1 accepted bridge observation): the document names the owned area that holds its home.

  f is exempt only when it is paired with every home in its set; otherwise it is reported, and the homes it is paired with are listed in `pairedHomes`. Without a validator development root (installed consumers), nothing is paired. Being in the same development project is not pairing: a document whose root names a different area than its home (for example a suite document matching a home under `src/`) is reported.
- **B3. No minimum.** One qualifying file emits: each file is individually supported by an eligible home. A minimum would be a new S2.10 parameter with its own catalogue evidence, added by amendment.
- **B4, B5. Parameter states.** The finding is governed by the S2.9 `status`, never by `conformance`:

  | Parameter set | Reasoning `status` | `TREE_FAMILY_SCATTERED` |
  | --- | --- | --- |
  | `available`, `conformance: passed` | `evaluated` | emits from placements |
  | `available`, `conformance: not-checked` | `evaluated` | emits from placements; conformance is reported in `meta` |
  | `configuration-unavailable` | not evaluated | emits nothing; `meta` says why; no fallback |
  | `not-prepared` | not evaluated | emits nothing; `meta` says why; no fallback |

  Unavailable reasoning is no evidence, never negative evidence. Codes not yet migrated, and all other Tree findings, are unaffected.
- **B6. Report metadata.** The Tree validator entry carries `meta.semanticHomeReasoning` on every run that prepared Stage 2: `{ status, reason?, conformance, conformanceBinding?, registry?, governedCodes }`. `reason` is the parameter set's reason when Stage 2 was not evaluated. `registry` is `{ registryId, version, source, digest }` only when a registry was read; its absence never stands for Builtin. `governedCodes` lists the codes that depend on Stage 2A (`['TREE_FAMILY_SCATTERED']`).
- **B7. Details.** `{ basis: 'semantic-home-placement', homes, files, fileCount }`:
  - `homes[]`, sorted by `occurrenceAddress`: `{ folder: identityTuple, folderPath, qualifyingCandidates[] }`, each candidate `{ candidateId, governingChannel, claim }`, with `claim` `{ channel: 'root', root }` or `{ channel: 'prefix', tokens }`. Claims stay on their candidates and are never merged into one implied claim.
  - `files[]`, sorted by `occurrenceAddress`: `{ occurrence: identityTuple, path, matchedCandidates[], pairedHomes?, otherCandidates[], splitFamilyFlags? }`. `matchedCandidates` are exactly the eligible candidates this file matches. `otherCandidates` are the placement's consulted candidates (`candidateId`, `outcome`, `reason`, `relation`, `location`): evidence that did not decide the placement. `splitFamilyFlags` appear when the file's observation carries them (split-family guardrail below).
  - The family-heuristic details (`semanticFamily`, structural homes, roots, containers and root kinds, `localFirstInterpretation`, `broaderSpreadInterpretation`, `allowedCrossContainerPatterns`, `thresholds`) are retired for this code.
- **B8. Ownership.** `tree/src/contributors/tree-semantic-home-scatter-contributor.logic.mjs` reads the prepared Stage 2A record, the Stage 1 candidates and accepted bridge observations, and the development-root context. It computes no eligibility, comparison, or structural home. The Naming semantic-family bridge contributor no longer emits this code; it keeps the other three family codes and their shared interpretation spine unchanged.
- **Effect at `9770ce7`** (`repo` and `validator` scope are identical):

  | Scope | Before | After |
  | --- | --- | --- |
  | `repo`, `validator` | 4: `registry` (28 files), `naming` (18), `validator` (30), `structural` (3) | 1: home `src/core/registry-lifecycle`, 2 files (`scripts/registry-lifecycle.host.mjs`, `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md`) |
  | `app` | 1: `validator` (26) | 0 |

  `naming` (all 18 `undetermined`), `validator` (all `no-home`) and `structural` (`no-home` or `undetermined`) stop. The 16 `doc/**/tree-*` documents are `home-elsewhere` relative to the eligible home `tree` and are exempt by pairing (root `tree`, owned area `tree`). Both remaining files also match `naming/test/fixtures/registry-lifecycle`, which is `undetermined`, reported in `otherCandidates`. This supersedes the projection recorded at 9cd27d9, before `tree` became eligible.

**`TREE_OBSERVED_FAMILY_CLUSTER`: retired in Stage 2B-ii (implemented; calculogic-validator#102, D1–D3).**
- **Before:** emitted when the local-first spine classified a family `local-density-first`: every singular (unflagged) observation of the family in one naming-aligned semantic container, with at least 4 files or at least 2 container-local homes, and no subgroup opportunity. 0 emissions at `repo`, `validator` and `app` scope at 3016de0. The value 4 had no recorded rationale.
- **Why it is retired, not re-based.** Under the home model it has no distinct role:
  - An eligible home already establishes the grouping it inferred from path alignment, and its size and quality are in the S2.7 strength profile (`support`, `coverage`, `supportShare`, corroboration). A finding that a home holds N matching files would repeat the prepared record.
  - The catalogue supports no concentration threshold: C1 (6 files), C14 (10), C24 (3), C20 (2) and a 3-file variant of C1 are all eligible homes with every file `inside-home`; nothing distinguishes a 3-file home from a 6-file one. Keeping a threshold would need a new S2.10 parameter with catalogue evidence, registry version 3 and a new conformance binding, which nothing justifies.
  - Concentration in a path-aligned folder that is not an eligible home cannot be reported: that is grouping from family membership alone (RR1).
  - Several local subfolders inside one grouping is the subgroup question, which `TREE_FAMILY_SUBGROUP_OPPORTUNITY` owned; it was decided separately (retired in Stage 2B-iii, below).
- **What stays.** Only the emitter is removed. `interpretFamilyLocalFirst` and its classifications, including `local-density-first`, and their decision order are unchanged: `TREE_FAMILY_SUBGROUP_OPPORTUNITY` emits only for `local-subgroup-first`, which is decided before density, and `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` emits only for the two divergence lanes, so every other lane (density and expected presence alike) suppresses it. With the emitter gone, whether a family is `local-density-first` or `expected-local-presence` no longer changes any emitted finding; the classification is kept unchanged so that this slice removes nothing but the emitter. The density threshold is renamed `FAMILY_LOCAL_DENSITY_MIN_FILES` for the classification it still decides; its value (4) and behavior are unchanged, and retaining it does not declare it correct: whether the density lane survives belongs to the subgroup and lanes slices.
- **Compatibility.** The code is intentionally retired and no longer emitted, even though the reports at `repo`, `validator` and `app` scope stay byte-identical (it emitted nothing there). `governedCodes` is unchanged: a retired code is not governed by Stage 2A. The consumer inventory found no reference to the code or its details in Calculogic_React_App (at e660781) or in this repository's report tooling; the remaining mentions are historical audits.

Principle (Stage 2B): not every piece of prepared reasoning needs a finding. The reasoning record describes valid organization, evidence strength and uncertainty; a finding is emitted only when it reports something the record does not already establish.

**`TREE_FAMILY_SUBGROUP_OPPORTUNITY`: retired in Stage 2B-iii (implemented; calculogic-validator#102, E1–E3).**
- **Before:** emitted when the local-first spine classified a family `local-subgroup-first`: every singular (unflagged) observation of the family in one naming-aligned semantic container, with at least 4 files in at least 2 container-local homes, and a lower-level grouping signal (a `familySubgroup`, or a `semanticFamily` beginning with `familyRoot-`). It suggested a lower-level subgroup folder. 0 emissions at `repo`, `validator` and `app` scope at ff43ff6. The thresholds had no recorded rationale.
- **Why it is retired.** Unlike the cluster code, it attempted a distinct inference: a folder that does not exist yet, which Stage 2A does not evaluate. The evidence it rests on does not support that inference:
  - The lower-level grouping signal discriminates nothing: Naming sets `familySubgroup` on every observation (270 of 270 at `repo` scope at ff43ff6), as the name's remaining tokens.
  - The natural subgroup key, a compound `semanticFamily`, carries `family-boundary-heuristic` on every observation measured (135 of 135). Naming's own rule requires singular family evidence for subgroup and family aggregates, so the boundary that would define the subgroup is exactly the part Naming marks uncertain.
  - The remaining singular evidence is families equal to their root, which have no lower-level family. The one singular 4-file group inside an eligible home (`familySubgroup` `structure-advisor`: one module's `logic`, `wiring`, `host` and `contracts` files in `tree/src`) is ordinary organization; only the 2-local-homes condition kept it from being reported.
  - The catalogue holds no case about potential subfolders, so neither threshold has evidence.
  - Where a lower-level folder exists, Stage 2A already decides it: an eligible nested home holds its files (C16), and an undetermined one leaves them `undetermined` on their lineage. Neither leaves a subgroup to propose.

  These measurements establish the problem for the current evidence model and this repository; they do not show that reliable subgroup evidence could never exist.
- **What stays.** Only the emitter and its details (including the former `scopeBoundary` text) are removed. `interpretFamilyLocalFirst`, its `local-subgroup-first` classification and the decision order are unchanged; the thresholds are renamed `FAMILY_LOCAL_SUBGROUP_MIN_FILES` (4) and `FAMILY_LOCAL_SUBGROUP_MIN_DISTINCT_LOCAL_HOMES` (2), values and behavior unchanged, and the lower-level grouping signal is still required. The former `FAMILY_SUBGROUP_OPPORTUNITY_REQUIRES_LOWER_LEVEL_GROUPING_SIGNAL` constant only fed the retired finding's `details.thresholds` and is removed with them. Retaining them does not validate them. After Stage 2B-ii and 2B-iii, only the two divergence lanes can affect a finding (through `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES`); whether the spine is simplified belongs to that code's slice (E3).
- **Compatibility.** The code is intentionally retired and no longer emitted; every runner report stays byte-identical at `repo`, `validator` and `app` scope because it emitted nothing. `governedCodes` is unchanged. The consumer inventory found no reference to the code or its details in Calculogic_React_App (at e660781) or in this repository's report tooling; the remaining mentions are historical audits.
- **Deferred capability (E2).** Potential subgroup or subfolder discovery remains a possible future extension of Stage 2 reasoning. Unlike the retired `TREE_FAMILY_SUBGROUP_OPPORTUNITY` heuristic, such a capability would need independently justified evidence for hypothetical folder claims, explicit uncertainty handling, and its own contract, catalogue, parameter, and conformance decisions. This retirement neither authorizes nor commits to that extension. It would be potential-home discovery, distinct from Semantic Home evaluation, which decides relationships involving existing folders. The capability is now specified as a contract in Stage 3, emergent structural-boundary opportunities (S3.1–S3.12), and is still not implemented.

**`TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES`: retired in Stage 2B-iv (implemented; calculogic-validator#102, L1–L4), together with the Naming semantic-family bridge contributor.**
- **Before:** singular (unflagged) observations grouped by `semanticFamily`, under the shared root `src/shared` in at least 2 of the lane partitions `build`, `build-style`, `logic`, `knowledge`, `results`, `results-style`, `tests`, `docs`, with at least 3 files; emitted only when the local-first spine classified the family in one of its two divergence lanes and the broader-spread review was unresolved. It recommended `src/shared/<semanticFamily>` (`details.suggestedSemanticTargetRoot`). 0 emissions at `repo`, `validator` and `app` scope at 92c3b91, and 0 in Calculogic_React_App at e660781 (its `src/shared` holds no lane partition and no Naming observation). The thresholds and the shared-root and lane lists were code literals with no recorded rationale.
- **Why it is retired.** It combined two questions: a structural observation (are shared files organized primarily into role-based lanes?) and a semantic recommendation (should these files be grouped into a particular semantic folder?). Measured against Stage 2A placement, the recommendation is unsupported:
  - Files whose placement is `home-elsewhere` already have an eligible home. Recommending `src/shared/<semanticFamily>` for them contradicts `TREE_FAMILY_SCATTERED`, which reports the same files as outside that home (the Stage 2B-i end-to-end fixture: home `src/widget` against a recommended `src/shared/widget-keyed`).
  - Files whose placement is `no-home` have no eligible home, and lane separation alone does not establish that they belong in one new folder: the grouping and the destination come from family membership alone (RR1, `semanticFamilyAloneDoesNotImplyGrouping`).
  - `inside-home` and `undetermined` files were not reached in any measured case.
- **What is removed.** The emitter, and with it the whole bridge contributor (`tree-naming-semantic-family-bridge-contributor.logic.mjs` and `.wiring.mjs`) and its attachment: after Stage 2B-ii and 2B-iii its local-first spine, broader-spread review, placement records, folder-kind classification, payload selection and `semanticHomeEvidence` details existed only to gate this code. The docs-authority prefix the Stage 2B-i pairing rule (B2) reads moved, unchanged, to `tree/src/tree-validator-development-root.logic.mjs` (`toValidatorDocAuthorityPathPrefix`).
- **What stays.** Stage 1 Naming evidence and bridge observations, the occurrence and section intakes, the staged `namingSemanticFamilyBridge` payload (still read by the family-root folder evidence, S2.13, and the intakes), Stage 2A, `TREE_FAMILY_SCATTERED` and its R2 pairing, and `meta.semanticHomeReasoning` (`governedCodes` unchanged).
- **Inputs (L3).** `prepareTreeStructureAdvisorInputs` and `runTreeStructureAdvisor` still accept `namingSemanticFamilyBridge` and `preparedAddressKeyedJoinEvidence`, and wiring still hands both to the default contributor assembly, which accepts them. No current default contributor reads them, so they change no finding. They were never part of the prepared inputs a contributor receives: the assembly passed them only to the bridge contributor at attach time. Removing or deprecating them is a separate contract decision.
- **Compatibility.** The code is intentionally retired and no longer emitted; every runner report stays byte-identical at `repo`, `validator` and `app` scope, and against Calculogic_React_App at e660781. The consumer inventory found no reference to the code, its details, the bridge inputs or the module in Calculogic_React_App or in this repository's report tooling; the remaining mentions are historical audits.
- **Deferred capability (L4).** The shared-root semantic-first convention ("Shared-root semantic-first grouping" below) remains, not currently enforced. A future capability might detect lane-first organization under a configured shared root directly from structural evidence, without grouping files by `semanticFamily`; such a structural observation need not pass Semantic Home eligibility. Proposing a semantic destination is different: it needs an eligible home or other independently justified semantic evidence. Either would need its own contract, evidence, thresholds and policy ownership for the shared-root and lane lists. This retirement neither authorizes nor commits to that capability.

**Split-family stability guardrail.** The Tree blueprint requires split-family flags to prevent a semantic-family grouping from being treated as fully stable (calculogic-validator#85 living document). Where Naming's `splitFamilyFlags` evidence is available and applicable to a family or subgroup, no Stage 2B finding may treat that family or subgroup as fully stable without an explicitly justified policy. This applies to any code that groups by `semanticFamily` or `familySubgroup`. Stage 1 transports this evidence on the v1 observation but does not interpret it (S1.5), and Stage 2 eligibility does not use family groupings. This guardrail therefore binds the 2B slices; it does not imply that Stage 1 produces or interprets every possible split-family signal.

**No fallback when Stage 2 is unavailable.** When the S2.9 `status` is `configuration-unavailable`, a finding migrated to depend on Stage 2 emits nothing for that run, and the report says why. It never falls back to the older semantic-family heuristics. Codes not yet migrated, and all other Tree findings, are unaffected. Each 2B slice must show both behaviors.

The literal thresholds of the codes that keep their basis are not moved into the registry by this contract. Moving them is part of the 2B slice for that code.

#### S2.13 Legacy `semanticHome` (Q7): retired in Stage 2C (implemented; calculogic-validator#102)

**What the field was.** `treeSemanticHomeEvidence.evidenceRecords[].semanticHome` (`tree/src/tree-semantic-home-evidence.logic.mjs`) copied the same record's `semanticFamily`. A family name is not a folder, so the field did not mean what Stage 2 means by a Semantic Home, and it contradicted the earlier modeling note ("`semanticHome` resolves to a folder/subfolder home"). It asserted a home for every matched occurrence, with no uncertainty state: in this repository at `repo` scope (ad4451b) it named a home for 268 files, of which Stage 2A placed 93 `inside-home`, 18 `home-elsewhere`, 100 `no-home` and 57 `undetermined`.

**What it carried.**
- *Files:* only the file's own `semanticFamily`, which Naming still owns and Stage 2A still reads. No reader used the file records for a decision.
- *Folders:* a lexical signal, that a folder's name is a Naming family root. A repository-top folder qualifies only through Tree's `semantic-repository-top-family-home` relationship, which takes precedence over the Naming record. That signal is a claim, not an eligible home (RR1): in Calculogic_React_App at `repo` scope, `calculogic-doc-engine` carries it while its Stage 2A candidate is `undetermined`.

| Concept | Meaning | Authority |
| --- | --- | --- |
| Naming family | Semantic interpretation of a name | Naming |
| Family-root folder evidence | A folder name matches a Naming family-root claim, with the applicable structural context | Tree, consuming Naming evidence |
| Eligible Semantic Home | A folder supported by evaluated evidence | Stage 2A |
| Home placement | Relationship between a file occurrence and eligible homes | Stage 2A |

**Decision (Option D).** Retire the field and keep the folder signal under its actual meaning.
- `treeSemanticHomeEvidence` becomes `treeFamilyRootFolderEvidence` (`tree/src/tree-family-root-folder-evidence.logic.mjs`, source `tree-family-root-folder-evidence`). It is folder-only; matching, eligibility of Naming records, the repository-top exclusion and relationship precedence are unchanged. Records drop `semanticHome` and `semanticHomeSource`; `semanticHomeEvidenceStrength` becomes `familyRootEvidenceStrength` with the same values. `semanticName`, `semanticFamily`, `familyRoot` and `familySubgroup` keep Naming's values. The carried value is Naming's `semanticFamily`, not its `familyRoot` (for `calculogic-doc-engine` they are `calculogic-doc-engine` and `calculogic`), so no field is named a family root.
- Folder-kind evidence reads the new collection's `semanticFamily`. Its records' `semanticHome` becomes `semanticFamily`, and `folderKindEvidenceStrength: 'derived-from-semantic-home-evidence'` becomes `'derived-from-naming-family-root-evidence'` (an intentional internal value change; the classification it labels is unchanged).
- The classification runtime keeps reading the claim directly as well as through `folderKind` (`folderKind === 'semantic' || familyRootSemanticFamily`), so a Custom folder-kinds registry without `semantic` classifies a family-root repository-top folder as before.
- Parity and shadow records' `replacementSemanticHome` becomes `replacementFamilyRootSemanticFamily`. It is `null` for files, which no longer have a record.
- Rationale strings name the family-root folder evidence instead of semantic-home evidence.

**Why not the alternatives.** Re-pointing readers at Stage 2A would change what `folderKind: semantic` means, tie classification to Stage 2 configuration, and create a cycle: folder-kind evidence feeds Stage 1 candidates (by reference), which feed Stage 2A. Removing the producer would leave every report unchanged but silently flip Calculogic_React_App's classification parity for `calculogic-doc-engine` to `differs` and its replacement readiness to `review-required`. Keeping the field leaves a second, misleading authority for the Semantic Home concept. A deprecation alias protects no consumer: the field lived only in `preparedDependencies`, which the report does not carry and no spec documents as an API.

**Compatibility.** Runner reports are byte-identical at every scope in this repository and in Calculogic_React_App (e660781). Classification, parity summaries, readiness, recommendation, execution contract, structural-context assessment, Stage 1 candidates and Stage 2A reasoning are identical; prepared dependencies differ only by the renames above and the removed file records. The Stage 2A conformance binding and source digest are unchanged; none of these modules is bound. The report schema is unchanged. The tests that keep `semanticHome` out of Naming, Structural Addressing and report-capture outputs stay: they guard the retired Tree-owned concept.

**Known parity defects (resolved after Stage 2C by retirement).** Two classification-parity problems found during the Stage 2C review were tracked separately and were later resolved by retiring the classification migration machinery that contained them (see "Classification migration machinery: retired" under the current runtime notes), not by repairing it:
- both sides of the semantic-root comparison read the same family-root evidence, so a match does not independently establish the replacement class (calculogic-validator#118);
- an allowed but unclassified repository-top folder gets `repo-shape-allowed-top-level-directory` on the current side and `non-root-or-unknown` on the replacement side, which can change readiness (calculogic-validator#119).

#### S2.14 Slicing and authorization (F5)

Each step needs its own authorization:

1. **This contract**, including its policy amendment and registry architecture (documentation only).
2. **Lane text reconciliation** (data only, no structural change). Align the `semantic-home-policy` lane texts with the S2.10 lane table (RR2), keeping each lane's description of its evidence class.
3. **Parameter adoption** (done: the Builtin data, shape validation, migration and inventory below; no runtime consumer). It followed the registry migration sequence:
   - the parameter section (RR3), with the S2.10 selected values, their rationales and their catalogue references;
   - `version` `"2"`, with `readableVersions` covering `"1"` and `"2"` (RR5);
   - the version-1-to-2 transform and its consistency test (RR6);
   - shape validation of the S2.5 constraints (RR3);
   - inventory declarations without merge-fields for the section.
4. **Parameter loader and converter** (done: `treeSemanticHomeParameterSet`, S2.9, a frozen prepared dependency with RR4 provenance from the lifecycle Baseline comparison; no consumer; findings byte-identical at `repo`, `validator` and `app` scope).
5. **Stage 2A.** `treeFolderSemanticHomeReasoning` (S2.1–S2.9) and the S2.11 cases as executable fixtures. Findings stay byte-identical at `repo`, `validator` and `app` scope. In three slices, each separately authorized:
   - **2A-i, candidate reasoning** (done): S2.3–S2.7, the record with `candidateOutcomes` and `memberAttributions`, and the catalogue's candidate outcomes;
   - **2A-ii, placement** (done): S2.8, `placements` and `candidateDiscovery`, the shared Stage 1 comparison operation, and the catalogue's placements;
   - **2A-iii, conformance binding** (done): the RR4 binding of the four values, the catalogue identity and the reasoning implementation, checked by `npm test`, and run-time conformance in the parameter set.
6. **Stage 2B.** Findings reconciliation, one code per pull request (S2.12):
   - **2B-i, `TREE_FAMILY_SCATTERED`** (done): re-based on `home-elsewhere` placement with B1–B8 and `meta.semanticHomeReasoning`;
   - **2B-ii, `TREE_OBSERVED_FAMILY_CLUSTER`** (done): retired, with the local-density routing it shared kept unchanged;
   - **2B-iii, `TREE_FAMILY_SUBGROUP_OPPORTUNITY`** (done): retired, with the local-subgroup classification kept unchanged and potential-subfolder discovery recorded as a deferred, unauthorized capability;
   - **2B-iv, `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES`** (done): retired with the Naming semantic-family bridge contributor; the shared-root semantic-first convention recorded as a deferred structural capability. Stage 2B findings reconciliation is complete;
   - the remaining codes, each separately authorized.
7. **Stage 2C** (done). The legacy `semanticHome` field retired; its folder evidence renamed `treeFamilyRootFolderEvidence` with classification, parity and readiness unchanged (S2.13).

#### S2.15 Non-goals

- Changing Stage 1 evidence, Naming, the bridge contract or the runner.
- Tree interpretation of Naming material, including label qualifiers.
- Any single strength score, or ranking of candidates against each other.
- Treating `home-elsewhere` as misplacement in itself.
- Adopting a parameter value without catalogue evidence.
- Compensating for known Naming evidence gaps through parameter values (S2.10, D3).
- Changing findings outside the per-code decisions in S2.12.
- Broader local-context reasoning is deferred. Stage 2 reads containment, ancestry (`rootAncestry`, as a facet only), composition and candidate-relative relationships. It does not reason over parent or sibling context in the wider sense the Tree blueprint describes. Adding that needs its own contract amendment and adds no dependency to this one.

#### S2.16 Organizational placement (Contract; implemented by slices 1 and 2)

**Status.** This subsection is a contract with a catalogue, implemented in two separately authorized slices. The Builtin policy changes no finding:
- **Slice 1, registry and loader (implemented).**
  - What exists: the Builtin registry `tree/organizational-placement` (`entries: []`), its shape validation and the reference edge `tree/organizational-placement-namespace` to `tree/structural-homes` (lifecycle §12.11).
  - The loader prepares `treeOrganizationalPlacementPolicy` from the run's resolution, with its provenance.
  - Effects on reports: the Tree entry's `meta.registryProvenance` lists the new registry, and the resolved-set digests change. A Custom set created before this registry existed is incomplete until it inherits it (lifecycle §7.1 item 2).
- **Slice 2, relation classification (implemented).**
  - `tree/src/tree-organizational-placement.logic.mjs` classifies every relation from the prepared records. It is the one owner of R2 pairing and of the policy's interpretation, and it never reads emitted findings.
  - Wiring prepares `treeOrganizationalPlacement` for the run's validator development root; the runtime reports `meta.organizationalPlacement`.
  - The `TREE_FAMILY_SCATTERED` contributor presents the classification (S2.12 B2 is now that classification). It reuses the prepared record for the run's root and reclassifies for another root, as for direct library calls.

With the Builtin policy, `TREE_FAMILY_SCATTERED` and R2 (S2.12 B2) are exactly as before, and every exit code is unchanged. Only the new record and `meta.organizationalPlacement` are added.

**Purpose.** A `home-elsewhere` file can share a semantic subject with an eligible home while correctly belonging to a different organizational context. The common example is a specification kept in a central `doc/` tree about code under `src/`. Today:
- R2 recognizes this only for documents in the validator's own repository whose Naming `familyRoot` names the home's top-level folder;
- it never applies to installed consumers;
- and the files it exempts are not reported anywhere.

This contract makes the organizational relationship explicit, configurable and inspectable, without changing what Naming, Addressing or Stage 2A decide.

**Ownership.**

| Layer | Owner | Responsibility |
|---|---|---|
| Artifact facts: role, role category, role status, semantic tokens | Naming (unchanged), through the section intake (S1.1) | Upstream facts. Never reinterpreted |
| Role and category vocabulary of the run | Naming, through the §4.9 vocabulary intake (`treeRoleCategoryVocabularyIntake`) | Bounds which selectors are applicable |
| Structural namespace of a folder | Tree, `tree/structural-homes` (unchanged), through `treeStructuralHomeEvidence` | Which folders are `doc`, `docs`, `scripts`, `src`, … |
| Path, ancestry, occurrence identity | Addressing and suite core (unchanged) | — |
| **Organizational placement policy** | **Tree, new registry `tree/organizational-placement`** | Which artifact kinds are kept in which namespaces, and how |
| Relation classification and the finding | Tree, Stage 2 emitter (S2.12) | Classifies each relation and decides the finding |

Stage 2A reasoning, its placements, the S2.11 catalogue and the conformance binding are unchanged. The policy is read only after placement.

**Registry shape (`tree/organizational-placement`, version 1).**
- `entries[]`, each:
  - `entryId`: unique;
  - `select`: exactly one of `{ roles: [...] }` or `{ roleCategories: [...] }`, non-empty, naming Naming roles or role categories;
  - `arrangement`: `centralized` or `colocated`;
  - `namespaces`: Tree structural-home ids. Required and non-empty when `centralized`; absent when `colocated`;
  - `definition`: the convention it records.
- **Builtin:** `entries: []`. The Builtin set adopts no organizational exemption.
- **Custom:** a consumer's Custom set may add entries through the existing registry lifecycle (lifecycle §7–§8), with its source and digest reported.
- **Load-time validation:**
  - a closed shape;
  - `namespaces` drawn from `tree/structural-homes` in the same resolved set;
  - no two entries whose selectors of the same kind (`roles`, or `roleCategories`) both name one value. That would be an ambiguous precedence.

**Arrangements.**
- **Centralized:** files of the selected kind are kept in the listed namespaces, away from the subjects they concern.
- **Colocated:** files of the selected kind are kept inside their subject's home. A file outside its home is reportable, which is today's behavior.
- **Mixed** is not a third value. It is several entries with different arrangements, for example documentation centralized and entry scripts colocated.
- **A kind with no entry** keeps today's behavior.

**Deterministic matching**, per file, before any relation is classified:
1. **Applicability.** If the vocabulary intake is not `usable`, no entry applies: the policy is inapplicable, recorded as such, with today's behavior. An entry whose selector names a role or category absent from the run's usable vocabulary is inapplicable and recorded, never an error.
2. **File kind.** The file's Naming role and role category come from its accepted section-intake record (`roleStatus: active` only). A file without an accepted active role matches no entry.
3. **Precedence.** An applicable `roles` entry naming the file's role wins over a `roleCategories` entry naming its category. Load-time validation makes at most one entry of each kind match.
4. **Namespace.** A folder's namespace is the structural home of the folder itself or of its nearest ancestor with one in `treeStructuralHomeEvidence`, or none.
   - A file's namespace is that of its folder.
   - A home's namespace is that of the home folder.

**Relation classification.** A relation is one (`home-elsewhere` file, eligible home folder) pair, using the home set of S2.12 B1. Each relation is classified independently, in this order:
1. **`paired`:** R2 pairs the file with that home (S2.12 B2, unchanged). R2 stays an ownership relation, distinct from organizational consistency, and always takes precedence.
2. **`consistent`:** the file's matching entry is `centralized`, the file's namespace is one of the entry's `namespaces`, and the home's namespace is not one of them (none counts as outside). The relation crosses from the kind's organizational context into a different one, which is the configured convention.
3. **`reportable`:** every other relation, including:
   - a home inside the same namespace (scatter within the documentation tree stays reportable);
   - a `colocated` entry;
   - no matching entry;
   - an inapplicable policy.

**The finding.**
- **When a file is reported:** only when at least one of its relations is `reportable`. One `consistent` or `paired` relation never exempts a file's other relations.
- **What its record lists:** today's `pairedHomes`, plus a new `consistentHomes`. The finding's home set excludes consistent homes.
- **Grouping** (S2.12 B1) uses that home set.
- **With an empty or inapplicable policy,** no relation is `consistent`, so every finding is byte-identical to today.

**Inspectability (for the implementation slice).**
- **A prepared record, `treeOrganizationalPlacement`,** is present whenever Stage 2 is evaluated. It holds:
  - `validatorDevelopmentRoot`: the root R2 was evaluated for;
  - `policy`: `{ registryId, version, source, digest, applicability, reason? }`. `reason` is `policy-not-prepared` or `vocabulary-unusable` when the policy is inapplicable;
  - one record per relation: `{ file: identity tuple, path, home: identity tuple, homePath, classification, basis }`, sorted by file then home address. `basis` is one of:
    - `{ rule: 'r2-ownership' }`;
    - `{ rule: 'organizational-policy', entryId, arrangement, fileNamespace, homeNamespace }`;
    - `{ rule: 'no-applicable-entry' | 'same-namespace' | 'colocated' | 'policy-inapplicable' }`;
  - `diagnostics` for inapplicable entries.
- **The report entry** carries `meta.organizationalPlacement`: `{ policy, counts: { paired, consistent, reportable }, diagnostics?, governedCodes: ['TREE_FAMILY_SCATTERED'] }`. `diagnostics` appears only when an entry is inapplicable. Consistent and paired relations are visible as counts, and in the record, even when no finding is emitted.

**Compatibility.**
- **With the Builtin (empty) policy:** findings stay byte-identical; only the new record and `meta` entry are added (current behavior since slice 2).
- **What a policy would change in this repository** (measured at `2538487` by the test-only reference). These are the three relations S2.12 B2 deliberately reports today: "a document whose root names a different area than its home … is reported", with the `9770ce7` effect table.

  | File | Today | Under a Custom policy (documentation roles centralized in `doc`/`docs`; `host`/`entry`/`cli` centralized in `bin`/`scripts`) |
  |---|---|---|
  | `doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md` | reported (homes `linguistic-foundation`, `test/fixtures/linguistic-foundation`) | `consistent` with both; not reported |
  | `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md` | reported (home `src/core/registry-lifecycle`) | `consistent`; not reported |
  | `scripts/registry-lifecycle.host.mjs` | reported (home `src/core/registry-lifecycle`) | `consistent`; not reported |

  - **Self-check:** R2's 22 exempted documents stay `paired`.
  - **Installed-consumer view:** without a validator development root, R2 is inactive. All 25 `home-elsewhere` files in this repository are reported today, in 4 findings. The same Custom policy would make all 25 `consistent`.
  - **React app:** it has no `home-elsewhere` file, so no change.
  - **Approval needed:** the S3.13.9 guard applies in spirit. Removing these findings needs the owner's approval as part of the implementation slice.

**Catalogue.**
- OP-1 to OP-8 are real temporary repositories prepared through Naming staging and Tree wiring.
- **Test-only reference:** it evaluates the cases against fixture policies. It obtains R2 pairing from the production emitter run without a policy, so R2 is never re-implemented.
- **Production run (slice 2):** each case also runs with its policy activated as a Custom set. The production classifier must give exactly the reference's relations, basis included.

| Case | Shape | Policy | Expected classification | Reported |
|---|---|---|---|---|
| OP-1 centralized documentation | `doc/specs/widget-engine-overview.spec.md`, home `src/widget-engine` | documentation centralized in `doc`/`docs` | `consistent` | no |
| OP-2 entry script | `scripts/widget-engine.host.mjs`, home `src/widget-engine` | `host`/`entry`/`cli` centralized in `bin`/`scripts` | `consistent` | no |
| OP-3 within-namespace scatter | `doc/guides/widget-engine-usage.spec.md`, home `doc/widget-engine` | documentation centralized | `reportable` (`same-namespace`) | yes |
| OP-4 colocated documentation | the OP-1 tree | documentation colocated | `reportable` (`colocated`) | yes |
| OP-5 no applicable entry | `src/misc/widget-engine-helper.logic.mjs`, home `src/widget-engine` | documentation centralized | `reportable` (`no-applicable-entry`) | yes |
| OP-6 several namespaces | `doc/specs/widget-engine-overview.spec.md`, homes `doc/widget-engine` and `src/widget-engine` | documentation centralized | `src` home `consistent`, `doc` home `reportable` | yes, for the `doc` home only |
| OP-7 R2 ownership | `doc/specs/widget-overview.spec.md`, home `widget`, under a validator development root | documentation centralized | `paired` (R2 precedes the policy) | no |
| OP-8 mixed arrangement | the OP-1 tree plus `scripts/widget-engine.host.mjs` | documentation centralized; entry scripts colocated | doc `consistent`, script `reportable` (`colocated`) | the script only |

With the empty Builtin policy, the reference reproduces the production emitter exactly on every case and on this repository, with and without a validator development root.


### Emergent structural-boundary opportunities, Stage 3 (Status: Contract; evidence-only runtime, S3.11 step 4. The S3.5 claim-relative uncertainty and S3.6 coverage-invariance amendments of calculogic-validator#138 are implemented by calculogic-validator#140. The S3.2 positional lineage expression of calculogic-validator#142 is implemented by calculogic-validator#144. The S3.2 lexical-label expression of calculogic-validator#153 is implemented by its implementation slice. The S3.2 repository package expression of calculogic-validator#157 is implemented by calculogic-validator#159. The S3.6 role-category vocabulary rule of calculogic-validator#162 is Contract only, implementation-pending; its S1 intake is implemented by the evidence-only slice, and Stage 3 does not read it. The S3.13 first-advisory contract of calculogic-validator#171: its adopted policy (S3.13.6, slice B) is implemented by the slice-B implementation; the first advisory finding (slice C, S3.13.2–S3.13.5 and S3.13.7) is implemented by the slice-C implementation and is emitted only under the adopted policy with an active language profile. The S3.13.9 selection evidence contract of calculogic-validator#175 is Contract only: `opportunity-selection` stays unresolved and EL5 is unchanged. Rules marked *provisional* are not binding until adopted with catalogue evidence; S3.11)

This section is the contract for potential-home discovery, the capability Stage 2B-iii recorded as deferred (E2). It asks one question: **does a directory hold a cohesive group of responsibilities that a new structural boundary would make clearer?**

**Conformance and opportunity.** Stage 2 and the existing findings answer conformance questions: how files relate to structure that exists. Stage 3 answers an opportunity question: whether structure that does not exist yet would improve the organization.
- An opportunity never makes valid placement invalid. Every Stage 2 placement and existing finding is unchanged by Stage 3.
- The absence of an opportunity is not approval. The organization may be improvable in ways Stage 3 does not model.
- A new folder is the only improvement Stage 3 models. It is not the only kind of structural improvement. Merging, renaming, moving between existing homes and reshaping a directory are outside this section.

**Principle (from Stage 2).** Every conclusion names the evidence that justifies it. Where evidence does not justify an opportunity, the result is recorded as insufficient, explained or not an opportunity, never as an affirmative suggestion. Uncertainty is never treated as negative evidence.

**Relationship to Stage 2.** Stage 2 decides relationships between files and folders that exist. Stage 3 considers folders that do not exist. It reads Stage 2's records by reference and never changes them.

#### S3.1 Inputs and ownership

Stage 3 reads only prepared evidence, by reference:
- the addressed snapshot (Structural Addressing): directories, their direct file members, sibling sets and lineage, joined by addressed occurrence identity, never by path;
- the Stage 1 Naming intake: each file's accepted semantic identity, including N1 token sequence, `semanticName`, `role`, `roleCategory` and ambiguity flags;
- the Stage 1 comparison operation (S1.5), to decide whether an ancestor folder expresses a file's leading tokens;
- the Stage 2A record: candidate outcomes, claims, governing channels and placements;
- *(calculogic-validator#157, #159)* the accepted package elements of the Naming repository-package label section (bridge contract §4.8), from `treeRepositoryPackageIntake` (S1.1, S1.2), only for S3.2 repository package expression;
- *(calculogic-validator#153)* the accepted records of the Naming lexical-identity section, from `treeLexicalIdentityIntake` through the Tree lexical-identity evidence module (S1.1, S1.2), only when the section is `available`, and only for S3.2 positional lineage expression.

Stage 3 never reinterprets Naming material:
- It never tokenizes, stems, singularizes or derives families.
- It reads N1 token sequences as Naming supplies them.
- A lexical relationship Naming does not supply (for example between `rule` and `rules`) is not assumed and not approximated. Its absence is recorded (S3.10).
- Since calculogic-validator#153, the lexical-identity section is the one supplied source of such a relationship. Stage 3 reads only the foundation's relation between two accepted resolutions (foundation contract §6.2), never a surface string.

Naming supplies semantic evidence; Tree decides what structural reading it supports. Stage 3 owns:
- candidate discovery;
- relationships between candidates;
- member sets;
- assessment, outcomes;
- any future advisory finding.

#### S3.2 Terms

- **Directory:** a folder occurrence in the addressed snapshot.
- **Member:** a file occurrence directly inside a directory with an evaluated semantic identity. Files without one are not members; they are counted as coverage (S3.5).
- **Lineage-expressed prefix:** the leading N1 tokens of a member that folders on its relevant lineage (S2.8) already express, by **positional lineage expression** (below).
- **Residual tokens:** a member's N1 tokens after its lineage-expressed prefix. This is a positional reading of Naming's sequence, not re-tokenization.

**Positional lineage expression** (calculogic-validator#142; implemented by calculogic-validator#144; S3.9 cases E16 and E17). A folder's concept is already represented in a member's name only through an established structural relationship, never because a matching token appears somewhere in the name. The lineage-expressed prefix is the end position `p` reached by walking the member's relevant lineage from its outermost folder to the member's own directory, starting at `p = 0`:
- At each folder, the end position becomes the furthest of:
  - the current `p`;
  - the end of a Stage 1 match at the first token, as before this amendment: a prefix match expresses the folder's label tokens, and a root match the first token;
  - `p` plus the folder's label length, when the folder's parsed Naming label tokens equal, **in full and in order**, the member's N1 tokens at positions `p` onward.
- A folder whose label does not continue at `p` expresses nothing and leaves `p` unchanged. A structural folder such as `src` is passed over; it does not break the walk.

The walk keeps expression grounded:
- **Structural relationship.** Only folders on the member's relevant lineage take part: its containing folders, up to the first terminating folder (S2.8).
- **Order and contiguity.** A folder continues expression only at the position its outer lineage reached. A label that equals tokens later in the name, after a position no lineage folder expressed, expresses nothing. For example, `src/core/cli` does not express the `cli` of `validator-cli-*`, because nothing expresses `validator`. That is the S3.10 limitation on relationships away from leading tokens, unchanged.
- **Exact Naming evidence.** The comparison is equality of Naming-supplied tokens: the folder's parsed label tokens (S1.1, N2) against the member's N1 tokens, the same operation as the Stage 1 prefix comparison (S1.5) at another position. A folder whose label is not parsed expresses nothing. No token is transformed, and a partial label never expresses (S3.10).
- **Each folder expresses at most once.**

**Lexical-label expression** (calculogic-validator#153; implemented by its implementation slice; lexical companions E10-L, E10.1-L and E11-L, S3.9). When the run's lexical-identity section is `available` (S1.3), each lineage folder can reach a third end beside the two above:
- **A new basis, `lexical-label`.** The folder's parsed label tokens `L` (length `k`) are aligned with the member's tokens at `p` onward, with `p + k` within the member's tokens. The folder reaches `p + k` on `lexical-label` when every aligned position is either exactly equal, or `same-lexeme` under the foundation's relation (foundation contract §6.2), and at least one position is `same-lexeme`.
- **The grounding rules are unchanged.** Only folders on the relevant lineage, the same order and contiguity, each folder at most once, and a partial label never expresses. `same-lexeme` at a position other than `p` onward expresses nothing.
- **Exact evidence keeps precedence.**
  - A position that is exactly equal is never compared lexically.
  - A folder whose label is exactly equal at `p` reaches its end on `positional-label`, as before, and the foundation is not consulted for it.
  - When two bases reach the same end, the step keeps the earlier basis in this order: Stage 1 (`stage-1-root`, `stage-1-prefix`), `positional-label`, `lexical-label`.
- **What lexical expression changes:** only where a member's lineage-expressed prefix ends, and so its residual tokens, the shared residual prefixes discovered (S3.3), and what assessment reads from them. It never changes a Stage 1 comparison, a Stage 2 placement, a claim, the correspondence test (S3.5 compares claim tokens with the shared prefix by exact equality) or any finding.

**Relation outcomes, per folder.** Lexical comparison applies to a folder only when its label is parsed, aligned positions exist (`p + k` within the member's tokens), at least one aligned position is not exactly equal, and `p + k` is beyond the end the folder already reaches on a Stage 1 basis. The non-exact positions decide:

| Non-exact aligned positions | Expression | Recorded (S3.7) |
|---|---|---|
| every one `same-lexeme` | `lexical-label` | a `lexical-label` step, with each position's surfaces, relation and lexeme identifiers |
| any one `different-lexemes` | none | nothing: the folder cannot continue whatever the other positions say |
| otherwise, any one `undetermined` (an `unknown` token, or a record unavailable for either occurrence) | none, and never negative evidence (foundation contract §6.1, §9.1) | one **undetermined** unit |
| otherwise (one or more `possibly-same-lexeme`, the rest `same-lexeme`) | none (D5 resolved this way; foundation contract §12) | one **possible** unit, and a `possibleLexicalExpression` note on the member naming the folder, the positions it would have expressed and each position's relation |

- **The unit of accounting is one (member, lineage folder) pair** at which the table above applies. It is evaluated once, because each folder is visited once.
- **No other comparison is counted:**
  - not exact positions;
  - not folders whose label is exactly equal, not parsed, or longer than the remaining tokens;
  - not folders off the relevant lineage, and not a folder whose label could only reach an end some other basis already reaches;
  - not tokens away from `p`, and no repeat of a pair.
- A possible expression is never a step. It never moves `p` and never changes a residual. Like S3.5's claim-relative uncertainty, it is recorded uncertainty, not evidence.
- **Without an `available` section** (absent, unsupported or invalid), no lexical comparison is made, nothing is counted, and expression is exactly as before this amendment.

Example (E10-L, `naming/src/rules`, English v1). `naming/` expresses `naming` (Stage 1 root). `src/` is aligned with `rule` at position 1: `src` is `unknown`, so it records one undetermined unit and expresses nothing. `rules/` is aligned with `rule` at position 1 and is `same-lexeme` (`english.rule`), so it expresses position 1 on `lexical-label`. The residuals of the three `naming-rule-check-*` members begin with `check`.

**Repository package expression** (Contract, calculogic-validator#157; Current, calculogic-validator#159; S3.9 cases E18–E21). A target's root manifest may declare the package the repository root *is*, for example `@calculogic/validator`. Every file is contained in the repository root, so that containment is an established structural relationship, and the manifest declares its label. The declared identity therefore takes part in positional lineage expression the way a folder label does, one level further out:
- **The elements.** The declared package identity contributes at most two **package elements**, in this order: the scope, when declared, then the name.
  - Each element's label tokens are Naming's interpretation of that segment, exactly as Naming interprets a folder label (bridge contract §4.8).
  - A segment Naming does not parse contributes no element.
  - The raw identity is a neutral suite-core fact (capability inventory §3.11), and Tree never tokenizes it.
- **Where they apply.** The package elements are the **outermost** lineage elements. They are walked before the relevant lineage, starting at `p = 0`:
  - An element continues expression at `p` only when its label tokens equal the member's tokens at `p` onward, **exactly, in full and in order**. A partial label never expresses.
  - An element that does not continue expresses nothing and is passed over, like a structural folder. Each element expresses at most once.
  - The basis is `repository-package`. The step records the element (`scope` or `name`) and the declared segment.
- **What never happens.**
  - A package element never applies after a lineage folder, or at any position other than the one the walk has reached. A token that matches the package name anywhere else in a name is untouched (E21).
  - Recognising a concept is not expressing it. Naming may treat `validator` as a family root; only this structural relationship, at the leading position, expresses it.
  - There is no lexical comparison for package elements: the lexical-identity section has no record for them. Stage 1, Stage 2, correspondence (S3.5) and findings are unchanged.
- **Absence.** Without a declared identity, or with a manifest that is absent, unreadable, malformed or declares no usable name, there are no package elements, and the walk is exactly as before this amendment.

Example (E18, `src/core/cli`, `@calculogic/validator`):
- The scope `calculogic` does not continue at position 0 for `validator-cli-runner`, so it expresses nothing.
- The name `validator` continues at 0 (`repository-package`).
- `src/` and `core/` express nothing, and `cli/` continues at 1 (`positional-label`).
- The residual is `runner`.

**Implementation acceptance** (met by calculogic-validator#159; `tree/test/tree-repository-package-expression-contract.test.mjs` checks the runtime against the test-only reference walk, and the PR records the measurements):
- E18, E19 and E20 become base cases, and the runtime reproduces their declared outcomes.
- The four opportunities measured at `9fe8bb1` are each shown before and after, individually: `bin` `calculogic-validate` and `calculogic-validator`, `src/core` `validator-report`, and `src/core/cli` `validator-cli`. Any outcome that differs from the measured prototype (74 → 66 candidates, 5 → 1 opportunities at `repo` scope) is investigated and explained, not adopted silently.
- `tree/src` `semantic-home` (E1) stays an `opportunity`, and the `naming/src` `validator` negative and E21 stay unchanged. Every other case's declared candidates are unchanged with the package declared; outside a case's declared directory a member may gain an expressed token (for example E8's undeclared `doc/specs/tree-owned`, whose `validator` and `validator-tree` become `tree`).
- Without an identity fact, or with the bridge section absent or invalid, Tree's output is byte-identical to the output before the implementation.

**Provenance.** Each member records how its lineage-expressed prefix was reached: for each folder that extended it, the folder, the positions expressed, and the basis (`stage-1-root`, `stage-1-prefix`, `positional-label`, or, since calculogic-validator#153, `lexical-label` with its relation evidence; since calculogic-validator#159, also `repository-package`, with the element and segment instead of a folder or occurrence). Each member also records its **leading tokens** for the grouping: its lineage-expressed tokens followed by the shared prefix. A candidate's record keeps its shared residual prefix as its identifier and, as the evidence that prefix was derived from, **every distinct leading-token sequence among its members**. Members of one directory can reach different lineage-expressed prefixes (E16: `naming-cli` for the `cli` members, `naming` for `naming-report-builder`), so a common residual prefix does not imply one shared sequence, and none is forced. The sequences are explanatory evidence, not an identity: the prefix remains the identifier.
- When positional expression changes a candidate's prefix (E17: `health-check` becomes `check`), it is a different evidence-derived identifier.
- Whether two identifiers name the same candidate across a change of derivation is **not decided**. One possible rule is equal leading tokens over the same members, which `health-check` and `check` share. It is recorded as unresolved, not applied.

Example (E16, `naming/src/cli`): `naming/` expresses `naming` (Stage 1 root match). `src/` expresses nothing. `cli/` continues at position 1 for `naming-cli-args`, `naming-cli-runner` and `naming-cli-usage`, whose residuals become `args`, `runner` and `usage`. `naming-report-builder` keeps the residual `report-builder`. No residual prefix is shared, so no candidate is discovered.
- **Shared residual prefix:** a leading sequence of residual tokens common to several members of one directory. Its length is its **lexical specificity**.
- **Primary unit:** a distinct `semanticName` among members in a primary responsibility class (S3.5).
- **Grouping candidate:** a directory, a shared residual prefix, the discovery method, and the members that carry the prefix.

#### S3.3 Candidate discovery (prefix-based, V0)

**Prefix-based discovery V0 is Tree's first discovery method, not its definition of a semantic grouping.**
- It finds only relationships expressed by shared leading residual tokens. Relationships expressed elsewhere in a name are not discovered (S3.10).
- Later methods may use Naming-provided relationship evidence without changing Tree's ownership. Each is added by amendment, and every candidate records the method that discovered it.

**Discovery and assessment are separate steps.**
- **Discovery** finds possible groupings from the available evidence, however weak.
- **Assessment** (S3.5, S3.6) decides whether a grouping supports a recommendation.

Discovery applies no evidence-quality or threshold filter. For each directory it forms one candidate for every shared residual prefix, at every specificity, carried by **at least two member files**. Two files is the structural minimum for a group to exist, not an evidence threshold. Responsibility units are counted only in assessment (S3.5), so a single name with several files (E5) is discovered and assessed, not filtered out.

**Every discovered candidate is preserved.** None is discarded because it overlaps another or because it is weak. Its assessment outcome records why it is not recommended.

#### S3.4 Relationships between candidates

For each pair of candidates in one directory, exactly one relation is recorded:

| Relation | Condition |
|---|---|
| `nested-subgroup` | One candidate's prefix extends the other's, and its members are a proper subset of the other's. |
| `redundant` | Both have the same members. |
| `competing` | They share members, but neither is nested in the other. |
| `disjoint` | No shared members. |

Under V0 prefix discovery `competing` cannot arise: a member's residual has one leading sequence, so two prefixes that do not extend one another share no members. The relation exists for later discovery methods.

A nested subgroup does not cancel its parent; both are assessed. Selecting an actionable boundary among related candidates happens only in S3.6.

#### S3.5 Assessment

##### Existing structure and correspondence

**Correspondence is decided from prepared evidence, never from folder-name strings.** An existing folder's candidate *corresponds* to a grouping when both hold:
- the members' Stage 2 placements record that candidate as consulted with relation `match`;
- the candidate's claim tokens equal the grouping's shared prefix.

A claim that is a proper leading part of the shared prefix is **broader**. Any other claim is **different**. `possible-root-reading` and `possible-unevaluated` relations never *establish* correspondence.

**Possible correspondence** (calculogic-validator#138). A relation that is not a `match` but puts forward a claim equal to the grouping's leading tokens makes the candidate **possibly corresponding** (claim-relative uncertainty, below). For example, a `possible-root-reading` to a `claim-unresolved` candidate whose root reading is that claim.
- Possible correspondence never establishes correspondence: it never makes the folder the grouping's home, and never yields `explained-by-existing-structure`.
- It is uncertainty about existing structure, so the table below treats it as a corresponding folder whose candidate is undetermined.
- Only an undetermined candidate can be possibly corresponding. Stage 2 records `possible-root-reading` only for a `claim-unresolved` candidate (S2.8), and `possible-unevaluated` puts forward no claim.

| Semantic Home evidence | Effect |
|---|---|
| A supported home is an ancestor of the candidate's directory | **Compatible.** A Semantic Home explains ownership of the larger area, not its internal decomposition. |
| The candidate's directory is itself a supported home | Internal subdivision. The home relationship is recorded as supported and the candidate as discovered. **Recommendation is deferred** in this version (`insufficient-evidence`, `internal-boundary-deferred`). |
| A supported home elsewhere corresponds to the grouping | The existing home is the destination: **`explained-by-existing-structure`**. Every member matching that claim matches the home, so this is decided for the group. |
| A supported home elsewhere with a broader claim | Recorded. Not decisive. |
| A corresponding, or possibly corresponding, folder whose candidate is undetermined | **`insufficient-evidence`** (`corresponding-home-unresolved`). It is neither treated as the home nor ignored. |
| An unrelated or broader undetermined folder | Does not block assessment. Noted (`related-folder-undetermined`). |
| No supported home | Neither establishes nor rules out an opportunity. |

##### Member sets

Each candidate keeps its full discovered membership and partitions it into three sets:

| Set | Condition | Explanation recorded |
|---|---|---|
| **supported** | placement `inside-home` at an ancestor, `no-home`, or `home-elsewhere` only at broader homes; primary or supporting responsibility class | — |
| **conflicting** | `home-elsewhere` at a supported home with a **different** claim | *positive evidence of another destination*: the home's identity and claim |
| **unresolved** | `undetermined` placement, unless every candidate it consulted puts forward a broader claim (claim-relative uncertainty, below), or unresolved responsibility class | *insufficient evidence for a decision*: the undetermined placement reason, the candidate that could be another destination, or the missing role evidence |

Conflicting and unresolved members are both excluded from any suggested boundary. Their explanations stay distinct: a conflicting member belongs somewhere else, while an unresolved member is undecided.

**Claim-relative uncertainty** (calculogic-validator#138; implemented by #140). A member's placement may consult candidates that do not settle it:
- an `undetermined` candidate, through any relation;
- any candidate through a `possible-*` relation (S2.8).

Each such candidate is judged by **the claim its relation puts forward**, compared with the member's leading tokens for the grouping (its lineage-expressed tokens followed by the shared prefix, as for correspondence above):
- A relation puts forward a claim when it compares the file with one reading of the candidate's claim:
  - `match` puts forward the candidate's governing claim;
  - `possible-root-reading` puts forward its root reading's claim, the candidate's lexical root.
- A relation that compared nothing (`possible-unevaluated`) puts forward no claim.
- A future Stage 2 relation type states which claim, if any, it puts forward. The table below then applies to it unchanged; no relation label has a rule of its own.

| Claim put forward, compared with the grouping | Effect |
|---|---|
| **corresponds** | For a `match`, the candidate corresponds; for any other relation it *possibly* corresponds (above). Either way the grouping is `insufficient-evidence` (`corresponding-home-unresolved`), as in the existing-structure table above, and the member is unresolved |
| **broader** | Contextual evidence, retained on the record (`related-folder-undetermined`). It does not by itself make the member unresolved: the candidate would own a larger area, which says nothing about the relationships inside the directory |
| **different** | The member is unresolved: the candidate is a possible other destination (as E15) |
| **none** | The member is unresolved: the comparison that would decide it is missing |

- **Location does not change the rule.** An undetermined ancestor is one case of it: its claim is a leading part of the member's own tokens, so it is broader, or corresponding. This is the rule #135 stated for ancestors.
- **The rule decides only members whose placement is `undetermined`.** `inside-home`, `no-home` and `home-elsewhere` placements are decided by the member-set table. Correspondence is collected from every placement, whatever its state.
- A placement left undetermined for a run-wide reason (`candidate-discovery-incomplete`) leaves the member unresolved.
- **Membership itself is formed from Stage 1 comparisons** (S3.2), so no candidate's Stage 2 status changes which files are members.
- **Example (E10.1).** `naming-owned/` is undetermined (`claim-unresolved`): its root reading `naming` would be eligible, and its prefix reading `naming-owned` is not settled. Through `possible-root-reading` it puts forward `naming`. That is broader than `naming-rule-check`, so the `naming/src/rules` members stay supported, with the folder kept as context.

**Only the supported set may satisfy opportunity criteria.** Every dimension below is evaluated on the supported members alone:
- minimum units;
- specificity;
- responsibility diversity;
- separation value.

A conflicting or unresolved member never counts toward a minimum or toward cohesion. A candidate with two supported primary units and three unresolved members does not reach a minimum of three.

##### Dimensions

Each dimension records its evidence. None is a score, and they are never combined into one.

| Dimension | Evidence (supported members only) | Rule |
|---|---|---|
| Concentration | primary units and member files | the minimum primary units for `opportunity` is a provisional parameter (S3.8) |
| Lexical specificity | shared residual prefix length | an evidence-strength consideration, not an eligibility rule. In this version a one-word prefix reaches no `opportunity` (`low-specificity`), as a provisional limit (S3.8) |
| Responsibility diversity | `semanticName`, `role`, `roleCategory` | members are classed *(provisional mapping, S3.8)* as **primary** (a contributing function, for example `concern-core`, `architecture-support`, `surface-system`, `data-model`, `indexing-registry`, and `documentation` for documentation groupings), **supporting** (for example `quality-support`) or **unresolved** (no role category). Primary units are counted separately from supporting files. **A role does not identify a responsibility:** a primary-unit count is evidence of diversity, not proof |
| Separation value | supported members as a share of the directory's members | a grouping covering the whole directory separates nothing inside it (S3.6) |
| Evidence quality | coverage (non-members in the directory), ambiguity flags | per Stage 2 D2, the family-boundary flag does not qualify token-sequence comparisons, so a shared residual prefix is full support. The flag is recorded, and no family- or subgroup-level conclusion counts flagged evidence |

**Partial-evidence aggregation (open; S3.8).** How large the conflicting or unresolved share may be before a candidate with a sufficient supported set becomes `insufficient-evidence` (`member-placement-unresolved`) is not decided. Both absolute support (independently supported primary units) and support proportion (the established share of membership) may matter. The catalogue fixes only that **one** conflicting or unresolved member in a group of five does not suppress a sufficient supported set (E14, E15).

Until the limits are decided, only that catalogue point is used. A candidate whose supported set is otherwise sufficient, and which has conflicting or unresolved members, proceeds only when it is at least as strong as E14/E15 on **both** measures: at least **four** supported primary units, and at most **one in five** of its member files outside the supported set. This assumes that more absolute support and a smaller unsupported share never weaken a candidate. Any other share leaves the assessment incomplete for `partial-evidence-aggregation` (S3.6).

#### S3.6 Outcomes

Each candidate receives exactly one outcome, with reasons from a closed vocabulary:

| Outcome | Meaning | Reasons |
|---|---|---|
| `opportunity` | The supported set positively supports that a new boundary would clarify the directory | the supporting dimensions |
| `insufficient-evidence` | The evidence does not justify an opportunity or its absence | `below-minimum-units`, `low-specificity`, `corresponding-home-unresolved`, `responsibility-evidence-insufficient`, `low-coverage`, `member-placement-unresolved`, `internal-boundary-deferred`, `competing-candidate-unresolved`, `whole-directory-value-undetermined` |
| `explained-by-existing-structure` | A supported home elsewhere corresponds to the grouping | the home's identity and claim |
| `not-an-opportunity` | **Affirmative evidence** shows that the specific boundary assessed would add nothing | `single-responsibility-unit`, `redundant-with` |

Rules:
- **`not-an-opportunity` needs an affirmative reason.** Failing a threshold, or not knowing whether a boundary adds value, is `insufficient-evidence`.
- **`single-responsibility-unit`** means the supported set contains exactly one primary unit, and every other supported member is in a supporting class. It does not claim that the supporting members belong to that unit, because Naming supplies no such relation. It is a structural assessment of the recognized members: they show one primary unit and no other, so on the observed evidence a boundary around them would separate nothing. It is not a statement that the grouping can hold no other responsibility. Its affirmative basis is the responsibility-class mapping, which is provisional (S3.8).
- **A grouping covering the whole directory** is `insufficient-evidence` (`whole-directory-value-undetermined`). A subfolder separates nothing, but the directory itself may deserve renaming or reshaping, which Stage 3 does not model.
- `insufficient-evidence` is never treated as `not-an-opportunity` and never produces a finding.
- **Selection.** When related candidates (S3.4) both reach `opportunity`, both are kept, and the record names the one selected as actionable, with its reason *(selection rule provisional, S3.8)*. While the rule is unresolved, neither yields an advisory finding, and both assessments are kept unchanged (S3.13.3, EL5).
- **The actionable membership of an `opportunity` is its supported set.** Conflicting and unresolved members stay on the record with their explanations.

##### Evidence evaluation and outcome resolution

Assessment has two operations:
- **Evidence evaluation** computes every dimension and every rule below independently, and records them all.
- **Outcome resolution** applies the order below to that evidence. The first rule that applies gives the outcome and its one **decisive reason**. `opportunity` carries its supporting dimensions instead.

A decisive rule never hides other evidence. For example, a candidate with low coverage and too few primary units is `insufficient-evidence` (`low-coverage`), and its record still shows the unit count.

Resolution order, with each step's provenance (*established*: a catalogue case where both rules apply fixes the order; *bounded choice*: no case does, so the order is a stated decision, not a finding):

1. **`existing-structure`**: `explained-by-existing-structure`, or `corresponding-home-unresolved` or `internal-boundary-deferred` (S3.5).
   - Before minimum units and partial evidence: established by E2 `structural-addressing`, whose members are unresolved.
   - Before specificity: established by E8 `tree`.
   - First overall: bounded choice. Positive evidence of existing structure answers the question before any property of the grouping does.
2. **`coverage`**: `low-coverage`. In a directory with unrecognized files, the candidate proceeds only when its conclusion is invariant under every admissible completion (below). Otherwise it needs the `coverage-share` decision (S3.8).
   - Before redundancy, whole directory and specificity: established by E12 (S3.9: "any candidate").
   - Before single responsibility: bounded choice. A grouping read from a mostly unrecognized directory is not assessed further.
3. **`single-responsibility`**: `single-responsibility-unit`.
   - Before minimum units and specificity: established by E5.
   - Before redundancy: established by E4 `semantic`.
   - Before whole directory: bounded choice. E4 and E5 exercise it only as built, since S3.9 does not fix their directories' other contents. Affirmative evidence is preferred to an undetermined value.
4. **`redundancy`**: `redundant-with`, for the less specific candidate of a `redundant` pair.
   - Before specificity: established by E2 `structural`, E7 `semantic`, E14 and E15 `semantic`.
   - Before minimum units and partial evidence: established by E2 `structural`, whose members are unresolved.
5. **`whole-directory`**: `whole-directory-value-undetermined`, measured on the supported set (S3.5).
   - Before specificity: established by E9 `date` and E10 `rule`.
6. **`specificity`**: `low-specificity`.
7. **`minimum-units`**: `below-minimum-units`.
   - Specificity before minimum units: bounded choice. No case is both one-word and below the minimum.
8. **`partial-evidence`**: `member-placement-unresolved` or `responsibility-evidence-insufficient`, by the kind of evidence missing.
   - Last before `opportunity`: from S3.5, where the tolerance question arises only for a supported set that is otherwise sufficient. A supported set that fails an earlier rule is decided by that rule.
   - Under the experimental policy the step either passes (the E14/E15 point) or leaves the assessment incomplete, so neither reason is reachable yet.
9. **`opportunity`**: every rule above passed.

`competing-candidate-unresolved` has no position: `competing` is unreachable under V0 (S3.4). It is placed when a discovery method can produce it.

**Assessment completion.** Each candidate's assessment is `complete` or `incomplete`. This is a status, not a fifth outcome.
- When a rule's evaluation needs a provisional decision (S3.8) that the policy in use leaves unresolved:
  - if an earlier rule already applies, the outcome stands and the assessment is `complete`;
  - otherwise the assessment is `incomplete`. It carries no outcome and names the unresolved decision.
- An unresolved decision that no rule on the candidate's path needs never blocks its outcome.
- An unresolved selection rule never removes an outcome: related opportunities are all kept, and the selection is recorded as unresolved.

##### Coverage: conclusion invariance under admissible completions

(calculogic-validator#138; implemented by #140.)

A global coverage share answers *how much information is missing*. The coverage step answers instead *whether the missing information could change this candidate's conclusion*.

**Unrecognized files and completions.**
- An **unrecognized file** is a file occurrence directly in the directory without an evaluated identity: a non-member (S3.2). `k` is their number in the directory.
- An **admissible completion** assigns each unrecognized file evidence it could have if it were recognized. Held fixed:
  - every other occurrence's Stage 1 and Stage 2 records;
  - every Stage 2 candidate outcome (Stage 3 never changes them, S3.1);
  - the policy.
- Relative to a candidate C, a completion makes each unrecognized file either:
  - **not a member of C**; or
  - **a member of C**, and possibly of any more specific candidate as well, in any member set, with any responsibility category and any unit identity, new or existing.
- Several files complete independently.

**What a completion can change for C** (`P` primary units, `O` member files outside the supported set and `n` member files, all under current evidence):

| Property | Range over every admissible completion |
|---|---|
| Primary units | `P` to `P + k`: each joining file adds at most one new unit |
| Member files outside the supported set | `O` to `O + k` |
| Member files | `n` to `n + k` |
| Responsibility classes | A joining file may carry any category, so an all-documentation supported set can become mixed, and any other set can gain a documentation member |
| Redundancy with a more specific candidate | If it holds, it can break: a file may carry C's prefix but not the partner's. If it does not hold, no completion creates it: an equal partner would need all of C's current members, and C has at least two (S3.3) |
| Covering the whole directory | If it holds, it can break: a file may stay outside C. If it does not hold, no completion creates it: a current member stays outside |
| Existing structure | Unchanged. Stage 2 outcomes are fixed, and any candidate that could correspond to C already relates to C's current members, so their placements already show it |
| Prefix length | Unchanged |

**Invariance test.** C's conclusion is invariant when every rule on its resolution path, up to and including the deciding one, applies alike across the whole range. Per rule:

| Rule | Applies alike over every completion when |
|---|---|
| `single-responsibility` | `P ≥ 2`, and no joining file can leave a responsibility class unresolved under the policy's mapping |
| `redundancy` | C is not redundant with a more specific candidate |
| `whole-directory` | C does not cover the whole directory |
| `specificity` | always |
| `minimum-units` | `P ≥` the minimum, or `P + k <` the minimum |
| `partial-evidence` | Either every completion passes (`P ≥ 4` and `5(O + k) ≤ n + k`), or every completion fails (`O > 0`, and `P + k < 4` or `5·O > n + k`), against the S3.5 point. With `O = 0`, the completion in which every file is absent leaves the step passing, so it cannot fail for every completion |
| `opportunity` | no further condition |

When the conclusion is not invariant, the record lists the rules whose application varies.

**Soundness, including several unrecognized files.**
- Each rule above depends on the changeable properties only through comparisons that move one way as a property grows. So the ends of each range decide the whole range: a condition that holds, or fails, at both ends holds, or fails, for every completion. That includes every mix of assignments over several files, because a mix only moves each property within its range.
- Responsibility categories and redundancy are not ordered quantities. The table treats them as variant whenever any completion can change them.
- This is a bound, not an enumeration of assignments. It is conservative: a range may include combinations that no completion realizes, so it may deny invariance where it holds, but it never asserts invariance where it fails. Where it cannot show invariance, the assessment stays `incomplete`.

**Rejected shortcut.** Three completions (files absent; joining C and its more specific partners; joining C alone, each time as unresolved members) do not bound the range. They miss:
- a joining file that is a new supported unit, which can change single responsibility, minimum units and partial evidence;
- a joining file with another category, which can make a grouping mixed.

E8.1 is the counterexample: the shortcut would conclude `opportunity` for `tree-known-roots`, but a joining file of another category leaves the grouping's classes unresolved under the experimental policy.

**Consequence under `emergent-boundary-experimental` v1.** v1 leaves documentation in a mixed grouping unresolved (S3.8). So with any unrecognized file in the directory, `single-responsibility` is not invariant for any candidate that reaches it, and the conclusion is decided only where existing structure decides first.
- E12, E8.1 and E22 stay policy-incomplete for `coverage-share`. The decision that binds them is the mapping's mixed-documentation case, and the variant rules record it.
- Invariance settles more once a policy resolves that case. No value is assumed here.

**Two sources of non-invariance (calculogic-validator#162).** The `single-responsibility` row varies whenever a joining file can leave a responsibility class unresolved. Today that is assumed for every candidate (`joiningFileCanLeaveClassUnresolved: true`), because a joining file may carry **any** category: (A) documentation in a mixed grouping, which the mapping leaves unresolved, and (B) a category the mapping does not cover, including one a Custom Naming set adds. Resolving A alone does not make E8.1, E12 or E22 invariant.

**Future rule (Contract, calculogic-validator#162; implementation-pending; not current behavior).** The role-category vocabulary intake is implemented (S1.1–S1.3); once a separately authorized slice adopts this rule, with `V` the `admissibleCategories` of a `usable` **v2** vocabulary (S1.3; bridge contract §4.9.1; a v1 vocabulary supplies no `V`, and an empty bound is `V = ∅`, not unavailability), `P` and `S` the mapping's primary and supporting categories, `D` = `documentation`, and `σ(C)` the candidate's supported members:

```
joiningFileCanLeaveClassUnresolved(C) =
  true                                      when no usable v2 vocabulary
  unmapped(V) or mixedReachable(C, V)       otherwise

unmapped(V)          = some c in V with c not in P, S or {D}
mixedReachable(C, V) = mixedDocumentationUnresolved and (
                           ( σ(C) all documentation and some c in V with c ≠ D )
                        or ( σ(C) has no documentation and D in V )
                       )
mixedDocumentationUnresolved = the documentation rule leaves mixed groupings unresolved
```

- It changes only the `single-responsibility` row; every other row keeps its own invariance test, and `P < 2` still varies by itself.
- It keeps the admissible-completion method: it bounds what a joining file could carry, never what an unrecognized file is.
- Without a usable v2 vocabulary it is exactly today's value. With the Builtin set and the experimental mapping it is still `true`, since `concern-style` and `integration-adapter` are admissible and unmapped. Covering them is a separate policy decision, and mixed documentation is another (calculogic-validator#162). `deprecated` is declared but not admissible, so under v2 it no longer counts, and it needs no responsibility class.

#### S3.7 Output

A prepared evidence record, `treeEmergentBoundaryReasoning`. It holds, per directory:
- its candidates and their discovery method, with each candidate's distinct leading-token sequences and each member's own leading tokens and lineage-expression provenance (S3.2);
- the candidate relations;
- the three member sets with their explanations;
- dimension evidence and outcomes, each with its assessment completion and the policy that produced it (S3.6, S3.8);
- the selected actionable candidates;
- coverage;
- the S3.10 limitations the run met.

**Lexical identity (Current, calculogic-validator#153).** Only when the run's lexical-identity section is `available` (S1.3) and Stage 3 is prepared, the record carries one more top-level block, `lexicalIdentity`:
- `lexicalProfile`: the section's provenance;
- `expressionUnits`: `{ lexical, possible, undetermined }`, the number of (member, lineage folder) units of each kind (S3.2), over every member in every directory.

Member records add a `lexical-label` step to `lineageExpression` and a `possibleLexicalExpression` note only when they have one.

**Repository package steps (Current, calculogic-validator#159).** A member's `lineageExpression` may begin with `repository-package` steps: `{ element, segment, basis, positions, tokens }`, with no `folder` or `folderPath`. No other field or block is added: without an accepted package element the record is byte-identical to the record before calculogic-validator#159, and the intake's state and diagnostics are not repeated here. Otherwise every field and key is exactly as before. **Without an `available` section the record is byte-identical to the record before this amendment:** there is no `lexicalIdentity` block, and the `limitations` keys are unchanged. Intake diagnostics stay in `treeLexicalIdentityIntake` (S1.2) and are not repeated here.

**The record emits no finding itself.** Its `recommendation` stays `not-authorized`. Since calculogic-validator#171 slice C, a separate contributor derives the one advisory finding, `TREE_EMERGENT_BOUNDARY_OPPORTUNITY`, from this record without changing it (S3.13.2–S3.13.5). No other finding reads the record.

#### S3.8 Parameters (all provisional)

None of the following is binding:
- the **minimum primary units** for `opportunity`. The catalogue is evaluated at **3**, as a testing value. Three is not a rule that three units justify a folder. It may be profile-aware (documentation versus implementation, by `roleCategory`), and it carries over to no other structural domain;
- whether, and how, independent supporting evidence lets a **one-word prefix** reach `opportunity`. This version makes no allowance; that is a limit, not a permanent rule;
- the **responsibility-class mapping** over Naming's role categories;
- the **separation-value** limit and the **coverage** share for `low-coverage`;
- the **partial-evidence aggregation** limits (absolute support and support proportion);
- the **selection rule** between related opportunities.

No value is adopted without catalogue evidence (as S2.10), and none compensates for an upstream evidence gap (S2.15). Adopted values become Tree registry data through the registry migration sequence.

**Adopted policy (current behavior since calculogic-validator#171 slice B).** S3.13.1 lists the approved values, and S3.13.6 how the adopted policy is supplied and told apart from an experimental one. Every validation run evaluates Stage 3 under the adopted policy from its resolved Tree registry `tree/emergent-boundary-policy`. Since slice C, the advisory finding reads the result, and only when EL1–EL5 hold (S3.13.3).

**Experimental policy.** An **explicitly supplied, named experimental policy** decides in place of the adopted policy, as a programmatic override for testing (S3.13.6).
- Without either source (a direct call that supplies neither), candidates, relations, member sets, coverage and limitations are still prepared, and no outcome is.
- Each assessment records the policy's id and version, and the rule and value that decided it. The record states `policySource`: `adopted` or `experimental-override`.
- An experimental policy is not adopted policy, is never Tree registry data, and never makes a candidate finding-eligible.

The catalogue is evaluated under `emergent-boundary-experimental`, version `1`:

| Decision | Value in `emergent-boundary-experimental` v1 | Basis |
|---|---|---|
| `minimum-primary-units` | 3 | S3.9 testing value |
| `one-word-prefix` | no allowance: a one-word prefix is `low-specificity` | S3.9 testing value |
| `responsibility-class-mapping` | the S3.5 provisional mapping; `documentation` is primary in a grouping whose supported members are all `documentation`, and a mixed grouping's documentation members leave the decision unresolved | S3.5 |
| `separation-value-limit` | `whole-directory-only` | see below |
| `coverage-share` | unresolved: whether, and how far, a candidate whose conclusion is not invariant under admissible completions (S3.6) may still be decided | no catalogue case fixes it (E12, E8.1) |
| `partial-evidence-aggregation` | unresolved beyond the E14/E15 point | S3.5 |
| `opportunity-selection` | unresolved | no catalogue case decides it; E22 is the first with nested opportunities and decides no selection (S3.13.9) |

**`whole-directory-only`** means that a grouping whose supported set does not cover the whole directory has **separation potential**: it would separate some members from others.
- It does not establish that the separation is beneficial. For example, three files among twenty can be separated, but that alone does not justify a folder.
- It never produces `opportunity` by itself. It is one of the dimensions every `opportunity` needs, and not an adopted organizational-quality standard.
- Its basis is the catalogue's contrast: E9 and E10 `rule`, which cover the whole directory, against E1, E6, E7 and E8, which cover part of it.
- E14 and E15 inform partial-evidence tolerance, not this limit.

#### S3.9 Evidence catalogue

Catalogue `emergent-boundary-catalogue`, version `1`.
- **One case is one fixture.** Its candidates and their outcomes are nested within it.
- Each case records:
  - the prepared evidence;
  - the candidates discovery forms;
  - the relevant relations;
  - its **expected outcome**;
  - any missing evidence.
- Measured cases cite `calculogic-validator` at `667a151`, with Stage 2 evidence prepared as full runs prepare it.
- **Stage 3 is not implemented.** "Reasoning result" below means what the rules of this section would produce once implemented. It is **not** current runtime behavior.
- **Expected outcomes are provisional.** They are what the proposed evidence model concludes under the provisional values of S3.8 (minimum 3; no one-word allowance). They are catalogue expectations, **not mandatory recommendations**. In particular, the `opportunity` outcomes of E1 (`semantic-home/`) and E8 (`tree-known-roots/`) do not establish that those folders should be created. Each case's expectation may change when a provisional value or rule is adopted, and the change is recorded in this table first, with a catalogue version increase.
- **The expected outcome is what correct reasoning concludes, not what the proposed rules produce.** Where the two differ, the case is a **known discrepancy** (see E10).
  - Its expected outcome is never adjusted to match the reasoning.
  - In the executable catalogue, a known discrepancy is a distinctly marked **known-gap case**: it records both outcomes and its cause, and checks that the discrepancy is still exactly as recorded.
  - It does not fail the test suite, so unrelated Tree work is not blocked. When the cause is removed, the check fails until the case is reclassified as an ordinary case, so a fixed gap cannot go unnoticed.
  - It stays visible in the catalogue and blocks the finding decision (S3.11 step 5) under the conditions in which findings can be emitted (S3.13.4).
- **Any case may be implementation-pending** (defined under companion cases below): its expected outcome follows a contract amendment the runtime does not implement yet. E16 and E17 were reclassified when calculogic-validator#144 implemented S3.2, and the lexical-evidence companions E10-L, E10.1-L and E11-L (below) when the calculogic-validator#153 implementation slice implemented lexical-label expression. E18, E19 and E20 were pending in the contract slice (calculogic-validator#157) and were reclassified as ordinary cases when calculogic-validator#159 implemented repository package expression. No case is pending at present.
- **A case whose expected outcome needs a decision the experimental policy leaves unresolved is a policy-incomplete case** (see E12). It is not a known discrepancy:

  | | Known-gap case (E10) | Policy-incomplete case (E12) |
  |---|---|---|
  | Problem | the rules reach a known incorrect conclusion | a policy value is missing |
  | Status under the experimental policy | evaluated, with the known discrepancy | assessment `incomplete` (S3.6) |
  | Resolved by | correct upstream evidence, or a justified reasoning change | an adopted, or explicitly experimental, value for the decision |
  | Executable check | the discrepancy is still exactly as recorded | the assessment is incomplete for exactly the recorded decision |

  - Its expected outcome stays recorded. Incompleteness is an assessment-completion status, not a fifth outcome and not a defect.
  - When a policy supplies the decision, the check fails until the case is re-evaluated against that value and reclassified, and the result is recorded here.
  - **Outcomes at tested values (calculogic-validator#162; optional).** A policy-incomplete case may also record, per unresolved decision, what the runtime concludes when only that decision is resolved to each **tested value**. The tested values are declared once, test-only, beside the experimental policy fixture (`COVERAGE_SHARE_TEST_VALUES`: 0.1, 0.25, 0.5 for `coverage-share`). They name the variants the catalogue exercises, not values S3.8 permits or adopts. A case that records them records every tested value, and each entry is checked against the runtime. The record is evidence for the decision, never its expected outcome, which stays what correct reasoning concludes. E22 records them.

| Case | Tree | Expected outcome |
|---|---|---|
| E1 | `tree/src`: `tree-semantic-home-*`, 8 primary units of 28 members; supported home `tree/` is an ancestor | `semantic-home`: **`opportunity`**. `semantic` (9): `insufficient-evidence` (`low-specificity`). `semantic-home-reasoning` (2): `insufficient-evidence` (`below-minimum-units`) |
| E2 | `doc/ValidatorSpecs`: three `structural-addressing-*` specs; the `structural-addressing/` candidate matches them (`match`), claims `structural addressing`, and is undetermined (coverage 5/11) | `structural-addressing`: **`insufficient-evidence`** (`corresponding-home-unresolved`). `structural`: `not-an-opportunity` (`redundant-with`) |
| E3 | synthetic: five `registry-*` primary units | `registry`: `insufficient-evidence` (`low-specificity`) |
| E4 | synthetic: `semantic-home-report.logic` (`concern-core`, primary) and `semantic-home-test.fixture` (`quality-support`, supporting): two different names | `semantic-home`: **`not-an-opportunity`** (`single-responsibility-unit`). Two different names do not make two responsibilities: the supported set holds one primary unit and one supporting member. Depends on the provisional responsibility-class mapping (S3.8). Unrecognized files and coverage are E12's question |
| E5 | synthetic: `loader.logic`, `loader.test`, `loader.fixture` | **`not-an-opportunity`** (`single-responsibility-unit`) |
| E6 | synthetic: `registry-lifecycle-{loader,resolver,state}` plus `registry-{policy,report}` | `registry-lifecycle`: **`opportunity`**. `registry`: `insufficient-evidence` (`low-specificity`); relation `nested-subgroup` |
| E7 | `tree/src`: `tree-folder-*`, 5 units | `folder`: `insufficient-evidence` (`low-specificity`). The relation of `tree-folder-semantic-home-reasoning` to `semantic-home` is **not discovered** (S3.10) |
| E8 | `doc/ValidatorSpecs`: twelve `tree-*` specs, `home-elsewhere` at `tree/` (root claim `tree`, held by the B2 pairing); `tree-owned/` undetermined, with only `possible-root-reading` relations | `tree`: **`explained-by-existing-structure`** (`tree/`). `tree-known-roots` (8): **`opportunity`** (`tree/` is broader; `tree-owned/` does not correspond). `tree-known`: `not-an-opportunity` (`redundant-with`) |
| E9 | synthetic: `src/utils/` whose every member is `date-*` | `date`: `insufficient-evidence` (`whole-directory-value-undetermined`) |
| E10 | `naming/src/rules`: `naming-rule-check-*`, 3 primary units; `rules` is not related to `rule` by any prepared evidence; the members' placements are `home-on-lineage-undetermined` (`naming/`), which leaves them supported (S3.5, undetermined ancestors) | `rule` (8): `insufficient-evidence` (`whole-directory-value-undetermined`). `rule-check`: expected **`insufficient-evidence`** (`low-specificity`). **Known discrepancy (known-gap case):** the rules of this section would produce `opportunity`, because without the `rule`/`rules` relationship the folder's own concept stays in the residual and inflates specificity. The cause is the S3.10 singular/plural limit, owned by Naming or a shared Linguistic Foundation. The case stays a known-gap case until that cause is removed |
| E11 | plural folder names (`naming/src/rules`, `tree/src/registries`) | **Not discovered** (S3.10): groupings that would relate `rule` and `rules` are never formed. Measured effects: E10's discrepancy, and spurious whole-directory candidates |
| E12 | a directory whose members mostly lack a semantic identity | any candidate: `insufficient-evidence` (`low-coverage`). **Policy-incomplete case:** no catalogue case fixes the `coverage-share` decision (S3.8), so under the experimental policy the assessment is incomplete for that decision |
| E13 | E1 with every member flagged `family-boundary-heuristic` | as E1 (Stage 2 D2) |
| E14 | synthetic: an E1-like group of five, where one member is `home-elsewhere` at a supported home whose claim is **different** | **`opportunity`** on the supported set of four. One conflicting member is recorded with its home and excluded |
| E15 | synthetic: an E1-like group of five, where one member's placement is `undetermined` against a non-corresponding candidate | **`opportunity`** on the supported set of four. One unresolved member is recorded as undecided and excluded |
| E16 | `naming/src/cli` (measured at `d0fbdce`): `naming-cli-args`, `naming-cli-runner`, `naming-cli-usage`, `naming-report-builder`; `naming/` expresses `naming`, and the `cli` label equals the next token of three members (S3.2) | **No candidate is discovered**: `cli` is expressed by `cli/`, so no residual prefix is shared. Reclassified from implementation-pending when calculogic-validator#144 implemented S3.2 (before it, the runtime expressed only `naming` and discovered `cli`: `insufficient-evidence`, `low-specificity`) |
| E17 | `naming/src/health` (measured at `d0fbdce`): `naming-health-check` as a host and a logic file; `naming/` expresses `naming`, and the `health` label equals the next token of both (S3.2) | `check`: **`not-an-opportunity`** (`single-responsibility-unit`). `health` and `health-check` are not discovered; `check` is a different evidence-derived identifier from `health-check`, with the same leading tokens (S3.2). Reclassified from implementation-pending when calculogic-validator#144 implemented S3.2 (before it, the runtime discovered `health` and `health-check`, both `not-an-opportunity`, `single-responsibility-unit`) |
| E18 | `src/core/cli` (measured at `9fe8bb1`, calculogic-validator#157): `validator-cli-*` (7 units) and `validator-report-examples`, `validator-report-summary`; the target root manifest declares `@calculogic/validator`. No lineage folder expresses `validator`, so `cli/` cannot continue (S3.2 order rule) | `report` (2): **`insufficient-evidence`** (`low-specificity`). With repository package expression, `validator` is expressed by the declared name and `cli/` continues at position 1, so `validator`, `validator-cli` and `validator-report` are not discovered. **Before calculogic-validator#159** the runtime gave `validator`: `insufficient-evidence` (`whole-directory-value-undetermined`); `validator-cli`: `opportunity`; `validator-report`: `insufficient-evidence` (`below-minimum-units`) |
| E19 | `src/core` (measured at `9fe8bb1`, calculogic-validator#157): 22 members, 14 leading with `validator`; the same declared package | `candidate` (2 units): **`insufficient-evidence`** (`low-specificity`). `candidate-policy`: **`not-an-opportunity`** (`single-responsibility-unit`), nested in `candidate`. `registry`, `report` (4 files), `repository`: **`insufficient-evidence`** (`low-specificity`). `validator`, `validator-candidate`, `validator-candidate-policy` and `validator-report` are not discovered. **Before calculogic-validator#159** the runtime gave `validator`: `insufficient-evidence` (`low-specificity`); `validator-candidate`: `insufficient-evidence` (`below-minimum-units`); `validator-candidate-policy`: `not-an-opportunity`; `validator-report`: `opportunity`; `repository`: `insufficient-evidence` (`low-specificity`) |
| E20 | `bin` (measured at `9fe8bb1`, calculogic-validator#157): six entry-point hosts, `calculogic-validate`, `-validate-naming`, `-validate-tree`, `calculogic-validator-health`, `-registry`, `-report-summarize`; the same declared package | `validate` (3): **`insufficient-evidence`** (`low-specificity`). The declared scope expresses `calculogic` for all six, and the declared name `validator` where it follows; `calculogic`, `calculogic-validate` and `calculogic-validator` are not discovered. **Before calculogic-validator#159** the runtime gave `calculogic`: `insufficient-evidence` (`whole-directory-value-undetermined`); `calculogic-validate` and `calculogic-validator`: `opportunity` |
| E21 | synthetic, negative (calculogic-validator#157): `tree/src` with `tree-validator-alpha`, `-beta`, `-gamma` and two other `tree-*` units; the same declared package; `tree/` expresses `tree` | `validator` (3): **`insufficient-evidence`** (`low-specificity`). `validator` follows a folder-expressed token, so the package never expresses it: repository package expression applies only at position 0, before any lineage folder (S3.2). The outcome is the same with and without the declared package |
| E22 | `doc/ValidatorSpecs` (measured at `40f18fa`, calculogic-validator#162): E8's directory with the `retirement` subgroup E8 leaves out (five of the eight `tree-known-roots` specs), the three `structural-addressing-*` specs, two other specs and one unrecognized file (18 files, 17 members). Related to E8, not a companion: the subgroup changes five of E8's files. The first case with nested eligible candidates (`opportunity-selection`, S3.8); it decides no selection | `tree`: **`explained-by-existing-structure`** (`tree/`). `structural-addressing`: **`insufficient-evidence`** (`corresponding-home-unresolved`). `structural`, `tree-known`, `tree-known-roots`, `tree-known-roots-retirement`: `insufficient-evidence` (`low-coverage`), as E8.1. **Policy-incomplete case:** one unrecognized file could make any of these documentation groupings mixed, which the experimental policy leaves unresolved, so none is invariant (S3.6). **Outcomes at tested values:** at every tested `coverage-share` (0.1, 0.25, 0.5) `tree-known-roots` and `tree-known-roots-retirement` are both `opportunity`, nested (`nested-subgroup`); `tree-known` and `structural` are `not-an-opportunity` (`redundant-with`). No tested share reproduces the expected `low-coverage` (members ÷ files is 17/18), as for E8.1 (calculogic-validator#162) |

##### Evidence sufficiency and policy dependency (S3.11 step 3)

This record traces each expected outcome through the resolution order (S3.6) under `emergent-boundary-experimental` v1 (S3.8). For each case it gives:
- whether the case can be evaluated;
- the rule that decides each candidate;
- every provisional decision on the path to that rule;
- the limitation, if any, that blocks a justified conclusion.

A decision is depended on only where the path reaches it:
- `one-word-prefix`: only for a one-word prefix;
- `coverage-share`: only where the directory has non-members;
- `partial-evidence-aggregation`: only where members fall outside the supported set.

Outcomes decided by `existing-structure` rest on the Stage 2 preconditions the catalogue checks.

| Case | Status | Decisive rule per candidate | Decisions depended on | Limitation |
|---|---|---|---|---|
| E1 | evaluable | `semantic-home`: `opportunity`. `semantic`: `specificity`. `semantic-home-reasoning`: `minimum-units` | `minimum-primary-units`, `one-word-prefix`, `responsibility-class-mapping`, `separation-value-limit` | — |
| E2 | evaluable | `structural-addressing`: `existing-structure`. `structural`: `redundancy` | `responsibility-class-mapping` | none blocks the expected outcome. The undetermined `structural-addressing/` it records is an upstream coverage effect (S3.10) |
| E3 | evaluable | `registry`: `specificity` | `one-word-prefix`, `responsibility-class-mapping` | — |
| E4 | evaluable | `semantic-home`, `semantic`: `single-responsibility` | `responsibility-class-mapping` | — |
| E5 | evaluable | `loader`: `single-responsibility` | `responsibility-class-mapping` | — |
| E6 | evaluable | `registry-lifecycle`: `opportunity`. `registry`: `specificity` | `minimum-primary-units`, `one-word-prefix`, `responsibility-class-mapping`, `separation-value-limit` | — |
| E7 | evaluable | `folder`: `specificity`. `folder-semantic`: `minimum-units`. `semantic-home`: `opportunity`. `semantic`: `redundancy` | `minimum-primary-units`, `one-word-prefix`, `responsibility-class-mapping`, `separation-value-limit` | relationships away from leading tokens: a discovery limit that changes no listed outcome |
| E8 | evaluable | `tree`: `existing-structure`. `tree-known-roots`: `opportunity`. `tree-known`: `redundancy` | `minimum-primary-units`, `responsibility-class-mapping`, `separation-value-limit` | — |
| E9 | evaluable | `date`: `whole-directory` | `responsibility-class-mapping` | — |
| E10 | evaluable, known gap | `rule`: `whole-directory`. `rule-check`: expected `specificity`; the rules reach `opportunity` | `minimum-primary-units`, `responsibility-class-mapping`, `separation-value-limit` | singular/plural relationship (Naming): blocks the justified `rule-check` conclusion |
| E11 | evaluable | `registry`: `specificity` | `one-word-prefix`, `responsibility-class-mapping` | singular/plural relationship: a discovery limit that changes no listed outcome |
| E12 | policy-incomplete | `widget-panel`, `widget`: `coverage` | `coverage-share` | `coverage-share` is unresolved |
| E13 | evaluable | as E1 | `minimum-primary-units`, `one-word-prefix`, `responsibility-class-mapping`, `separation-value-limit` | — |
| E14 | evaluable | `semantic-home`: `opportunity`. `semantic`: `redundancy` | `minimum-primary-units`, `partial-evidence-aggregation`, `responsibility-class-mapping`, `separation-value-limit` | — |
| E15 | evaluable | `semantic-home`: `opportunity`. `semantic`: `redundancy` | `minimum-primary-units`, `partial-evidence-aggregation`, `responsibility-class-mapping`, `separation-value-limit` | — |
| E16 | evaluable | no candidate is discovered (S3.2) | — | — |
| E17 | evaluable | `check`: `single-responsibility` | `responsibility-class-mapping` | — |
| E18 | evaluable | `report`: `specificity` | `one-word-prefix`, `responsibility-class-mapping` | the unexpressed repository concept without the declared package; addressed by repository package expression (S3.2, calculogic-validator#159) |
| E19 | evaluable | `candidate`, `registry`, `report`, `repository`: `specificity`. `candidate-policy`: `single-responsibility` | `one-word-prefix`, `responsibility-class-mapping` | as E18 |
| E20 | evaluable | `validate`: `specificity` | `one-word-prefix`, `responsibility-class-mapping` | as E18 |
| E21 | evaluable | `validator`: `specificity` | `one-word-prefix`, `responsibility-class-mapping` | — |
| E22 | policy-incomplete | `tree`, `structural-addressing`: `existing-structure`. `structural`, `tree-known`, `tree-known-roots`, `tree-known-roots-retirement`: `coverage` | `coverage-share` | `coverage-share` is unresolved; what binds it is the mapping's mixed-documentation case (S3.6) |

Further observations:
- **Decisions no case depends on.**
  - `opportunity-selection`: no case decides two related opportunities under the experimental policy. E22 (calculogic-validator#162) is the first with nested eligible candidates: at every tested `coverage-share` both `tree-known-roots` and `tree-known-roots-retirement` are `opportunity`, related as `nested-subgroup`. The selection between them is undecided, and nothing recorded for E22 makes either boundary preferable (S3.13.9).
  - Documentation in a mixed grouping (`responsibility-class-mapping`): no case has one among its recognized members. Under coverage invariance (S3.6) it is the decision that binds E12, E8.1 and E22, since a joining file could make any of their groupings mixed.
- **Every expected `opportunity` depends on `separation-value-limit`.** Outcomes are reachable only because the experimental policy supplies it explicitly. Under a policy that leaves it unresolved, every one of them, E10's known gap included, would be incomplete.
- **Catalogue fidelity corrections (calculogic-validator#134).** These change no expected outcome:
  - E3 and E6 are built with unrelated siblings, so their groups no longer cover the whole directory, which would have made them E9's case;
  - E12's `widget` records the decisive reason this table states.

##### Companion cases: real-repository conditions (calculogic-validator#138)

A companion case reproduces, as a fixed tree, a condition measured on the real repository that its base case simplifies.
- It adds the measured condition and keeps the base case's intent.
- A base case and its expected outcome are never rewritten for it.
- It carries the classifications of S3.9 (known gap, policy-incomplete). It also carries one more:
  - **Implementation-pending:** the expected outcome follows a contract amendment that the runtime does not implement yet. The case records what the runtime produces today, and its check verifies exactly that, so the check fails once the runtime changes and the case is reclassified with the implementation.

| Case | Companion of | Tree | Expected outcome |
|---|---|---|---|
| E10.1 | E10 | E10, plus `doc/specs/naming-owned/` (measured: `doc/ValidatorSpecs/naming-owned/`): four `naming-*` specs, so the folder is undetermined (`claim-unresolved`) with an eligible root reading. Every `naming/src/rules` member consults it through `possible-root-reading` from elsewhere | As E10. `rule` (8): `insufficient-evidence` (`whole-directory-value-undetermined`). `rule-check`: expected `insufficient-evidence` (`low-specificity`). **Known discrepancy (known-gap case):** under S3.5's claim-relative uncertainty, the folder puts forward `naming`, which is broader, so the members are supported and the rules produce `opportunity`; the cause is E10's. Reclassified from implementation-pending when #140 implemented S3.5 |
| E8.1 | E8 | E8, plus one unrecognized file in `doc/specs` (measured: `filename-case-and-interpretation-contract.md`, `NAMING_MISSING_ROLE`) | `tree`: **`explained-by-existing-structure`** (`tree/`), decided before coverage. `tree-known-roots`, `tree-known`: `insufficient-evidence` (`low-coverage`). **Policy-incomplete case:** not invariant under admissible completions (S3.6). A joining file could make the documentation grouping mixed, which the experimental policy leaves unresolved, and for `tree-known` it could also break redundancy |

| Case | Status | Decisive rule per candidate | Decisions depended on | Limitation |
|---|---|---|---|---|
| E10.1 | evaluable, known gap | `rule`: `whole-directory`. `rule-check`: expected `specificity`; the rules reach `opportunity` | `minimum-primary-units`, `responsibility-class-mapping`, `separation-value-limit` | singular/plural relationship (Naming), as E10 |
| E8.1 | policy-incomplete | `tree`: `existing-structure`. `tree-known-roots`, `tree-known`: `coverage` | `coverage-share` | the unrecognized file's identity (Naming) |

##### Lexical-evidence companions (calculogic-validator#153)

A lexical-evidence companion runs a base case, or a companion, under one more **evidence condition**: an active language profile, so Naming's lexical-identity section is present (S1.2). Its tree is the base case's, unchanged.
- **The base case is never rewritten.** Without a profile it keeps its checks exactly, the E10 and E10.1 known gaps included.
- **The lexical companion states what correct reasoning concludes under the condition,** through the amended S3.2 (lexical-label expression). Its candidates may differ from the base case's, because the condition moves where members' lineage-expressed prefixes end.
- Each one was **implementation-pending** in the contract slice (calculogic-validator#154): its check verified the base case's result, which the runtime then produced with the section in the payload. **Reclassified as ordinary cases** by the #153 implementation slice, whose runtime reaches each expected outcome below; the expected outcomes are unchanged.
- `expressionUnits` are the S3.7 counts over the whole case tree. They come from the test-only reference of the amended walk, checked against today's runtime where the amendment changes nothing.

| Case | Extends | Condition and evidence | Expected outcome |
|---|---|---|---|
| E10-L | E10 | English v1. `rules/` and the members' `rule` are `same-lexeme` (`english.rule`), so `rules/` expresses position 1 on `lexical-label` for all eight members; lineage-expressed `naming-rule`. `expressionUnits`: lexical 8, possible 0, undetermined 24 | `check` (3): **`insufficient-evidence`** (`low-specificity`), leading tokens `naming-rule-check`. `rule` and `rule-check` are not discovered: `rule` is the folder's own concept, and `rule-check` is the same grouping as `check`, with equal leading tokens over the same members (D-T1, as E17). Ordinary case, no known gap. Before the implementation the runtime gave `rule`: `insufficient-evidence` (`whole-directory-value-undetermined`); `rule-check`: `opportunity` |
| E10.1-L | E10.1 | As E10-L, plus `naming-owned/`, whose tokens are `unknown`. `expressionUnits`: lexical 8, possible 0, undetermined 36 | As E10-L: `check` (3): **`insufficient-evidence`** (`low-specificity`). `naming-owned/` stays undetermined (`claim-unresolved`) and is consulted through `possible-root-reading`. Its claim `naming` is broader than the leading tokens `naming-rule-check`, so the members stay supported: structural evidence, unchanged by lexical identity. Before the implementation the runtime gave E10's result |
| E11-L | E11 | English v1. `registries/` and `registry` are `same-lexeme` (`english.registry`) for the five `tree-registry-*` members (position 1). `tree-structural-homes-registry` carries `registry` only as its final token, a kind-suffix member (S3.10), and is not expressed. `expressionUnits`: lexical 5, possible 0, undetermined 7 | **No candidate is discovered**: the residuals (`inventory`, `migrations`, `references`, `set`, `bridge-domains`, `structural-homes-registry`) share no prefix, as in E16. The kind-suffix relationship is not discovered (S3.10). Before the implementation the runtime gave `registry`: `insufficient-evidence` (`low-specificity`) |

| Case | Status | Decisive rule per candidate | Decisions depended on | Limitation |
|---|---|---|---|---|
| E10-L | evaluable | `check`: `specificity` | `one-word-prefix`, `responsibility-class-mapping` | — |
| E10.1-L | evaluable | `check`: `specificity` | `one-word-prefix`, `responsibility-class-mapping` | — |
| E11-L | evaluable | no candidate is discovered (S3.2) | — | kind-suffix grouping: a discovery limit that changes no listed outcome |

**Measured on the repository** (`ff004ed`, `repo` scope, experimental policy, English v1, through a throwaway prototype of the amended walk. Reproduced exactly by the implemented runtime on the #153 implementation slice's tree, which also records `expressionUnits` lexical 18, possible 0, undetermined 477):
- **Candidates:** 77 without the condition and 74 with it.
- **Every difference:**

  | Directory | Not discovered under the condition | Discovered only under it |
  |---|---|---|
  | `naming/src/rules` | `rule` (8, `whole-directory-value-undetermined`), `rule-check` (3, `opportunity`), `rule-derive` (2, `below-minimum-units`) | `check` (3, `low-specificity`), `derive` (2, `low-specificity`) |
  | `tree/src/registries` | `registry` (5, `low-specificity`) | — |
  | `naming/src/registries` | `registry` (5, `low-specificity`) | — |

- **18 members gain a `lexical-label` step**, all on single-token labels:
  - 8 in `naming/src/rules` (position 1);
  - 5 in `tree/src/registries` (position 1);
  - 5 in `naming/src/registries`: 4 at position 1, and `registry-state` at position 0, where its lineage expressed nothing.
- `rule-derive` becoming `derive` also changes the decisive rule, from `minimum-units` to `specificity`, by the S3.6 resolution order. No policy value is involved.

#### S3.10 Limitations: discovery coverage and assessment evidence

Two kinds of limitation are recorded separately, so a missing candidate is never mistaken for an assessed, inconclusive one:

| Limitation | Kind | Effect | Owner if pursued |
|---|---|---|---|
| Singular/plural lexical relationship | discovery coverage; inflates specificity | Without an active language profile, `rule` and `rules` never relate, and a folder's own concept stays in members' residuals (E10 known discrepancy; E11). With one, the lexical-identity section relates them for S3.2 expression (E10-L, E10.1-L, E11-L; calculogic-validator#153) | Naming and the Linguistic Foundation supply it (lexical identity contract: `linguistic-foundation-shared-contract.spec.md`; runtime and Naming production current since calculogic-validator#148 and #150); Tree consumes it (S3.2) |
| Kind-suffix grouping (calculogic-validator#153) | discovery coverage | Members carry the folder label's lexeme only as their **final** token: the folder groups by artifact kind, not by leading subject. Measured at `ff004ed`: 11 of 17 members of `tree/src/registries` (10 ending `registry`, 1 ending `registries`) and 7 of 12 of `naming/src/registries`. E11-L's `tree-structural-homes-registry`. It is not a lexical limitation (a `registry/` label would leave it unchanged), and S3.2's order and contiguity are not relaxed for it | a later discovery method, by amendment (S3.3); whether one should exist is deferred (D-T3) |
| Unexpressed repository concept (calculogic-validator#156, #157) | **addressed** for targets that declare a usable package identity (calculogic-validator#159); otherwise changes conclusions and inflates specificity | Members lead with the repository's own concept (`validator-…`, `calculogic-validate-…`). Before #159 no lineage element expressed it, so it stayed in the residual, inflated specificity and stopped a folder continuing after it (S3.2 order rule): at `9fe8bb1`, 17 of 74 candidates, including 4 of the 5 opportunities (#156; E18–E20). Since #159 the declared package identity expresses it at the leading position (S3.2 repository package expression). Re-measured at `9cfda81` (English v1, experimental policy; #156 reassessment): 16 of the 17 are no longer discovered, 8 re-derived candidates take their place, and 1 opportunity remains of 5. The 17th, `naming/src` `validator`, keeps `validator` by design: it follows the folder-expressed `naming`. **Still open:** a target with no usable declared identity (no manifest, no supported `name`, or a segment Naming does not parse) keeps the limitation | Tree, through repository package expression (S3.2), with the identity from suite core (capability inventory §3.11) and its interpretation from Naming (bridge contract §4.8). Nothing further is planned |
| Partially matched compound folder label (#156 reassessment) | assessment noise; restates the folder | A folder whose label has several tokens is expressed only by an exact, full match (S3.2), so members that share only the label's first token keep it, and a candidate is named after part of its own folder. Measured at `9cfda81`: 1 of 67 candidates, `doc/ValidatorSpecs/tree-owned` `tree` (members `validator-tree-*` after the package expresses `validator`), unresolved on `coverage-share` and `low-specificity` at every tested share. Not a reason to relax S3.2: a partial label never expresses | none planned; recorded so the candidate is not read as a structural finding |
| Relationships away from leading tokens | discovery coverage | a name related to a group through middle tokens is not a member (E7) | a later discovery method using Naming relationship evidence |
| Files without an evaluated identity | discovery coverage and assessment | not members; they lower coverage (E12). They also drive upstream Stage 2 coverage outcomes (E2: `*.test.mjs` files). At `9cfda81`: 185 files in folders (`*.test.mjs` 124, `.md` 33, registry JSON), which leave 11 of 67 candidates unresolved on `coverage-share` (#156 reassessment) | Naming coverage, or the `coverage-share` decision (S3.8) |
| Members without a role category | assessment | unresolved responsibility class | Naming role evidence |

**Tree does not work around a limitation.** In particular, Stage 3 never approximates a lexical relationship by comparing residual tokens with folder labels as strings. That would be stemming under another name.
- Positional lineage expression (S3.2) is not such an approximation. It compares Naming-supplied tokens for exact equality, as the Stage 1 prefix comparison does, and transforms nothing.
- `rules` and `rule` stay unrelated until Naming, or a shared Linguistic Foundation, supplies evidence relating them (E10, E11 unchanged).
- Lexical-label expression (S3.2, calculogic-validator#153) is not such an approximation either. It reads the foundation's relation between two resolutions that Naming supplied and Tree accepted, and compares no surface string. Without the section it changes nothing.

#### S3.11 Slicing and authorization

Each step needs its own authorization:
1. This contract (documentation only).
2. The S3.9 catalogue as executable fixtures, with expected outcomes as stated. Known discrepancies are known-gap cases (S3.9) with their cause; their expected outcomes are never rewritten to match the reasoning.
3. An evidence-sufficiency record for the fixtures: which cases current evidence decides, and which limitations block a justified conclusion (S3.9, Evidence sufficiency and policy dependency).
4. Prepared-evidence implementation (`treeEmergentBoundaryReasoning`), with findings byte-identical at `repo`, `validator` and `app` scope.
5. The advisory finding decision, with before/after tables, as Stage 2B did.
   - **It is blocked while the catalogue holds a known discrepancy that the reasoning cannot detect, under the conditions in which findings can be emitted** (S3.13.4). Without that scope, E10 and E10.1 would block it permanently.
   - A known discrepancy that remains reachable under finding-eligible conditions blocks step 5 until upstream evidence removes its cause and the case is reclassified as ordinary. A known-gap case confined to finding-ineligible conditions does not block step 5; its discrepancy and catalogue status remain recorded. Authorizing a finding cannot accept a known discrepancy in its place.
   - Until then, no outcome affected by a known discrepancy is reported as a confirmed opportunity.
   - **Profile-conditional removal (calculogic-validator#153, D-T2).** Lexical-label expression removes E10's cause only under an active language profile (E10-L). Without one, E10 and E10.1 stay known-gap cases. So implementing #153 does not by itself unblock this step. D-T2 settles it (calculogic-validator#171): an advisory finding requires an active language profile, so runs without one never emit, and E10 and E10.1 no longer block the step.

**Decisions recorded by calculogic-validator#153** (lexical-identity consumption):

| # | Decision | State |
|---|---|---|
| D-T1 | Candidate identity across a change of derivation (S3.2): E10-L's `check` and E10's `rule-check` have equal leading tokens over the same members | **Not decided.** As E17, the lexical companion records the new identifier and the equal leading tokens and members, and applies no identity rule |
| D-T2 | Whether an advisory finding (step 5) requires an active language profile, or how it treats runs without one | **Open.** at calculogic-validator#153, where step 5 stayed blocked. **Decided by calculogic-validator#171:** an advisory finding requires one (S3.13.4); implemented by slice C as EL2 (S3.13.3, S3.13.8) |
| D-T3 | Whether a kind-suffix discovery method should exist (S3.10) | **Deferred.** Recorded only; positional constraints are not relaxed for it |
| D5 (foundation contract §12) | Tree's treatment of `possibly-same-lexeme` | **Resolved:** no expression; recorded as a possible unit and a `possibleLexicalExpression` note (S3.2) |

#### S3.12 Non-goals

- Changing Stage 1 or Stage 2 evidence, outcomes or findings.
- Tree stemming, singularizing or any other lexical interpretation.
- Treating an opportunity as misplacement, or its absence as approval.
- Mutating files or reorganizing automatically.
- Requiring every related group to have its own folder.
- Restructurings other than a new folder.
- Recommending subdivisions inside a directory that is itself a supported home (deferred; S3.5).
- Any single strength score, or ranking across directories.

#### S3.13 First advisory finding (Contract, calculogic-validator#171; implemented by slices B and C. S3.13.9: Contract only, calculogic-validator#175)

This section is the contract for S3.11 step 5. It takes effect through two separately authorized slices: the adopted-policy registry and loader (S3.13.8, slice B), then findings derivation (slice C). **Both slices are implemented.** Slice B: the S3.13.1 values, S3.13.6 and the slice-B part of S3.13.7 are current behavior. Slice C: S3.13.2–S3.13.5 and the slice-C part of S3.13.7 are current behavior; the contributor derives findings from the prepared record and adds no Stage 3 reasoning.

**Still deferred after slice C** (each needs its own authorization): the S3.6 role-category vocabulary rule, M1 (mixed documentation), any class for `integration-adapter` or `concern-style`, any `opportunity-selection` rule (outer-only, inner-only or remainder-based; S3.13.9), any `coverage-share` or `partial-evidence-aggregation` value, a `one-word-prefix` allowance, a profile-aware `minimum-primary-units`, and findings without an active language profile. Candidates these decisions would affect stay excluded (incomplete or related), and are visible only as counts.

##### S3.13.1 Owner decisions (calculogic-validator#171)

| Decision | Approved | Deferred alternative (not adopted) |
|---|---|---|
| D-T2 | An advisory finding requires an active language profile (S3.13.4) | Findings without a profile |
| Incomplete candidates | Never yield a finding; their assessments are unchanged | A finding for an incomplete candidate under some `coverage-share` |
| Related complete opportunities | Neither yields a finding while `opportunity-selection` is unresolved; both assessments and their relation are kept | A selection rule: outer-only, inner-only or remainder-based, none adopted (S3.13.9). E22 shows nested opportunities with selection unresolved; it does not establish that the outer boundary is better |
| `minimum-primary-units` | 3, not profile-aware | A profile-aware value (documentation versus implementation) |
| `one-word-prefix` | `no-allowance` | An allowance, pending the review of the 20 measured one-word candidates |
| `separation-value-limit` | `whole-directory-only`, as a necessary condition only (S3.8) | A limit that measures beneficial separation |
| `responsibility-class-mapping` | The current assignment: primary `concern-core`, `architecture-support`, `surface-system`, `data-model`, `indexing-registry`; supporting `quality-support`; `documentation` primary only in an all-documentation grouping (M0) | M1 (mixed documentation), `concern-style` → supporting (preferred, not recorded), any class for `integration-adapter` |
| `coverage-share` | Stays unresolved | Any share; the S3.6 vocabulary rule |
| `partial-evidence-aggregation` | Stays unresolved beyond the S3.5 point | Any limit, after more catalogue cases |
| `opportunity-selection` | Stays unresolved | Any selection rule (above; S3.13.9) |

Categories outside the mapping (`concern-style`, `integration-adapter`) stay unmapped: a member in one of them leaves its candidate's primary-unit count unresolved, so the candidate is incomplete and never yields a finding. Adopting the mapping does not settle mixed documentation and does not classify any unmapped category.

##### S3.13.2 Ownership

| Layer | Owner | Responsibility |
|---|---|---|
| Stage 3 reasoning | `tree-emergent-boundary-reasoning.logic.mjs` (S3.1–S3.7) | Candidates, relations, member sets, dimension evidence, assessments, completion and `selection`. It is authoritative over assessments |
| Advisory eligibility | The findings contributor (below), from the prepared record only | Decides, per candidate, whether a finding is safe to report (S3.13.3). It never re-assesses, re-derives evidence or changes an outcome |
| Findings derivation | `tree/src/contributors/tree-emergent-boundary-opportunity-contributor.logic.mjs`, attached through the contributor assembly by its own wiring | Emits one `info` finding per eligible candidate (S3.13.5) |

The record is never modified by eligibility or derivation: it is identical with and without the contributor. The record's `recommendation: { status: 'not-authorized', reason: 'stage-3-evidence-only' }` keeps its meaning: the reasoning record itself recommends nothing. Findings are derived separately.

##### S3.13.3 Eligibility

A candidate yields an advisory finding **only when all five conditions hold**:

| # | Condition | Read from |
|---|---|---|
| EL1 | The run's Stage 3 assessment is `evaluated` under the **adopted** policy (S3.13.6) | `assessment.status`, `assessment.policySource` |
| EL2 | The run has an active language profile: the lexical-identity section is `available`, so the record carries `lexicalIdentity` (S3.7) | `lexicalIdentity` |
| EL3 | The candidate's assessment is `complete` | `assessment.completion` |
| EL4 | Its outcome is `opportunity` | `assessment.outcome` |
| EL5 | No related candidate is also a complete `opportunity` | `assessment.selection.status` is `not-needed` |

- **Every other candidate yields nothing.** No outcome other than `opportunity` produces a finding: `insufficient-evidence` (S3.6), `not-an-opportunity` and `explained-by-existing-structure` included. An absent finding is never a negative result (S3.12).
- **Exclusion erases no evidence.** An incomplete candidate keeps `unresolvedDecisions` and `blockedAt`. Related opportunities keep their outcomes, relation and `selection: { status: 'unresolved', relatedOpportunities }`. Nothing is rewritten as `not-an-opportunity`.
- **EL5 covers every relation except `disjoint`.** `redundant` pairs never both reach `opportunity` (the redundancy rule decides the less specific one), and `competing` is unreachable under V0 (S3.4). EL5 still applies to them.
- **Deterministic.** Eligibility reads only recorded fields. It adds no threshold and no heuristic.

##### S3.13.4 D-T2 and the S3.11 known-discrepancy block

- **Decision:** findings require an active language profile (EL2). A run without one prepares Stage 3 evidence and assessments as usual and emits no Stage 3 finding.
- **Scope of the S3.11 block:** step 5 is blocked while the catalogue holds a known discrepancy **under the conditions in which findings can be emitted**: a known-gap case whose lexical companion is also a known gap, or a known-gap case with no lexical companion.
  - Today the only known-gap cases are E10 and E10.1. Both lexical companions (E10-L, E10.1-L) are ordinary cases, so nothing blocks findings under EL2.
  - E10 and E10.1 stay known-gap cases, recorded as before. They describe runs without a profile, which never emit.
  - A future known-gap case that holds under an active profile blocks findings again, until it is resolved.
- **Consequence:** the profile is opt-in (`linguisticProfile` in the validator config). A consumer sees Stage 3 findings only after opting in.

##### S3.13.5 The finding

- **Code** `TREE_EMERGENT_BOUNDARY_OPPORTUNITY`, **severity** `info`, **classification** `advisory-structure`. The exit policy reacts only to `warn` findings, so exit codes are unchanged.
- **Path:** the directory's path (folder-scoped).
- **Message:** a fixed template: the directory holds a cohesive group of files sharing a leading name sequence, and a new folder for them may make the directory clearer; advisory only, not a misplacement.
- **Semantic identity:** one finding per eligible candidate, identified by `(directory identity tuple, discoveryMethod, prefix)`.
- **Details** `{ basis: 'emergent-boundary-opportunity', directory, candidate, members, evidence, decidedBy, policy, lexicalProfile, relatedCandidates }`:
  - `directory`: `{ identity, path }`, with `identity` the directory's occurrence identity tuple;
  - `candidate`: `{ discoveryMethod, prefix, leadingTokens }`;
  - `members`: the **supported set only**, each `{ occurrence, path, semanticName, roleCategory }`, sorted by `occurrenceAddress`. This is the actionable membership (S3.6);
  - `evidence`: `{ primaryUnitCount, supportingMemberFileCount, memberFileCount, directoryFileCount, directoryMemberCount, unrecognizedFileCount }`, copied from the record;
  - `decidedBy`: copied from the assessment;
  - `policy`: `{ policyId, policyVersion, registry: { registryId, version, source, digest } }` of the adopted policy;
  - `lexicalProfile`: copied from the record's `lexicalIdentity`;
  - `relatedCandidates`: each non-`disjoint` relation, `{ prefix, relation, completion, outcome }`, sorted by prefix. None is a complete opportunity (EL5).
- **Not included:** a folder name, moves or any other proposal. The prefix is evidence, not a recommended name (S3.12).
- **Ordering:** findings by the Tree rule (`path`, then `code`), then by `details.candidate.prefix` joined with `-`. Every list in `details` is sorted as stated.

##### S3.13.6 Policy sources

| Source | How it is supplied | `policyStatus` | Assessments | Finding-eligible (EL1) |
|---|---|---|---|---|
| **Adopted** | The run's resolved Tree registry `tree/emergent-boundary-policy` (Builtin or Custom; lifecycle §7–§8), read by a Tree loader | `adopted` | Yes | Yes |
| **Experimental override** | The wiring's programmatic `emergentBoundaryPolicy` argument (S3.8). No CLI flag or config reaches it | `experimental` | Yes, recorded as `experimental-override` | **Never** |
| **None** | No readable adopted policy and no override | — | No outcomes: `configuration-unavailable`, with its reason | No |

- **The loader distinguishes them by source and status together.** A registry payload whose `policyStatus` is not `adopted` is invalid. An override whose `policyStatus` is not `experimental` is invalid. Neither is ever converted into the other.
- **Precedence:** an override, when supplied, is used for assessments in place of the adopted policy. The record states `policySource: 'experimental-override'`, and no finding is emitted.
- **No fallback:** an absent or invalid adopted policy is never replaced by the experimental fixture or by Builtin values, outside the direct-library-call rule Tree's other loaders follow (lifecycle §14; as the Stage 2 parameter set).
- **Unresolved decisions are data:** the registry lists all seven decisions. The four approved decisions are `{ status: 'resolved', value }`; `coverage-share`, `partial-evidence-aggregation` and `opportunity-selection` are `{ status: 'unresolved' }`. The policy's identity is `emergent-boundary`, version `1`: distinct from `emergent-boundary-experimental`, so no record can confuse the two.
- **Custom sets:** a Custom set's copy is consumer policy, validated by the same value checks. Its findings report `source: custom` and its digest. The Builtin values are exactly the S3.13.1 approved values.
- **Lifecycle consequence:** a new Builtin registry is `registry-added`. An active Custom set that lacks it is blocked as incomplete until its owner inherits it (lifecycle §7.1 item 2, §8.2). Neither measured repository has a Custom set (both run `activeSet: builtin`).

##### S3.13.7 Report

- **Slice B (registry and loader):** the Tree entry's `meta.registryProvenance` lists `tree/emergent-boundary-policy`, and the resolved-set and registry digests change. Every finding is unchanged. The prepared Stage 3 record carries outcomes under the adopted policy in every run; the record is not part of the report.
- **Slice C (findings):** the new code may appear in `findings`, `counts` and `codeCounts`. The entry carries `meta.emergentBoundaryReasoning`: `{ status, reason?, policySource, policy?, lexicalProfileActive, eligibility, governedCodes }`.
  - `eligibility` is `{ eligible, notEligible: { incomplete, relatedOpportunity, otherOutcome } }`, counts over every candidate when EL1 and EL2 hold.
  - When EL1 or EL2 fails, `eligibility` is absent, and `reason` names the failing condition: `policy-not-adopted` or `language-profile-inactive`.
  - Exclusions stay visible as counts. They are never findings.
  - As implemented: `status` is `evaluated` or `not-evaluated`. `policySource` is the record's (`adopted`, `experimental-override`, or `null` when no policy was available). `policy` is `{ policyId, policyVersion, registry? }`, absent when no policy was available; `registry` appears only for the adopted policy. `lexicalProfileActive` is whether the record carries `lexicalIdentity`. `governedCodes` is `['TREE_EMERGENT_BOUNDARY_OPPORTUNITY']`. The summary is absent when Stage 3 was not prepared.

##### S3.13.8 Slices and acceptance tests

**Slice B: adopted-policy registry and loader.** Owner surfaces: `tree/src/registries/_builtin/emergent-boundary-policy.registry.json`, the Tree registry inventory, a Tree loader and converter (loader/converter/runtime ownership contract), and the Stage 3 policy intake in wiring. The experimental fixture stays test-only.

| # | Test |
|---|---|
| B-1 | The registry shape validates. It lists exactly the seven decisions; the four resolved values equal S3.13.1; the other three are `unresolved` |
| B-2 | For each decision resolved in both, the adopted value equals the `emergent-boundary-experimental` v1 value. The catalogue reproduces every expectation under the adopted policy, with the known-gap and policy-incomplete markers unchanged |
| B-3 | Source distinction: a registry payload with `policyStatus: experimental` is rejected; an override with `policyStatus: adopted` is rejected; an override is recorded as `experimental-override`; without one the record says `adopted` |
| B-4 | An absent or invalid adopted policy gives `configuration-unavailable` with its reason, never the experimental fixture |
| B-5 | Provenance: `meta.registryProvenance` lists the registry with its digest. An active Custom set without it is blocked as incomplete |
| B-6 | Every Tree finding is unchanged at `repo`, `validator` and `app` scope in both measured repositories. In this repository at `repo` scope, the Stage 3 outcome tallies equal the experimental-v1 measurements at `f708302`: without a profile, 2 opportunities, 11 incomplete (`coverage-share`), 57 other outcomes; with English, 1, 11 and 55 |

**Slice C: findings.** Owner surfaces: the contributor and its wiring, the contributor assembly, and the report's `meta.emergentBoundaryReasoning`.

| # | Test |
|---|---|
| C-1 | Eligibility: for each of EL1–EL5, negating only that condition yields no finding |
| C-2 | Exclusion erases nothing: the record is deep-equal before and after derivation; an incomplete candidate and a related pair of complete opportunities keep every recorded field |
| C-3 | D-T2: no profile, or a requested profile whose section is unavailable, yields no Stage 3 finding |
| C-4 | An experimental override yields no finding, even with a profile |
| C-5 | Known-gap guard: no catalogue known-gap case holds under an active profile (S3.13.4). Adding one fails the check |
| C-6 | Baseline, measured at `f708302` under the adopted values: this repository at `repo` scope with English gains **exactly one** finding, `TREE_EMERGENT_BOUNDARY_OPPORTUNITY` at `tree/src`, prefix `semantic-home`, 9 supported members, `primaryUnitCount` 8: the measured counterpart of catalogue case E1, whose expected outcome is `opportunity`. Without a profile, none. The React app: none. The 16 existing findings and every exit code are unchanged. `validator` and `app` scope are recorded in the before/after tables |
| C-7 | Determinism: two runs are identical, and the order follows S3.13.5 |
| C-8 | Ownership: the contributor reads only the prepared record and computes no assessment |

##### S3.13.9 Opportunity selection: evidence contract (Contract only, calculogic-validator#175)

**Status.** This subsection adopts no selection rule and changes no behavior. `opportunity-selection` stays `unresolved` in the adopted policy. EL5 is unchanged: while it is unresolved, related complete opportunities yield no finding, and their assessments, relation and `selection` record are kept. Stage 3 reasoning, the registry, findings and reports are unchanged.

**E22, evidence versus interpretation.**
- **What E22 records** (measured at `c1d8607` with `coverage-share` set to a tested value, the only way the pair becomes complete):
  - `tree-known-roots` and `tree-known-roots-retirement` are both complete `opportunity`, with the same four reasons, related as `nested-subgroup`.
  - 8 and 5 primary units, no supporting and no outside members, all `documentation`, prefix lengths 3 and 4.
  - The outer candidate's supported units outside the subgroup (its **remainder**) are 3.
- **What it establishes:** nested complete opportunities arise in a measured directory, and their selection is unresolved.
- **What it does not establish:** that the outer boundary is better. No recorded field distinguishes the two boundaries' quality. Reading the remainder's three specs as part of the same retirement work is domain interpretation, not recorded evidence. The catalogue expects `low-coverage` for both, and E22 decides no selection (S3.9).

**Candidate strategies (none adopted).** Each was evaluated on the shapes below at `c1d8607`.
- The shapes are synthetic structural trees assessed under the adopted policy with the catalogue builder. They are investigation evidence, not catalogue fixtures.
- The `semantic` shape was traced by the S3.6 resolution order, not executed, because the adopted policy permits no one-word allowance.

| Shape | Outer-only | Inner-only | Remainder-based (hypothesis) | Unresolved (current) |
|---|---|---|---|---|
| E22 shape: outer 8 units, subgroup 5, remainder 3 | the outer boundary; plausible | the subgroup; plausible, leaving three specs in place | the outer boundary, only if the threshold is at most 3; at the threshold, one renamed file flips it | neither reported |
| Inner-preferred: outer 5, subgroup 3, remainder 2 | a folder whose only addition is two unrelated units; weak | the subgroup; good | the subgroup | neither reported |
| Two subgroups of 3 under an outer of 6, remainder 0 | the outer boundary, which hides two coherent subgroups | both subgroups, which requires "every innermost" set semantics | both subgroups | none reported |
| Three-level chain: 9 ⊃ 6 ⊃ 3 | the outermost | the innermost (3), which drops the 6-unit middle level; harmful | undefined without a recursive definition | none reported |
| `tree/src`: `semantic` (9 units, one-word) ⊃ `semantic-home` (8), remainder 1, under a hypothetical one-word allowance | the one-word `semantic` replaces the current finding; harmful | `semantic-home` kept | `semantic-home` kept | the current finding is lost |

- **Neither fixed direction is adopted.** Each damages at least one shape: outer-only the inner-preferred and `semantic` shapes, inner-only the chain.
- **Remainder-based selection is a testable hypothesis, not an adopted principle or a committed direction.** As stated so far: select the outer candidate only when its supported units outside every nested opportunity reach a threshold; otherwise select the nested opportunities.
  - It reads only the recorded supported member sets. It adds no input, score or filename heuristic, and compares sets, not raw counts across candidates.
  - **Its threshold is a separate decision.** It does not inherit `minimum-primary-units`, whose meaning (enough primary units for a candidate) stays unchanged.
  - **Its limit:** a remainder's size does not show that the remainder is a cohesive responsibility deserving its own boundary. Members share the outer prefix and nothing more is recorded about them.
  - **Unresolved semantics:** chains (whether selection recurses, and whether a selected outer boundary also reports its subgroups) and several subgroups under one outer candidate.

**Policy-expansion regression guard.** Any proposed change to the adopted policy, the Stage 3 rules or eligibility that can make a candidate a complete `opportunity` must first be measured against the findings the current policy emits. This covers a `one-word-prefix` allowance, a `coverage-share` value, a mapping change and S3.6.
1. **Measure:** the before and after record every newly complete opportunity that is related to a currently eligible candidate, and every finding that would be removed, changed or newly suppressed by EL5, in both measured repositories and the catalogue.
2. **Preserve, or obtain approval:** an existing finding is kept, by a justified and adopted selection mechanism, or its removal or change is documented in the proposal and approved by the owner as part of that change.
3. **A test is not permission.** A passing test, or an updated expectation, never authorizes silently removing or changing an existing finding.
4. Until a selection rule is adopted, a change that would newly suppress an existing finding through EL5 is not adopted without that approval.

**Evidence required before any selection rule is adopted.** The catalogue (S3.9) must first hold cases for each structural situation below, with each expected outcome and selection stated:

| Required case | Structural evidence (synthetic, recorded fields) | Domain interpretation (stated separately, never inferred) |
|---|---|---|
| SE-1 inner-preferred | outer and subgroup both complete `opportunity`; remainder below any candidate threshold | why the remainder does not belong in the outer boundary |
| SE-2 outer-preferred | the same, with a remainder clearly above any candidate threshold, not at it | why the remainder belongs with the subgroup |
| SE-3 two coherent subgroups | two disjoint nested opportunities under one outer opportunity, with a small or empty remainder | whether one outer boundary or two subgroups is the better structure |
| SE-4 three-level chain | three nested complete opportunities | which level or levels should be reported |

- Every case states its structural evidence and its domain interpretation separately. An expected selection that rests only on interpretation is recorded as such, and cannot justify a rule by itself.
- E22 remains a measured case with selection unresolved. It is not counted as SE-2.
- The cases are added by calculogic-validator#175 slice S3 (below). Adopting a rule, its threshold, and its chain and multi-subgroup semantics is a later owner decision.

**Catalogue cases (calculogic-validator#175, slice S3).** SE-1 to SE-4 are executable synthetic fixtures, `selectionCases` in the Stage 3 catalogue. They are kept apart from the S3.9 cases and do not join their integrity checks.
- **What every case shows:** each case runs under both the adopted and the experimental policy, with the same results.
  - Every candidate is complete. There is no unrecognized file, so coverage plays no part.
  - Every member is supported and `concern-core`.
  - The one-word prefix is `not-an-opportunity` (`redundant-with`).
  - Every nested candidate is a complete `opportunity` with `selection: unresolved`.
  - With an active profile, EL5 counts them as related opportunities and no finding is emitted.
- **How the strategy columns are computed:** by a test-only reference that reads recorded outcomes, selection and supported members. It is not runtime behavior, and the catalogue builder has no selection logic.
- **The interpretation column is not checked against reasoning.**

| Case | Structural evidence (recorded) | Domain interpretation | Outer-only | Inner-only | Remainder-based | Recorded fields determine a boundary? |
|---|---|---|---|---|---|---|
| SE-1 | `cache-store` (5 units) ⊃ `cache-store-index` (3); remainder 2 | the index is one responsibility; `config` and `errors` do not justify the outer folder. Prefers the inner | `cache-store` | `cache-store-index` | outer only for a threshold of at most 2 | No |
| SE-2 | `report-render` (8) ⊃ `report-render-html` (3); remainder 5 | every unit is a format renderer; HTML is a sub-concern. Prefers the outer | `report-render` | `report-render-html` | outer only for a threshold of at most 5 | No |
| SE-3 | `pipeline-stage` (6) ⊃ `pipeline-stage-parse` (3) and `pipeline-stage-emit` (3), the two disjoint; remainder 0 | one folder with two subfolders, or two sibling folders; no preference | `pipeline-stage` | both subgroups | never the outer | No |
| SE-4 | `sync-engine` (9) ⊃ `sync-engine-journal` (6) ⊃ `sync-engine-journal-segment` (3); remainder 3 and 3, one per nesting step | which levels deserve folders is a design choice; no preference | `sync-engine` | `sync-engine-journal-segment` | not defined: a chain needs a recursive definition | No |

**What the cases establish.**
- **SE-1 and SE-2 differ only in counts.** Their records are otherwise alike: relations, outcomes, reasons, categories, prefix lengths, no supporting or unrecognized files.
  - Each fixed direction contradicts one of the two interpretations: outer-only goes against SE-1, inner-only against SE-2.
  - The remainder (2 against 5) is the only recorded difference. It separates them only for a threshold above 2 and at most 5, and that threshold is an undecided value with no evidence for any point in the range.
- **The interpretations rest on reading file names,** which the record does not carry. The preference in SE-1 and SE-2 is interpretation, not evidence.
- **SE-3 and SE-4 have no preferred reading.** No strategy can be checked against them. They record what each strategy would do, and that remainder-based selection is undefined for a chain.
- **Result:** existing recorded fields do not justify a deterministic selection rule. `opportunity-selection` stays unresolved and EL5 is unchanged. A rule would need evidence the record does not carry, such as whether the remainder is itself cohesive.

### Naming-bridge folder-kind interpretation + placement model (Status: Bounded modeling note)

Classification: Informative

Tree now carries a bounded, explicit folder-kind interpretation layer before placement derivation when consuming naming-bridge observations.

Folder-kind interpretation (bounded in this slice):

- `structural-folder`
  - structural surfaces and structural utility partitions (for example `src`, `test`, `doc`, `docs`, `scripts`, `tools`)
- `semantic-folder`
  - meaning-bearing folder segments interpreted as semantic roots or semantic subhomes
- `unspecified-folder`
  - segments currently unresolved by this bounded interpretation layer

Interpretation order in this slice:

1. classify folder segments by folder-kind
2. derive structural interpretation from structural folders
3. derive semantic interpretation from semantic folders + naming-owned bridge signals

This bounded tranche is intentionally limited to modeling and home-derivation refinement first. It does not intentionally broaden finding families/codes or redesign thresholds.

Tree consumes naming-owned signals and does not re-own naming semantics:

- naming remains source-of-truth for `familyRoot`, `semanticFamily`, and optional `familySubgroup`
- tree uses those naming-owned signals plus folder-kind interpretation to derive semantic placement

At minimum, the placement model distinguishes:

- folder-kind breakdown (structural/semantic/unspecified)
- structural segment chain/surface chain
- `structuralRoot`
- `structuralSurface`
- `structuralHome`
- `localStructuralHome`
- `semanticRoot`
- `semanticContainerIdentity`
- `semanticHome`
- `semanticSubhome`
- unresolved/unspecified segment context

On top of those placement fields, tree also records a bounded local placement-coherence classification so the local relationship between structural and semantic placement is explicit and inspectable.

Bounded local placement-coherence values in this tranche:

- `aligned-local-home`
- `structural-home-only`
- `semantic-home-only`
- `divergent-local-placement`
- `no-semantic-home`

Ownership and interpretation guardrails for this tranche:

- naming still owns `familyRoot`, `semanticFamily`, and optional `familySubgroup`
- tree consumes those naming-owned signals plus folder-kind/path interpretation to interpret semantic placement
- this tranche adds bounded folder-kind interpretation and placement modeling plus local structural-vs-semantic coherence classification only
- this tranche does not broaden finding behavior (no new finding families/codes and no intentional threshold/count/severity broadening)
- semantic placement values in this tranche are folder/subfolder-derived interpretations
  - `semanticContainerIdentity` resolves to a folder/subfolder home, not a filename path
  - `semanticHome` resolves to a folder/subfolder home, not a filename path
  - `semanticSubhome`, when present, resolves to a folder/subfolder home, not a filename path
  - filename-level semantic token hits may remain visible in alignment/explanation details, but do not become semantic home/container values

Examples of naming validity judgments that tree advisor must not duplicate:

- bad semantic case
- missing role
- deprecated role
- hyphen-role ambiguity

When usable naming-shaped metadata is unavailable, incomplete, or not yet wired into tree runtime in a bounded context, tree advisor should reduce confidence and/or recommend running naming validation rather than inventing naming-invalid findings inside tree output.

Bridge shape (prepared-input contract):

- `namingSemanticFamilyBridge.observations[]`
  - `path`
  - `semanticName`
  - `familyRoot`
  - `semanticFamily`
  - optional `familySubgroup`
  - optional `ambiguityFlags[]`
  - optional `splitFamilyFlags[]`

Tree consumes this normalized bridge payload only. Tree runtime must not parse filenames to recreate these fields.

### Family-scatter structural gating (Status: Historical; removed in Stage 2B-iv, S2.12)

Since Stage 2B-iv this section and the four that follow (broader-spread layer, local-first spine, shared-root lane routing, subgroup opportunity) are historical: the Naming semantic-family bridge contributor that implemented them is removed, and no current finding is decided by them. They record the former behavior.

Since Stage 2B-i, `TREE_FAMILY_SCATTERED` is decided from Semantic Home placement (S2.12), not by this gate. The local-first and broader-spread layers below were the shared interpretation spine for the remaining family codes until those codes were retired (Stage 2B-ii to 2B-iv); the text below records how scatter was gated before.

`TREE_FAMILY_SCATTERED` now applies a bounded tree-owned structural interpretation layer before emitting broader scatter:

- tree classifies each family observation by structural root/surface and naming-aligned semantic-container placement,
- semantic-container recognition is based on path alignment with naming-owned bridge evidence (`familyRoot`, `semanticFamily`, optional `familySubgroup`), not a hardcoded semantic-folder allowlist,
- tree evaluates family interpretation in explicit local-first order:
  1. structural placement,
  2. semantic placement,
  3. local placement coherence,
  4. local-first family interpretation lane selection,
  5. bounded broader-spread interpretation for families that survive local-first review,
  6. broad scatter eligibility only when both local and broader interpretation remain unresolved,
- family presence confined to one valid naming-aligned semantic container is treated as expected/container-local density/subgroup opportunity first (not immediate broad scatter),
- bounded allowed cross-container pairings are exempt from broad scatter by default (for example canonical docs authority lane with aligned owned runtime container pairing),
- broad scatter remains for family spread across unrelated structural homes/containers when no allowed pairing covers the spread.

Current bounded local-first family interpretation outcomes used for this gate:

- `expected-local-presence`
- `local-density-first`
- `local-subgroup-first`
- `local-divergence-needs-broader-review`
- `no-local-semantic-explanation`

Behavior boundary for this slice:

- no new findings/codes are introduced,
- this slice only refines when existing broad-scatter eligibility (`TREE_FAMILY_SCATTERED`) is allowed after local-first interpretation.

### Bounded broader-spread interpretation layer (Status: Historical; removed in Stage 2B-iv, S2.12)

Classification: Normative

After local-first interpretation, tree now applies a bounded broader-spread interpretation layer before final `TREE_FAMILY_SCATTERED` escalation.

Bounded scope for this layer:

- runs only when local-first interpretation is one of:
  - `local-divergence-needs-broader-review`
  - `no-local-semantic-explanation`
- reuses already-shipped bounded explainable spread rules (for example: same semantic container, allowed structural-root pairing, canonical docs authority/runtime pairing)
- remains deterministic and inspectable; no fuzzy or open-ended policy expansion

Bounded broader-spread interpretation outcomes:

- `allowed-broader-spread`
- `docs-runtime-paired-spread`
- `cross-concern-but-explainable`
- `unresolved-broader-spread`

Escalation intent:

- local-first local lanes remain the shared decision spine for local family outcomes,
- broader-spread interpretation is only a review layer for families that survive local-first checks,
- before Stage 2B-i, `TREE_FAMILY_SCATTERED` represented unresolved spread after both local and broader interpretation did not sufficiently explain placement; it is now decided from Semantic Home placement (S2.12).

### Shared local-first family interpretation spine for family outcomes (Status: Historical; removed in Stage 2B-iv, S2.12)

Classification: Normative

Current family-level tree outcomes now share one bounded local-first interpretation authority (`interpretFamilyLocalFirst`) before emitting family findings. Since Stage 2B-i, `TREE_FAMILY_SCATTERED` is not routed by this spine (S2.12); the routing notes for it below record its earlier behavior, and its suppression by the local lanes no longer applies. Since Stage 2B-ii, `TREE_OBSERVED_FAMILY_CLUSTER` is retired (S2.12): `local-density-first` is still classified, unchanged, but no longer emits a finding of its own, and no remaining finding distinguishes it from `expected-local-presence`. Since Stage 2B-iii, `TREE_FAMILY_SUBGROUP_OPPORTUNITY` is retired as well: `local-subgroup-first` is still classified, unchanged and first, but no longer emits a finding, so only the two divergence lanes can affect a finding.

The shared local-first interpretation spine routes existing family findings as follows:

- `expected-local-presence`
  - suppresses broad scatter (`TREE_FAMILY_SCATTERED`)
  - does not force local debt-style cluster/subgroup signaling
- `local-density-first`
  - formerly enabled cluster-first local signaling (`TREE_OBSERVED_FAMILY_CLUSTER`, retired in Stage 2B-ii); it now emits nothing itself
  - is still decided after `local-subgroup-first`, and, like every lane other than the two divergence lanes, keeps the family out of shared-root lane spread
  - suppresses broad scatter-first routing
- `local-subgroup-first`
  - formerly enabled subgroup-opportunity-first local signaling (`TREE_FAMILY_SUBGROUP_OPPORTUNITY`, retired in Stage 2B-iii); it now emits nothing itself
  - is still decided first, and keeps the family out of shared-root lane spread like every lane other than the two divergence lanes
  - suppresses broad scatter-first routing
- `local-divergence-needs-broader-review`
  - routes to bounded broader-spread interpretation review first
  - keeps broad scatter (`TREE_FAMILY_SCATTERED`) eligible only when broader-spread interpretation remains unresolved
- `no-local-semantic-explanation`
  - routes to bounded broader-spread interpretation review first
  - keeps broad scatter (`TREE_FAMILY_SCATTERED`) eligible only when broader-spread interpretation remains unresolved

Boundary notes for this consolidation slice:

- no new finding codes are introduced,
- no new family/advisory families are introduced,
- routing is consolidated so existing family findings derive from one bounded local-first interpretation model,
- naming ownership remains unchanged (`familyRoot`, `semanticFamily`, optional `familySubgroup` stay naming-owned).

### Shared-root lane spread routing inside the shared family interpretation spine (Status: Historical; `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` retired in Stage 2B-iv, S2.12)

Classification: Normative

`TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` remains an existing bounded code, and its emission is now decision-routed by the same shared family interpretation spine used by other family outcomes.

Routing and meaning in this slice:

- shared-root lane spread is no longer treated as a separate family-reasoning island,
- eligibility is evaluated from shared family analysis grouped by naming-owned `semanticFamily`,
- shared-root lane counts/partitions remain bounded decision inputs, but they are no longer a standalone threshold collector that emits first and only carries shared-spine context afterward,
- local-first and broader-spread outcomes from the shared spine now gate whether shared-root lane spread is the selected outcome,
- emission occurs only when bounded shared-spine interpretation resolves to shared-root lane spread (rather than from lane thresholds alone),
- this consolidation adds no new finding family and does not alter naming ownership boundaries.

Bounded intent:

- preserve the existing finding code (`TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES`),
- keep shared-root lane spread as a bounded, explicit, deterministic, inspectable outcome within the existing local-first → broader-spread family reasoning flow,
- avoid introducing new policy surfaces beyond this routing consolidation slice.

### Family subgroup opportunity inside one semantic container (Status: Retired in Stage 2B-iii, S2.12)

`TREE_FAMILY_SUBGROUP_OPPORTUNITY` is retired and no longer emitted (S2.12, Stage 2B-iii); its `local-subgroup-first` classification is kept unchanged. The text below records the former behavior.

`TREE_FAMILY_SUBGROUP_OPPORTUNITY` was a bounded, info-level, advisory-only signal for lower-level family grouping opportunity *inside one naming-aligned semantic container*.

Former runtime trigger posture:

- observations must be singular naming evidence (`ambiguityFlags[]` absent),
- observations for the family must all classify to one valid naming-aligned semantic container identity,
- density must meet explicit thresholds (`minFilesInContainer`, `minDistinctContainerLocalHomes`),
- lower-level grouping signal must be present (currently from naming-owned `familySubgroup` or `semanticFamily` alignment with `familyRoot`),
- this signal is container-local guidance and does not replace broad cross-container scatter behavior.

Boundary note:

- files outside an eligible Semantic Home elsewhere are represented by `TREE_FAMILY_SCATTERED` (S2.12),
- container-local high-count observability was represented by `TREE_OBSERVED_FAMILY_CLUSTER`, retired in Stage 2B-ii (S2.12): a home's size and evidence quality are in the Stage 2A strength profile,
- subgroup opportunity was the bounded “between” signal for dense/cohesive lower-level grouping in one semantic container, retired in Stage 2B-iii (S2.12): potential-subfolder discovery is a deferred, unauthorized Stage 2 capability.

Ownership boundary remains unchanged:

- naming owns semantic-family derivation and validity semantics,
- tree owns structural interpretation/gating decisions that consume naming bridge evidence.

Boundary note (canonical_target for this slice): tree validator ownership is under `calculogic-validator/tree/src/**`. Legacy flat suite-core paths such as `calculogic-validator/src/tree-structure-advisor.*.mjs` are compatibility wrappers only, not canonical ownership.

## Top-Root Registry Classes and Ownership Boundary (Status: Bounded modeling note)

Classification: Informative

This section clarifies modeling intent for tree root registries without changing current runtime behavior.

### 1) Top-root classes

- **Structural top roots**:
  - generic surface-like roots such as `src`, `test`, `doc`, `docs`, `scripts`, `tools`, `public`, `bin`
  - these are interpreted by tree as structural folder surfaces
- **Semantic/custom-style top roots**:
  - top roots whose semantic/package identity is supplied by Naming-owned evidence and interpreted by Tree through the semantic-naming-to-folder-type relationship perspective
  - current runtime truth does not model these roots as Tree-owned named semantic-home registry entries

### 2) Builtin vs custom ownership

- Generic structural roots are appropriate builtin tree-owned defaults.
- Semantic/custom-style roots may be valid and high-value, but are not automatically universal builtin truth.
- Repo-specific roots used for dogfooding or implementation convenience may exist in current policy (**dogfooding/current-repo reality**), but they should not automatically become permanent published-package builtins.

### 3) Case/style distinction

- Semantic/custom-style roots may follow naming-like style conventions.
- This style signal does not make them filename roles.
- Tree remains the owner of structural interpretation for folder roots.

### 4) Future registry direction (modeling only; Status: Future advisory direction)

Future tree root registries may require metadata richer than a flat string list, for example:

- root kind (`structural` vs `semantic`)
- ownership/source (`builtin` vs `custom`)
- style classification (`generic-builtin`, `custom-style`, or similar)

This is a modeling direction note only, not an implementation claim for this version.

### 5) Structural-root vs semantic-container modeling clarification (bounded; non-runtime)

Classification: Informative

This bounded modeling note preserves ownership and interpretation direction for future tree hardening without claiming shipped behavior changes.

- **Structural folders/nodes** are tree-owned structural surfaces and are the most direct candidates for eventual registry-backed tree-node modeling.
- **Semantic folders** should generally be interpreted through alignment with naming-owned semantic-family signals (for example `semanticFamily`, `familyRoot`, optional `familySubgroup`) rather than as an independent flat truth source owned by tree.
- **Top-level semantic folders** (repo-shape dependent examples can include `tree/` and `naming/`) may function as semantic-family containers, not only as generic folder roots.
- Inside one such top-level semantic container, lower-level family distribution should be evaluated first as:
  1. expected family presence / healthy family density,
  2. lower-level family subfolder opportunity,
  3. and only secondarily as broader scatter.
- **Cross-container family presence** should count as meaningful scatter only when no allowed structural or cross-concern rule explains that placement.
- Tree organization and tree addressing stay distinct from file-level structural addressing concerns; tree addressing remains tree-owned report/organization metadata and does not re-own naming derivation.

Ownership boundary restatement:

- naming slice owns semantic-family derivation (`semanticFamily`, `familyRoot`, `familySubgroup`)
- tree slice owns folder/node interpretation and may consume naming-owned derivation as bounded evidence
- tree must not re-derive or re-own naming validity semantics

---

## Tree Addressing (Report-Only, Status: Future advisory direction)

This slice assigns **Tree Addresses** for reporting and internal clustering.
They are not canonical persistent IDs and must not be embedded into filenames.

### Grammar

Tree Address uses the same token style as the Deterministic Structural Addressing spec:

`<HostLetter>.<HostLocalIndex>.<LaneIndex>[.<NodeIndex>...]`

Rules:

- dot-separated tokens
- host token is a single uppercase letter
- numeric tokens are positive integers (no leading zeros)
- numeric compare is numeric, not lexical

### Interpretation

- `HostLetter` = scope-root namespace token for this report run
- `HostLocalIndex` = deterministic index of a top-level surface inside that host (e.g., `src` subtree roots, tool roots)
- `LaneIndex` = deterministic lane classification index (see below)
- `NodeIndex...` = deeper nested nodes used only when needed to represent:
  - (a) folder depth in a suggested target tree, and/or
  - (b) stable cluster subdivision (e.g., domain → subdomain → family)

### Host token binding (important)

Host tokens are **context-bound** (per the addressing spec’s “local meaning” concept).
The report MUST also include explicit host bindings:

- `addressing.hostBindings[]` items:
  - `host: "A" | "B" | ...`
  - `scopeRootPath: "<repo-relative path>"`
  - `notes: "<optional>"`

This prevents confusing “A” with anything global.

### Lane index mapping (V0.0.1)

This slice must preserve the existing concern slot semantics where applicable while allowing non-CCS lanes.

**Concern-aligned lanes (match existing concern indices):**

- `3` Build
- `4` BuildStyle
- `5` Logic
- `6` Knowledge
- `7` Results
- `8` ResultsStyle

**Non-concern lanes (tree advisor only; not CCS concerns):**

- `2` ArchitectureSupport (roles like `host`, `wiring`, `contracts`)
- `10` Tests (test-only surfaces and fixtures clusters)
- `11` ToolingSurface (bin/scripts/tool wrappers; report-only lane)
- `12` DocumentationSurface (docs-only roots; report-only lane)

Notes:

- This lane extension is permitted only because these Tree Addresses are report-only.
- When a filename role’s category is concern-core or concern-style, it MUST map to its concern index (3–8).
- When a filename role is architecture-support, it MUST map to lane `2`.

---

## Tree Snapshot Inputs (TreeManifest / TreeSnapshot, Status: Bounded modeling note)

Tree advisor analysis input is a deterministic **TreeSnapshot** (also called a TreeManifest): a stable list of repo-relative paths selected for analysis.

### Snapshot sources

TreeSnapshot may come from one of two sources:

- `fs` snapshot (always available): filesystem walk results after scope + target filtering
- `git` snapshot (optional): committed tree listing for a selected git ref when `.git` is present

Typical `git` usage is `gitRef=HEAD`.

Important metadata clarifications:

- `HEAD` is a git ref / snapshot selector, not a filename role
- `git status --porcelain` is optional diagnostics metadata (for dirty/untracked visibility) and is not required for basic tree-advisor operation

### Determinism rules (snapshot-specific)

- normalize all paths to `/`
- stably sort snapshot entries
- same snapshot inputs and same options => same report output

### Recommended shape-level schema (doc-only; Status: Bounded modeling note)

- `sourceSnapshot.source`: `fs | git`
- `sourceSnapshot.gitRef`: optional string (for example `HEAD`)
- `sourceSnapshot.diagnostics`: optional object (dirty/untracked counts or booleans)
- `entries[]`:
  - `path`
  - `kind`: `file | dir` (optional)
  - `parsed`: optional naming metadata
    - `semanticName`
    - `role`

---

## Input Scope Profiles (Status: Current runtime behavior)

Tree advisor scope selection follows the suite-owned scope boundary contract in [`ValidatorSuite-Contracts-And-Modes.md`](../ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md#6-suite-owned-scope-boundary-contract-canonical): suite owns canonical scope vocabulary and scoped input selection, and tree advisor applies tree-local interpretation after that shared boundary.

Tree advisor scope selection should reuse the existing validator scope discovery model (repo/app/docs/validator/system), plus optional target filtering.

- Default scope: `repo`
- Supports: `--scope=<scopeName>`
- Supports: `--target <path>` (repeatable; union)

Target filtering applies after scope discovery and before analysis.

Scope discovery for all profiles (including `repo`) must consume both scope-profile surfaces exposed by the shared runtime contract:

- `includeRoots`: directory roots to walk recursively
- `includeRootFiles`: explicit repository-root files to include when present

Runtime collection should consume the suite-core shared scoped snapshot/input helper boundary (scope profile read + includeRoots/includeRootFiles collection + normalization + target filtering + deterministic sort/dedupe) before tree-local interpretation.

Runtime collection must ignore missing declared root files, normalize collected root-file paths the same way as walked paths, then merge + deduplicate before target filtering.

---

## Analysis Heuristics (Deterministic, Status: Future advisory direction)

This section is a deferred heuristic menu, not a statement of currently emitted tree behavior, except where explicitly noted as shipped below. Current runtime only ships the bounded findings listed later under **Current Runtime Boundary and Shipped Findings**.

### 1) Semantic family cohesion

Detect when a naming-derived semantic family signal is scattered across too many unrelated folders.

Example family keys:

- exact semantic name: `validator-config`
- configured family-prefix rule when enabled: `naming-rule-*` → family `naming-rule`

### 2) Lane purity / entropy

Detect when a folder contains a high-entropy mix of lanes that predict navigation pain as the subsystem grows.

### 3) Subsystem scaffold normalization

Detect when one validator subsystem has a rich internal namespace (`rules/`, `registries/`) while other validator subsystems are flat/scattered, and recommend adopting a common scaffold.

### 4) “Tool-as-subpackage” separation

Detect when subpackages (e.g., `tools/report-capture`) contain mixed surfaces that should remain isolated from library code.

### 5) Owned-slice boundary drift

Detect when validator-owned subsystem growth is accumulating under suite-core `<validator development root>/src/**` instead of an owned slice root. The suite-core root follows the prepared validator development root described under "Current Runtime Boundary and Shipped Findings"; the advisory does not apply without one.

Signals may include subsystem-local host/wiring/logic files, registries, tests, docs, scripts, and scaffolds that indicate package-like internal growth.

Advisory intent:

- prefer earlier extraction to an owned slice root before additional files and shims accumulate
- preserve suite-core as shared infra/compat boundary rather than long-term home for owned validator internals

All scoring thresholds MUST be explicit constants in code and reported in `details`.

### Explicit thresholds (V0.0.1 defaults)

- `MIN_LANE_PARTITIONS_FOR_SCATTER = 2`
- `MIN_FILES_IN_FAMILY_FOR_RECOMMENDATION = 2`
- `LANE_FIRST_FOLDER_SIGNAL_SET = { build, build-style, logic, knowledge, results, results-style, tests, docs }`

## Recommendation Patterns (Advisory Only, Status: Future advisory direction)

The following outputs are advisory recommendation patterns only. They are not mandatory rules and are **not currently emitted** by shipped tree runtime. Treat them as deterministic future-design guidance for later `suggested-reorg` findings, not as current contract behavior.

### 1) Semantic-family folder recommendation

When one semantic family is scattered across unrelated folders beyond configured thresholds, recommend consolidation under a family root such as:

- `<semantic-name>/...`
- `<semantic-family>/...`

This is recommendation output (`suggested-reorg`) and not an enforcement requirement.

### 2) Concern subfolder recommendation under a family

When a semantic family has multi-file and multi-lane presence and is not already cleanly scoped by a higher family folder, recommend concern subfolders such as:

- `<semantic-family>/build/...`
- `<semantic-family>/logic/...`
- `<semantic-family>/knowledge/...`

This recommendation should trigger only when it reduces lane entropy or improves navigation, and remains advisory-only.

Constraint (shared-root):

- Do not recommend creating or expanding lane-first folders directly under a shared root (for example, `src/shared/logic/`).
- Lane/role subfolders are only recommended inside a semantic family folder (for example, `src/shared/<semantic-family>/logic/...`).

Naming metadata reuse note:

- Treat parsed naming metadata (`<semantic-name>.<role>.<ext>`) as a primary lane signal.

### 3) Shared-root semantic-first grouping (advisory-only; not currently enforced)

Not currently enforced: `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES`, which partially implemented this convention, was retired in Stage 2B-iv (S2.12). The convention is kept as a possible future structural capability (S2.12, L4); the detection and recommendation text below describes intent, not current behavior.

Intent:

- At shared-root level (default example: `src/shared/`), prefer semantic-first grouping.
- Preferred target: `src/shared/<semantic-family>/...`
- Avoid recommending: `src/shared/<lane>/...` as the target structure.

Detect (deterministic):

- A shared root is one of a configured set (V0.0.1 default example: `src/shared`).
- The shared root contains lane-first partitions as immediate child folders (examples):
  - `logic`, `knowledge`, `results`, `build`, `build-style`, `results-style`, `tests`, `docs`
- A semantic family output supplied by naming (derived from parsed `<semantic-name>`) appears under >= 2 distinct lane-first partitions within that shared root.
- Guardrail: only recommend when the family has >= configured minimum files (reduces churn/noise).

Recommend (advisory):

- Consolidate to: `src/shared/<semantic-family>/...`
- Within `src/shared/<semantic-family>/`, lane/role subfolders are allowed only when needed to reduce clutter/entropy:
  - `src/shared/<semantic-family>/logic/...`
  - `src/shared/<semantic-family>/knowledge/...`
  - etc.

No-inference constraint (V0.0.1):

- The advisor must not require or assume folder-name case transforms (no kebab↔Pascal conversion).
- Use the derived `familyKey` as-is for suggested target paths.

Example:

- Before:
  - `src/shared/logic/selection.logic.ts`
  - `src/shared/knowledge/selection.knowledge.ts`
- Suggested target:
  - `src/shared/selection/selection.logic.ts`
  - `src/shared/selection/selection.knowledge.ts`

### 4) Owned slice extraction recommendation (advisory-only)

Intent:

- when a validator subsystem is growing like an owned slice inside suite-core `src/**`, recommend extraction to a dedicated slice root
- keep recommendations report-first and bounded to structural/ownership guidance

Pattern examples (conceptual):

- from: `calculogic-validator/src/<subsystem>/**`
- to: `calculogic-validator/<subsystem>/src/**`

Current architecture alignment examples:

- canonical naming slice root: `calculogic-validator/naming/src/**`
- canonical tree slice root: `calculogic-validator/tree/src/**`

Non-claim boundary:

- this spec section defines advisory direction and recommendation shape
- it does not claim current runtime fully enforces deterministic owned-slice boundary detection yet

## Compat / Shim Health Signals (Advisory Diagnostics)

Shim/compat detection is a tree-health diagnostic layer in report-first mode.

V0.1.4 hardened subset:

- infer bounded artifact surface from path/basename only:
  - `quality`, `docs`, `examples`, `fixtures`, `runtimeish`
- collect structured evidence fields (do not flatten to `isShimLike` early):
  - `artifactSurface`
  - `matchedShimSignals.folderSignals`
  - `matchedShimSignals.nameTokenSignals`
  - `matchedShimSignals.thinReexportShim`
  - `insideCompatSurface`
  - `canonicalTargetPath`
  - `reexportTargetCount`
  - intentional pass-through booleans (canonical host pass-through / public entrypoint pass-through)
- content reads are gated after the resolved extension allowlist: an eligible selected path must have a folder or basename-token signal, be inside a compat surface, match a Validator-owned basename matcher, contain `.host.` in its basename, or be the development-context public entrypoint. Content access also retains the contributor's containment and regular-file guards.
- signal provenance in current runtime truth is folder-segment and Tree-tokenized basename evidence, together with separately evaluated file-content evidence. Tree lowercases the basename, removes its final extension and splits on non-alphanumeric characters for token matching. Naming role and subject evidence are not passed to the shim contributor; these tokens do not distinguish assigned role from subject.
- recognized thin re-exports remain the strongest/high-confidence shim signal. After trimming lines and ignoring blank lines and lines starting with `//`, every remaining line must be a flat `export * from ...` or `export { ... } from ...` statement. The first target alone must contain a `core/`, `tree/`, `naming/` or `validators/` segment (at the start or after `/`); later targets are collected but are not checked for that segment.
- canonical host boundaries forwarding only to a sibling wiring module do not produce thin-re-export evidence or the `TREE_SHIM_OUTSIDE_COMPAT` warning through that forwarding: `./<name>.wiring.<ext>` lacks the required canonical directory segment. The dedicated host pass-through check requires a recognized, single-target thin re-export whose target equals `./` plus the host basename with `.host.` replaced by `.wiring.`. These predicates cannot recognize the intended sibling target. Parser non-recognition does not prevent weak path/token findings: a host with a shim-related basename token or folder segment can still emit `TREE_SHIM_SURFACE_PRESENT`, and the dedicated host exclusion cannot match the sibling target to suppress it.
- the `<validator development root>/src/index.mjs` package/public entrypoint barrel is excluded separately in Validator development context (see Runtime boundary).
- the resolved `validator-owned-signals` registry supplies basename matchers. Its Builtin patterns are specific to this Validator's module names and apply in every context, including installed consumers. Unlike these matchers, the public-entrypoint and detector-module self-exemptions depend on a validator development root.
- weak token/path-only shim signals on non-runtime surfaces (`quality/docs/examples/fixtures`) are suppressed from shim-debt output
- weak token/path-only shim signals on the shim detector's own implementation modules (under `<validator development root>/tree/src/`, with a detector-implementation token) are suppressed from shim-debt output (Validator development context only)
- runtimeish token/path-only shim signals remain info-only observability

Implemented codes:

- `TREE_SHIM_SURFACE_PRESENT` (`info`):
  - emitted for thin re-export shim evidence
  - emitted for runtimeish token/path-only signals as low-confidence observability
- `TREE_SHIM_OUTSIDE_COMPAT` (`warn`): emitted only when thin re-export shim evidence exists and the path is outside a compat/shims surface
- `TREE_SHIM_SCATTERED`: reserved for a later deterministic slice

Constraints:

- do not require creation of empty `compat/` folders
- report findings are advisory diagnostics only (not pass/fail by default)
- the diagnostic does not promise discovery of every thin forwarding module. Widening content-read eligibility and widening parser recognition are separate, undecided decisions; this description adopts neither.

---

## Classification Outputs (Status: Current runtime behavior)

Current tree-runtime and attached shim contributor findings use:

- `classification`: `advisory-structure`
- `severity`: `info` and `warn` only (report-mode, no tree finding errors)

---

## Finding Schema (Status: Current runtime behavior)

Each finding uses the same stable envelope shape used by existing validators:

- `code` (string)
- `severity` (`info` | `warn`)
- `path` (normalized relative path; when folder-scoped, path is the folder root)
- `classification` (enum)
- `message` (short human-readable summary)
- `ruleRef` (spec reference pointer, e.g. `tree-structure-advisor-validator.spec.md#...`)
- `suggestedFix` (optional, advisory-only; e.g., proposed move set)
- `details` (object, deterministic)

### Tree-Advisor details fields (recommended; Status: Current architectural/modeling guidance)

- `addressing.treeAddress` (string; report-only)
- `addressing.host` (string)
- `addressing.laneIndex` (number)
- `signals`
  - `parsed.semanticName` (string|null)
  - `parsed.role` (string|null)
  - `parsed.roleCategory` (string|null)
  - `familyKey` (string|null)
  - `sharedRoot` (string|null)
  - `isSharedRootContext` (boolean)
  - `isLaneFirstPartition` (boolean)
  - `laneFirstFolderName` (string|null)
  - `semanticFamilyKey` (string|null; `familyKey` when in shared-root context)
- `metrics`
  - `familyScatterCount` (number)
  - `laneEntropy` (number)
  - `clusterSize` (number)
- `proposal` (optional)
  - `proposedMoves[]`:
    - `from` (path)
    - `to` (path)
    - `reason` (string; deterministic template text)

---

## Finding / Code Set (Draft; Status: Mixed current runtime behavior + future advisory direction)

### Current shipped codes (current runtime behavior)

- `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` (`info`)
- `TREE_VALIDATOR_OWNED_FILE_OUTSIDE_TREE` (`info`)
- `TREE_OWNED_SLICE_BOUNDARY_DRIFT` (`info`)
- `TREE_SHIM_SURFACE_PRESENT` (`info`) — implemented (thin-reexport high-confidence + runtimeish token-only observability)
- `TREE_SHIM_OUTSIDE_COMPAT` (`warn`) — implemented (thin re-export evidence only)

### Deferred/planning code candidates (future advisory direction)

- `TREE_OBSERVED_FAMILY_CLUSTER` (`info`) — retired in Stage 2B-ii (S2.12); formerly emitted by the naming bridge contributor as thresholded cluster observability. No longer emitted.
- `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` (`info`) — retired in Stage 2B-iv (S2.12), with the naming bridge contributor. No longer emitted.
- `TREE_FAMILY_SCATTERED` (`info`) — implemented via the Semantic Home scatter contributor from Stage 2A placement (S2.12, Stage 2B-i)
- `TREE_EMERGENT_BOUNDARY_OPPORTUNITY` (`info`) — implemented via the Stage 3 emergent-boundary opportunity contributor (S3.13, calculogic-validator#171 slice C); emitted only under the adopted policy with an active language profile
- `TREE_LANE_MIX_HIGH_ENTROPY`
- `TREE_MISSING_NAMESPACE_ROOT`
- `TREE_SUBSYSTEM_SCAFFOLD_ASYMMETRY`
- `TREE_TOOL_SURFACE_MIX`
- `TREE_SHIM_SCATTERED` (`warn`/`info`)
- `TREE_SHARED_LANE_FIRST_PARTITION_PRESENT` (`info`)
- `TREE_SHARED_SEMANTIC_ROOT_RECOMMENDED` (`warn`/`info`)
- `TREE_OWNED_SLICE_EXTRACTION_RECOMMENDED` (`warn`/`info`)

Deferred candidates above are a documentation menu only. They are not current runtime claims and should not be treated as conformance expectations until shipped below the current-runtime boundary.

---

## Current Runtime Boundary and Shipped Findings (Status: Current runtime behavior)

### Runtime boundary

- Tree core consumes **prepared tree-core inputs only** and fails closed when that contract is bypassed.
- Tree wiring consumes suite core's resolved development context and prepares an optional repository-relative `validatorDevelopmentRoot` for Tree core. Standalone development resolves this root to `.`, embedded development resolves it to `calculogic-validator`, and installed consumer context leaves it absent (`null`).
- `TREE_VALIDATOR_OWNED_FILE_OUTSIDE_TREE` compares validator-owned basename signals with that prepared contextual root; it does not infer the root from repository-name literals, package-name substrings, `node_modules`, or current working directory. Without a validator development root, this finding is not emitted.
- `TREE_OWNED_SLICE_BOUNDARY_DRIFT` derives its suite-core root from the same prepared root: `.` resolves to `src/` and `calculogic-validator` to `calculogic-validator/src/`. The suite-core carveouts (`core/`, `compat/`, `registries/`, `index.mjs`, `validator-config.schema.json`) are interpreted relative to that suite-core root. Without a validator development root (installed consumer), this finding is not emitted, so a consumer's own `src/**` is never treated as Validator suite core. The finding's `path`, `message` and `details.suiteCoreRoot` report the resolved suite-core root; its code, severity, classification and threshold are unchanged.
- Shim diagnostics derive their Validator-development self-exemptions from the same prepared root: the public package entrypoint barrel is `<root>/src/index.mjs` and the shim detector's own implementation modules live under `<root>/tree/src/` (`.` resolves to `src/index.mjs` and `tree/src/`; `calculogic-validator` to the prefixed paths). Without a validator development root (installed consumer), neither self-exemption applies, and all other shim reasoning (thin re-export evidence, compat surfaces, canonical host-to-wiring pass-through, non-runtime weak-signal suppression) runs unchanged.
- `TREE_FAMILY_SCATTERED` derives its docs-authority root from the same prepared root (`toValidatorDocAuthorityPathPrefix` in `tree/src/tree-validator-development-root.logic.mjs`): `<root>/doc/` (`.` resolves to `doc/`), applied in its Stage 2 pairing rule (S2.12, B2). Without a validator development root, no document is paired. (Until Stage 2B-iv the retired Naming semantic-family bridge contributor derived this context, with its own structural root surfaces.)
- Tree reads every registry a run uses from the run's resolved Tree registry root (#41 registry lifecycle): the package Builtin set, or the consumer's active Custom set. `tree/src/registries/tree-runtime-registries.logic.mjs` loads them once per run and wiring passes them as prepared dependencies (`treeRepoShapePolicy`, `treeSignalPolicy`, the structural-home, folder-kind, relationship, role-token and context-assessment registries) and to the shim diagnostics contributor. The adopted Stage 3 policy (`tree/emergent-boundary-policy`) is read by its own loader from the run's resolution and reaches only Stage 3 reasoning, as `treeEmergentBoundaryPolicy` (S3.13.6). The runner entry reports them as `meta.registryProvenance`.
- Tree wiring prepares an effective repo-shape policy for each run: the Tree-owned repo-shape policy of the resolved set plus two contextual additions, which are facts about this repository rather than generic conventions:
  - in embedded development only, the top-level folder of the explicit validator development root;
  - every top-level folder with **local-package evidence** (#37): the root manifest explicitly declares the folder as a local package, and the folder has its own contained `package.json`. Suite core extracts that fact (`collectDeclaredLocalPackageEvidence`, capability inventory §3.10, which defines the exact supported declaration forms). Tree alone decides that it allows the folder at the repository top level. Tree records what the evidence added in `preparedDependencies.treeRepoShapeEvidence` (`evidenceRecords[]`: `{ folder, evidenceKind: 'declared-local-package', manifestPath, declarations }`), so an allowance is traceable rather than silent.

  Builtin holds generic conventions, a Custom set holds consumer policy choices, and local-package evidence holds facts observable from the repository being validated. It is a new prepared value (`preparedDependencies.treeRepoShapePolicy`); the registry policy object (cached for Builtin) is never modified, so context from one run cannot leak into another. Tree core, semantic-naming folder-type relationship evidence and the occurrence-classification runtime consume that prepared policy; direct runtime callers that omit it fall back to the builtin policy. Neither `calculogic-validator` nor `calculogic-doc-engine` is a generic builtin entry. In Calculogic_React_App, `calculogic-doc-engine` is allowed through local-package evidence: the root `package.json` depends on it as `file:calculogic-doc-engine`, and the folder has its own manifest. A repository with a folder of that name but no such declaration or manifest still reports it as an unexpected top-level folder.
- Tree core consumes occurrence-derived file records from `structuralAddressSnapshot.occurrenceRecords` when available for bounded structural helpers (`TREE_VALIDATOR_OWNED_FILE_OUTSIDE_TREE`, `TREE_OWNED_SLICE_BOUNDARY_DRIFT`) while keeping findings path output on resolved paths.
- Occurrence-derived records are enriched with a bounded structural class interpretation layer (`structuralClass`, `structuralKind`, `isRepoShapeAllowedTopLevelDirectory`, `isSemanticRoot`, `isStructuralRoot`, `isSubtreePartitionCandidate`, `isRepoTopOccurrence`, `isScopedRootOccurrence`) for tree-local reasoning substrate use; findings envelopes remain unchanged.
- Tree known-roots registry/runtime dependencies are retired in current runtime truth: `topRoots[].kind` does not back occurrence classification and `knownTopLevelDirectories` does not back unexpected top-level folder policy.
- Occurrence classification now uses prepared Tree replacement evidence from addressed occurrences, structural-home evidence, family-root folder evidence (`treeFamilyRootFolderEvidence`, S2.13; formerly semantic-home evidence), and folder-kind evidence; the former guarded known-roots fallback route is not current runtime truth.
- `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` membership comes from the effective repo-shape policy alone: a top-level folder is reported, at `repo` scope, exactly when that policy does not allow it. Occurrence classification is not consulted, so structural-home registration or a semantic-root classification never makes a folder allowed, and no classification flag adds a folder. The finding's code, severity, classification, message, ruleRef, path style, details shape and ordering are unchanged.
- `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` finding details report the full effective repo-shape policy used for the run in `details.allowedTopLevelDirectories`, not only the observed allowed top-level folder subset, so the payload explains the bounded policy used to classify a folder as unexpected. The finding and its reported policy always agree, including for direct runtime callers whose classification runtime closed over a different allowlist.
- **Classification migration machinery: retired** (calculogic-validator#118, #119). While known-roots classification was being replaced, Tree compared the known-roots classifier (the "current" side) with classification re-derived from Tree-owned evidence (the "replacement" side), and a chain of prepared records turned that comparison into a gate: `treeOccurrenceClassificationParityEvidence`, `…ParitySummary`, `…ShadowReport`, `…ReplacementReadiness`, `…ReplacementRecommendation`, `…RuntimeEvaluationPlan` and `…RuntimeExecutionContract`. Only when readiness was `candidate-ready` did `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` read classification flags, and only from a runtime that declared the effective policy. When the known-roots runtime was retired, the replacement runtime's own output became the "current" side, so the comparison checked the evidence against itself (#118), and the only way left to report `differs` was a label-vocabulary mismatch (#119). The gate no longer selected anything either: a Tree-prepared runtime marks a repository-top folder allowed exactly when the policy allows it, so both routes reported the same folders. The seven records, their modules and the gate are removed. Classification itself, its `isRepoShapeAllowedTopLevelDirectory` flags, the structural-context assessment and file reasoning are unchanged, and the runtime keeps its recognition shape (`classifyOccurrenceRecords` and `collectUnexpectedTopLevelDirectoryNames`). The removed records lived only in `preparedDependencies`, which no report carries and no specification documents as an API. A future use of classification for top-level judgments needs its own contract; it would not restore this gate.
- If `structuralAddressSnapshot` is missing or malformed, tree core deterministically falls back to prepared `selectedPaths` for file-path reasoning. The internal file-reasoning input records which applied (`source: 'structuralAddressSnapshot'` or `'selectedPaths-fallback'`).
- Occurrence identity and nesting come from Structural Addressing (#45). Tree wiring prepares `structuralAddressSnapshot` through the Addressing-owned validation input adapter (`structural-addressing-tree-codebase-validation-input.spec.md`), then `prepareTreeCodebaseAddressedSnapshot`, then the Tree-owned projection (`tree-owned/tree-structural-address-probe-contract.spec.md`, "Addressing-backed projection"). Suite-core `selectedPaths` stay the membership authority. Only Tree wiring imports Addressing; Tree core consumes prepared inputs. `structuralAddressSnapshot` is Tree core's only snapshot input: the transitional `occurrenceSnapshot` alias and Tree's former private producers were retired in #49. Relative to the former private producer, the occurrence corrections are D1 (a root file outside every declared root binds to `.`), D2 (no phantom ancestors above a target) and D4 (overlapping roots collapse to one nested identity per path), and records gain `orderIndex`. Finding codes, severities and report shapes are unchanged: React-app and Validator reports were identical before and after the switch.
- Required prepared tree-core fields:
  - `selectedPaths` (array)
  - `topLevelDirectoryNames` (array)
  - `targets` (array)
- Optional composition field:
  - `findingContributors` (array of contributor callbacks)
- Tree core does **not** require `getFileContent(relativePath)`.
- The shim diagnostics contributor's `getFileContent` re-checks a selected path immediately before reading it (#56), with the shared containment rule and a regular-file check. A path that no longer resolves inside the target, is not a regular file, or cannot be read yields no content, and shim detection uses path-only evidence for it. Suite core already admits only contained regular files; this check is defensive. It checks then reads by path, so it is not race-proof: an entry retargeted or replaced between the check and the read can still be read.
- Current tree runtime does **not** consume tree-specific config surfaces. The dedicated CLI may accept `--config=<path>` through shared suite runner plumbing, but current tree behavior only validates/normalizes the shared config shape and exposes `configDigest` at the runner envelope when config is supplied.
- Current tree runtime does **not** emit tree addresses or move proposals. Naming bridge payload is consumed as contributor input and is not re-emitted as a raw payload surface.

### Composition ownership

- Tree wiring prepares tree-core inputs and calls tree contributor assembly for default contributors.
- Default contributor selection is owned by `tree-structure-advisor-contributors-assembly.wiring.mjs`, not by tree core.
- Shim diagnostics are attached as a contributor (`tree-shim-diagnostics`) during normal tree runs.
- Shim/content reads are owned by the shim contributor attachment boundary and are guarded to selected paths.

### Current shipped finding codes

Tree core currently ships:

- `TREE_UNEXPECTED_TOP_LEVEL_FOLDER`
- `TREE_VALIDATOR_OWNED_FILE_OUTSIDE_TREE`
- `TREE_OWNED_SLICE_BOUNDARY_DRIFT`

Attached shim contributor currently ships during normal tree runs:

- `TREE_SHIM_SURFACE_PRESENT`
- `TREE_SHIM_OUTSIDE_COMPAT`

Attached Semantic Home scatter contributor (`tree-semantic-home-scatter-contributor`, Stage 2B-i) currently ships during normal tree runs:

- `TREE_FAMILY_SCATTERED` (from `treeFolderSemanticHomeReasoning.placements`, S2.12; nothing when Stage 2 was not evaluated)

Attached Stage 3 emergent-boundary opportunity contributor (`tree-emergent-boundary-opportunity-contributor`, calculogic-validator#171 slice C) currently ships during normal tree runs:

- `TREE_EMERGENT_BOUNDARY_OPPORTUNITY` (from `treeEmergentBoundaryReasoning`, S3.13; one per candidate meeting EL1–EL5, so nothing without an active language profile or under an experimental override)

The naming-bridge contributor is no longer attached: `TREE_OBSERVED_FAMILY_CLUSTER`, `TREE_FAMILY_SUBGROUP_OPPORTUNITY` and `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` were retired in Stage 2B-ii to 2B-iv, and the contributor with the last of them (S2.12).

### Current report payload from tree runtime

The tree runtime result includes:

- `findings[]` (deterministically sorted)
- `totalFilesScanned`
- `scope`
- `filters` with `isFiltered` and optional `targets`
- `semanticHomeReasoning` when Stage 2 was prepared (S2.12, B6)
- `emergentBoundaryReasoning` when Stage 3 was prepared (S3.13.7)

When tree runs through the shared validator runner / CLI surfaces, the composed validator entry additionally includes summary counts, optional `meta.filters`, `meta.registryProvenance`, `meta.semanticHomeReasoning` and `meta.emergentBoundaryReasoning`, and the runner envelope may include `configDigest` when `--config` is supplied. No tree-specific config payload is emitted today.

---

## Determinism Requirements (Status: Current runtime behavior)

- Normalize path separators to `/`
- Use explicit include/exclude sets per scope
- Parse filename metadata deterministically (no inference beyond registry rules)
- All clustering keys must be deterministic:
  - stable string keys derived from path + parsed name components
- Findings sorted by:
  1. `path` asc
  2. `code` asc
  3. stable secondary keys in `details` (if needed)
- Identical repo state + same CLI inputs => identical report ordering and counts

---

## Rollout Modes (Status: Current runtime behavior + future advisory direction)

Mode semantics are centralized in [`ValidatorSuite-Contracts-And-Modes.md`](../ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md).

Tree advisor V0.0.1 implementation status:

- `report` only
  - no fix/mutate behavior is implemented
  - report JSON is emitted before exit handling
  - warning-level tree findings may still yield exit `2` under the shared suite exit policy
  - invalid CLI usage / invalid config / nonexistent target still fail with exit `1`

Suite policy options (`soft-fail`, `hard-fail`, `correct`, `replace`) are contract-level modes and are deferred for this slice (**future advisory direction**).

---

## CLI Usage (Status: Current runtime behavior)

Current script usage:

- `npm run validate:tree -- --scope=validator` runs tree-structure-advisor only for validator scope.
- `--target` is repeatable (`--target <path>` and `--target=<path>`) and filters analysis to the union of selected in-scope targets.
- `--config=<path>` is accepted through shared suite CLI plumbing for config validation + runner-envelope `configDigest`; current tree runtime does not apply tree-local config semantics yet.
- The command remains report-only in the non-mutating/report-first sense. Exit status still follows the shared suite exit contract after report emission, so warning-level advisory findings can currently yield exit `2`.

Npm forwarding requirement remains: pass flags after `--` (for example `npm run validate:tree -- --scope=validator --target tree/src`; targets are repository-relative).

---

## Non-Goals (Restated, Status: Current runtime boundary)

- This slice is not a “tree linter that blocks PRs” yet.
- It does not define a single canonical folder layout.
- It does not introduce filename numbering or address stamping into paths.
- It does not validate NL↔code atom parity or provenance token correctness.
