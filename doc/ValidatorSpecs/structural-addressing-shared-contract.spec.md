# Structural Addressing Shared Contract (Stage 1)

## 1. Status and classification

- **Status:** Contract (documentation only). It changes no runtime behavior, registry, command, report or test.
- **Scope:** the shared model every Structural Addressing profile follows: profiles, namespaces, occurrence records, ordering, counting, markers, hierarchy, identity, and NL↔Code correspondence boundaries.
- **Last reviewed:** 2026-10-27.

Every rule in this contract carries one of these labels. They map onto `doc/ConventionRoutines/DocumentContentClassificationConvention-V1.md`.

| Label | Meaning | Classification |
|---|---|---|
| **Current** | True of `main` today; verified in code and tests. A change to it is a runtime change. | `Normative` |
| **Contract** | Binding on every future profile and consumer, whether or not one exists yet. | `Normative` |
| **Proposed** | The expected direction. Not binding until a later slice adopts it. | `Draft-Assumption` |
| **Deferred** | Must be decided explicitly in its own task. It is never settled as a side effect of unrelated work. | `Draft-Assumption` (open) |

Examples are `Illustrative` unless marked otherwise.

## 2. Purpose and non-goals

Structural Addressing answers one question: **where is this occurrence, in a deterministic order, inside a defined scope?** This contract fixes that question's vocabulary and boundaries once. Later profiles (code-file, NL-document) and consumers (Tree, Naming, Lexical Coherence, an NL↔Code comparison) can then be added without changing the foundation.

This contract does not:
- add a profile, command, registry, record field or finding;
- choose a serialized cross-domain address grammar (§7.3);
- replace, absorb or rewrite `DeterministicStructuralAddressingSpec-Draft.md`, CCPP markers or any existing addresses;
- change Tree's join keys or compatibility IDs.

## 3. Authority

### 3.1 Governing rule (Contract)

Structural Addressing owns the shared addressing model and profile contracts. Each profile defines the permitted occurrence hierarchy, ordering authority, counting policy, marker conventions, address grammar, and address interpretation within its declared scope. Domain-specific grammar rules remain authoritative only within their declared scope and must not be silently generalized to other profiles.

Consequences:
- This contract is the authority for cross-profile concepts: occurrences, records, profiles, ordering, counting, markers, namespaces, identity kinds and comparison boundaries.
- It is **not** the authority for any particular grammar's segment meanings. Those belong to the profile or grammar contract that declares them.
- No address convention is universal. Neither `tree-codebase`'s folder-letter/file-number markers nor the specialized grammar's host letters and concern slots define how another profile's addresses are read.

### 3.2 Authority map

| Source | Authority |
|---|---|
| This contract | The shared model and profile contract (§4–§10). |
| `structural-addressing/src/*` and its tests | Runtime truth for the one implemented profile, `tree-codebase`. §4–§6 describe it as **Current**. |
| `structural-addressing-get-tree-commands.spec.md` | The get-tree inspection commands. Unchanged. |
| `structural-addressing-tree-codebase-validation-input.spec.md` | Membership and root construction for validation runs. Unchanged. |
| `doc/ConventionRoutines/DeterministicStructuralAddressingSpec-Draft.md` | **Remains authoritative**, within its own declared and closed scope, for its specialized grammar (§7.4). This contract neither supersedes nor generalizes it. |
| `CCPP.md` provenance markers (`[5.2.25] cfg-… · Container · "…"`) | Remain governed by CCPP. §7.4 records their relationship to this contract. |
| Validator and Interface living documents (planning clarifications, October 2026) | Preserve intended direction. They are context, not repository authority, and never override a repository specification or implementation contract. Items adopted here are restated with labels. |
| `doc/Audits/tree-structural-addressing-comparison.audit.md`, `address-keyed-join-helper-ownership-and-extraction.audit.md` | Historical evidence. Their adopted recommendations are already runtime truth. |

## 4. Core model

### 4.1 Terms (Contract)

- **Occurrence:** one addressable unit in one source, such as a folder, a file, a code block or a document section. Profiles define which kinds exist.
- **Occurrence type:** the profile-declared kind of an occurrence (`folder`, `file`, …).
- **Profile:** the declared rules that turn one kind of source into addressed occurrences (§5). A profile owns its ordering authority, counting rule and marker strategy.
- **Addressed snapshot:** the complete, ordered set of occurrence records a profile produces from one input.
- **Address path:** the profile's serialized position of an occurrence inside its snapshot, such as `A.B.3`. It is a position, not an identity (§8).
- **Marker:** one rendered segment of an address path (`B`, `3`).
- **Ordinal:** the integer position a counting rule assigns to an occurrence among its siblings. A marker renders an ordinal; it never replaces it.
- **Domain prefix:** a short code naming the address domain: `T` (repository tree; **Current**), `NL` and `C` (**Proposed**).
- **Source namespace:** the label naming which source a snapshot addresses (for example `calculogic-validator`).

### 4.2 Occurrence record (Current, for `tree-codebase`)

`prepareTreeCodebaseAddressedSnapshot` returns, per occurrence:

| Field | Meaning |
|---|---|
| `address`, `addressPath` | the address path (the two fields are equal today) |
| `displayMarker` | the occurrence's own marker |
| `occurrenceType` | `folder` or `file` |
| `name`, `path` | the entry name and the source-relative path |
| `parentAddressPath` | the parent's address path, or `null` at a root |
| `depth` | 0 at a root |
| `orderIndex` | snapshot-wide depth-first pre-order position, starting at 0 |

The snapshot envelope adds `snapshotOutputId`, `profileId`, `domainPrefix`, `sourceNamespace`, `scope`, `target` and `scopeRoots`. It also carries Addressing-owned `compatibilityPolicy` (`status` and `revision`) and the derived joined `addressProfileId`; these are metadata, not occurrence fields or snapshot-instance identity.

### 4.3 Record invariants (Contract)

1. Occurrence type is an explicit field. No consumer infers it from a marker's shape.
2. Order is explicit. A consumer that needs order reads an order field, never array position and never a marker.
3. Lineage is explicit. A consumer reads `parentAddressPath` and `depth` rather than splitting strings, unless the profile documents the split as stable.
4. A record carries enough to rebuild the hierarchy without the source.
5. The same input always produces byte-identical records (determinism).

**Current gap:** `tree-codebase` records the snapshot-wide `orderIndex` but not the **sibling ordinal** its counter assigns. Today the record carries no explicit sibling ordinal. In a complete addressed snapshot that retains `parentAddressPath`, `orderIndex` and `occurrenceType`, the ordinal can be reconstructed from those fields without decoding `displayMarker`; an investigation did so for all 568 records of the repository-scope snapshot at `fb074d6a9fb2174402eed15638e75bea7444a52b`, for both meanings below. Filtered or partial views may not retain enough sibling evidence to reconstruct it. *Sibling ordinal* can mean the position among all siblings of a parent or the position among siblings of the same occurrence type. The `tree-codebase` counter assigns the same-type value, consistent with the currently Proposed field. Whether and how that field is adopted remains a decision for its runtime slice. Consumers still must not decode `displayMarker` (invariants 1 and 2). **Proposed:** an explicit sibling-ordinal field, raised as an implementation issue when the relevant runtime slice is authorized. Until then, no new consumer decodes markers.

## 5. Profile contract

### 5.1 What every profile declares (Contract)

| Declaration | Meaning |
|---|---|
| `profileId`, `status` | stable identifier; lifecycle status |
| `domainPrefix` | the address domain (§7) |
| `occurrenceTypes` | the closed set of kinds it emits |
| ordering authority | what decides sibling sequence (§6.1) |
| counting rule | how ordinals are assigned (§6.2) |
| marker strategy per occurrence type | how ordinals render (§6.3) |
| lineage separator | how markers join into an address path |
| address interpretation | what each segment of its addresses means, valid only within its declared scope |
| record fields | the fields its records carry beyond §4.2's |
| input contract | what it consumes, and which owner supplies membership |

A profile may interpret source structure as needed to identify and address occurrences, but must not perform slice-owned semantic judgments about role, placement correctness, terminology, or responsibility.

### 5.2 Profiles

| Profile | Status | Domain | Occurrences | Ordering authority | Counting rule | Markers |
|---|---|---|---|---|---|---|
| `tree-codebase` | **Current** (`active-v0`) | `T` | folder, file | name, then type, then path | per parent, per type | folders `A, B, … Z, AA`; files `1, 2, …` |
| `code-file` | **Proposed** | `C` | declarations, Containers, Subcontainers, Atomic Components, at a declared granularity | source order | **Proposed:** one counter across all sibling types | **Deferred** |
| `nl-document` | **Proposed** | `NL` | document sections and their contents | declared document order | **Deferred** | **Deferred** |

Whether NL↔Code comparison needs its own profile (`nl-code-compare` in the living document) or is only a consumer of two profiles is **Deferred**. §9 defines its boundaries either way.

**Current limitation:** the traversal in `structural-addressing-tree-codebase.logic.mjs` is written for `tree-codebase` alone (its counters, sort and types are hard-coded). A second profile is a runtime slice that must first separate the profile-neutral parts. Helper extraction follows the living document's rule: only once a second consumer exists.

## 6. Ordering, counting and markers

Three concepts, each owned by the profile and never conflated (Contract):

| Concept | Decides | Must not |
|---|---|---|
| Ordering authority | the sequence of siblings | depend on the runtime environment |
| Counting rule | which ordinal each sibling receives | depend on rendering |
| Marker strategy | how an ordinal is written | carry type, order or meaning a consumer must decode |

### 6.1 Ordering authority

- **Contract:** ordering is deterministic and environment-independent. The same input yields the same order on every machine and locale.
- **Contract:** where order carries meaning in the source (statements, blocks, document sections), the ordering authority preserves source order. Name order is valid only where the source has no meaningful order, as in a filesystem.
- **Current observation:** `tree-codebase` compares names with `String.prototype.localeCompare` without a fixed locale or collation. Its result varies with the runtime's default locale, so Current behavior deviates from the Contract requirement above. The evidence record follows.
- **Current observation, evidence record:** from a read-only investigation at `main` commit `fb074d6a9fb2174402eed15638e75bea7444a52b` (Node v22.22.2 with ICU 78.2; Node v24.22.1 with ICU 78.3 matched on the controlled cases). The scripts and report are kept outside the repository, and no repository test covers these results.
  - **Locale divergence (demonstrated in production):** run through the unmodified host, a Lithuanian default locale (`lt-LT`) swapped the sibling file ordinals of `categories.registry.json` and `category-role-perspective.registry.json` under `naming/src/registries/_builtin/`, which changed two addresses relative to English. Swedish and Turkish locales changed controlled test directories but not this repository. In the Naming bridge, one `occurrenceAddress` differed while `addressProfileId` and `addressedSnapshotId` did not. Whether any consumer's join failed was not tested.
  - **Default-locale mapping:** in the tested runtimes, `C` and `POSIX` resolved to the `en-US` default locale. They did not produce code-unit order.
  - **Ties (demonstrated under controlled permutations):** distinct strings that compare equal under `localeCompare`, such as NFC `é` and NFD `e` plus a combining acute accent, tie in every tested locale. The producer's whole comparison chain (name, then occurrence type, then path) also ties for same-type paths, so their relative order and file numbers follow input order. This shows dependence on input order, not instability in an unchanged environment.
  - **Filesystem variation (not demonstrated):** both normalization forms coexisted in the tested directories, and 40 repeated listings on one overlay filesystem returned the same order. Case-insensitive and normalization-enforcing filesystems were untested.
  - **ICU-version portability (not established):** two ICU versions agreed on the controlled cases. Other ICU versions and collation data were not tested.
  - **Pipeline:** the producer's comparison chain is the immediate address-ordering authority. Earlier host and collection sorts use the same unqualified comparison and supply the input order. The React app was not measured.
- **Proposed (direction approved 2026-11-05; not implemented):** pin the `tree-codebase` producer comparison to UTF-16 code-unit order across its name, then occurrence type, then path chain, so ordering does not depend on the runtime's collation data. The guarantee applies to the producer comparator only. End-to-end ordering determinism has not been verified: earlier host and collection sorts supply the input order and were not tested. Adopting it re-addresses siblings and changes `orderIndex` for some records (measured on the English baseline at `main` 776a88e8, substituting only the producer comparison: Validator 18 of 568 addresses and 229 `orderIndex` values; React 62 of 180 addresses and 123 `orderIndex` values). It is therefore a versioned change under §6.3 and needs a migration with parity evidence covering ordering, `orderIndex`, addresses, join compatibility and rendered report order. The decision is recorded in the owner-approved architecture decision record "Structural Addressing Ordering Policy and Compatibility Boundary", held outside this repository.

### 6.2 Counting rule

- **Current (`tree-codebase`):** counters reset per parent, with separate counters for folders and for files. A folder and a file under the same parent can therefore share an ordinal (`A` and `1`), and type disambiguates them.
- **Proposed (`code-file`):** one counter across all sibling types, so the address itself preserves source order.

### 6.3 Marker strategy and address changes

- **Contract:** a marker change is either display-only (the address path is unchanged), or it changes canonical address paths. The second kind is a **versioned** change: it invalidates stored addresses and joins and needs a migration with parity evidence. It is never presentation.
- **Deferred:** the `code-file` and `nl-document` marker grammars, the meaning of lowercase segments, and numbering policy within files.

## 7. Domains, namespaces and serialization

### 7.1 Domains (Contract)

Code and NL addresses use distinct domains even when their coordinates match. `C:…A.1` and `NL:…A.1` are different addresses, never the same address.

### 7.2 Where the domain lives today (Current)

`domainPrefix` is a snapshot envelope field (`T`). It is **not** part of `addressPath`. No serialized cross-domain address exists in runtime output.

### 7.3 Serialized cross-domain form (Deferred)

The candidates on record are both `Illustrative`:
- `<domain>:<namespace>@<addressPath>`, such as `T:calculogic-validator@A.B.3` (Validator living document §4.5).
- A file-anchored pair, such as `naming-projection.logic.mjs:C:A.B.1.a.a.a.1` and `naming-projection.logic.md:NL:A.B.1.a.a.a.1` (Validator living document, planning clarification).

The file-anchored pair shows the intended direction: one file's code and its documentation addressed with comparable coordinates under distinct domains. Lexical Coherence would interpret whether their language agrees. **Contract:** nothing in this contract rules that direction out. **Contract:** identical coordinates never by themselves establish semantic correspondence (§9) or Configuration membership (§8).

Choosing a form, or neither, is one explicit decision. It also covers segment meaning, escaping, and how an address is embedded in or referenced from files.

### 7.4 Existing specialized conventions (Contract on scope only)

**Deterministic Structural Addressing grammar** (`DeterministicStructuralAddressingSpec-Draft.md`). It is not a general tree notation. It assigns fixed meanings to positions:

`Illustrative`: `A.1.3.2`

| Segment | Meaning in that grammar |
|---|---|
| `A` | host identity |
| `1` | host-local structure index |
| `3` | concern slot (`3` Build … `8` ResultsStyle) |
| `2` | nested node index |

- It remains authoritative for its own closed scope: docs, NL skeletons, comments and the CCPP-adjacent references that draft names.
- Its concern-position semantics are domain-specific. They do not determine how `code-file` addresses an arbitrary function or loop, nor how any other profile reads its segments.
- It remains usable where concern-structured addressing fits, such as NL documentation and generated concern-separated code. Whether a future profile adopts it, maps to it or stays separate is **Deferred** (D2).

**CCPP `[n.n.n]` NL-section markers** are governed by CCPP. A deterministic mapping to `nl-document` addresses is **Deferred** (D2). They are not adopted as the `nl-document` grammar merely because they are in use.

Neither convention is rewritten here, and no existing address is restamped (consistent with that draft's §12).

## 8. Identity

Four kinds, related but never interchangeable (Contract):

| Kind | Answers | `tree-codebase` today |
|---|---|---|
| Structural position | where the occurrence sits in one snapshot; changes when it moves | `addressPath` (**Current**) |
| Entity reference / persistent identity | what the occurrence is, and which edits that survives | an **entity reference** only: the source-relative `path` (**Current**). It survives reordering of siblings but not a rename or move, so it is not persistent identity across all edits |
| Snapshot identity | which snapshot a position belongs to | **Deferred:** needs a contract for scope, profile, source and membership before any mechanism (such as a digest) is chosen |
| Relationship | which occurrences belong together (for example one Configuration across files) | none. **Contract:** matching addresses never establish a relationship; a relationship is explicit |

**Contract:** every entity key states which edits it survives. No key is assumed to survive every kind of edit. A path survives none that change the path. Builder entity IDs and doc-engine `contentId`/`anchorId` are intended to survive moves, within their own domains' contracts. Persistence across renames and moves, for any domain this contract addresses, is **Deferred** to the slice that needs it.

**Current join key (B1/D6 Stage 1):** Tree joins Naming occurrences on `addressProfileId + addressedSnapshotId + occurrenceAddress`. Structural Addressing owns the family, compatibility-policy metadata and joined profile identity. Tree obtains `addressProfileId` from the actual producer result. For Stage 1, Addressing preserves `tree-structure-advisor-address-profile` solely as a `legacy-unqualified` alias: `compatibilityPolicy` is `{ status: "legacy-unqualified", revision: null }`, and the profile declaration owns `legacyAddressProfileId`. This does not assert compatibility across locale-dependent outputs. The family `profileId` remains `tree-codebase`. Tree retains the separate static snapshot namespace `tree-structure-advisor-current-snapshot`; no per-snapshot identity semantics are established. **Contract:** activating a changed joined identity requires a coordinated producer/consumer transition with join-parity and migration evidence.

**Current observation (mixed-policy experiment, read-only, at `main` 776a88e8, synthetic scenarios on frozen English-collected inputs):** with identical Tree-supplied constants, Tree's section intake accepted Naming evidence attached to a different file when the payload and the addressed snapshot came from different ordering policies. In the English and code-unit comparison, each mixing direction produced one mis-associated React v1 observation, four Validator repo-scope v1 observations, and four Validator docs-scope v1 observations. The intake matches by namespace and `occurrenceAddress` tuple; N1 and N2 also check occurrence type. It does not compare the observation's source path with the resolved occurrence's path. Changing either Tree-supplied constant alone rejected every attempted association as `unmatched-record`. Contract-version gates did not discriminate between the policies. The experiment does not show that such mixing occurs in practice, and unchanged findings on the measured entry surface do not show that associations were correct.

**Current infrastructure; future activation deferred:** Addressing's pure compatibility derivation validates lowercase kebab-case family identifiers. A future `versioned` descriptor requires a canonical positive decimal string revision (no zero, leading zero, sign, decimal point or whitespace) and no legacy alias, and encodes `<family>@<revision>`. Consumers compare the joined string exactly and treat it as opaque. Unknown status or invalid metadata fails; derivation consults no environment, locale, package version or digest. No versioned production revision is active. The current comparator remains unchanged.

**Tree compatibility qualification:** incompatible, missing or unknown envelope namespaces admit no addressed evidence. Under a compatible envelope, only records with a valid tuple, matching namespace and a tuple resolving in Tree's actual snapshot qualify for legacy consumption. Compatibility-rejected evidence never recovers through path or address aliases. Independent payload-level sections retain their own contracts. B2 source-path checks remain separate; their rejected-record set is not automatically applied to legacy consumers.

**Migration limits:** no historical payload is relabeled or supplemented. Caller-supplied addressed payloads are distinct from path-keyed Naming staging used to construct Tree-built payloads. React package pins, live links, external producers and retained payloads require coordinated upgrade/regeneration decisions outside Stage 1; their absence is not assumed. The legacy alias cannot discriminate differently ordered legacy artifacts. C1 and its versioned revision must be activated together only under separate authorization.

**Current (B2):** Tree performs a bounded source-path correspondence check at Naming intake, without replacing tuple identity (Tree spec S1.2). It compares supplied `repoRelativePath` with the tuple-resolved occurrence's `path` under an explicit lexical policy, rejects malformed/mismatched evidence per record, and records permitted omissions as unverified. Tree owns consumption checks; Naming retains interpretation and Structural Addressing retains identity generation. Rejection can affect downstream availability and findings, but changes no addresses or compatibility constants.

## 9. NL↔Code correspondence

### 9.1 Four checks (Contract)

| Check | Question | Owner |
|---|---|---|
| Positional alignment | do two occurrences have matching coordinates? | Structural Addressing |
| Correspondence | does evidence show they represent related constructs? | the comparison capability, using owning slices' evidence |
| Ordering coherence | do corresponding constructs appear in the required sequence? | the comparison capability |
| Lexical coherence | do terminology and stated responsibilities agree? | Lexical Coherence |

### 9.2 Rules (Contract)

1. Positional alignment is evidence to investigate, never proof of correspondence.
2. Order is evaluated under an explicit correspondence and ordering contract. Not every documentation section or code occurrence needs a one-to-one counterpart.
3. A reported mismatch names which check failed, so ownership stays attributable.

`Illustrative`: code `…a.1` "Validate registry", `…a.2` "Generate report"; documentation `…a.1` "Generate report", `…a.2` "Validate registry". Where the operations are established as corresponding, the example demonstrates an ordering-coherence mismatch despite positional alignment. Without that evidence, the comparison reports unresolved correspondence instead.

### 9.3 Not current

No NL or code addressing, no comparison capability and no `validate:addressing*` command exists (`structural-addressing-get-tree-commands.spec.md`).

## 10. Ownership boundaries (Contract)

| Owner | Owns | Does not own |
|---|---|---|
| Suite core | validation-run membership (`selectedPaths`, scope roots) | addresses |
| Structural Addressing | profiles, occurrence records, ordering, counting, markers, positional alignment | meaning, placement, correctness, terminology |
| Tree | repository-structure interpretation of addressed occurrences; its join constants | address production; filename meaning |
| Naming | filename and folder-name interpretation; semantic evidence offered through explicit bridges | in-file interpretation; Tree placement |
| Lexical Coherence (future) | in-file linguistic interpretation: identifiers, comments, stated responsibilities | filename reasoning (it consumes Naming's through a bridge) |
| Comparison capability (future) | correspondence and ordering coherence across profiles | producing addresses; lexical judgement |
| Linguistic Foundation (contract only: `linguistic-foundation-shared-contract.spec.md`; no runtime) | shared lexical identity: profile-scoped lexemes, resolution, ambiguity, provenance | lexicon content of any language; tokenization; any slice's interpretation |

## 11. Current versus planned

| Capability | State |
|---|---|
| `tree-codebase` profile, addressed snapshot, get-tree text/JSON rendering | **Current** |
| Validation-input adapter feeding Tree | **Current** |
| Tree consuming addressed snapshots and joining Naming by address | **Current** |
| Explicit sibling-ordinal field | **Proposed** (issue raised with its runtime slice) |
| Locale-independent name ordering | **Proposed** (UTF-16 code-unit producer comparator; direction approved, not implemented; issue raised with its runtime slice) |
| Tree-owned source-path correspondence check at Naming intake | **Current** (B2; Tree spec S1.2) |
| Addressing-owned compatibility metadata and Tree qualification | **Current** (B1/D6 Stage 1; legacy-unqualified alias only) |
| Versioned ordering-policy activation | **Proposed** (B1 Option A; coordinated C1/D6 activation separately authorized) |
| `code-file`, `nl-document` profiles | **Proposed** |
| Serialized cross-domain address | **Deferred** |
| Snapshot-identity contract | **Deferred** |
| NL↔Code comparison capability, `validate:addressing*` | **Deferred** |
| Deterministic Structural Addressing grammar, within its declared scope | **Current** (documentation authority; no runtime parser) |
| Reconciling that grammar and CCPP markers with future profiles | **Deferred** |
| Persistent identity across renames and moves | **Deferred** |

## 12. Deferred decisions register

| # | Decision | Trigger to open it |
|---|---|---|
| D1 | `code-file` granularity, counting rule and marker grammar | first code-file profile slice |
| D2 | `nl-document` counting rule and marker grammar; whether it adopts, maps to or stays separate from the Deterministic Structural Addressing grammar; mapping of CCPP markers | first nl-document profile slice, or a deliberate reconciliation task |
| D3 | Serialized cross-domain address form (§7.3) | first consumer that stores or prints a cross-domain address |
| D4 | Snapshot-identity contract | first consumer comparing or caching snapshots |
| D5 | Whether comparison is a profile or only a consumer | comparison capability design |
| D6 | Changes to Tree join constants | only with a coordinated producer/consumer task; if the ordering-comparator transition changes Tree join constants, open D6 through a coordinated producer/consumer task |

## 13. Change control

- Runtime work under this contract follows NL-first: the owning spec and an NL configuration note come first, then code.
- A slice that touches a **Current** row updates this contract in the same change.
- A slice that resolves a **Deferred** row records the decision here and moves it to **Contract** or **Current**.
- This contract adds no enforcement. Structural-address validation, if introduced, follows `ValidatorSuite-Contracts-And-Modes.md`.
