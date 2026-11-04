# Naming Bridge Occurrence Identity Contract

- **Classification:** Normative for the Naming occurrence bridge identity, field-eligibility, existing v1 context/compatibility, enrichment, versioning, and migration contract; descriptive only where explicitly labeled as **current runtime truth**.
- **Applies to:** Cross-slice occurrence identity used by Addressing, Naming bridge observations, Tree evidence joins, and suite-core neutral transport.
- **Status:** Contract/specification decision slice only for issue #651; no runtime behavior is changed by this artifact.
- **Amendment:** calculogic-validator#84 adds the additive envelope-section rule (§4.4), the Naming semantic-evidence enrichment section (§4.5), and approves `semanticTokens` and role facts for that section only (§6.2). Contract only; no runtime behavior is changed by the amendment. calculogic-validator#87 implemented the §4.5 section. calculogic-validator#89 adds the Naming folder-label observation section (§4.6, §6.3) and clarifies §7 rule 1; contract only. calculogic-validator#150 adds the Naming token lexical-identity section (§4.7, §6.4); its implementation slice emits it with an active language profile. calculogic-validator#157 adds the payload-level section rule (§4.4 rule 9) and the Naming repository-package label section (§4.8, §6.5); calculogic-validator#159 implements it. calculogic-validator#162 widens rule 9 to run-scoped facts and adds the Naming role-category vocabulary section (§4.9, §6.6); its evidence-only implementation slice emits it and adds Tree's intake. calculogic-validator#162 (v2 contract) adds version v2 of that section, with the canonically admissible upper bound (§4.9.1, §6.6); contract only, implementation-pending. Tracking: calculogic-validator#85.
- **Issue context:** Refs #651 and Refs #647. Earlier identity baseline: Refs #621, Refs #618, and Slice 1 audit #648 / PR #649.
- **Repo-reality input:** `calculogic-validator/doc/Audits/occurrence-identity-and-naming-tree-bridge.audit.md` and `calculogic-validator/doc/Audits/addressing-backed-naming-tree-bridge-enrichment-surfaces.audit.md`.

## 1. Purpose and authority boundary

This spec defines the neutral occurrence identity contract, the versioned Naming bridge envelope, and the normative decision gate for future enriched Naming occurrence bridge fields.

This artifact is intentionally narrow. It defines contract names, ownership boundaries, approved future field shapes, deferred/rejected candidate status, migration expectations, and non-goals only. It does not implement Naming bridge enrichment, does not change Tree joins or consumption policy, does not add runtime payload fields, does not wire Tree to a different provider, does not extract shared join helpers, and does not change CLI or report envelope behavior.

Authority posture:

1. Current source files, tests, and the issue #648 audit remain the source for **current runtime truth**.
2. This spec defines the **target contract direction** for future implementation slices.
3. A field marked `approved for a future enriched bridge version` is approved for an additive future contract shape only; it is **not current runtime truth** until a later implementation slice emits and tests it.
4. A field marked `deferred` is **deferred implementation work** that needs the named prerequisite before runtime payload use.
5. A field marked `rejected for bridge payload use` must not be emitted by the Naming bridge payload as a contract field.

## 2. Current runtime truth

Current runtime truth from the issue #648 / PR #649 audit:

- Naming bridge observations can be emitted in a versioned occurrence bridge payload with `bridgeContractVersion: naming-occurrence-bridge.v1`.
- The only resolved durable occurrence identity tuple for addressed Naming occurrence observations is `addressProfileId + addressedSnapshotId + occurrenceAddress`.
- Naming occurrence bridge observations currently preserve path/source trace fields: `repoRelativePath`, `path`, and optional `addressPath`.
- `path` and `repoRelativePath` remain compatibility/source-trace fields, not the preferred durable join identity.
- `addressPath` remains a compatibility/debug mirror unless it is explicitly equal to `occurrenceAddress`; it must not become a second competing occurrence identity.
- Current Naming bridge semantic evidence includes existing Naming-owned semantic fields such as `semanticName`, `familyRoot`, `semanticFamily`, optional `familySubgroup`, optional sorted `ambiguityFlags`, and optional sorted `splitFamilyFlags`.
- `occurrenceType` is existing optional v1 neutral occurrence-context / compatibility evidence when the addressed occurrence record supplies it. It remains Addressing-owned occurrence-type data; Naming may echo it, and valid v1 observations containing it remain valid.
- The bridge does not currently emit new enriched context partition fields such as `parentAddressPath`, `depth`, `orderIndex`, `lineageKey`, `contextPartitionKey`, `siblingContextKey`, `subtreeContextKey`, `semanticTokens`, `role`, `role-like fields`, `disambiguationNotes`, `evidenceStrength`, or `evidenceLimitNotes` merely because they may be useful.
- Current runtime truth added since this spec was first written: the bridge producer also emits the separately named `occurrenceContextEnrichment` sidecar (`naming-occurrence-bridge-enrichment.v1`) carrying `parentOccurrenceAddress`, `occurrenceDepth`, `occurrenceOrderIndex`, `disambiguationNotes`, and `evidenceLimitNotes` keyed by the identity tuple, and Tree intake reads it through a dedicated sidecar intake path. The v1 observations themselves are unchanged by that sidecar.
- `semanticTokens` and role facts (`role`, `roleCategory`, `roleStatus`) are emitted only in the separately named `namingSemanticEvidenceEnrichment` section (§4.5), never on v1 observations. Current runtime truth since calculogic-validator#87: the Naming occurrence-bridge path (`projectNamingOccurrenceBridge`, and so `runNamingValidator` with an addressed namespace) emits the section. Since calculogic-validator#95 the bridge payload that Tree wiring builds internally on the runner path also carries it, and Tree validates it at intake (§4.5/§4.6 *Current consumers*).
- Folder-label observations are emitted only in the separately named `namingFolderLabelObservations` section (§4.6). Current runtime truth since calculogic-validator#91: the Naming occurrence-bridge path (`projectNamingOccurrenceBridge`, and so `runNamingValidator` with an addressed namespace) emits the section. Since calculogic-validator#95 the bridge payload that Tree wiring builds internally on the runner path also carries it, and Tree validates it at intake (§4.5/§4.6 *Current consumers*). The folder-composition, folder-semantic-context and package-root observations are unchanged.
- Tree staged intake and address-keyed join preparation may inspect the v1 bridge, but current Tree contributor behavior preserves fallback to path-keyed semantic-family evidence unless address-keyed evidence is clean and usable under Tree-owned policy.

## 3. Canonical occurrence identity contract

### 3.1 Namespace rule

`occurrenceAddress` is interpreted only inside the namespace identified by `addressProfileId` and `addressedSnapshotId`.

The tuple `addressProfileId + addressedSnapshotId + occurrenceAddress` is the preferred durable join identity for one addressed snapshot namespace. It is not a timeless global id, not a repo-wide immutable id across every profile, and not a semantic identity by itself.

### 3.2 Required durable identity tuple

For an addressed Naming occurrence observation, all three fields are required either directly on the observation or by an explicitly validated envelope inheritance rule:

| Field | Requirement | Owner | Contract meaning | Current runtime relationship |
| --- | --- | --- | --- | --- |
| `addressProfileId` | Required | Addressing | Identifier for the address profile whose grammar/provider semantics make `occurrenceAddress` meaningful. | Structural-addressing currently uses `profileId`; Naming bridge payloads normalize the contract field as `addressProfileId`. |
| `addressedSnapshotId` | Required | Addressing | Identifier for the specific addressed snapshot namespace shared by the producer and consumers during a run or staged payload exchange. | Structural-addressing has `snapshotOutputId`; whether that is sufficient as the durable snapshot namespace remains a later provider decision. |
| `occurrenceAddress` | Required | Addressing | Neutral occurrence address used for cross-slice joins inside the profile/snapshot namespace. | Current bridge payload construction can normalize an addressed occurrence `occurrenceAddress`, `address`, or `addressPath` into this field. |

Normative identity rules:

- The tuple remains the preferred durable join identity for addressed Naming occurrence observations.
- `path` and `repoRelativePath` remain compatibility/source-trace fields.
- `addressPath` remains a compatibility/debug mirror unless explicitly equal to `occurrenceAddress`.
- No enrichment field may replace, weaken, override, or compete with the canonical observation identity tuple: `addressProfileId + addressedSnapshotId + occurrenceAddress`.
- Consumers must not treat observation array index, path, semantic family, context partition key, diagnostic metadata, parent-reference evidence, or Tree placement evidence as a replacement identity. Parent-reference evidence is permitted only as optional containment evidence, never as the observation's own primary identity.

Explicit identity distinction:

- Canonical observation identity: `addressProfileId + addressedSnapshotId + occurrenceAddress`. This required tuple identifies the observed occurrence.
- Optional parent-reference identity evidence: `parentOccurrenceAddress`. This optional future enrichment field is neutral Addressing-owned containment evidence about the observed occurrence's parent.
- `parentOccurrenceAddress` does not replace the observation's own `occurrenceAddress`, must remain inside the same validated `addressProfileId` and `addressedSnapshotId` namespace, and must not become a second primary identity for the observation. Tree may later consume it only as neutral evidence after Tree validates the canonical observation tuple and applies Tree-owned join policy.

## 4. Versioned Naming bridge envelope contract

### 4.1 Current valid version

`naming-occurrence-bridge.v1` remains valid. Existing v1 producers and consumers must continue to preserve the canonical identity tuple and path-keyed compatibility/source-trace fields during migration.

### 4.2 Future enriched version decision

`occurrenceType` does not require a bridge version bump because it is existing optional v1 neutral occurrence-context / compatibility evidence when supplied by the addressed occurrence record. Valid v1 observations containing optional `occurrenceType` must not be stripped, rejected, or treated as unsupported enrichment.

New approved enrichment fields in this spec require a future explicit version named `naming-occurrence-bridge.v2` unless a later contract slice intentionally chooses a separately named additive sidecar. The default path is an additive v2 bridge payload, not mutation of v1 semantics.

The v2 bridge may keep the same top-level envelope fields as v1 and add an explicitly versioned observation enrichment block or direct observation fields for genuinely new approved fields that valid v1 observations do not already emit. A later implementation slice must choose the concrete serialization route before runtime emission. Until that slice lands, new approved fields below are contract-approved but **not current runtime truth**.

Future v2 enrichment is additive to the current Naming semantic observation payload. Any future `naming-occurrence-bridge.v2` payload, or any additive sidecar strategy, must preserve the existing Naming-owned semantic observation fields and semantics, including at minimum `semanticName`, `familyRoot`, `semanticFamily`, `familySubgroup` when present, `ambiguityFlags` when present, `splitFamilyFlags` when present, existing Naming disambiguation evidence when present, existing path/source-trace compatibility fields, and optional existing v1 `occurrenceType` behavior when available. Future enrichment adds neutral occurrence context, approved Naming metadata, or versioned diagnostics around that semantic evidence; it must not replace, flatten, omit, or downgrade the current semantic interpretation.

A sidecar approach must either preserve direct linkage to the complete current semantic observation payload or define an explicit deterministic association that leaves the existing semantic payload intact. Tree must still receive Naming semantic evidence plus any approved enrichment; Tree must not be forced to reconstruct semantic-family interpretation from raw names, paths, or enrichment fields.

Route decision for Naming token and role evidence (calculogic-validator#84): `semanticTokens` and role facts use the separately named additive sidecar route, as the Naming semantic-evidence enrichment section defined in §4.5 under the envelope-section rule in §4.4. They are not added to v1 observations and do not require `naming-occurrence-bridge.v2`. A coordinated bridge v2 was not chosen because current Tree intake rejects every bridge contract version other than v1; bumping the existing `naming-occurrence-bridge-enrichment.v1` sidecar was not chosen because current Tree intake would treat the whole sidecar as invalid and lose the occurrence context it carries today.

### 4.3 Version handling and unknown fields

Version handling rules:

- v1 consumers must continue accepting optional `occurrenceType` as existing v1 context/compatibility evidence when present; it is not unknown enrichment and not unsupported enrichment.
- v1 consumers may ignore unknown enrichment fields only if those fields are not needed to validate identity and do not change v1 semantics.
- Consumers that interpret v2 enrichment need an explicit v2-aware intake path or an explicitly documented sidecar intake path.
- Unsupported bridge versions must be handled as unsupported future evidence, not as invalid identity by default.
- Diagnostics must distinguish invalid identity from unsupported enrichment:
  - **invalid identity:** missing, non-string, empty, mismatched, duplicate, or namespace-incompatible `addressProfileId`, `addressedSnapshotId`, or `occurrenceAddress`.
  - **unsupported enrichment:** recognized identity with a bridge version, field, or sidecar that the consumer does not interpret.
  - **unsupported version:** a bridge contract version outside the consumer's supported set.
- Unsupported enrichment must not force fallback removal, shared-helper extraction, provider swaps, or Tree policy changes.
- The documented intake path for additive envelope sections, including which consumers validate section records, is the envelope-section rule in §4.4.

### 4.4 Additive envelope sections

An additive envelope section is a separately named top-level property of a `naming-occurrence-bridge.v1` payload that carries its own contract version and its own records. Sections are additive extensions of the payload envelope. They are not changes to the `naming-occurrence-bridge.v1` observation contract.

Envelope-section rules:

1. **v1 is unchanged.** A section does not change `bridgeContractVersion`, the v1 envelope fields, the v1 `compatibility` block, the v1 `observations` and their fields, or the existing `occurrenceContextEnrichment` sidecar. A payload carrying sections is a valid `naming-occurrence-bridge.v1` payload.
2. **Legacy consumers ignore unknown sections.** A consumer that does not support a section ignores it. Ignoring a section must not invalidate, drop, reorder, or alter v1 observations, the existing sidecar, or any other section.
3. **Only supporting consumers validate.** A consumer validates a section's records only when it explicitly supports that section's contract version. An unsupported section version is unsupported enrichment under §4.3, not invalid identity; its records are ignored and nothing else in the payload is affected. A supported section whose envelope is malformed (not a plain object, `identityTupleFields` not exactly the tuple below, `records` not an array, or `recordCount` not equal to the number of records) is invalid as a whole: the consumer reports one section-level diagnostic and ignores its records, and rule 4 applies.
4. **Sections are independent.** The absence, unsupported version, or invalidity of one section never affects v1 observations, the existing sidecar, or another section.
5. **Section envelope.** Every section is a plain object carrying:
   - `contractVersion`: the section's own version string;
   - `producerId` and `source`: provenance of the producing Naming component;
   - `identityTupleFields`: exactly `["addressProfileId", "addressedSnapshotId", "occurrenceAddress"]`, in that order;
   - `recordCount`: the number of records;
   - `records`: the records, sorted by `addressProfileId`, then `addressedSnapshotId`, then `occurrenceAddress`;
   - optional `diagnostics`: section-level producer diagnostics.

   Section counts and diagnostics live inside the section, never in the v1 `compatibility` block.
6. **Identity.** Every section record carries the canonical identity tuple (§3.2). Its `addressProfileId` and `addressedSnapshotId` must equal the payload's namespace. Section records associate only through the identity tuple. `repoRelativePath` may be echoed as source-trace only and is never a join key; the §8 path fallback does not extend to section records.
7. **Declared association.** Each section's contract states what a record attaches to (for example, an existing v1 observation, or an addressed occurrence) and which occurrence types it applies to.
8. **Change control.** Adding a section, or a new section version, requires a contract amendment that passes the §6.2 decision standard for every field it carries.
9. **Payload-level sections** (calculogic-validator#157). A section whose records describe the validation target as a whole, or (calculogic-validator#162) the run itself, such as the vocabulary of its resolved registry set (§4.9), rather than an addressed occurrence, is a **payload-level section**. It must say so in its contract, and it is the only kind of section that departs from rules 5 and 6:
   - Its envelope carries no `identityTupleFields`, and its records carry no identity tuple and no `repoRelativePath`.
   - Its contract declares the record key that orders and distinguishes its records, in place of the tuple.
   - It never attaches to an occurrence, and an occurrence-keyed consumer never joins it to one.
   - Rules 1–4, 7 and 8 apply unchanged. A supported payload-level section whose envelope is malformed (not a plain object, carrying `identityTupleFields`, `records` not an array, or `recordCount` not equal to the number of records) is invalid as a whole (rule 3).

   Repository facts never become occurrences through this rule: Naming must not manufacture an occurrence for the repository root (§4.6, "Namespace root").

The existing `occurrenceContextEnrichment` sidecar predates this rule and keeps its established shape (`enrichmentContractVersion`, `identityTupleFields`, `enrichedObservations`). This rule does not change it.

### 4.5 Naming semantic-evidence enrichment section

- **Section name:** `namingSemanticEvidenceEnrichment`.
- **Contract version:** `naming-semantic-evidence-enrichment.v1`.
- **Provenance:** `producerId: naming-semantic-evidence-enrichment`, `source: calculogic-validator/naming`.
- **Status:** contract-approved by calculogic-validator#84; emitted by the Naming occurrence-bridge path since calculogic-validator#87. The bridge payload that Tree wiring builds internally does not carry the section, and no consumer reads it yet.

**Purpose.** The section enriches existing file observations with Naming-owned semantic tokens and role facts. It does not create observations of its own.

**Association.** A record attaches to the v1 observation in the same payload that carries the same identity tuple. The section applies to file occurrences only. Folder observations (`folder-semantic-structural-composition`, `folder-semantic-context`, `semantic-family-root-folder`) are not enriched by this section.

**Record shape.** Each record carries the identity tuple, optionally `repoRelativePath` as source-trace only, and at least one enrichment field group:

| Field group | Fields | Rule |
| --- | --- | --- |
| Tokens | `semanticTokens` | §6.2 `semanticTokens` row |
| Role facts | `role`, `roleCategory`, `roleStatus` | §6.2 `role` row; the three fields are emitted together or not at all |

A record that would carry no enrichment field group is not emitted.

**Production source.** Records are produced by a Naming-owned projection of the same canonical Naming findings that produce v1 file observations. The prepared path-keyed semantic-family bridge projection (`projectNamingSemanticFamilyBridge`, `NamingValidatorSpec.md` Naming→Tree bridge contract) is not changed by this section and does not gain these fields.

**Producer identity rules.**

- A record is emitted only for a v1 file observation the producer emitted in the same payload.
- When the addressed namespace is invalid, the section is omitted; the payload's existing namespace diagnostics already record the cause.
- When occurrence identity cannot be attached to a Naming source observation, no v1 observation and no section record is emitted for it. The existing `missing-occurrence-identity` payload diagnostic records the omission; the section does not duplicate it.
- Naming never synthesizes an `occurrenceAddress` or infers snapshot identity to force attachment (Naming address-attached rules spec §8).
- The section is omitted when it would contain no records.

**Consumer identity rules.** A supporting consumer validates section records separately from v1 identity (§7, rule 13) and drops a record, with a distinguishable diagnostic, when:

| Case | Diagnostic meaning |
| --- | --- |
| The identity tuple is missing, non-string, or empty | invalid identity |
| The same identity tuple appears in more than one record | duplicate identity; every record carrying that tuple is dropped |
| The record's `addressProfileId` or `addressedSnapshotId` differs from the payload namespace | namespace mismatch |
| No v1 observation that the consumer accepted carries the same tuple | unmatched record |
| The matching v1 observation carries an `occurrenceType` other than `file` | occurrence-type mismatch |

An invalid value in one field group invalidates only that field group, never the identity tuple or the other group. There is no path fallback: a record that cannot be associated through the identity tuple is dropped.

**Absence behavior.** When the section is absent, carries an unsupported version, or is invalid, consumer behavior is exactly the behavior without the section. The enrichment is then **unavailable** evidence:

- consumers must not manufacture tokens or role facts, including by re-tokenizing `semanticName` or parsing paths;
- consumers must not treat a comparison that needs unavailable enrichment as a failed comparison;
- unavailable enrichment is never contradictory evidence.

**Ownership boundaries.**

- Naming owns token interpretation and role interpretation (§5).
- The section must not carry folder-kind, structural-home, semantic-home, placement, scatter/cluster, confidence, severity, Tree diagnostic, or finding fields (§7, rule 5).
- Role facts are Naming source facts about the role slot and its registry metadata, not naming-validity verdicts; validity stays in the Naming report classification. Role-like hints remain in existing v1 disambiguation evidence and `disambiguationNotes`; role-like fields stay deferred (§6.2).
- Tree may consume the section only as evidence under Tree-owned rules.

**Current consumers.** Since calculogic-validator#95, Tree receives this section on its default path (Tree slice spec, "Folder-level semantic-home evidence, Stage 1", S1.1) and validates it at intake under the consumer rules above (S1.2, S1.3 run and record levels). Tree joins, existing evidence and findings are unchanged by it; Tree's use of accepted records for folder-level evidence (Stage 1B) is not current runtime truth.

### 4.6 Naming folder-label observation section

- **Section name:** `namingFolderLabelObservations`.
- **Contract version:** `naming-folder-label-observation.v1`.
- **Provenance:** `producerId: naming-folder-label-observation`, `source: calculogic-validator/naming`.
- **Status:** contract-approved by calculogic-validator#89; emitted by the Naming occurrence-bridge path since calculogic-validator#91. The bridge payload that Tree wiring builds internally does not carry the section, and no consumer reads it yet.
- **Interpretation rules:** Naming semantic interpretation spec (`doc/ValidatorSpecs/naming-owned/naming-semantic-family-and-interpretation.spec.md`) §13.
- **Envelope:** §4.4 rule 5 (`contractVersion`, `producerId`, `source`, `identityTupleFields`, `recordCount`, tuple-sorted `records`, optional `diagnostics`).

**Purpose.** The section describes what each addressed folder's label says, as lexical material. It is a **distinct kind of observation**, not enrichment. It does not claim that any folder is a semantic home.

**Independence.** The section is independent of the v1 observations, the `occurrenceContextEnrichment` sidecar and the §4.5 section. Its records are never added to v1 observations or `NAMING_SEMANTIC_FIELDS`, and never merged into file observations. It shares only the identity framework (§3) and the envelope-section rule (§4.4) with §4.5.

**Association.** A record attaches to the **addressed folder occurrence** in the payload namespace that carries the same identity tuple. It does not attach to a v1 observation, because most folders have none.

**Coverage.**

- Every occurrence in the addressed snapshot whose `occurrenceType` is `folder` gets exactly one record, regardless of what the folder contains. This includes folders none of whose files have a Naming semantic observation, and scope-root folders (for example, `src` and `test` at `app` scope, which Structural Addressing marks as scoped roots).
- Scope means membership in the addressed snapshot. There is no separate scope policy.
- **Namespace root.** A folder is covered only when Structural Addressing represents it as a folder occurrence. The current addressed snapshots do not represent the repository root as an occurrence (top-level occurrences have no parent), so it gets no record, and Naming must not manufacture one. If an address profile later represents a namespace root as a folder occurrence, the same coverage rule applies to it.

**Record shape.** Each record carries the identity tuple, `repoRelativePath` as source-trace only, and one of two field groups determined by `parseOutcome` (§6.3):

| `parseOutcome` | Fields | Never present |
| --- | --- | --- |
| `parsed` | `labelTokens`, `labelRoot`, optional `labelFacts` | `notParsedReasons` |
| `not-parsed` | `notParsedReasons` | `labelTokens`, `labelRoot`, `labelFacts` |

A not-parsed record never retains a partial interpretation (interpretation spec §13.4).

**Production source.** Records are produced by Naming from the addressed folder occurrences of the supplied namespace, using the interpretation rules referenced above. They need the addressed snapshot, so they are produced where an addressed namespace is available.

**Producer identity rules.**

- Records come from addressed folder occurrences, so each record's identity exists by construction.
- A folder occurrence without an occurrence address gets no record. The section records the omission as a section diagnostic.
- When the addressed namespace is invalid, the section is omitted; the payload's existing namespace diagnostics already record the cause.
- Naming never synthesizes an `occurrenceAddress` or infers snapshot identity (Naming address-attached rules spec §8).
- The section is omitted when it would contain no records.

**Consumer identity rules.** A supporting consumer validates records separately from v1 identity (§7, rule 13) and drops a record, with a distinguishable diagnostic, when:

| Case | Diagnostic meaning |
| --- | --- |
| The identity tuple is missing, non-string, or empty | invalid identity |
| The same identity tuple appears in more than one record | duplicate identity; every record carrying that tuple is dropped |
| The record's `addressProfileId` or `addressedSnapshotId` differs from the payload namespace | namespace mismatch |
| No addressed occurrence in the consumed snapshot carries the same tuple | unmatched record |
| The matching addressed occurrence is not a folder | occurrence-type mismatch |
| `parseOutcome` is missing or not one of `parsed` and `not-parsed`, or the record carries fields from the other outcome's group | invalid record shape |

There is no path fallback: a record that cannot be associated through the identity tuple is dropped.

**Parsed, not-parsed and absent.** These are three distinct states for a folder:

- `parsed`: a usable lexical interpretation was produced.
- `not-parsed`: Naming evaluated the label and it did not satisfy the interpretation rules. This is a positive statement about the label, with reasons. It is not missing evidence and not contradictory evidence.
- **absent**: a consumer has no usable record for the folder, because the section is absent, unsupported or invalid, or the record was dropped. Absent evidence is unavailable, never contradictory.

**Independence from §4.5.**

- This section is valid without the §4.5 section.
- Together with existing v1 `familyRoot`, it supports comparing a folder's lexical label root with file family roots.
- Comparing label tokens with file token prefixes additionally needs the §4.5 section's `semanticTokens`.
- When evidence from either section is unavailable, consumers must not manufacture tokens, reinterpret labels or parse folder names themselves, and must not treat an unavailable comparison as a failed one.

**Ownership boundaries.**

- Naming owns label interpretation (§5).
- The section must not carry folder-kind, structural-home, semantic-home, ownership, responsibility, placement, scatter/cluster, confidence, severity, qualifier-meaning, Tree diagnostic, or finding fields (§6.2 decision standard; §7, rule 5).
- Tree may consume records only as evidence under Tree-owned rules, and never parses folder labels itself.
- The folder-composition patterns, folder-semantic-context patterns and package-root projection are unchanged by this section.

**Current consumers.** Since calculogic-validator#95, Tree receives this section on its default path (Tree slice spec, "Folder-level semantic-home evidence, Stage 1", S1.1) and validates it at intake under the consumer rules above (S1.2, S1.3 run and record levels). Tree joins, existing evidence and findings are unchanged by it; Tree's use of accepted records for candidates and folder-level evidence (Stage 1B) is not current runtime truth.

### 4.7 Naming token lexical-identity section

- **Section name:** `namingTokenLexicalIdentities`.
- **Contract version:** `naming-token-lexical-identity.v1`.
- **Provenance:** `producerId: naming-token-lexical-identity`, `source: calculogic-validator/naming`.
- **Status:** contract-approved by calculogic-validator#150. **Current implementation reality since its implementation slice:** the Naming occurrence-bridge path emits it whenever the run has an active language profile, including in the bridge payload Tree wiring builds. **Tree consumption (Current, calculogic-validator#153):** Tree is a supporting consumer, reading the section only for Stage 3 positional lineage expression (Tree slice spec S1.1–S1.3, S3.2).
- **Envelope:** §4.4 rule 5, plus one required field, `lexicalProfile` (below).
- **Lexical model:** the Linguistic Foundation shared contract (`doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md`), §4–§8.

**Purpose.** The section presents, for the tokens Naming already supplies in the §4.5 and §4.6 sections, the Linguistic Foundation's lexical resolution of each token under the run's active language profile. Naming presents foundation evidence. It does not own lexeme identity, does not resolve tokens itself, and adds no interpretation of its own.

**Independence.** The section is a separate section (§4.4 rule 4). It does not change the §4.5 or §4.6 sections, their versions or their records, so a consumer that does not support it keeps every token it reads today. Its records never merge into another section.

**Envelope field `lexicalProfile`.** `{ profileId, profileVersion, lexiconDigest }`, each a non-empty string: the provenance of the one active profile every record in the section was resolved under (foundation contract §7). A section without a valid `lexicalProfile` is a malformed supported section (§4.4 rule 3).

**Association.** A record attaches through the identity tuple to exactly one source record in the same payload:

| `tokenSource` | Source record | Token list |
| --- | --- | --- |
| `semantic-tokens` | the §4.5 record of a file occurrence that carries `semanticTokens` | its `semanticTokens` |
| `label-tokens` | the §4.6 `parsed` record of a folder occurrence | its `labelTokens` |

A `not-parsed` §4.6 record and a §4.5 record without `semanticTokens` get no record. An identity tuple appears in at most one record: a file and a folder never share a tuple.

**Record shape.** Each record carries the identity tuple, optionally `repoRelativePath` as source-trace only, `tokenSource`, and `tokens`: one entry per position of the source token list, in source order (§6.4).

**Production source and ownership.**
- The records are produced by a Naming-owned projection, which `createNamingOccurrenceBridgePayload` invokes when it builds the §4.5 and §4.6 sections. Its only lexical operation is the foundation's `resolveSurfaceForm` on each token, exactly as supplied. Naming applies no lexical rule of its own.
- On the runner path, the prepared foundation state reaches the producer through the same opaque transport as the §4.5 source and the folder-label interpreter (Tree slice spec S1.1): Naming's staging function returns it as an opaque value, the runner passes it unchanged, and Tree wiring passes it to `createNamingOccurrenceBridgePayload`. The runner never calls the foundation's resolution or comparison functions, builds records or inspects readings. Neither does Tree for transport. As a consumer (calculogic-validator#153), Tree reads the readings of records it accepted and relates two of them only through the foundation's comparison relation, from one Tree module (Tree slice spec S1.1). It never calls `resolveSurfaceForm` or builds records.

**Producer rules.**
- The section is emitted only when a language profile is active for the run. With none active it is omitted, and nothing else in the payload changes.
- A record is emitted for every source record in the association table, and only for those.
- An `unknown` token is a valid entry, not an omission: a profile that knows no reading for a token says so.
- When the addressed namespace is invalid, or the section would contain no records, it is omitted.
- Naming never synthesizes an `occurrenceAddress` or infers snapshot identity (Naming address-attached rules spec §8).

**Consumer identity rules.** A supporting consumer validates records separately from v1 identity (§7, rule 13), after it has accepted the §4.5 and §4.6 records, and drops a record, with a distinguishable diagnostic, when:

| Case | Diagnostic meaning |
| --- | --- |
| The identity tuple is missing, non-string, or empty | invalid identity |
| The same identity tuple appears in more than one record | duplicate identity; every record carrying that tuple is dropped |
| The record's `addressProfileId` or `addressedSnapshotId` differs from the payload namespace | namespace mismatch |
| The record does not have the §6.4 shape: `tokenSource` is not `semantic-tokens` or `label-tokens`; `tokens` is not a non-empty array; an entry is not an object with a non-empty string `surface`, a `status` from §6.4 and a `readings` array; or a reading is not an object with a non-empty string `lexemeId`, a `features` object mapping foundation feature spaces to their values, and `basis` `lexicon-entry` | invalid record shape |
| No accepted source record of the record's `tokenSource` carries the same tuple | unmatched record |
| `tokens` has a different length from the accepted source token list | token-count mismatch |
| An entry's `surface` differs from the source token at that position | surface mismatch |
| An entry's `status` disagrees with its readings (foundation contract §6.1) | status-readings disagreement |
| A reading's `lexemeId` does not begin with the envelope's `profileId` and a dot | lexeme outside the profile |

The cases are checked in table order, and a record's shape is checked before its alignment, so a malformed structure is reported as **invalid record shape** and never as an alignment case. A malformed record is dropped on its own; the section's other records are unaffected. Only a malformed envelope, including an invalid `lexicalProfile`, invalidates the whole section (§4.4 rule 3). A consumer never fails or stops on a malformed record. There is no path fallback.

**Absence behavior.** When the section is absent, unsupported or invalid, or a record is dropped, lexical identity is **unavailable** evidence (foundation contract §8.4):
- consumers must not resolve tokens themselves, transform surface strings or keep a lexicon copy;
- an unavailable comparison is never a failed one, and unavailable evidence is never contradictory.

**Ownership boundaries.**
- Lexeme identity, readings, statuses and the comparison relation are the Linguistic Foundation's (foundation contract §13). Token production stays Naming's (§5).
- The section must not carry folder-kind, structural-home, semantic-home, ownership, placement, confidence, severity, Tree diagnostic or finding fields (§7, rule 5).
- Tree may consume records only as evidence under Tree-owned rules, decided in a Tree slice.

**Current consumers.** Tree, since calculogic-validator#153: a separate Tree lexical-identity intake (`treeLexicalIdentityIntake`), read only by Stage 3 positional lineage expression (Tree slice spec S1.1–S1.3, S3.2). It performs the consumer identity checks above in their stated order. Tree's Stage 1A intake still reads a payload carrying the section exactly as without it (§4.4 rule 2).

### 4.8 Naming repository-package label section

- **Section name:** `namingRepositoryPackageLabels`.
- **Contract version:** `naming-repository-package-label.v1`.
- **Provenance:** `producerId: naming-repository-package-label`, `source: calculogic-validator/naming`.
- **Status:** contract-approved by calculogic-validator#157. **Current since calculogic-validator#159:** the Naming occurrence-bridge path emits it whenever a repository package identity fact is supplied, including in the bridge payload Tree wiring builds, and Tree is a supporting consumer for S3.2 only.
- **Kind:** a payload-level section (§4.4 rule 9). Its record key is `element`.
- **Envelope:** `contractVersion`, `producerId`, `source`, `recordCount`, `records` (ordered `scope`, then `name`), optional `diagnostics`.
- **Interpretation rules:** Naming semantic interpretation spec §13, the folder-label interpretation, unchanged.

**Purpose.** The validation target's root manifest may declare the package the repository root *is* (for example `@calculogic/validator`). The section presents Naming's interpretation of each segment of that declared identity as label material, exactly as Naming interprets a folder label. Tree uses it only for S3.2 repository package expression (Tree slice spec S3.2).

**Source fact.** The declared identity is a neutral suite-core fact, `{ scope, name }` (capability inventory §3.11). Naming does not read the manifest, does not derive an identity from a directory name, and adds no rule of its own.

**Records.** One record per declared segment: a `scope` record when the identity has a scope, then a `name` record. Each record carries:
- `element`: `scope` or `name`;
- `segment`: the declared segment exactly as the fact carries it, without `@` or `/`;
- the §4.6 parse field groups, with the same meaning and the same exclusivity rule (§6.3): `parseOutcome` `parsed` with `labelTokens`, `labelRoot` and optional `labelFacts`, or `not-parsed` with `notParsedReasons`.

**Production and transport.**
- `createNamingOccurrenceBridgePayload` builds the section from an optional `repositoryPackageIdentity` input, using the same folder-label interpreter it receives for §4.6.
- On the default path, Tree wiring obtains the fact from suite core and passes it unchanged to `createNamingOccurrenceBridgePayload`, with the folder-label interpreter it already passes. Tree never tokenizes or interprets the identity.
- The section is independent of the addressed namespace: it does not need one, and an invalid namespace does not omit it.

**Producer rules.**
- With no fact, the section is omitted and nothing else in the payload changes.
- Every declared segment gets exactly one record. A segment that does not parse gets a `not-parsed` record, never a partial interpretation.
- Naming never adds lexical-identity records (§4.7) for package segments.

**Consumer rules.** A supporting consumer validates the envelope (§4.4 rules 3 and 9) and then each record, and drops a record, with a distinguishable diagnostic, when:

| Case | Diagnostic meaning |
| --- | --- |
| `element` is not `scope` or `name` | invalid record shape |
| The same `element` appears in more than one record | duplicate element; every record carrying it is dropped |
| `segment` is not a non-empty string | invalid record shape |
| `parseOutcome` is missing or not one of `parsed` and `not-parsed`, or the record carries fields from the other outcome's group | invalid record shape |
| A `scope` record follows the `name` record | element order; both records are dropped |

There is no fallback: a consumer never reads the manifest, a package name from elsewhere or the checkout directory name instead.

**Parsed, not-parsed and absent.** As for §4.6: a `not-parsed` record and an absent one both contribute no lineage element. Absence is unavailable evidence, never contradictory.

**Ownership boundaries.**
- The identity is suite core's fact (capability inventory §3.11); its label interpretation is Naming's (§5).
- The section must not carry folder-kind, structural-home, semantic-home, ownership, responsibility, placement, confidence, severity, Tree diagnostic or finding fields (§7, rule 5).
- Whether and where a package element expresses anything is Tree's decision (Tree slice spec S3.2). This section asserts no family, concept or lineage.
- Structural Addressing is unchanged: the repository root stays a non-occurrence.

**Current consumers.** Tree, since calculogic-validator#159: a separate Tree intake (`treeRepositoryPackageIntake`, `tree/src/tree-repository-package-evidence.logic.mjs`), read only by Stage 3 repository package expression (Tree slice spec S1.1–S1.3, S3.2). It performs the consumer checks above in their stated order. Tree's Stage 1A intake reads a payload carrying the section exactly as without it (§4.4 rule 2).

### 4.9 Naming role-category vocabulary section

- **Section name:** `namingRoleCategoryVocabulary`.
- **Contract version:** `naming-role-category-vocabulary.v1`.
- **Provenance:** `producerId: naming-role-category-vocabulary`, `source: calculogic-validator/naming`.
- **Status:** Contract, calculogic-validator#162. **Current since its evidence-only implementation slice:** the Naming occurrence-bridge path emits it whenever a vocabulary input is supplied, including in the bridge payload Tree wiring builds on the staged path, and Tree takes it in as a supporting consumer whose result nothing reads yet (Tree slice spec S1.1–S1.3).
- **Kind:** a payload-level section (§4.4 rule 9) describing the run, not the target or an occurrence. Its record key is `category`.
- **Envelope:** `contractVersion`, `producerId`, `source`, `registrySource`, `categoryRolePerspectiveDigest`, `recordCount`, `records` (sorted by `category`), optional `diagnostics`. No `identityTupleFields`.

**Purpose.** It states, for the run that produced the payload, every role category the §4.5 section's role-fact group can carry, with the roles that produce each one: the run's **producible role-category vocabulary**. It describes the domain of `roleCategory`; it classifies nothing. Its consumer uses it to bound what an unrecognized file could carry if it were recognized (Tree slice spec S3.6). It never assigns a category to an occurrence.

**Independence.** It is separate from §4.5 and changes nothing in it: not its version, envelope, records or field groups. A consumer that does not support it reads every other section exactly as before (§4.4 rules 2 and 4). It is not part of §4.8, whose subject is the target's declared package, not the run's registry set.

**Source and completeness guarantee (Naming).**
- One Naming-owned derivation function produces the vocabulary from the run's **resolved roles runtime** (`toNamingRolesRuntime` over the resolved registry set, `naming/src/naming-runtime-converters.logic.mjs`): for every role the runtime holds, whatever its status, its category, with the roles that produce it. Every role-fact group is read from the same runtime, so the vocabulary contains every value a §4.5 `roleCategory` can take in the run. It is an upper bound, **not** an exact one: canonical admission (§4.9.1) can exclude a declared category entirely, as Builtin `deprecated` is excluded, since its only role is deprecated. (Clarified by calculogic-validator#162, v2 contract; no behavior changes.)
- **Completeness is Naming's guarantee.** The producer emits the whole vocabulary or no section; it never emits a partial one. A consumer cannot verify completeness without Naming's registry data, which it must not read (§5), and does not claim to.
- The same function is the one place the derivation lives, so that a future registry-level bridge (registry lifecycle spec §9.4) over the category-role perspective cannot disagree with it.
- Never a fallback to Builtin, never a directory name, never a value the producer did not derive from the run's runtime.

**Provenance.**
- `registrySource`: the run's resolved set (`builtin`, `custom` or `candidate`), as the run's registry resolution states it.
- `categoryRolePerspectiveDigest`: the digest of the resolved `naming/category-role-perspective` registry, **copied from the run's suite-provided registry provenance** (registry lifecycle spec §11.2), not computed by Naming. Categories and roles come from that registry; role statuses come from `naming/roles` and do not change which categories are producible, so no `naming/roles` digest is carried unless a later version makes role status part of the contract.
- What a digest establishes: which registry the vocabulary was derived from. It does **not** establish that the list is complete (the producer computes both) or that two independently produced payloads describe the same snapshot.

**Records.** `{ category, roles }`: `category` a non-empty string, exactly as the §4.5 `roleCategory` carries it; `roles` a non-empty, sorted, duplicate-free list of non-empty role strings. Categories are unique. A declared category with no role is not producible and has no record.

**Production and transport.** On the default path Naming's staging function returns the vocabulary as an opaque staged value, derived from the same registry resolution as the run; the runner passes it unchanged and Tree wiring passes it to `createNamingOccurrenceBridgePayload`, which emits the section (as §4.7 and §4.8). A direct caller of `projectNamingOccurrenceBridge` may supply the same value. The section does not depend on the addressed namespace. The staged value is `{ registrySource, categoryRolePerspectiveDigest, records }`; staging returns none when the run's registry resolution carries no provenance for `naming/category-role-perspective`, so there is never a vocabulary without provenance. The staged value is deeply frozen and recorded against the registry resolution object it was derived from; `isNamingDerivedRoleCategoryVocabulary(value, registryResolution)` lets a consumer's wiring establish that a value is the run's own derivation, which the producer path's completeness guarantee requires (Tree slice spec S1.1, S1.2 check 3). It reads no registry and exposes no vocabulary content.

**Producer rules.**
- No vocabulary input: the section is omitted, and nothing else in the payload changes.
- An input that is not a complete, well-formed vocabulary: the section is omitted, never emitted partially.

**Consumer rules.** A supporting consumer validates the envelope (§4.4 rules 3 and 9; `registrySource` and `categoryRolePerspectiveDigest` non-empty strings) and every record. Because a vocabulary missing a category is the unsafe direction, **any** invalid record, a duplicate category, or a `recordCount` mismatch makes the whole section invalid: there is no per-record dropping. Its trust, consistency and provenance checks are the consumer's own (Tree slice spec S1.2, S1.3).

**Ownership boundaries.**
- Naming owns the vocabulary and its completeness; suite core owns the registry provenance; the consumer owns what the vocabulary allows it to conclude.
- The section must not carry a responsibility class, a mapping, Agnostic-Core meanings, folder-kind, placement, Tree diagnostic or finding fields (§7, rule 5).
- A consumer never reads Naming's registries or registry state to obtain, check or complete the vocabulary.

**Current consumers.** Tree, since the evidence-only implementation slice: a separate Tree intake (`treeRoleCategoryVocabularyIntake`, `tree/src/tree-role-category-vocabulary-evidence.logic.mjs`) that performs the consumer checks above and Tree's own trust, provenance and consistency checks (Tree slice spec S1.2, S1.3). Nothing reads its result yet: Stage 3 is unchanged until a separately authorized slice adopts the S3.6 rule. Tree's Stage 1A intake reads a payload carrying the section exactly as without it (§4.4 rule 2).

#### 4.9.1 Version 2: declared vocabulary and canonically admissible upper bound

- **Contract version:** `naming-role-category-vocabulary.v2`. Same section name, provenance fields, kind and record key as v1.
- **Status:** Contract, calculogic-validator#162 (v2 contract); **implementation-pending**. Current behavior is v1 (§4.9): no producer emits v2 and no consumer reads it yet.
- **Envelope:** `contractVersion`, `producerId`, `source`, `registrySource`, `categoryRolePerspectiveDigest`, `rolesDigest`, `recordCount`, `records`, `admissibleCategories`, optional `diagnostics`. No `identityTupleFields`.
- **Records:** exactly as v1. `{ category, roles }` is the run's **declared vocabulary**: every category of every role the resolved roles runtime holds, whatever its status, sorted by `category`.

**Purpose.** v2 states two facts Naming owns, kept distinct:
- **Declared vocabulary** (`records`): the categories Naming recognizes in the run (as v1).
- **Canonically admissible upper bound** (`admissibleCategories`): a set of categories that contains every category Naming's canonical outcome can admit into a §4.5 role-fact group in the run.

A consumer that needs to bound what an unrecognized file could carry if it were recognized (Tree slice spec S3.6) reads the bound, not the declared vocabulary. Neither set classifies anything or assigns a category to an occurrence.

**Canonical admission.** A §4.5 role-fact group exists only for a finding that reaches Naming's **canonical outcome**. Admission is defined by that outcome, not by the `canonical` classification label. The label comes from the finding-policy registry, which a Custom set may edit; relabelling an outcome changes neither admission nor the bound. (Evidence, calculogic-validator#162: a Custom set labelling the deprecated-role outcome `canonical` still adds no deprecated category to §4.5, because the §4.5 projection needs semantic-family details that only the canonical outcome derives.)

**Soundness (mandatory).** `admissibleCategories` must contain every category the canonical outcome can admit in the run, for every file the run could classify. A bound missing such a category is a contract violation. It is the unsafe direction: it would let a consumer treat a possible category as impossible.

**Precision (best-effort).** The bound may also contain categories the canonical outcome cannot admit. That never violates soundness. Naming leaves a declared category out of the bound only when it can establish, from the run's resolved role metadata alone, that no role of that category can reach the canonical outcome.

**Structural dependency (current derivation).**
- Today the canonical outcome is reachable for a role only when the role is in the resolved roles runtime's `activeRoles` (`isUnknownOrInactiveRole(role, roleMetadata, runtime.activeRoles)` is false; `naming/src/naming-validator.logic.mjs`). `activeRoles` is built by `toNamingRolesRuntime` from the same runtime as the declared vocabulary.
- The other admission conditions depend only on the filename (special cases, missing-role patterns, semantic-name case rules). They can only exclude a file, never admit a role's category.
- Therefore, today, `admissibleCategories` is the categories of the roles in `activeRoles`. It is computed from the runtime, never by inspecting files.

**Governance of admission changes.**
- Canonical admission must not bypass the eligibility source the bound is derived from. Contract review of §4.9 is required, in the same amendment as the change itself, for any change to how canonical admission depends on a role: a new admissible status, eligibility that depends on more than resolved role metadata, or a path that produces §4.5 role facts outside the canonical outcome.
- If eligibility can no longer be established from resolved role metadata alone, the producer must not emit a narrower bound. It emits no v2 section, and the bound is **unavailable**.
- Per-role canonical probes (Tree slice spec S1.3, v2 acceptance) are regression tests of this dependency, not a proof over every filename or context.

**Unavailable versus empty.** These must never be conflated:
- An **empty** bound (`admissibleCategories: []`) is valid evidence that no declared category can be canonically admitted in the run.
- An **unavailable** bound is the absence of trustworthy v2 evidence: no v2 section, an unsupported or invalid one, or one the consumer does not trust.

A consumer never reads unavailability as empty, and never reads the declared vocabulary as the admissible bound.

**Provenance.**
- `registrySource` and `categoryRolePerspectiveDigest`: as v1.
- `rolesDigest`: the digest of the resolved `naming/roles` registry, **copied from the run's suite-provided registry provenance** (registry lifecycle spec §11.2), not computed by Naming. Role statuses come from that registry, so the bound depends on it.
- Both digests identify their source registries. As in v1, neither establishes completeness or soundness, which are Naming's guarantees.

**Production and transport.**
- One Naming-owned derivation produces the declared records and `admissibleCategories` together, from one resolved roles runtime, in the factory that resolves that runtime from the registry resolution alone.
- The result is the same deeply frozen, origin-bound staged value as v1 (`isNamingDerivedRoleCategoryVocabulary`), extended with `rolesDigest` and `admissibleCategories`. The bound is never supplied, edited or transported apart from that value.
- The factory returns no value when the run's provenance lacks either registry's digest.
- The producer emits v2 whenever it receives a complete, well-formed staged v2 value, on every path that accepts the staged value (Tree wiring and a direct `projectNamingOccurrenceBridge` caller alike). Whether to trust the section is the consumer's decision, never the producer's.
- Once v2 is implemented, the producer emits v2 in place of v1: never both in one payload.

**Producer rules.** As v1, plus: a staged value whose `admissibleCategories` is missing, not sorted and duplicate-free, contains a non-string or empty string, or names a category without a record, is not a complete, well-formed vocabulary, and the section is omitted.

**Consumer rules.**
- A supporting consumer validates the whole section: the v1 envelope and record rules; `rolesDigest` a non-empty string; `admissibleCategories` an array of non-empty strings, sorted, duplicate-free, each the `category` of a record. An empty array is valid.
- Any defect makes the whole section invalid. There is no per-record or per-category dropping.
- Trust, provenance (both digests) and consistency checks are the consumer's own (Tree slice spec S1.2, S1.3).

**v1 compatibility.**
- A v1 section never provides admissibility evidence, and a consumer never derives a bound from v1 records.
- Once a consumer supports v2 for the bound, v1 is unsupported for that purpose: conservative and observable, never read silently as v2.
- The v1 contract (§4.9) stays documented. It is the current contract until the v2 implementation lands.

**Ownership boundaries.** As v1. Naming owns both sets and their guarantees, including canonical admission and its relation to the bound. A consumer never reads role statuses, finding-policy labels or Naming's admission logic to obtain, check or complete either set.

## 5. Ownership boundaries

| Surface | Addressing | Naming | Tree | Suite-core |
| --- | --- | --- | --- | --- |
| Occurrence identity | Owns `occurrenceAddress`, address profile semantics, address grammar, addressed snapshot/provider output rules, and parent/child/sibling identity facts. | References identity to attach observations; does not define address grammar. | Consumes identity for tuple matching and join preparation; does not define Naming semantics. | Transports identity neutrally; does not own semantics. |
| Neutral occurrence context | Owns neutral lineage/depth/containment facts, parent/child/sibling identity facts, and deterministic occurrence ordering. | May copy approved neutral context as evidence when sourced from Addressing and shaped by this spec. | May consume neutral context only as evidence under Tree-owned qualification policy. | May stage opaque payloads without semantic ownership. |
| Semantic interpretation | Does not own Naming semantics. | Owns semantic-name, family-root, semantic-family, family-subgroup, token interpretation, role interpretation, ambiguity flags, split-family flags, disambiguation interpretation, bridge observation production, preservation of current semantic observation payloads, and approved semantic-evidence partitioning representation. | Consumes Naming semantic evidence plus approved enrichment for Tree-owned structural interpretation after joining; does not reconstruct Naming semantic-family interpretation from raw names, paths, or enrichment fields. | May report metadata without semantic ownership. |
| Tree conclusions | Does not own Tree placement conclusions. | Must not emit Tree conclusions. | Owns folder-kind interpretation, structural-home interpretation, semantic-home interpretation, placement reasoning, scatter/cluster reasoning, confidence, severity, findings, fallback selection, join diagnostics, and clean/usable evidence assessment. | May transport/report metadata without owning Tree conclusions. |

Suite-core owns only runner orchestration, staging, target/scope transport, source metadata, report-envelope mechanics, and neutral opaque payload transport.

## 6. Field eligibility table for existing v1 fields and future enriched bridge versions

### 6.1 Existing optional v1 context/compatibility field

| Field | Classification | Owner | Source of truth | Value shape | Required / optional | Null / absence behavior | Normalization and deterministic-order requirements | Identity status | Tree-consumption limitation | Versioning rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `occurrenceType` | existing optional v1 neutral occurrence-context / compatibility evidence | Addressing | Addressed occurrence record occurrence-type data supplied in current v1 observation production | non-empty string from the Addressing-owned vocabulary when supplied | Optional in v1 because existing production includes it only when available | Omit when unavailable; do not invent `unknown`; invalid values affect only this optional context field unless they break identity validation elsewhere | Preserve source spelling from the approved Addressing vocabulary; no mapping to Tree `folderKind`; no sorting role | Not part of the canonical durable observation identity tuple `addressProfileId + addressedSnapshotId + occurrenceAddress` | Tree may consume only as occurrence kind evidence; it is not Tree folderKind, structural-home policy, semantic-home policy, placement policy, confidence, severity, diagnostics, or findings | Retaining or documenting `occurrenceType` does not require `naming-occurrence-bridge.v2`; valid v1 observations containing it remain valid and must not be stripped, rejected, or treated as unsupported enrichment |

### 6.2 Candidate table for genuinely new future enrichment fields

Decision standard: approve only fields with a clear current source, a narrow semantic purpose, a deterministic representation, and a concrete need for the first enriched Naming bridge version. Defer fields that require a new vocabulary, an opaque grouping strategy, a separate role/token model, unclear source authority, or likely Tree-policy leakage. Reject fields that would encode Tree placement, folder/home interpretation, severity, confidence policy, or findings.

| Candidate | Decision status | Owner | Source of truth | Exact field name when approved | Value shape when approved | Required / optional when approved | Null / absence behavior when approved | Normalization and deterministic-order requirements when approved | Classification | Tree-consumption limitation | Explicit prerequisite when deferred | Reason when rejected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `parentAddressPath` | approved for a future enriched bridge version | Addressing | Addressed occurrence record from the active `addressProfileId` / `addressedSnapshotId` namespace | `parentOccurrenceAddress` | string occurrence address in the same namespace as `occurrenceAddress`, or `null` for namespace roots | Optional | Omit when the source record does not provide parent identity; use `null` only for an addressed root whose source explicitly has no parent | Must equal the Addressing-owned parent occurrence identity in the same validated `addressProfileId` / `addressedSnapshotId` namespace; no Naming inference; stable string; no sorting role | neutral context / parent-reference identity evidence | Tree may later consume only as neutral evidence after Tree validates the canonical observation tuple and applies Tree-owned join policy; Tree must not infer folder kind, structural home, semantic home, placement, confidence, severity, diagnostics, or findings from Naming emission alone | n/a | n/a |
| `depth` | approved for a future enriched bridge version | Addressing | Addressed occurrence record | `occurrenceDepth` | non-negative integer rooted at `0` in the addressed snapshot namespace | Optional | Omit when unavailable; do not use `null`; invalid negative/non-integer values invalidate only the enrichment field, not the identity tuple | Numeric integer; producer must not bucket, band, or semantically label depth | neutral context | Tree may consume only as neutral nesting evidence; Tree owns any placement or scatter/cluster interpretation | n/a | n/a |
| `orderIndex` | approved for a future enriched bridge version | Addressing | Addressed occurrence record deterministic traversal output | `occurrenceOrderIndex` | non-negative integer stable for the addressed snapshot traversal | Optional | Omit when unavailable; do not use `null`; invalid negative/non-integer values invalidate only the enrichment field, not the identity tuple | Numeric integer; represents Addressing traversal order only; consumers must not treat it as identity | neutral context / diagnostic metadata | Tree may use only for deterministic ordering or evidence review, not placement quality, severity, or confidence | n/a | n/a |
| `lineageKey` | deferred | Addressing, with Naming allowed to reference only after source is defined | No approved current source for bridge payload use | n/a | n/a | n/a | n/a | n/a | neutral context candidate | Tree must not consume a Naming-computed lineage key as structural-home or semantic-home evidence | Addressing must define an opaque, deterministic lineage/grouping key source and collision semantics, or the bridge must choose `parentOccurrenceAddress` instead | n/a |
| `contextPartitionKey` | deferred | Naming if semantic-evidence partitioning; Addressing if opaque occurrence partitioning | No approved current source or grouping strategy | n/a | n/a | n/a | n/a | n/a | semantic evidence partition candidate | Tree must not treat it as folder/home/placement policy | A later Naming-owned contract must define the partition purpose, stable algorithm, collision behavior, and proof it is folder-agnostic and not Tree policy | n/a |
| `siblingContextKey` | deferred | Addressing preferred; Naming only if it can prove neutral evidence partitioning | No approved current source or grouping strategy | n/a | n/a | n/a | n/a | n/a | neutral context candidate | Tree must not treat it as sibling placement quality or folder-kind evidence | Addressing must define sibling identity/group semantics, or a later Naming contract must define an opaque source-backed key without Tree-policy leakage | n/a |
| `subtreeContextKey` | deferred | Addressing preferred; Naming only if it can prove neutral evidence partitioning | No approved current source or grouping strategy | n/a | n/a | n/a | n/a | n/a | neutral context candidate | Tree must not treat it as subtree ownership, structural home, semantic home, or placement evidence by itself | Addressing must define subtree grouping semantics and stability/collision rules, or a later sidecar must carry it as opaque evidence | n/a |
| `semanticTokens` | approved for the Naming semantic-evidence enrichment section (§4.5) only; not a v1 observation field | Naming | Naming's semantic tokenization of the canonical semantic name, the same token list Naming's semantic-family derivation uses; currently present as `finding.details.semanticTokens` on canonical Naming findings | `semanticTokens` | Array of non-empty strings. Token vocabulary: open; a token is any non-empty segment of the canonical semantic name, and the token list is not checked against a registry | Optional within a record | Omit when Naming produced no token list; do not emit `null` or an empty array. Naming currently derives the token list only for semantic names with at least two tokens, which is also the condition for a v1 semantic-family observation, so every enriched observation has at least two tokens | Tokens are the canonical `semanticName` split on `-` and `.`, each segment trimmed, empty segments removed; no further case mapping, since canonical semantic names already passed Naming's case rules. Source order is preserved; duplicates are preserved in position; no sorting and no deduplication. Relationship: `familyRoot` equals the first token; `semanticFamily` equals the first one or two tokens joined by `-`, as Naming's semantic-family derivation decides; joining the tokens is not guaranteed to reproduce `semanticName` (for example when it contains `.`), so consumers must not reconstruct `semanticName` from tokens | semantic evidence | Tree may compare tokens (for example, token-prefix comparison between occurrences) only under Tree-owned rules; Tree must not re-tokenize `semanticName`, derive family/role/category from tokens, or treat token equality as home or placement evidence by itself | n/a | n/a |
| `role` | approved for the Naming semantic-evidence enrichment section (§4.5) only, as the role-fact group `role`, `roleCategory`, `roleStatus`; not a v1 observation field | Naming | Naming's role-slot parse of the filename (`parsed.role`) and the effective Naming role metadata for that role in the run; currently present as `finding.details.role`, `roleCategory`, and `roleStatus` on canonical Naming findings | `role`, `roleCategory`, `roleStatus` | `role`: non-empty string, the parsed role slot. Naming's canonical parser takes the role slot verbatim from the filename segment before the extension, and canonical classification requires it to equal an `active` registry role key exactly, so for enriched observations the parsed role and the registry spelling are the same value and no separate normalized form exists. `roleCategory`: non-empty string from Naming's role-category vocabulary, as recorded in the effective role metadata. `roleStatus`: one of `active`, `deprecated`, `provisional` (`FileNamingMasterList-V1_1.md`, Role Status Values) | Optional within a record as a group: the three fields are emitted together or not at all | Omit the whole group when any of the three values is unavailable; do not emit `null` or partial groups | Values are copied verbatim from the parse and the effective role metadata, with no mapping to Tree vocabulary and no sorting role. Serialization of non-active statuses: the section enriches only canonical observations, and canonical classification currently requires an `active` role (deprecated and unknown or inactive roles produce non-canonical findings), so current production yields `active` only; if canonical admission ever changes, `deprecated` and `provisional` serialize verbatim without remapping | semantic evidence (role-slot fact and role registry metadata) | Role facts are source facts, not naming-validity verdicts; validity stays in the Naming report classification. They are not role-like hints, which remain in existing disambiguation evidence. Tree must not derive folder, home, or placement policy solely from role; any use of role category as redirect evidence requires a separate Naming-owned convention decision | n/a | n/a |
| `role-like fields` | deferred | Naming | Naming disambiguation / role-like token interpretation | n/a | n/a | n/a | n/a | n/a | semantic evidence candidate | Tree must not treat role-like evidence as a role verdict or placement policy | Naming must define bounded field names and distinguish role verdicts from role-like hints, ambiguity flags, and disambiguation evidence | n/a |
| `disambiguationNotes` | approved for a future enriched bridge version | Naming | Naming-owned disambiguation interpretation | `disambiguationNotes` | array of objects, each `{ "code": "<non-empty-kebab-case-string>", "message": "<short deterministic string>", "source": "naming" }`; no severity/confidence/verdict fields | Optional | Omit when there are no notes; empty array is allowed only when a producer intentionally serializes empty containers; `null` is not allowed | Sort by `code`, then `message`, then `source`; remove exact duplicates; messages must be deterministic and not environment-specific | diagnostic metadata / semantic evidence | Tree may consume only as Naming disambiguation evidence; Tree owns whether it is usable, diagnostic-only, or ignored | n/a | n/a |
| `evidenceStrength` | rejected for bridge payload use | Tree, if strength/confidence is ever interpreted; Naming may own only source facts | Tree confidence/severity policy, not a Naming bridge field | n/a | n/a | n/a | n/a | n/a | rejected Tree-policy/confidence candidate | Tree must not receive Naming-authored strength as bridge policy | n/a | It would encode confidence/strength policy and blur Tree-owned clean/usable evidence assessment, confidence, severity, and findings. |
| `evidenceLimitNotes` | approved for a future enriched bridge version | Naming | Naming-owned bridge production and source limitation diagnostics | `evidenceLimitNotes` | array of objects, each `{ "code": "<non-empty-kebab-case-string>", "message": "<short deterministic string>", "source": "naming" }`; no severity/confidence/verdict fields | Optional | Omit when there are no limits; empty array is allowed only when a producer intentionally serializes empty containers; `null` is not allowed | Sort by `code`, then `message`, then `source`; remove exact duplicates; messages must be deterministic and not environment-specific | diagnostic metadata | Tree may consume only as source-limit evidence or diagnostics; Tree owns fallback and finding policy | n/a | n/a |

Existing optional v1 context/compatibility set: `occurrenceType`.

Approved first enriched bridge set: `parentOccurrenceAddress`, `occurrenceDepth`, `occurrenceOrderIndex`, `disambiguationNotes`, and `evidenceLimitNotes`.

Approved Naming semantic-evidence enrichment section set (§4.5, calculogic-validator#84): `semanticTokens` and the role-fact group `role`, `roleCategory`, `roleStatus`.

Deferred set: `lineageKey`, `contextPartitionKey`, `siblingContextKey`, `subtreeContextKey`, and `role-like fields`.

Approved Naming token lexical-identity section set (§4.7, §6.4, calculogic-validator#150): `lexicalProfile` on the envelope; `tokenSource` and `tokens` on records. Emitted with an active language profile since the #150 implementation slice.

Rejected set: `evidenceStrength`.

### 6.3 Naming folder-label observation fields (§4.6)

These fields are approved for the §4.6 section only. They are never v1 observation fields.

| Field | Owner | Source of truth | Value shape | Required / optional | Absence behavior | Normalization and deterministic order | Tree-consumption limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `parseOutcome` | Naming | Naming folder-label interpretation (interpretation spec §13.3) | `parsed` or `not-parsed` | Required on every record | A record without it is invalid (§4.6 consumer rules) | Exact string | An outcome, not a validity finding. `not-parsed` is a statement about the label, never contradictory evidence about the folder |
| `labelTokens` | Naming | Semantic tokenization of the label (interpretation spec §13.3) | Non-empty array of non-empty strings | Required when `parseOutcome` is `parsed`; forbidden otherwise | Never `null` or empty | Source order; duplicates kept in position; no sorting or deduplication | Tree may compare tokens under Tree-owned rules; it must not re-tokenize the label or treat token equality as home or placement evidence by itself |
| `labelRoot` | Naming | First label token (interpretation spec §13.1) | Non-empty string equal to `labelTokens[0]` | Required when `parsed`; forbidden otherwise | Never `null` | Exact string | A lexical root, not a `familyRoot`; it asserts no semantic family |
| `labelFacts` | Naming | Lexical fact vocabulary (interpretation spec §13.5) | Array of codes from that vocabulary; v1 vocabulary: `contains-connector-token` | Optional when `parsed`; forbidden otherwise | Omit when no fact applies; never `null` or empty | Sorted; no duplicates | Records what the label contains, never what it means |
| `notParsedReasons` | Naming | Not-parsed reason vocabulary (interpretation spec §13.4) | Non-empty array of codes: `label-empty`, `label-has-uppercase`, `label-has-unsupported-character`, `label-has-malformed-separator` | Required when `parseOutcome` is `not-parsed`; forbidden otherwise | Never `null` or empty | Sorted; no duplicates | Lexical facts about the label; not naming-validity findings |

Not approved for the §4.6 section in v1: `semanticFamily`, `familySubgroup`, `ambiguityFlags` and `splitFamilyFlags` for folder labels (no folder family policy exists), role-like or qualifier classifications (deferred), and the raw label as a separate field (`repoRelativePath` already carries it as source-trace; consumers must not parse either).

### 6.4 Naming token lexical-identity fields (§4.7)

These fields are approved for the §4.7 section only (calculogic-validator#150). They are never v1 observation fields and never fields of the §4.5 or §4.6 sections.

| Field | Owner | Source of truth | Value shape | Required / optional | Absence behavior | Normalization and deterministic order | Consumer limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lexicalProfile` | Linguistic Foundation (presented by Naming) | The run's active language profile (foundation contract §5.3, §7) | `{ profileId, profileVersion, lexiconDigest }`, non-empty strings | Required on the envelope | A section without it is malformed (§4.4 rule 3) | Exact strings | Identifies the profile; never a quality or confidence measure |
| `tokenSource` | Naming | The source section of the record (§4.7 association table) | `semantic-tokens` or `label-tokens` | Required on every record | A record without it is invalid | Exact string | Names the token list the record aligns to; not a folder or file classification |
| `tokens` | Naming | The source record's token list, position by position | Non-empty array of entries | Required on every record | Never `null` or empty | Source order and length; no sorting or deduplication | Aligned to the source list; consumers check the alignment (§4.7) |
| `tokens[].surface` | Naming | The source token at that position | Non-empty string | Required | Never `null` | Exact string, as the source record carries it | Equals the source token; consumers never transform it |
| `tokens[].status` | Linguistic Foundation | `resolveSurfaceForm` (foundation contract §6.1) | `resolved`, `ambiguous` or `unknown` | Required | `profile-unavailable` never appears: with no profile the section is omitted | Exact string | `unknown` is never negative evidence |
| `tokens[].readings` | Linguistic Foundation | `resolveSurfaceForm` | Array of `{ lexemeId, features, basis }`; empty exactly when `status` is `unknown` | Required | Empty array, never `null` | Sorted by `lexemeId`, then features (foundation R4); no duplicates | Compared only through the foundation's relation (foundation contract §6.2, §9.1) |
| `tokens[].readings[].lexemeId` | Linguistic Foundation | The profile's lexicon entry | Non-empty string beginning with `lexicalProfile.profileId` and a dot | Required | — | Exact string; opaque to consumers | Compared for equality only, never parsed |
| `tokens[].readings[].features` | Linguistic Foundation | The lexicon entry's form | Object mapping a foundation feature space to one of its values; may be empty | Required | Empty object when the entry specifies none | Keys sorted | Distinguishes forms of one lexeme; never an identity |
| `tokens[].readings[].basis` | Linguistic Foundation | Foundation contract §7 | `lexicon-entry` | Required | — | Exact string | Names where the reading came from |

Not approved for the §4.7 section in v1: comparison relations between tokens (a consumer computes them), a reading chosen as preferred or default (foundation contract §6.1), and any lexical form Naming derives itself.

### 6.5 Naming repository-package label fields (§4.8)

These fields are approved for the §4.8 section only (calculogic-validator#157; current since calculogic-validator#159). The parse fields (`parseOutcome`, `labelTokens`, `labelRoot`, `labelFacts`, `notParsedReasons`) have exactly the §6.3 definitions and are not repeated.

| Field | Owner | Source of truth | Value shape | Required / optional | Absence behavior | Normalization and deterministic order | Consumer limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `element` | Naming | Which part of the declared identity the record interprets | `scope` or `name` | Required on every record | A record without it is invalid | Exact string; records ordered `scope`, then `name` | Names the part of the identity; never a classification of the repository |
| `segment` | Suite core (presented by Naming) | The declared identity fact (capability inventory §3.11) | Non-empty string, without `@` or `/` | Required on every record | A record without it is invalid | Exact string, as the fact carries it | Source-trace for the interpretation; consumers never tokenize or parse it |

Not approved for the §4.8 section in v1: the raw manifest `name` string, a version, any other manifest field, a lexical-identity reading for a segment, and an occurrence identity.

### 6.6 Naming role-category vocabulary fields (§4.9)

These fields are approved for the §4.9 section only (calculogic-validator#162; current since its evidence-only implementation slice).

| Field | Owner | Source of truth | Value shape | Required / optional | Absence behavior | Normalization and deterministic order | Consumer limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `registrySource` | Suite core (presented by Naming) | The run's registry resolution | `builtin`, `custom` or `candidate` | Required on the envelope | A section without it is invalid | Exact string | Names the set; never a quality or trust claim |
| `categoryRolePerspectiveDigest` | Suite core (presented by Naming) | The run's registry provenance for `naming/category-role-perspective` | Non-empty string | Required on the envelope | A section without it is invalid | Exact string, copied | Identifies the source registry; never proof of completeness |
| `category` | Naming | The resolved roles runtime | Non-empty string, the §4.5 `roleCategory` form | Required on every record | — | Records sorted by `category`; unique | A producible value, never an occurrence's category |
| `roles` | Naming | The resolved roles runtime | Non-empty array of non-empty strings | Required on every record | — | Sorted; no duplicates | The roles producing the category; not a role classification |

Not approved for the §4.9 section in v1: role statuses, role definitions, Agnostic-Core meanings, categories without roles, a responsibility class or mapping, and any per-occurrence field.

**Version 2 (§4.9.1; calculogic-validator#162, v2 contract; implementation-pending).** v2 carries every v1 field with the same definition, plus:

| Field | Owner | Source of truth | Value shape | Required / optional | Absence behavior | Normalization and deterministic order | Consumer limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rolesDigest` | Suite core (presented by Naming) | The run's registry provenance for `naming/roles` | Non-empty string | Required on the envelope | A section without it is invalid | Exact string, copied | Identifies the registry role statuses came from; never proof of soundness |
| `admissibleCategories` | Naming | Canonical admission over the resolved roles runtime (§4.9.1) | Array of non-empty strings, each a record's `category`; may be empty | Required on the envelope | A section without it is invalid; an empty array is a valid empty bound | Sorted; no duplicates | A sound upper bound on categories the canonical outcome can admit; not every member need occur, and it classifies nothing |

Not approved for the §4.9 section in v2: role statuses or any per-role or per-record admissibility flag, finding-policy classifications, admission conditions, and everything v1 excludes.

## 7. Guardrails for approved future enrichment fields

Every approved future enrichment field is governed by these rules:

1. Naming remains folder-agnostic: Naming never turns folder, path, parent, child, sibling, depth or content context into Tree-owned conclusions, and any bounded use of such context for filename disambiguation stays within the Naming address-attached rules spec §6.3. Interpreting a folder's own label as an isolated string (§4.6; interpretation spec §13.2) is consistent with this rule; folder-label interpretation uses no context at all.
2. The field is evidence, not Tree policy.
3. No enrichment field may replace, weaken, override, or compete with the canonical observation identity tuple: `addressProfileId + addressedSnapshotId + occurrenceAddress`.
4. `parentOccurrenceAddress`, when present, is optional neutral Addressing-owned parent-reference / containment identity evidence; it does not replace the observation's own `occurrenceAddress`, must remain inside the same validated `addressProfileId` and `addressedSnapshotId` namespace, and must not become a second primary identity for the observation.
5. The field must not encode folder kind, structural home, semantic home, placement judgment, scatter/cluster judgment, confidence, severity, Tree-owned diagnostics, or findings. Naming-owned diagnostic metadata fields may carry deterministic source/disambiguation notes only when approved in the field table and must not carry Tree verdicts.
6. Tree may consume the field only as evidence and retains all clean/usable evidence assessment, fallback selection, join diagnostics, placement reasoning, confidence, severity, Tree-owned diagnostics, and findings policy.
7. Tree may later consume `parentOccurrenceAddress` only as neutral evidence after Tree validates the canonical observation tuple and applies Tree-owned join policy.
8. The field does not move tuple matching or join preparation into Addressing.
9. The field does not require shared join-helper extraction.
10. The field must remain additive and versioned.
11. The field must preserve current path-keyed compatibility during migration.
12. A future implementation must not remove `path`, `repoRelativePath`, or path-keyed compatibility fallback solely because approved enrichment fields exist.
13. A future implementation must validate enriched fields separately from the required identity tuple so unsupported enrichment can be reported without mislabeling valid identity as invalid.
14. For fields carried in an additive envelope section (§4.4), rules 11 and 12 refer to the compatibility fields of the v1 observations, which the section leaves intact. Section records themselves associate only through the identity tuple and have no path fallback.

## 8. Fallback and migration rule

Future implementation slices must follow this migration rule:

1. Tree should prefer address-keyed joins when `addressProfileId`, `addressedSnapshotId`, and `occurrenceAddress` are present and match the addressed occurrence namespace being consumed.
2. Path-based joins may remain as an explicit temporary compatibility fallback during migration.
3. Fallback behavior must be documented, test-covered, and removable later by an explicit implementation slice.
4. Fallback diagnostics should make it clear when Tree used path compatibility instead of address identity.
5. Tree must not silently re-derive Naming semantic-family interpretation when Naming evidence is missing. Missing Naming evidence should remain missing, bounded, or diagnostic according to Tree-owned consumer policy.
6. Future v2 enrichment does not by itself authorize provider swaps, Tree consumption changes, fallback removal, helper extraction, CLI changes, report-envelope changes, or runtime bridge production.
7. Future v2 or sidecar migration must preserve the existing Naming-owned semantic observation payload, existing path/source-trace compatibility fields, and optional existing v1 `occurrenceType` behavior when available. It must not create an identity-and-enrichment-only payload that drops semantic evidence Tree currently consumes.
8. Tree must continue receiving Naming semantic evidence plus any approved enrichment; it must not be forced to reconstruct semantic-family interpretation from raw names, paths, neutral occurrence context, or diagnostic metadata.
9. The path-based compatibility fallback in rules 2–4 applies to v1 observations only. It does not extend to records in additive envelope sections (§4.4), which have no legacy path-keyed consumers.

Path fallback is current implementation reality and must not be removed in this contract slice.

## 9. Relationship to current audited runtime fields

| Current audited field/surface | Relationship to this contract |
| --- | --- |
| Tree-local `addressPath` | Current runtime truth. Preserve as compatibility/debug alias during migration. Do not rename in runtime code as part of this contract. |
| Tree-local `parentAddressPath` | Current runtime truth on addressed occurrence records. Future enriched bridge payloads may emit `parentOccurrenceAddress` sourced from this parent identity, but the old source field name is not approved as the bridge field name. |
| Structural-addressing `address` | Candidate source for neutral `occurrenceAddress`; exact aliasing remains an implementation-slice decision. |
| Structural-addressing `addressPath` | Candidate compatibility/debug alias and possible initial source for `occurrenceAddress`; must be interpreted inside profile/snapshot namespace. |
| Structural-addressing `profileId` | Candidate source for contract field `addressProfileId`; this spec uses the bridge field name `addressProfileId` for clarity. |
| Structural-addressing `snapshotOutputId` | Related to `addressedSnapshotId`, but not identical by contract until a later slice decides whether output id is sufficient or an instance/source id is required. |
| Current Naming bridge `occurrenceType` / structural-addressing `occurrenceType` | Existing optional v1 neutral occurrence-context / compatibility evidence when the addressed occurrence record supplies it. It remains Addressing-owned occurrence-type data that Naming may echo; it is not part of the canonical durable observation identity tuple, is not Tree folder-kind policy, remains valid in v1, and does not require a bridge version bump. |
| Structural-addressing `depth` | Approved future bridge enrichment source for `occurrenceDepth`; it remains neutral context evidence. |
| Structural-addressing `orderIndex` | Approved future bridge enrichment source for `occurrenceOrderIndex`; it remains deterministic ordering/diagnostic evidence, not identity. |
| Current Naming bridge `path` observations | Current runtime truth and temporary compatibility alias. Future bridge observations should preserve `repoRelativePath` / `path` compatibility during migration. |
| Current Tree family-root folder evidence join by `path` (formerly semantic-home evidence; Tree slice spec S2.13) | Current runtime truth and temporary fallback path. Future Tree consumption should prefer address-keyed joins only when contract fields are present and Tree-owned qualification accepts them. |

## 10. Unresolved naming and migration follow-up notes

The following questions remain explicit follow-up work and are not resolved by runtime changes in this slice:

1. Whether `addressedSnapshotId` should be a run/snapshot instance id, a content digest, a source snapshot id, or a constrained alias of current `snapshotOutputId`.
2. Whether the future v2 bridge should emit approved enrichment fields directly on each observation, inside a nested `occurrenceContext` / `diagnostics` object, or in a separately named additive sidecar.
3. Whether structural-addressing `address` or `addressPath` should populate the first `occurrenceAddress` field in every producer path, and which compatibility alias must be retained in reports.
4. Which focused repeated-same-family fixtures should prove that address-keyed joins beat path/family bucket assumptions before fallback removal.
5. Which producer is the authoritative addressed snapshot provider for the cross-slice bridge: Tree-local addressed occurrences, structural-addressing addressed snapshots, or a later compatibility bridge between them.
6. Whether deferred partition keys should ever be emitted, and if so whether Addressing or Naming owns the exact grouping algorithm.
7. Resolved (was: whether deferred Naming token and role evidence should be modeled as bridge fields, a Naming-owned sidecar, or remain outside the occurrence bridge) by calculogic-validator#84: token and role evidence are modeled as the Naming-owned additive section in §4.5. Role-like fields remain deferred.
8. Whether folder labels should ever receive a semantic-family interpretation. That needs its own folder family policy; the §4.6 section deliberately emits none (calculogic-validator#89).

## 11. Non-goals

This spec does not:

- change runtime behavior;
- change current v1 Naming bridge payload production;
- change Tree join behavior;
- add enriched fields to runtime outputs;
- rename `addressPath` in runtime code;
- wire Tree runtime to a different structural-addressing provider;
- remove path fallback;
- remove known-roots or revive known-roots;
- promote Addressing to a standalone runnable validator slice;
- move Addressing semantics into suite-core;
- move tuple matching or join preparation into Addressing;
- require shared join-helper extraction;
- broaden Tree semantic-home, structural-home, scatter, cluster, or drift reasoning;
- add Tree confidence, severity, findings, or report-envelope policy to Naming bridge payloads;
- rework validator report envelopes;
- change CLI behavior;
- fix unrelated validator findings;
- perform broad docs cleanup outside this contract slice.

## 12. Recommended next implementation child

Recommended next implementation child: define and test a data-only, explicitly versioned `naming-occurrence-bridge.v2` payload or additive sidecar that preserves v1 identity, the complete current Naming-owned semantic observation payload, optional v1 `occurrenceType`, and path/source-trace compatibility while carrying only the genuinely new approved first enriched bridge set: `parentOccurrenceAddress`, `occurrenceDepth`, `occurrenceOrderIndex`, `disambiguationNotes`, and `evidenceLimitNotes`.

The preserved semantic payload must include at minimum `semanticName`, `familyRoot`, `semanticFamily`, `familySubgroup` when present, `ambiguityFlags` when present, `splitFamilyFlags` when present, and existing Naming disambiguation evidence when present. A sidecar child must define direct linkage or deterministic association to the complete current semantic observation payload and must leave that payload intact.

That child should still avoid Tree reasoning expansion. It should include focused tests for payload shape, semantic-payload preservation, version handling, unsupported-enrichment diagnostics, and explicit fallback behavior without removing the current path-based consumer path.
