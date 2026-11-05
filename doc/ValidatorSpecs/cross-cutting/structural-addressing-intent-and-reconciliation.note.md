# Structural Addressing: Architectural Intent and Reconciliation Note

## 1. Status and authority

- **Classification:** Informative. Statements about intended design are marked Draft-Assumption.
- **Authority:** This note adopts no address grammar, changes no existing contract authority, and authorizes no implementation. Where it differs from `doc/ValidatorSpecs/structural-addressing-shared-contract.spec.md` or any other specification, the specification governs.
- **Not a decision record.** It preserves intended design and names what is undecided. Decisions are made in their own tasks (shared contract §12, §13).

## 2. Purpose

Several conventions describe addressing in different eras of the project. This note records, in one place, which concepts the newer Structural Addressing foundation is intended to cover, which repository documents are the current authority or reference for them, and which questions remain open. It exists so later work does not treat an older convention as the specification for newer profiles.

## 3. Shared nested-occurrence foundation (Draft-Assumption)

Structural Addressing is intended as one foundation for locating nested occurrences, with each environment using a different portion of the hierarchy. Profiles define supported occurrence types, ordering, counting and markers (contract §3.1, §5). Domains stay distinct even when coordinates match (§7.1).

| Environment | Portion of the hierarchy it uses (Illustrative) |
|---|---|
| Codebase | folders, files, headings, encapsulations. No Builder Atomic Components in the current codebase model, which has no Builder IR. This is not a limit on future source-level addressing. |
| NL document | document, headings, sections, nested content |
| Builder | tabs or other containers, nested elements, Atomic Components |

The intended design includes continuing an address from a file into its contents. The planning documents illustrate this with uppercase-and-number segments for repository structure and lowercase segments for internal structure. Those forms are candidates only. Their meaning, counting and serialization remain open (contract §7.3, D1–D3).

## 4. Position, identity and relationships

- **Position evidence (Draft-Assumption).** A position can be *observed* (computed from the actual hierarchy) or *declared* (written into the source). These are separately sourced evidence about the position of an intended or identified occurrence, not separate identity kinds. The two can disagree, and a declared marker does not by itself establish which occurrence it correctly identifies. A future validator could compare them. Neither is persistent identity.
- **Identity and relationships (Contract, §8).** Structural position, entity reference, snapshot identity and relationship stay distinct. Persistent identity across edits is Deferred. Matching addresses never establish a relationship or correspondence (§8, §9).
- **Ownership.** Structural Addressing supplies positional evidence and reference mechanics. It does not interpret what a Configuration, Project or correspondence means (§10).

## 5. Conceptual scopes (Illustrative, conceptual only)

Vision §5 maps codebase structure to platform concepts. This note adds one observation without making it a rule: a Collection, Project or Configuration can be described by the levels it reaches.

| Concept | Levels it reaches (conceptual) |
|---|---|
| Collection | folder through encapsulation |
| Project | subfolder through Atomic Component |
| Configuration | heading through Atomic Component, possibly across tabs |

The depth span describes reach, not membership. Membership comes from explicit relationships, so a Project can include related structures across tabs or files without positional containment. No range mechanism is proposed.

## 6. CCPP in the architecture's history

- **What CCPP does (Contract, CCPP §3.2, §3.3, §5, §10).** Its bracket token is an NL-section number, and the leading digit matches the NL skeleton's concern index. It positions an NL section; many code annotations can reference one section. A structural address is a separate optional draft line, not a replacement.
- **Status.** CCPP is a legacy NL-section reference convention within the architecture's history. It is not automatically the grammar for newer profiles. Mapping it to an `nl-document` profile is Deferred (D2).
- **Open hypothesis (Draft-Assumption).** The annotation vocabulary may mix three dimensions: hierarchical type (Container, Subcontainer, Primitive), concern, and content role (for example Workflow, Derived value, Knowledge). Whether all labels fit these dimensions is not established, and no dimension model is adopted here. A separate review of CCS and the NL skeleton's concern numbering may refine or replace this hypothesis.

## 7. Current authority or reference source

| Concept | Current authority or reference source | Kind |
|---|---|---|
| Shared model, profiles, ordering, counting, markers, domains | Shared contract §3–§7 | Authoritative contract |
| Identity kinds | Shared contract §8 | Authoritative contract |
| NL↔Code correspondence checks | Shared contract §9 | Authoritative contract |
| `tree-codebase` runtime | `structural-addressing/src` and its tests | Implementation |
| Host/concern-slot grammar | `DeterministicStructuralAddressingSpec-Draft.md` | Draft, authoritative only within its own closed scope (contract §7.4). It does not own the grammar of newer profiles and is a reference source for D2. |
| Comment protocol, NL-section bracket token | `CCPP.md` | Convention (legacy NL-section reference) |
| Concern order and NL numbering | `CCS.md`, `General-NL-Skeletons.md` | Convention |
| Filename interpretation / repository-structure interpretation | Naming / Tree | Slice ownership |
| Codebase↔platform correspondence | Vision document §5 (planning context, outside the repository) | Planning reference, not repository authority |

## 8. Undecided

- D1 `code-file` granularity, counting and markers. D2 `nl-document` grammar and CCPP mapping. D3 serialized cross-domain form.
- D4 snapshot-identity requirements. They should be evaluated when a consumer compares or caches snapshots. Joining Tree and in-file evidence within one execution does not automatically require the deferred mechanism.
- Whether a written in-file marker carries position, identity, or separate fields for each.
- The dimension and authority of CCPP's non-hierarchical labels.
- #128 (profile-driven producer), and the `localeCompare` ordering and sibling-ordinal gaps.
- Whether concept ranges ever become a contract mechanism.

## 9. Non-goals

This note does not select a grammar, define uppercase or lowercase segment meanings, change CCPP or any annotation, add a profile, namespace or range mechanism, or authorize implementation.
