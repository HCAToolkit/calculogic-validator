# Linguistic Foundation Shared Contract (Stage 1: lexical identity)

## 1. Status and classification

- **Status:** Contract, with the foundation runtime and the `english` profile **Current** since calculogic-validator#148 (§15). calculogic-validator#150 adds the bridge section (§8) and the first-consumer integration (§15.4) as Contract, not yet current. No validation run reads it yet: there is no bridge section, command, report field or finding (§8, §9.2). The contract's executable evidence is test-only (`test/linguistic-foundation-contract.test.mjs` and its fixtures) and is not shipped.
- **Scope:** the shared model of lexical identity: language profiles, lexemes, surface forms, readings, grammatical features, resolution, ambiguity, provenance, the lexeme-comparison relation, and the boundary through which Naming will carry this evidence to Tree.
- **Origin:** calculogic-validator#146, following the singular/plural investigation behind calculogic-validator#142 and the Tree S3.10 limitation it measured (E10, E11).
- **Last reviewed:** 2026-11-01.

Every rule carries one of the labels of the Structural Addressing shared contract (`structural-addressing-shared-contract.spec.md` §1):

| Label | Meaning | Classification |
|---|---|---|
| **Current** | True of `main` today; verified in code and tests. | `Normative` |
| **Contract** | Binding on every future profile, producer and consumer, whether or not one exists yet. | `Normative` |
| **Proposed** | The expected direction. Not binding until a later slice adopts it. | `Draft-Assumption` |
| **Deferred** | Must be decided explicitly in its own task; never settled as a side effect of unrelated work. | `Draft-Assumption` (open) |

Examples are `Illustrative` unless marked **measured**. Lexeme identifiers, forms and entries in this contract illustrate the model; they are not English lexicon content. The `english` profile's content is its registry (§5.2, §15.2).

## 2. Purpose and non-goals

The Linguistic Foundation answers one question: **which reusable lexical identity does a word form carry, under a declared language profile, with which grammatical features, how certainly, and on what evidence?** Structural Addressing provides stable occurrence identity; the Linguistic Foundation provides stable lexical identity. Both are pre-reasoning layers that consumer slices use through explicit contracts, and neither owns a consumer's interpretation.

The first concrete need is the Tree S3.10 singular/plural limitation: `rules` and `rule`, `registries` and `registry` are never related, so a folder's own concept stays in its members' residual tokens (Tree slice spec S3.9 E10, E11). The investigation measured that a string transformation cannot safely relate them (§10), and that Tree must not own one (Tree S3.1).

This contract and its runtime (§15) do not:
- read lexical identity in any validation run, report or finding;
- change Naming tokenization, folder-label interpretation or any bridge section;
- change Tree reasoning, the S3.9 catalogue, or E10, E10.1 and E11;
- define parsing, translation, generation, Narrative wording or Lexical Coherence policy;
- choose a morphology engine (§12, D1).

## 3. Authority

### 3.1 Governing rule (Contract)

The Linguistic Foundation owns the shared lexical identity model: identity mechanics, foundation feature spaces, the resolution and ambiguity vocabularies, the comparison relation, provenance, and the profile contract. **Language profiles** own their lexicon content within that model. **Consumer slices** own every interpretation of the identities they receive.

Consequences:
- The foundation holds no language-specific entry, form or rule. English is a profile, not the foundation (§5).
- Reusing an identity never implies reusing an interpretation. Naming, Tree and future consumers may read the same lexeme differently, each under its own contract.
- A consumer never redefines a foundation identity under a slice-local name, and never maintains a manual copy of lexicon content as a second authority (§8.4).

### 3.2 Authority map

| Source | Authority |
|---|---|
| This contract | The shared lexical identity model (§4–§9). |
| Naming semantic interpretation spec §4.2, §13 | Tokenization of filenames and folder labels. Unchanged. The foundation receives tokens; it never produces them. |
| Naming bridge occurrence identity contract §4.4–§4.6, §6.2 | The bridge envelope and its sections. The proposed extension (§8) becomes binding only through an amendment there. |
| Tree slice spec S3.1, S3.2, S3.10 | Tree's consumption rules. Tree's use of lexical identity is decided in Tree's own slice (§9.2). |
| Validator living document §4.6, "Linguistic Foundation Slice / Layer" (calculogic-validator#85) | Intended direction. Context, not repository authority. Items adopted here are restated with labels; the rest stays planning context (§11). |

## 4. Core model

### 4.1 Terms (Contract)

- **Surface form:** one token exactly as a producer supplies it (today a Naming N1 `semanticTokens` entry or an N2 `labelTokens` entry). The foundation never tokenizes, case-maps or trims a surface form.
- **Language profile:** a declared, versioned set of lexicon entries and feature support for one language (§5).
- **Lexeme:** a reusable lexical identity within one profile. Its identifier is a string beginning with the profile identifier and a dot (illustrative: `english.rule`). The rest is opaque: consumers compare lexeme identifiers for equality and never parse them.
- **Feature space:** a foundation-owned, language-agnostic set of feature values. The first and only promoted space is `number`, with values `singular` and `plural`.
- **Lexicon entry:** one lexeme with its declared forms. Each form is a surface form with the features it carries.
- **Reading:** one way a surface form can be read under a profile: a lexeme identifier, the features the form carries for it, and its basis (§7).
- **Resolution:** all readings of one surface form under one profile, with its status (§6).

### 4.2 Lexicon entry shape (Contract)

| Field | Shape | Rule |
|---|---|---|
| `lexemeId` | non-empty string | Begins with `<profileId>.`; unique within the profile |
| `forms` | non-empty array of `{ surface, features }` | `surface` is a non-empty string; `features` maps a feature space to one of its values and may be empty |

- A form declares only feature values the profile supports (§5.1).
- A `(surface, lexemeId, features)` combination appears at most once in a profile.
- A form whose entry does not specify a feature simply omits it. Omission means "not specified by the entry", never a default value.
- The same surface may be declared by several entries (lexical ambiguity) and by one entry with several feature values (feature ambiguity, for example a form that is both singular and plural).

### 4.3 Resolution rules (Contract)

- **R1 Declared entries only.** A reading exists only when the profile's lexicon declares the exact surface form. No suffix rule, stemming, singularization, case folding or derivation produces a reading.
- **R2 Exact surface equality.** A form is matched as supplied. The foundation normalizes nothing; Naming's case rules already govern the tokens it supplies.
- **R3 Context-free.** Resolution uses only the surface form and the profile: never neighbouring tokens, position, file, folder, path or any other occurrence. This matches Naming's context-free label rule (Naming interpretation spec §13.2). Disambiguation by context belongs to a consumer or to a later contract.
- **R4 Deterministic.** Readings are sorted by lexeme identifier, then by feature values, with no duplicates. The same surface form, profile version and lexicon digest always give the same resolution.
- **R5 Features never create identity.** Feature values distinguish forms of one lexeme. They never make two lexemes, and two readings of one lexeme that differ only in features are one lexeme.

## 5. Profile contract

### 5.1 What every language profile declares (Contract)

| Declaration | Rule |
|---|---|
| `profileId` | kebab-case; unique among profiles |
| `profileVersion` | non-empty string; any change to entries or support changes it |
| `featureSupport` | for each foundation feature space, each value's status: `supported`, `unsupported` or `not-applicable` |
| `entries` | lexicon entries (§4.2) |

- A profile for a language without grammatical number declares the `number` space `not-applicable`; its forms carry no `number` feature.
- A profile may not add a feature space or value of its own. A new space or value is promoted into the foundation by amendment, when a profile or consumer needs it.
- The foundation's vocabularies (feature spaces, statuses, relations, bases) are language-agnostic and contain no lexeme, form or entry.

### 5.2 Profiles

- `english` (**Current**, `profileVersion` `1`, calculogic-validator#148): the first language profile. It is a profile like any other; nothing in the foundation depends on it. Version `1` declares only the vocabulary measured for E10 and E11 (§10): `english.rule` (`rule` singular, `rules` plural) and `english.registry` (`registry` singular, `registries` plural). Every other form is `unknown` under it. Adding entries is a profile version change in its own slice, with measured evidence.
- Domain, validator-domain and slice-perspective profiles from the living document are not defined here (§12, D7).

### 5.3 Active profile selection (Contract; D2 resolved by calculogic-validator#148)

A resolution is always relative to one active language profile. When none is active, every resolution is `profile-unavailable`.

- **Explicit only.** A profile is active only when a selection names it: `{ profileId }`, optionally pinned as `{ profileId, profileVersion }`. Nothing is inferred from the environment, the locale, the repository's content or language, or the profiles available. There is no default profile, English included.
- **One source per run.** The selection is supplied by the run's composition to the foundation. Its run-level source is the validator configuration key `linguisticProfile` (validator config spec §10; contract-approved by calculogic-validator#150, not yet current, §15.4). Until its implementation slice no validation run supplies a selection, so no profile is active in any run and every consumer keeps its current literal behavior.
- **Deterministic outcome.** Selection yields exactly one status:

| Status | Condition | Active profile |
|---|---|---|
| `none` | no selection | none |
| `active` | the selection names a registered profile, with no version pin or the registered version | that profile |
| `invalid` | the selection is malformed (`selection-malformed`), names no registered profile (`profile-not-registered`), or pins another version (`profile-version-mismatch`) | none |

- **No fallback.** An `invalid` selection is reported with its problem and leaves no profile active. It never falls back to another profile.
- **Non-English repositories** select their own profile once it is registered, or none. A repository that selects nothing is never resolved under English.

## 6. Resolution statuses and ambiguity

### 6.1 Statuses (Contract)

| Status | Condition | Readings |
|---|---|---|
| `resolved` | every reading has the same lexeme identifier | one or more, one lexeme |
| `ambiguous` | the readings name more than one lexeme identifier | two or more, several lexemes |
| `unknown` | a profile is active and declares no entry for the form | none |
| `profile-unavailable` | no profile is active | none |

- **Ambiguity is recorded, never resolved.** The foundation never picks a preferred, frequent or default reading.
- **Feature ambiguity is not lexical ambiguity.** A `resolved` form may carry several readings that differ only in features (the illustrative `series` below); its lexeme is still determinate.
- **`unknown` is not negative evidence.** It means the profile has no evidence about the form, never that the form differs from any other.

### 6.2 Lexeme-comparison relation (Contract)

Comparing two resolutions under the same profile version yields exactly one relation. `L` and `R` are the sets of lexeme identifiers of the two resolutions' readings.

| Relation | Condition |
|---|---|
| `same-lexeme` | both `resolved`, and `L` equals `R` |
| `possibly-same-lexeme` | at least one is `ambiguous`, and `L` and `R` share an identifier |
| `different-lexemes` | both are `resolved` or `ambiguous`, and `L` and `R` share no identifier |
| `undetermined` | either is `unknown` or `profile-unavailable`, or the resolutions come from different profiles or profile versions |

- The relation is about lexeme identity only. Literal equality of two surface forms is separate evidence that consumers already have, and the relation neither replaces nor overrides it. Two occurrences of one ambiguous form are `possibly-same-lexeme`, because resolution is context-free (R3).
- `different-lexemes` is positive evidence only to the extent that the profile's entries are correct. It never follows from `unknown`.
- How a consumer treats `possibly-same-lexeme` is the consumer's decision (§9.2).

### 6.3 Worked examples (Illustrative; checked against the test fixture)

Resolutions under the illustrative sample profile in `test/fixtures/linguistic-foundation/` (`english-sample`, version `0`). Forms marked *measured* occur as Naming tokens in this repository at `repo` scope (§10).

| Surface | Status | Readings | Note |
|---|---|---|---|
| `rule` | `resolved` | `english-sample.rule` (singular) | measured (E10) |
| `rules` | `resolved` | `english-sample.rule` (plural) | measured (E10 folder label) |
| `registry` | `resolved` | `english-sample.registry` (singular) | measured (E11) |
| `registries` | `resolved` | `english-sample.registry` (plural) | measured (E11 folder label) |
| `status` | `resolved` | `english-sample.status` (singular) | measured; never a plural of a lexeme `statu` |
| `address` | `resolved` | `english-sample.address` (singular) | measured |
| `series` | `resolved` | `english-sample.series` (plural), `english-sample.series` (singular) | feature ambiguity only |
| `diagnostics` | `ambiguous` | `english-sample.diagnostic` (plural), `english-sample.diagnostics` (—) | measured; plural of `diagnostic`, or the field of study |
| `docs` | `ambiguous` | `english-sample.doc` (plural), `english-sample.docs` (—) | measured; plural of `doc`, or "documentation" |
| `cross` | `unknown` | — | measured; not declared in the sample, and no reading is derived from `cros` + `s` |
| `readiness` | `unknown` | — | measured; not declared in the sample |

Comparisons under the same profile:

| Left | Right | Relation |
|---|---|---|
| `rules` | `rule` | `same-lexeme` |
| `registries` | `registry` | `same-lexeme` |
| `rule` | `rule` | `same-lexeme` |
| `docs` | `doc` | `possibly-same-lexeme` |
| `diagnostics` | `diagnostics` | `possibly-same-lexeme` |
| `rule` | `registry` | `different-lexemes` |
| `status` | `rules` | `different-lexemes` |
| `cross` | `cross` | `undetermined` |
| `cross` | `rule` | `undetermined` |

## 7. Provenance (Contract)

- Every resolution carries the active profile's `profileId`, `profileVersion` and **lexicon digest**, as `provenance: { profileId, profileVersion, lexiconDigest }`.
- **Digest algorithm (Current; D4 resolved by calculogic-validator#148):** the suite's canonical registry digest, `digestRegistryPayload`, over the whole profile registry payload. Its descriptor makes `entries` set-like by `lexemeId` and each entry's `forms` set-like by `surface`. Entry and form order never change the digest; any change to an entry, a feature, the support or a version does. Its report placement is decided in §15.4 (calculogic-validator#150).
- Every reading carries its **basis**. The only basis is `lexicon-entry`: the reading comes from a declared entry. A future basis (for example a profile rule) is added only by amendment, together with the rule it names (§12, D1).
- A `profile-unavailable` resolution carries no profile provenance.

## 8. Naming bridge extension (Contract, calculogic-validator#150; not emitted)

The section is defined by the bridge contract, `doc/ValidatorSpecs/cross-cutting/naming-bridge-occurrence-identity-contract.spec.md` §4.7 and §6.4, which is its authority (D3 resolved). This section records the foundation's side of it. Nothing emits the section until its implementation slice.

### 8.1 Producer and route (Contract)

- **Naming is the producing perspective.** It attaches resolutions to the tokens it already supplies, and remains the owner of tokenization and of every filename-specific interpretation. Lexeme identity is not a Naming interpretation, and Naming never derives readings itself.
- **Route: an additive envelope section** under the bridge contract's §4.4, independent of the N1 section (`namingSemanticEvidenceEnrichment`) and the N2 section (`namingFolderLabelObservations`). This follows the calculogic-validator#84 route decision. Adding fields to those sections would need new section versions, and current Tree intake treats an unsupported version as unavailable, so it would lose the tokens it reads today. The bridge contract §4.7 makes the route and field names binding.

### 8.2 Section shape (Contract; bridge contract §4.7, §6.4)

- **Section:** `namingTokenLexicalIdentities`, contract version `naming-token-lexical-identity.v1`, with the §4.4 rule 5 envelope.
- **Envelope addition:** `lexicalProfile: { profileId, profileVersion, lexiconDigest }`. The section has one profile for all its records.
- **Association:** a record attaches through the identity tuple to the N1 record of a file occurrence or to the N2 parsed record of a folder occurrence.
- **Record fields:**
  - the identity tuple;
  - `tokenSource`: `semantic-tokens` or `label-tokens`;
  - `tokens`: one entry per position of that token list, in order. Each entry is `{ surface, status, readings }`, where each reading is `{ lexemeId, features, basis }`, sorted (R4).
- **Section-level states:** a record never carries `profile-unavailable`. When no profile is active, the section is omitted.

### 8.3 Consumer checks (Contract; bridge contract §4.7)

A supporting consumer drops a record, with a distinguishable diagnostic, when:
- its `tokens` length differs from the accepted source token list;
- an entry's `surface` differs from the source token at that position;
- an entry's `status` disagrees with its readings (§6.1);
- a `lexemeId` lacks the section profile's prefix.

The bridge contract §4.7 also lists the identity cases: invalid identity, duplicate identity, namespace mismatch and unmatched record.

### 8.4 Absence and fallback (Contract)

- When the section is absent, unsupported or invalid, or a record is dropped, lexical identity is **unavailable** evidence. Consumers keep exactly their behavior without it, and must not resolve forms themselves, re-tokenize, or transform surface strings to approximate it.
- No producer or consumer may fall back to a manually maintained copy of lexicon content. A compatibility snapshot, if ever needed, is a generated projection that records its source version and digest, and its use is reported (living document §4.6, adopted as the rule; the mechanism is deferred, §12, D12).

### 8.5 Production ownership and transport (Contract, calculogic-validator#150)

- **Naming owns production.** A Naming-owned projection builds the section. `createNamingOccurrenceBridgePayload` invokes it, and its only lexical operation is `resolveSurfaceForm` on each token Naming already supplies.
- **The suite selects and transports.** The suite prepares the foundation from the run's selection (§5.3) and applies the run consequences of a failed selection (§15.4).
- **The runner and Tree only transport.** As for the other sections (Tree slice spec S1.1), Naming's staging function returns the prepared foundation state as an opaque value, the runner passes it unchanged, and Tree wiring passes it to the Naming-owned producer. Neither the runner nor Tree calls `resolveSurfaceForm` or `compareLexicalResolutions`, builds records or inspects readings.
- **Separation is verified, not only absence.** The implementation slice proves it with:
  - Naming-side tests of the projection that import nothing from Tree;
  - a boundary test that no `tree/src` or `src/core` module references the foundation's resolution or comparison functions or the projection;
  - a test that the payload Tree wiring builds equals the payload the Naming producer builds directly from the same inputs.

## 9. Consumers

### 9.1 Consumer rules (Contract)

- Consumers relate forms only through the comparison relation (§6.2) on resolutions they received, never by comparing or transforming surface strings.
- `unknown` and `undetermined` are never negative evidence.
- A consumer records when lexical identity was unavailable to a comparison that needed it, as Tree S3.10 records its limitations.

### 9.2 Tree (Proposed; decided in Tree's consumption slice)

- **Positional expression.** `same-lexeme` between a lineage folder's label token and a member's token at the current position is expected to extend positional lineage expression (Tree S3.2) on a new basis. That basis would sit beside `positional-label`, which remains exact equality.
- **Ambiguity.** How Tree treats `possibly-same-lexeme` is Tree's decision: no expression, or a recorded possible expression (§12, D5).
- **Reclassification.** E10, E10.1 and E11 are reclassified only with that slice (Tree S3.9). The executable evidence shows the contract relates their folder-label and member tokens; it changes no catalogue case.

## 10. Measured evidence (measured at `98e54e2`, `repo` scope)

The distinct Naming tokens (N1 `semanticTokens` and N2 `labelTokens`): 261 in total, 45 of them ending in `s`.

- **Forms where a singular token also occurs** (21): `args`/`arg`, `candidates`/`candidate`, `cases`/`case`, `contributors`/`contributor`, `decisions`/`decision`, `docs`/`doc`, `homes`/`home`, `kinds`/`kind`, `migrations`/`migration`, `paths`/`path`, `policies`/`policy`, `profiles`/`profile`, `references`/`reference`, `registries`/`registry`, `relationships`/`relationship`, `roots`/`root`, `rules`/`rule`, `scopes`/`scope`, `signals`/`signal`, `surfaces`/`surface`, `targets`/`target`.
- **Forms where stripping a final `s` would invent a word or a false singular** (examples): `address`, `cross`, `readiness`, `status`.
- **Forms that are not plain number pairs**:
  - `docs` and `diagnostics` each have a second reading;
  - `args` and `docs` are abbreviations. Whether `arg` relates to `argument` is an abbreviation relationship, not number (§12, D6).

This is why R1 admits declared entries only. A suffix rule would relate the 21 pairs, but it would also mint `statu`, `addres`, `cros` and `readines`, and it cannot express the second readings at all.

## 11. Current versus planned

| Capability | State |
|---|---|
| This contract and its test-only executable evidence | **Contract** |
| Foundation runtime, profile registry and loader, digest, explicit selection, `english` profile version `1` (§15) | **Current** (calculogic-validator#148) |
| The bridge section (bridge contract §4.7), the `linguisticProfile` config key and its run consequences, report provenance, packaging (§8, §15.4) | **Contract** (calculogic-validator#150); not current until its implementation slice |
| Naming producing the section; the runner selecting and transporting the foundation | **Proposed** (the implementation slice of calculogic-validator#150) |
| Builtin/Custom lifecycle participation of the profile registries | **Deferred** (D11) |
| Tree consuming lexical identity; E10, E10.1, E11 reclassification | **Proposed** (a Tree slice) |
| Feature spaces beyond `number`; domain and perspective profiles; realization strategies; Narrative and Lexical Coherence consumers | **Deferred** (living document §4.6 context) |
| Any validation run reading the Linguistic Foundation | Not current: no bridge section, report field or finding exists |

## 12. Deferred decisions register

| # | Decision | Trigger to open it |
|---|---|---|
| D1 | Identity sources beyond declared entries: profile morphology rules or a hybrid, with their exception lists and a new basis | a profile whose entry maintenance is measured to be impractical |
| D2 | **Resolved** (calculogic-validator#148): explicit selection only, no default (§5.3) | — |
| D3 | **Resolved** (calculogic-validator#150): the independent section of bridge contract §4.7 and §6.4 (§8) | — |
| D4 | **Resolved** (calculogic-validator#148): location, loader, digest and provenance (§7, §15). Lifecycle participation, report metadata, packaging and compatibility snapshots went to D10 | — |
| D5 | Tree's treatment of `possibly-same-lexeme` | the Tree consumption slice |
| D6 | Relationships other than number (abbreviation, derivation) and further feature spaces | a consumer need with measured evidence |
| D7 | Domain, validator-domain and slice-perspective profiles | a consumer that needs a non-language profile |
| D8 | Whether the literal `test`/`tests` handling the known-roots retirement audit leaves unnormalized changes under lexical identity | the Tree consumption slice, with that audit |
| D9 | Extracting Naming's connector set (`and`, `or`, `with`) into foundation identities with a Naming perspective | a second consumer of those tokens |
| D10 | **Resolved** (calculogic-validator#150) for the first consumer: the run-configuration key and its failure behavior, report provenance and packaging (§15.4). Lifecycle participation moved to D11 and compatibility snapshots to D12 | — |
| D11 | Whether language-profile resources (shared lexical identity) follow the same Builtin/Custom registry lifecycle as suite-wide customizable validation policy, or warrant different treatment. Until it is decided, profiles stay builtin-only (§15.4) | the first need to customize or override a language profile |
| D12 | The compatibility-snapshot mechanism (§8.4) | the first consumer that must run without the foundation |

Not decided here and owned elsewhere:
- Naming's case rule rejecting camelCase labels (`ValidatorSpecs`) is a Naming question.
- How a Tree candidate keeps its identity when its prefix changes is a Tree question (Tree S3.2).

## 13. Ownership boundaries (Contract)

| Owner | Owns | Does not own |
|---|---|---|
| Linguistic Foundation | lexeme identity mechanics, feature spaces, resolution and ambiguity vocabularies, the comparison relation, provenance, the profile contract | lexicon content of any language; tokenization; any slice's interpretation |
| Language profile | its lexicon entries and feature support | foundation vocabularies; other profiles |
| Naming | tokenization; filename and folder-label interpretation; attaching resolutions to its tokens and presenting them through the bridge | lexeme identity; Tree conclusions |
| Tree | structural reasoning using the lexical evidence Naming supplies, under Tree-owned rules | resolving forms; transforming tokens |
| Suite core | loading and transporting foundation state, ordering, report metadata | identities, profiles, interpretation |
| Narrative, Lexical Coherence (future) | their own uses of foundation identities | foundation identities |

## 14. Change control

- Runtime work under this contract follows NL-first: the owning spec and an NL configuration note come first, then code.
- A slice that implements a **Proposed** row updates this contract in the same change and moves the row to **Current**.
- A slice that resolves a **Deferred** decision records it here.
- Changing a foundation vocabulary (feature spaces, statuses, relations, bases) is a contract amendment. The test-only evidence checks that the fixture vocabularies match this contract's tables.
- This contract adds no enforcement and no finding.

## 15. Runtime and registry (Current, calculogic-validator#148)

### 15.1 Location and modules

The runtime is a shared area beside Structural Addressing: `linguistic-foundation/src/`. Its implementation guidance is `doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md`. It follows the loader, converter and runtime split (`doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md`):

| Module | Owns |
|---|---|
| `linguistic-foundation/src/linguistic-foundation.knowledge.mjs` | the foundation vocabularies (§4.1, §5.1, §5.3, §6.1, §6.2, §7) |
| `linguistic-foundation/src/registries/linguistic-foundation-language-profile-inventory.knowledge.mjs` | the registered profiles: identifier and registry file |
| `linguistic-foundation/src/registries/linguistic-foundation-language-profile-registry.logic.mjs` | loading and validating a profile registry (§4.2, §5.1), and its digest (§7) |
| `linguistic-foundation/src/linguistic-foundation-runtime-converters.logic.mjs` | the runtime profile: a private surface-to-readings lookup behind read-only accessors |
| `linguistic-foundation/src/linguistic-foundation-profile-selection.logic.mjs` | active profile selection (§5.3) |
| `linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs` | resolution (§4.3, §6.1) and the comparison relation (§6.2) |
| `linguistic-foundation/src/linguistic-foundation.wiring.mjs` | composing the prepared foundation |

The generic modules hold no language-specific content. A language profile is one inventory entry and one registry file.

### 15.2 Registry

- **Location:** `linguistic-foundation/src/registries/_builtin/<profile>-language-profile.registry.json`; the `english` profile is `english-language-profile.registry.json`.
- **Shape:** `{ version, profileId, profileVersion, featureSupport, entries }`, where `version` is the registry format version (`1`) and the rest is §4.2 and §5.1. An invalid registry fails to load, naming its problem.
- **Lifecycle:** a direct builtin loader with a from-root variant, cached once per process. That is the ownership contract's rule for bounded, locally consumed policy (§6.4 of that contract). The registries are not yet part of the suite's Builtin/Custom registry set (§15.4).

### 15.3 Runtime records

- **Prepared foundation:** `{ selection, profile }`. `selection` is `{ status, requested, problems }` (§5.3); `profile` is the runtime profile or `null`.
- **Resolution:** `{ surface, status, readings, provenance }`. `provenance` is present only when a profile is active (§7). A surface form that is not a non-empty string is a caller error, not a resolution.
- Every record is deeply frozen.

### 15.4 First-consumer integration (Contract, calculogic-validator#150; D10 resolved, not current)

These decisions bind the implementation slice of calculogic-validator#150. None is current runtime until that slice lands, and until then every run, report, CLI and package is unchanged.

| Item | Decision | Compatibility |
|---|---|---|
| Run-configuration key | `linguisticProfile: { profileId, profileVersion? }` (validator config spec §10) | Absent key: runs byte-identical, `configDigest` included. Present key: `configDigest` changes, as expected |
| Run consequences of a failed selection | Every failure stops the run with a stderr diagnostic, exit code 1 and no report. That covers a malformed key (schema validation, before any resolution) and a well-formed selection that is `profile-not-registered` or `profile-version-mismatch` (§5.3). The foundation classifies; the suite decides the consequence. A token resolving `unknown` under an active profile is never a failure | Identical in `validate:naming`, `validate:tree` and `validate:all`. Diagnostics name the requested `profileId` and any pinned `profileVersion` |
| Report provenance | `linguisticProfile: { profileId, profileVersion, lexiconDigest }` as an optional top-level field of the slice and runner report envelopes, present only when a profile is active (report schema §4, §5) | No profile: report bytes unchanged |
| Packaging | `linguistic-foundation/src/**` joins the package files, with the package-artifact tests extended | The package gains files; no existing file changes |
| Registry lifecycle | Language profiles stay **builtin-only**: the profile registries do not join the Builtin/Custom registry set, and no Custom profile is offered. Participation is D11 (§12) | Joining would add a `registry-added` registry, which blocks runs for consumers with an active Custom set until they run `update` (registry lifecycle spec §7.1, §12.5), and would change every report's registry-set digests. Neither happens |
