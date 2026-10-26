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

Current runtime truth also includes a separate triggered folder-only relationship perspective named `semantic-qualified-structural-container`. It activates only when Tree receives addressed Naming evidence with `semanticEvidenceKind: folder-semantic-structural-composition`, `folderCompositionKind: semantic-qualified-structural-container`, a Naming-owned `semanticQualifier`, and a Naming-owned `structuralRoleToken`; the occurrence is a folder; Addressing supplies the exact occurrence identity and parent/ancestor lineage; and Tree can evaluate that token against the Tree-owned structural-role token registry. This perspective does not scan every folder, does not emit non-applicability explanations for folders without Naming composition evidence, does not apply to files, and does not make an embedded token such as `src` equivalent to a direct repo-top structural-home folder named `src`.

Current runtime truth consumes the approved downstream folder-kind evidence from that perspective in occurrence classification through an exact-address-only route. A folder occurrence may receive `structuralClass: relationship-qualified-structural-container` and `structuralKind: implementation-container` only from Tree-owned `treeFolderKindEvidence` carrying `folderKind: semantic-qualified-structural-container`, `relationshipQualified: true`, `relationshipPerspective: semantic-qualified-structural-container`, and `relationshipInterpretation: semantic-qualified-structural-container-aligned` for the same Addressing-owned `addressPath` as the current occurrence. This contribution is Tree-owned, prepared-evidence-driven, exact-occurrence-scoped, non-semantic-home, and non-reporting. It does not consume raw Naming composition observations, does not consume raw relationship records as classification authority, does not use path-only fallback identity for this route, and does not make the folder a generic semantic root or generic structural root.

Current runtime truth may then apply a Tree-owned structural-context assessment to an already approved relationship-qualified occurrence classification. The assessment consumes only the current occurrence classification record and a Tree-owned assessment-policy registry; it does not consume raw Naming evidence, raw relationship evidence, raw folder-kind evidence, path segments, or folder names. The initial registry policy matches the exact classification selectors `structuralClass`, `structuralKind`, `relationshipQualified`, `classificationEvidenceKind`, `relationshipPerspective`, and `relationshipInterpretation` for the approved `semantic-qualified-structural-container-aligned` route and prepares one non-reporting `coherent` assessment for that exact occurrence-local `addressPath`. No policy match produces no assessment record, not a negative conclusion. This coherent structural-context assessment is internal prepared Tree evidence and does not create findings, alter report policy, alter finding codes or counts, change severity/confidence/suppression behavior, or change exit behavior.

For the initial route, Tree uses Addressing lineage only to locate relevant ancestor occurrences, then compares the Naming-owned semantic qualifier with explicit addressed ancestor semantic-context evidence supplied through the Naming evidence bridge. Tree does not treat raw ancestor folder names, raw path segments, or parent labels as semantic truth. Matching addressed context yields `semantic-qualified-structural-container-aligned`; a different explicit addressed context yields `semantic-qualified-structural-container-semantic-context-mismatch`; missing addressed context yields `semantic-qualified-structural-container-context-unresolved`; and an unregistered embedded structural token yields `structural-token-not-registered-for-this-perspective`. Mixed folder-composition observations are relationship input, not generic semantic-home evidence. A composition semantic qualifier is not itself a semantic-home assertion about that folder occurrence. Relationship outcomes remain internal prepared evidence and do not change finding codes, counts, severity, suppression, confidence policy, exit behavior, or report-envelope schema.

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
8. **Unchanged.** R1 staging and every current R1 consumer (the bridge contributor and the legacy semantic-home evidence) are unchanged.

Why this route: the addressed snapshot is built once, by Tree; occurrence identity stays with Structural Addressing through that snapshot; Naming stays the sole producer of both sections; and the runner gains only opaque transport.

#### S1.2 Section intake (consumer side)

Tree validates each section exactly as the bridge contract specifies for supporting consumers: §4.4 rules 2–4 and 6 for the envelope (a malformed supported section is invalid as a whole), §4.5 consumer identity rules for N1, and §4.6 consumer identity rules for N2. Field groups are validated separately from identity. There is no path fallback.

Intake produces Tree-owned **intake diagnostics** that name the section, the rejection reason and the identity tuple when one exists. Intake diagnostics are prepared evidence. They are not Tree findings and do not affect report counts or exit behavior.

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

**Legacy evidence.** The file-level `semanticHome` field in `tree/src/tree-semantic-home-evidence.logic.mjs` (the file's own `semanticFamily`) is legacy evidence pending migration in Stage 2 (S2.13). Stage 1 neither reads nor changes it.

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

### Folder-level Semantic Home reasoning, Stage 2 (Status: Contract, calculogic-validator#102. Stage 2A (candidate reasoning, placement and the conformance binding) is implemented as prepared evidence. Stage 2B-i makes `TREE_FAMILY_SCATTERED` its first reader; every other finding is unchanged. The S2.10 values are Builtin registry data (`semantic-home-policy` version 2), loaded as `treeSemanticHomeParameterSet`)

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

Each code is decided individually. These are proposals until their 2B slice is implemented. Changing any finding's code, severity, counts, report payload or exit behavior needs explicit approval for that code in its own Stage 2B pull request. That pull request carries before/after tables at `repo`, `validator` and `app` scope and the catalogue cases it relies on. All four codes are currently `info` and come from `tree/src/contributors/tree-naming-semantic-family-bridge-contributor.logic.mjs`. None of the proposals changes severity.

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
- **Deferred capability (E2).** Potential subgroup or subfolder discovery remains a possible future extension of Stage 2 reasoning. Unlike the retired `TREE_FAMILY_SUBGROUP_OPPORTUNITY` heuristic, such a capability would need independently justified evidence for hypothetical folder claims, explicit uncertainty handling, and its own contract, catalogue, parameter, and conformance decisions. This retirement neither authorizes nor commits to that extension. It would be potential-home discovery, distinct from Semantic Home evaluation, which decides relationships involving existing folders.

**`TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES`: keep (proposed; unchanged by Stage 2B-i).**
- **Today:** shared-root lane spread from the shared interpretation spine, with `SHARED_ROOT_MIN_DISTINCT_LANE_PARTITIONS = 2` and `SHARED_ROOT_MIN_FAMILY_FILES = 3`. 0 emissions.
- **Proposed:** it judges spread across structural lanes, which is a different question from semantic home eligibility, so Stage 2 does not re-base it.
- **The 2B slice that changes `TREE_FAMILY_SCATTERED` must show** (Stage 2B-i shows both with a shared-root fixture):
  - that the two codes do not report the same files for the same reason;
  - that no file whose placement is `undetermined` contributes to it.

**Split-family stability guardrail.** The Tree blueprint requires split-family flags to prevent a semantic-family grouping from being treated as fully stable (calculogic-validator#85 living document). Where Naming's `splitFamilyFlags` evidence is available and applicable to a family or subgroup, no Stage 2B finding may treat that family or subgroup as fully stable without an explicitly justified policy. This applies to any code that groups by `semanticFamily` or `familySubgroup`. Stage 1 transports this evidence on the v1 observation but does not interpret it (S1.5), and Stage 2 eligibility does not use family groupings. This guardrail therefore binds the 2B slices; it does not imply that Stage 1 produces or interprets every possible split-family signal.

**No fallback when Stage 2 is unavailable.** When the S2.9 `status` is `configuration-unavailable`, a finding migrated to depend on Stage 2 emits nothing for that run, and the report says why. It never falls back to the older semantic-family heuristics. Codes not yet migrated, and all other Tree findings, are unaffected. Each 2B slice must show both behaviors.

The literal thresholds of the codes that keep their basis are not moved into the registry by this contract. Moving them is part of the 2B slice for that code.

#### S2.13 Legacy `semanticHome` (Q7)

`treeSemanticHomeEvidence.evidenceRecords[].semanticHome` (`tree/src/tree-semantic-home-evidence.logic.mjs`) holds the file's own `semanticFamily`. It is a family name, not a folder, so it does not mean what Stage 2 means by a Semantic Home.

Readers at 2080ac7:
- `tree/src/tree-folder-kind-evidence.logic.mjs`;
- `tree/src/tree-occurrence-classification.logic.mjs`;
- `tree/src/tree-occurrence-classification-parity-evidence.logic.mjs`.

The bridge contributor's own `semanticHome` placement field and its `details.semanticHomeEvidence` come from separate paths: path-alignment placement, and the Naming occurrence intake. They are not readers of this field.

**Proposed: keep alongside, then deprecate.**
- Stage 2A leaves the field and its readers unchanged.
- Stage 2C decides, reader by reader, whether to move to `treeFolderSemanticHomeReasoning` placement, with a parity record for each move.
- Stage 2C then deprecates the field with a migration note. No rename is proposed: renaming would change every reader without resolving the meaning.
- Stage 2C starts with a complete consumer inventory, including tests and report metadata.

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
   - the remaining codes, each separately authorized.
7. **Stage 2C.** The legacy `semanticHome` decision (S2.13).

#### S2.15 Non-goals

- Changing Stage 1 evidence, Naming, the bridge contract or the runner.
- Tree interpretation of Naming material, including label qualifiers.
- Any single strength score, or ranking of candidates against each other.
- Treating `home-elsewhere` as misplacement in itself.
- Adopting a parameter value without catalogue evidence.
- Compensating for known Naming evidence gaps through parameter values (S2.10, D3).
- Changing findings outside the per-code decisions in S2.12.
- Broader local-context reasoning is deferred. Stage 2 reads containment, ancestry (`rootAncestry`, as a facet only), composition and candidate-relative relationships. It does not reason over parent or sibling context in the wider sense the Tree blueprint describes. Adding that needs its own contract amendment and adds no dependency to this one.

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

### Family-scatter structural gating (Status: Superseded for `TREE_FAMILY_SCATTERED` by Stage 2B-i, S2.12)

Since Stage 2B-i, `TREE_FAMILY_SCATTERED` is decided from Semantic Home placement (S2.12), not by this gate. The local-first and broader-spread layers below remain the current shared interpretation spine for `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` (`TREE_OBSERVED_FAMILY_CLUSTER` and `TREE_FAMILY_SUBGROUP_OPPORTUNITY` are retired, Stage 2B-ii and 2B-iii); the text below records how scatter was gated before.

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

### Bounded broader-spread interpretation layer (Status: Current runtime behavior, bounded)

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

### Shared local-first family interpretation spine for family outcomes (Status: Current runtime behavior, bounded)

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

### Shared-root lane spread routing inside the shared family interpretation spine (Status: Current runtime behavior, bounded)

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

### 3) Shared-root semantic-first grouping (advisory-only; partially shipped)

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
- thin flat re-export files (`export * from ...` / `export { ... } from ...` only) remain the strongest/high-confidence shim signal
- intentional pass-through entrypoints are excluded from shim debt findings:
  - canonical `*.host.* -> sibling *.wiring.*` pass-through in owned slices
  - `<validator development root>/src/index.mjs` package/public entrypoint barrel (Validator development context only; see Runtime boundary)
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
- `TREE_FAMILY_SCATTERED` (`info`) — implemented via the Semantic Home scatter contributor from Stage 2A placement (S2.12, Stage 2B-i)
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
- The Naming semantic-family bridge contributor derives its Validator-development context from the same prepared root. The canonical docs-authority/runtime pairing is `<root>/doc/** <-> <root>/<semantic-container>/**` (`.` resolves to `doc/** <-> <semantic-container>/**`), and `TREE_FAMILY_SCATTERED` applies the same docs-authority root in its Stage 2 pairing rule (S2.12, B2). Without a validator development root, no document is paired. In embedded development, the explicit root's top-level folder is added to the bridge's structural root surfaces for that run only. The bridge's generic structural root surfaces (`src`, `test`, `doc`, `docs`, `scripts`, `tools`, `bin`, `public`) remain Tree-owned bridge policy and are not derived from the repo-shape policy: a folder allowed at the repository top level (for example one allowed through local-package evidence) is not thereby a bridge structural surface.
- Tree reads every registry a run uses from the run's resolved Tree registry root (#41 registry lifecycle): the package Builtin set, or the consumer's active Custom set. `tree/src/registries/tree-runtime-registries.logic.mjs` loads them once per run and wiring passes them as prepared dependencies (`treeRepoShapePolicy`, `treeSignalPolicy`, the structural-home, folder-kind, relationship, role-token and context-assessment registries) and to the shim diagnostics contributor. The runner entry reports them as `meta.registryProvenance`.
- Tree wiring prepares an effective repo-shape policy for each run: the Tree-owned repo-shape policy of the resolved set plus two contextual additions, which are facts about this repository rather than generic conventions:
  - in embedded development only, the top-level folder of the explicit validator development root;
  - every top-level folder with **local-package evidence** (#37): the root manifest explicitly declares the folder as a local package, and the folder has its own contained `package.json`. Suite core extracts that fact (`collectDeclaredLocalPackageEvidence`, capability inventory §3.10, which defines the exact supported declaration forms). Tree alone decides that it allows the folder at the repository top level. Tree records what the evidence added in `preparedDependencies.treeRepoShapeEvidence` (`evidenceRecords[]`: `{ folder, evidenceKind: 'declared-local-package', manifestPath, declarations }`), so an allowance is traceable rather than silent.

  Builtin holds generic conventions, a Custom set holds consumer policy choices, and local-package evidence holds facts observable from the repository being validated. It is a new prepared value (`preparedDependencies.treeRepoShapePolicy`); the registry policy object (cached for Builtin) is never modified, so context from one run cannot leak into another. Tree core, semantic-naming folder-type relationship evidence and the occurrence-classification replacement runtime consume that prepared policy; direct runtime callers that omit it fall back to the builtin policy. Neither `calculogic-validator` nor `calculogic-doc-engine` is a generic builtin entry. In Calculogic_React_App, `calculogic-doc-engine` is allowed through local-package evidence: the root `package.json` depends on it as `file:calculogic-doc-engine`, and the folder has its own manifest. A repository with a folder of that name but no such declaration or manifest still reports it as an unexpected top-level folder.
- Tree core consumes occurrence-derived file records from `structuralAddressSnapshot.occurrenceRecords` when available for bounded structural helpers (`TREE_VALIDATOR_OWNED_FILE_OUTSIDE_TREE`, `TREE_OWNED_SLICE_BOUNDARY_DRIFT`) while keeping findings path output on resolved paths.
- Occurrence-derived records are enriched with a bounded structural class interpretation layer (`structuralClass`, `structuralKind`, `isRepoShapeAllowedTopLevelDirectory`, `isSemanticRoot`, `isStructuralRoot`, `isSubtreePartitionCandidate`, `isRepoTopOccurrence`, `isScopedRootOccurrence`) for tree-local reasoning substrate use; findings envelopes remain unchanged.
- Tree known-roots registry/runtime dependencies are retired in current runtime truth: `topRoots[].kind` does not back occurrence classification and `knownTopLevelDirectories` does not back unexpected top-level folder policy.
- Occurrence classification now uses prepared Tree replacement evidence from addressed occurrences, structural-home evidence, semantic-home evidence, and folder-kind evidence; the former guarded known-roots fallback route is not current runtime truth.
- `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` selection now uses prepared Tree occurrence-classification replacement evidence only when the replacement runtime is present, the runtime execution contract is `execution-candidate` / `ready-for-future-execution-contract`, replacement readiness is `candidate-ready`, and repo-top folder classification records are complete and well formed.
- When the prepared replacement route is ready, a repo-top folder suppresses `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` only when the folder is allowed by the Tree-owned repo-shape top-level policy and the replacement classification does not mark it unexpected; structural-home registration alone does not make a repo-top folder allowed for this advisory.
- Repo-top folders outside the Tree-owned repo-shape top-level policy still emit the existing finding with unchanged code, severity, classification, ruleRef, path style, and details shape, even when replacement occurrence classification identifies the folder as a structural home.
- Direct runtime callers that provide the required prepared tree-core inputs but omit, mis-shape, or gate-block occurrence-classification replacement evidence still use the explicit Tree-owned repo-shape policy fallback for `TREE_UNEXPECTED_TOP_LEVEL_FOLDER`; missing replacement composition must not silently suppress unexpected top-level folder findings.
- `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` finding details report the full effective repo-shape policy used for the run in `details.allowedTopLevelDirectories`, not only the observed allowed top-level folder subset, so the payload explains the bounded policy used to classify a folder as unexpected. The finding and its reported policy always agree. The neutral fallback route decides membership from the effective policy, never from an allowlist closed over by a separately prepared replacement runtime. The replacement runtime declares the repo-shape allowlist it classified against (`allowedTopLevelDirectories`); the ready classification route is used only when that declared allowlist equals the effective policy, and otherwise falls back, so a classification `isRepoShapeAllowedTopLevelDirectory` flag computed from a different policy never decides a finding.
- If `structuralAddressSnapshot` is missing or malformed, tree core deterministically falls back to prepared `selectedPaths` for file-path reasoning. The internal file-reasoning input records which applied (`source: 'structuralAddressSnapshot'` or `'selectedPaths-fallback'`).
- Occurrence identity and nesting come from Structural Addressing (#45). Tree wiring prepares `structuralAddressSnapshot` through the Addressing-owned validation input adapter (`structural-addressing-tree-codebase-validation-input.spec.md`), then `prepareTreeCodebaseAddressedSnapshot`, then the Tree-owned projection (`tree-owned/tree-structural-address-probe-contract.spec.md`, "Addressing-backed projection"). Suite-core `selectedPaths` stay the membership authority. Only Tree wiring imports Addressing; Tree core consumes prepared inputs. `structuralAddressSnapshot` is Tree core's only snapshot input: the transitional `occurrenceSnapshot` alias and Tree's former private producers were retired in #49. Relative to the former private producer, the occurrence corrections are D1 (a root file outside every declared root binds to `.`), D2 (no phantom ancestors above a target) and D4 (overlapping roots collapse to one nested identity per path), and records gain `orderIndex`. Finding codes, severities and report shapes are unchanged: React-app and Validator reports were identical before and after the switch.
- Required prepared tree-core fields:
  - `selectedPaths` (array)
  - `topLevelDirectoryNames` (array)
  - `targets` (array)
- Optional composition field:
  - `findingContributors` (array of contributor callbacks)
- Tree core does **not** require `getFileContent(relativePath)`.
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

Attached naming-bridge contributor currently ships during normal tree runs (`TREE_OBSERVED_FAMILY_CLUSTER` and `TREE_FAMILY_SUBGROUP_OPPORTUNITY` were retired in Stage 2B-ii and 2B-iii, S2.12):

- `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` (bounded shared-root lane-first spread outcome emitted from the shared family interpretation spine under supported shared roots, using naming-owned bridge observations only)

### Current report payload from tree runtime

The tree runtime result includes:

- `findings[]` (deterministically sorted)
- `totalFilesScanned`
- `scope`
- `filters` with `isFiltered` and optional `targets`
- `semanticHomeReasoning` when Stage 2 was prepared (S2.12, B6)

When tree runs through the shared validator runner / CLI surfaces, the composed validator entry additionally includes summary counts, optional `meta.filters`, `meta.registryProvenance` and `meta.semanticHomeReasoning`, and the runner envelope may include `configDigest` when `--config` is supplied. No tree-specific config payload is emitted today.

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
