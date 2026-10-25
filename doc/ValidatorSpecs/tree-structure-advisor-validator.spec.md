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

### Folder-level semantic-home evidence, Stage 1 (Status: Contract, calculogic-validator#93; S1.1, S1.2 and the S1.3 run and record levels are current implementation reality since calculogic-validator#95; the S1.3 fact level and S1.8 since calculogic-validator#97 Stage 1B-i; S1.4–S1.7 and S1.9 are not current runtime truth)

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

**Relationship is not support.** `preserved (provisional)` only records that no stronger relationship was established. It never counts as support by itself. Only an evaluated channel `match` is evidence for a candidate, and every count keeps the member's relationship and its provisional boundaries visible, so Stage 2 can decide what they mean.

Containment and comparison are independent dimensions. A member whose relationship is `preserved (provisional)` still contributes its independently evaluated `root` or `prefix` comparison: a `match` counts as matching evidence and a `foreign` as foreign evidence, with the member's provisional containment status kept on the count. Only `terminated` members are excluded from a candidate's matches and foreign evidence (S1.7).

#### S1.7 Accounting

- A member contributes to candidate C at most once per channel. `terminated` members are counted separately and never as matches or foreign evidence for C.
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

- per channel: `match` (singular or ambiguous, direct or descendant), `foreign` by root and by branch, and `not-evaluated` by reason;
- `terminated` members by terminating folder;
- `provisional-redirect` boundaries, each with the nested candidate's reference and the number of members behind it;
- `narrow` attributions;
- corroboration references (S1.4).

No ratio, threshold, eligibility, strength or placement value is produced in Stage 1.

**Output.** The evidence is one Tree-owned prepared-evidence record, `treeFolderSemanticEvidence`, in Tree's prepared dependencies, next to the existing Tree evidence. It holds run-level availability, intake diagnostics, candidates with facets, member relationship records and composition observations. Availability and intake diagnostics are taken unchanged from the Stage 1A intake record, and fact-level facts and composition observations from the Stage 1B-i record (S1.11), never recomputed (calculogic-validator#97, D2). It is not part of the report payload and does not change findings. All collections are sorted deterministically by occurrence identity, then by `candidateSource`.

**Legacy evidence.** The file-level `semanticHome` field in `tree/src/tree-semantic-home-evidence.logic.mjs` (the file's own `semanticFamily`) is legacy evidence pending migration in Stage 2. Stage 1 neither reads nor changes it.

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
- **Stage 1B-ii** (not current runtime truth): `treeFolderSemanticEvidence` (S1.9). It references the Stage 1B-i record's facts and composition observations and evaluates comparisons with its comparison rule. It never builds a second fact or composition model.

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

### Family-scatter structural gating (Status: Current runtime behavior, bounded)

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
- `TREE_FAMILY_SCATTERED` represents unresolved spread after both local and broader interpretation do not sufficiently explain placement.

### Shared local-first family interpretation spine for family outcomes (Status: Current runtime behavior, bounded)

Classification: Normative

Current family-level tree outcomes now share one bounded local-first interpretation authority (`interpretFamilyLocalFirst`) before emitting family findings.

The shared local-first interpretation spine routes existing family findings as follows:

- `expected-local-presence`
  - suppresses broad scatter (`TREE_FAMILY_SCATTERED`)
  - does not force local debt-style cluster/subgroup signaling
- `local-density-first`
  - enables cluster-first local signaling (`TREE_OBSERVED_FAMILY_CLUSTER`) using existing bounded thresholds/details
  - suppresses broad scatter-first routing
- `local-subgroup-first`
  - enables subgroup-opportunity-first local signaling (`TREE_FAMILY_SUBGROUP_OPPORTUNITY`) using existing bounded thresholds/details
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

### Family subgroup opportunity inside one semantic container (Status: Current runtime behavior, bounded)

`TREE_FAMILY_SUBGROUP_OPPORTUNITY` is a bounded, info-level, advisory-only signal for lower-level family grouping opportunity *inside one naming-aligned semantic container*.

Current runtime trigger posture:

- observations must be singular naming evidence (`ambiguityFlags[]` absent),
- observations for the family must all classify to one valid naming-aligned semantic container identity,
- density must meet explicit thresholds (`minFilesInContainer`, `minDistinctContainerLocalHomes`),
- lower-level grouping signal must be present (currently from naming-owned `familySubgroup` or `semanticFamily` alignment with `familyRoot`),
- this signal is container-local guidance and does not replace broad cross-container scatter behavior.

Boundary note:

- broad cross-container spread remains represented by `TREE_FAMILY_SCATTERED`,
- container-local high-count observability remains represented by `TREE_OBSERVED_FAMILY_CLUSTER`,
- subgroup opportunity is the bounded “between” signal for dense/cohesive lower-level grouping in one semantic container.

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

- `TREE_OBSERVED_FAMILY_CLUSTER` (`info`) — implemented via naming bridge contributor (bounded thresholded cluster observability, aggregated deterministically at semanticFamily level or semanticFamily-in-container when all family observations are naming-aligned to semantic containers)
- `TREE_FAMILY_SCATTERED` (`info`) — implemented via naming bridge contributor (bounded family scatter advisory)
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
- The Naming semantic-family bridge contributor derives its Validator-development context from the same prepared root. The canonical docs-authority/runtime pairing is `<root>/doc/** <-> <root>/<semantic-container>/**` (`.` resolves to `doc/** <-> <semantic-container>/**`), and `TREE_FAMILY_SCATTERED` reports that resolved pattern in `details.allowedCrossContainerPatterns.canonicalDocAuthorityRuntimePairing`. Without a validator development root, the pairing allowance does not apply and that detail is `null`. In embedded development, the explicit root's top-level folder is added to the bridge's structural root surfaces for that run only. The bridge's generic structural root surfaces (`src`, `test`, `doc`, `docs`, `scripts`, `tools`, `bin`, `public`) remain Tree-owned bridge policy and are not derived from the repo-shape policy: a folder allowed at the repository top level (for example one allowed through local-package evidence) is not thereby a bridge structural surface.
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

Attached naming-bridge contributor currently ships during normal tree runs:

- `TREE_FAMILY_SCATTERED`
- `TREE_OBSERVED_FAMILY_CLUSTER`
- `TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES` (bounded shared-root lane-first spread outcome emitted from the shared family interpretation spine under supported shared roots, using naming-owned bridge observations only)

### Current report payload from tree runtime

The tree runtime result includes:

- `findings[]` (deterministically sorted)
- `totalFilesScanned`
- `scope`
- `filters` with `isFiltered` and optional `targets`

When tree runs through the shared validator runner / CLI surfaces, the composed validator entry additionally includes summary counts and optional `meta.filters`, and the runner envelope may include `configDigest` when `--config` is supplied. No tree-specific config payload is emitted today.

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
