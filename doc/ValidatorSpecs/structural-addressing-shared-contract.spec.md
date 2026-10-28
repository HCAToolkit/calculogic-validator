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

The snapshot envelope adds `snapshotOutputId`, `profileId`, `domainPrefix`, `sourceNamespace`, `scope`, `target` and `scopeRoots`.

### 4.3 Record invariants (Contract)

1. Occurrence type is an explicit field. No consumer infers it from a marker's shape.
2. Order is explicit. A consumer that needs order reads an order field, never array position and never a marker.
3. Lineage is explicit. A consumer reads `parentAddressPath` and `depth` rather than splitting strings, unless the profile documents the split as stable.
4. A record carries enough to rebuild the hierarchy without the source.
5. The same input always produces byte-identical records (determinism).

**Current gap:** `tree-codebase` records the snapshot-wide `orderIndex` but not the **sibling ordinal** its counter assigns. Today that ordinal is recoverable only by decoding `displayMarker`, which invariants 1 and 2 forbid consumers to rely on. **Proposed:** an explicit sibling-ordinal field, raised as an implementation issue when the relevant runtime slice is authorized. Until then, no new consumer decodes markers.

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
- **Current observation:** `tree-codebase` compares names with `String.prototype.localeCompare` without a fixed locale or collation. Its result can vary with the runtime's default locale. It has matched across the environments tested so far. **Proposed:** pin the comparison (fixed locale and options, or code-unit order) with a regression check against existing addresses, because any changed order re-addresses siblings. It is raised as an implementation issue when the relevant runtime slice is authorized.

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

**Current join key:** Tree joins Naming occurrences on `addressProfileId + addressedSnapshotId + occurrenceAddress`. The profile and snapshot values are Tree-supplied compatibility constants (`tree-structure-advisor-address-profile`, `tree-structure-advisor-current-snapshot`), not the Structural Addressing `profileId`. **Contract:** changing them is a coordinated producer/consumer transition with join-parity tests, not part of any profile change.

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
| Linguistic Foundation (exploratory, §4.6 of the living document) | possibly shared linguistic identities | any slice's interpretation |

## 11. Current versus planned

| Capability | State |
|---|---|
| `tree-codebase` profile, addressed snapshot, get-tree text/JSON rendering | **Current** |
| Validation-input adapter feeding Tree | **Current** |
| Tree consuming addressed snapshots and joining Naming by address | **Current** |
| Explicit sibling-ordinal field | **Proposed** (issue raised with its runtime slice) |
| Locale-independent name ordering | **Proposed** (issue raised with its runtime slice) |
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
| D6 | Changes to Tree join constants | only with a coordinated producer/consumer task |

## 13. Change control

- Runtime work under this contract follows NL-first: the owning spec and an NL configuration note come first, then code.
- A slice that touches a **Current** row updates this contract in the same change.
- A slice that resolves a **Deferred** row records the decision here and moves it to **Contract** or **Current**.
- This contract adds no enforcement. Structural-address validation, if introduced, follows `ValidatorSuite-Contracts-And-Modes.md`.
