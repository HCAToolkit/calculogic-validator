# Tree Structural-Address Neutral Probe Contract Spec (Issue #480)

## Status and ownership

- **Ownership:** Tree-owned.
- **Contract posture:** docs/spec only.
- **Contract purpose:** neutral pre-reasoning structural-address evidence contract.
- **current runtime truth:** occurrence snapshot runtime substrate exists and is consumed inside Tree runtime preparation/reasoning flow.
- **not current runtime truth:** this document does not introduce runtime behavior, loader/normalization implementation, report output exposure, final placement confidence semantics, or known-root replacement semantics.
- **staged implementation path:** formalize contract boundary first, then evaluate bounded runtime exposure in a later issue.
- **staged producer migration (#45):** the evidence shape below will be produced by a Tree-owned projection over Structural Addressing output instead of Tree's private snapshot producers. See "Addressing-backed projection" under Handoff boundaries. Until #45's wiring switch lands, the private producers remain current runtime truth.

Issue lineage: Refs #480; parent roadmap context Refs #452; audit context Refs #478; producer migration Refs #45.

---

## Inputs

This contract defines a conceptual input boundary that reuses existing Tree scope and traversal behavior.

### Input boundary

- active Tree scope.
- target/include roots using existing Tree scope/target semantics.
- selected filesystem paths from existing Tree traversal/snapshot behavior.

### Guardrails

- no new scope policy.
- no new traversal policy.
- no new target resolution policy.

The neutral probe contract is intentionally defined on top of the existing occurrence snapshot substrate rather than introducing alternate traversal or scope interpretation.

---

## Neutral probe evidence shape

The neutral probe evidence contract is based on current occurrence snapshot concepts and field families.

```js
{
  scope: {
    scopeRootPath,
    targetKind,
    source
  },
  scopeRoots: [],
  occurrenceRecords: [
    {
      resolvedPath,
      actualName,
      occurrenceType,
      scopeRootPath,
      isScopedRoot,
      isScopeTopOccurrence,
      parentResolvedPath,
      depth,
      lineageSegments,
      markerSegments,
      occurrenceMarker
    }
  ]
}
```

Contract-preserved concepts (normative for this spec boundary):

- scope binding.
- scope roots.
- resolved path.
- actual name/token.
- folder/file occurrence type.
- scoped-root marker.
- scope-top marker.
- parent path.
- depth.
- lineage segments.
- marker segments.
- flattened occurrence marker/address.

Field naming may be refined in later implementation slices only if these concepts remain deterministic and explicitly mappable.

---

## Deterministic addressing semantics

This contract adopts the structural-address semantics already documented in `tree-occurrence-model-and-addressing.spec.md` for Tree occurrence identity modeling.

- active scope root starts at `A` in the illustrative lineage model.
- folder occurrences use alphabetic sibling markers: `A`, `B`, `C`, … (extended as needed).
- file occurrences use numeric sibling markers: `1`, `2`, `3`, …
- folder counters rebase per parent lineage.
- file counters rebase per parent lineage.
- addresses are lineage-based (for example `A.D.A.3`).
- resolved filesystem paths remain user-facing truth.
- structural addresses represent pre-reasoning occurrence identity, not final meaning.

This section defines neutral structural-address evidence semantics only; it does not change report semantics.

---

## Handoff boundaries

### Relationship to current occurrence snapshot substrate

- The current occurrence snapshot is the current implementation reality substrate that supplies most of the required neutral probe evidence fields.
- This contract formalizes boundary expectations without claiming a new runtime surface.

### Addressing-backed projection (staged, #45)

Status: staged. These rules bind the Tree projection module (`tree/src/tree-addressed-occurrence-snapshot.logic.mjs`) once it exists. They become current runtime truth only when #45's wiring switch lands. Evidence: `doc/Audits/tree-structural-addressing-comparison.audit.md` §5.

**Producer chain.** Tree wiring passes suite-core's prepared values to the Addressing-owned adapter (`structural-addressing-tree-codebase-validation-input.spec.md`). The adapter's `treeCodebaseInput` goes to `prepareTreeCodebaseAddressedSnapshot`. This projection then maps the addressed records onto the evidence shape above. Only Tree wiring imports Addressing modules; Tree core keeps consuming prepared inputs.

**Projection inputs:**
- the addressed `occurrenceRecords`;
- the adapter's `declaredScopeRoots`. These are the normalized, uncollapsed roots, taken from the adapter output and never reconstructed from the addressed records;
- the raw `targets` and `selectedPaths`, for the envelope's `targetKind`;
- the caller's `source` label.

**Envelope.** Every envelope value is input-derived and does not depend on the records:
- `scopeRoots`: `declaredScopeRoots`, as strings.
- `scope.scopeRootPath`: the first entry of `scopeRoots`, or `.` when the list is empty.
- `scope.targetKind`: `dir` or `file` for exactly one target, by the descriptor's kind or else inferred from the selected paths; otherwise `mixed`. A single `.` target is also `mixed`. This is today's rule, unchanged.
- `scope.source`: the caller-supplied label.

Structural Addressing's own envelope (string `scope`, node-object `scopeRoots`, profile metadata) is not this envelope and does not replace it.

**Records.** Each record carries Structural Addressing's `path`, `name`, `occurrenceType`, `addressPath`, `parentAddressPath`, `depth` and `orderIndex`. It also carries the contract-preserved concepts, mapped deterministically:

| Contract concept (field) | Mapping |
|---|---|
| resolved path (`resolvedPath`) | `path` (transition alias) |
| actual name (`actualName`) | `name` (transition alias) |
| flattened occurrence marker (`occurrenceMarker`) | `addressPath` |
| marker segments (`markerSegments`) | `addressPath` split on `.` |
| parent path (`parentResolvedPath`) | `path` of the record whose `addressPath` equals `parentAddressPath`, or `null` |
| scope binding (`scopeRootPath`) | the deepest entry of `declaredScopeRoots`, other than `.`, that equals or contains `path`; otherwise `.` |
| lineage segments (`lineageSegments`) | for a `.` binding, the path segments. Otherwise the binding followed by the segments below it |
| scoped-root marker (`isScopedRoot`) | `path` equals the binding |
| scope-top marker (`isScopeTopOccurrence`) | lineage segments have length 1 |
| depth (`depth`) | `depth` |

Deepest-root binding keeps an inner root's own binding after the adapter collapses overlapping roots: `tree/src` under `tree` still binds to `tree/src`. Under the top-level-entry fallback (`system` profile), each top-level entry is its own declared root, so it keeps `isScopedRoot: true`, as today.

**Prepared inputs.**
- `structuralAddressSnapshot` is the projected snapshot.
- `occurrenceSnapshot` references **the same object**. It is a transitional, deprecated alias kept for one transition, and is removed with the retirement of the private snapshot modules (a separate #39 follow-on).
- New consumers read `structuralAddressSnapshot`.

**Expected corrections** (gated in #45, see the audit §5.7):
- **D1:** a root file outside every declared root binds to `.`, which corrects `scopeRootPath`, `lineageSegments`, `isScopeTopOccurrence` and `depth`.
- **D2:** no phantom ancestors.
- **D4:** collapsed overlapping roots change address, marker segments, parent and depth, while binding, lineage and both scope flags are preserved.
- **O2:** `orderIndex` is non-null.

Everything else matches the private producer field for field.

### Relationship to known-root compatibility interpretation

- Known-root compatibility interpretation remains a separate downstream interpretation layer.
- This contract does not change known-root behavior.

### Relationship to future registry-based Tree reasoning

- Registry-based Tree reasoning is a later consumer layer that may consume this neutral evidence contract.
- This issue does not wire registry policy into Tree runtime logic.

### Relationship to future loader/normalization work

- Loader/normalization work is downstream from this boundary and should wait until this contract is stable.
- This issue does not add loader code or normalization behavior.

### Relationship to final Tree findings and reports

- Findings and reports remain downstream output layers.
- This issue does not expose structural addresses in findings/reports.

---

## Future surface options

After contract acceptance, exposure options can be evaluated in a bounded implementation issue:

- docs-only contract usage,
- internal API,
- debug/probe output,
- command surface,
- staged combination.

This issue does not select or implement any command/runtime surface.

---

## Conformance notes

- current snapshot substrate is mostly sufficient for neutral structural-address probe evidence concepts.
- contract formalization is the immediate next step completed by this docs/spec slice.
- loader/normalization migration should wait until this neutral probe contract is accepted.
- report/finding exposure remains out of scope in this issue.
- a later implementation issue can decide whether to expose this probe via internal API, debug/probe output, command surface, or another bounded path.

Non-goal reaffirmation for this issue:

- no runtime Tree behavior changes.
- no get-tree command implementation.
- no structural-address CLI/report exposure.
- no debug-output addition.
- no internal API export changes.
- no loader additions.
- no policy registry wiring into Tree logic.
- no known-root compatibility behavior changes.
- no Tree findings/report shape/severity/detail/summary changes.
- no registry JSON changes.
- no Naming behavior changes.
- no Naming → Tree bridge payload changes.

---

## Next implementation direction

Recommended next runtime-safe slice after this contract is accepted:

- evaluate one bounded exposure path (internal neutral structural-address probe API, debug/probe output, command surface, or staged combination) based on current evidence and ownership boundaries.

Broader loader/normalization migration and registry-based Tree reasoning should wait until this neutral probe contract is stable.
