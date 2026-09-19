# Calculogic Validator Repository Instructions

These instructions apply to the entire standalone `HCAToolkit/calculogic-validator`
repository. This file is self-contained; instructions from the Calculogic React app
do not govern this checkout.

## Repository authority and working roots

- This repository is the authoritative source for Validator implementation and for
  Validator package/development documentation.
- Run development commands from this repository root unless a command explicitly
  says otherwise. Paths in this file are relative to this root.
- Keep the **Validator development root** (this checkout, where implementation is
  edited and its own tests run) distinct from a **validation target root** (an
  external consumer repository whose files are being inspected).
- `HCAToolkit/Calculogic_React_App` is an originating consumer and integration
  environment. Its retained embedded `calculogic-validator/` tree is historical,
  pre-extraction implementation, not an authority for new Validator work. Make new
  Validator implementation and package/development-documentation changes here;
  handle consumer wiring or integration changes in a separately scoped consumer
  task.
- Do not infer that the React app's staged standalone-package migration is complete.
  Preserve the package-consumption status and qualifications recorded in `README.md`.
- Do not describe deferred validator modes, draft behavior, projected package
  layout, or future enforcement as implemented. Verify current behavior in code,
  tests, canonical specs, and registries before making a current-state claim.

## Issue, task, and pull-request discipline

1. Read the implementation issue, its parent or tracking issue, and every explicitly
   required reference before editing. Record an inaccessible or missing required
   reference as a blocker rather than inventing its contents.
2. Start from current `main` and use a dedicated branch. Keep one bounded task and
   one concern-focused change set per PR.
3. Treat the issue's allowed-change list and non-goals as hard boundaries. Do not
   bundle opportunistic cleanup, broad migrations, generated-output churn, lockfile
   changes, registry changes, or consumer-repository changes.
4. If the requested result cannot be completed within scope, stop and report the
   blocker; do not silently broaden scope.
5. Before delivery, inspect the complete diff and working tree. The PR body must
   summarize the change, identify changed files, state the relevant authority
   boundaries, and record exact verification commands with observed outcomes.
6. Use `Refs #<issue>` for related issues unless the task explicitly requests a
   closing keyword. Do not merge a PR or close an issue unless explicitly assigned.

## Source authority and documentation-first work

- Prefer repository-owned canonical sources over recollection, examples, copied
  consumer guidance, transitional inventories, or projected layouts.
- Read `README.md`, `package.json`, and the relevant current implementation/tests
  before documenting paths, commands, features, scopes, or behavior. A command is
  not available merely because an older document mentions it; confirm it in
  `package.json`.
- Follow NL-first for changes to structure, behavior, contracts, shells, configs,
  features, validators, registries, and other convention-governed architecture:
  update the owning NL skeleton or canonical contract first, then implementation.
  Do not create a parallel authority when an owning document already exists.
- Preserve concern purity and dependency direction from
  `doc/ConventionRoutines/CCS.md`, and preserve comment/provenance rules from
  `doc/ConventionRoutines/CCPP.md`.
- Use the classifications in
  `doc/ConventionRoutines/DocumentContentClassificationConvention-V1.md` and the
  scoped terms in
  `doc/ConventionRoutines/TerminologyScoping-Conventions-V1.md` when authoritative,
  illustrative, historical, draft, or transitional content might be confused.
- Treat a draft as binding only inside the scope it explicitly closes. Open and
  deferred draft decisions are not implementation authority.

### Documentation task fidelity and status wording

- Preserve required sections and acceptance criteria in structural documentation
  tasks unless they conflict with current repository truth.
- Do not satisfy a structural documentation task with wording cleanup alone.
- Keep task-specific supporting references scoped to the relevant task rather than
  making them global requirements.
- Distinguish current implementation reality from target architecture and staged or
  deferred behavior. Describe planned destinations, transition sequences, and
  future enforcement as such; do not present them as current standalone Validator
  behavior. Apply consumer-migration wording only when the task actually concerns
  that integration boundary.

## Baseline reading for every task

Before editing, read these repository-local convention sources:

1. `doc/ConventionRoutines/CCPP.md`
2. `doc/ConventionRoutines/CCS.md`
3. `doc/ConventionRoutines/FileNamingMasterList-V1_1.md`
4. `doc/ConventionRoutines/General-NL-Skeletons.md`
5. `doc/ConventionRoutines/NL-First-Workflow.md`

If any baseline source is missing, stop and report it instead of substituting or
inventing a replacement, unless the assigned task explicitly creates a local
pointer/wrapper for that source.

## Naming work

For naming-validator behavior, naming taxonomy, canonical filename grammar,
role/category/status registries, or naming convention/spec documentation, also read:

- `doc/ConventionRoutines/NamingValidatorSpec.md`

Authority boundaries:

- `doc/ConventionRoutines/FileNamingMasterList-V1_1.md` is the canonical authority
  for filename grammar, role taxonomy, category/status vocabulary, and naming
  change control.
- `doc/ConventionRoutines/NamingValidatorSpec.md` is the current Naming slice
  runtime/spec behavior authority. Do not assume runtime enforcement of every
  taxonomy concept in the master list.
- Naming owns filename interpretation and bounded semantic evidence. Other slices
  consume explicit Naming projections rather than duplicating Naming taxonomy or
  reading Naming internals as their own policy.
- Do not make Surface equivalent to Structural Home.
- Do not make Agnostic-Core Meaning replace Category, Role, Surface, or Structural
  Home identity.
- Keep Naming registry policy in Naming-owned registry surfaces. Preserve the
  documented builtin/custom precedence, canonicalization, digest/state, and runtime
  conversion boundaries rather than embedding registry payloads or policy into
  traversal logic.

## Tree work

For Tree runtime, findings, wiring, contracts, docs, registries, or Tree-related
documentation organization/navigation, follow the **Canonical Reading Order
(Implementation Work)** defined by
`doc/ValidatorSpecs/tree-owned/tree-documentation-map-and-reorg-inventory.md`:

1. `doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md`
2. `doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md`
3. `doc/ConventionRoutines/NamingValidatorSpec.md`
4. `doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md`
5. `doc/ValidatorSpecs/tree-owned/tree-documentation-map-and-reorg-inventory.md`

Do not introduce or follow a competing Tree implementation order.

Authority boundaries:

- The suite contract and Tree slice spec are canonical runtime/spec authority.
- The Naming spec is canonical inside Naming-owned scope and is bounded supporting
  authority when Tree consumes Naming-owned signals.
- The Tree NL/config note is supporting implementation guidance.
- The Tree documentation map is transitional navigation and ownership metadata,
  not runtime authority. Use its inventory to locate task-specific supporting
  specs and audits, then respect the status assigned to each source.
- Preserve current status labels, bounded modeling notes, and future advisory
  direction. Do not promote planned Tree reasoning or registry transitions to
  current runtime behavior.
- Keep Tree policy and reasoning deterministic: explicit evidence, stable ordering,
  owned registry vocabulary, bounded cross-slice inputs, and inspectable findings
  take precedence over hidden heuristics.

## Suite core, shared helpers, and cross-slice work

For suite-core/shared-helper reuse, cross-slice implementation, CLI scaffolding,
scope or target collection, exit-policy derivation, report metadata, or helper-area
ownership decisions, read in this order:

1. `doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md`
2. `doc/ConventionRoutines/ValidatorSuiteOwnedSharedHelpers-And-Capabilities.md`
3. `doc/ConventionRoutines/ValidatorHelperAreas-And-Reuse-Conventions.md`
4. `doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md`

Before adding suite-core or cross-slice helper logic, check the capability inventory
first. Reuse a matching suite-owned capability when concern and owner match. If none
matches, use the helper-area convention to choose a semantic owner and the ownership
contract to preserve loader/converter/runtime boundaries.

- Suite-wide composition belongs in a clear semantic area under `src/core/`.
- Slice-owned reuse belongs under the owning slice, such as `naming/src/` or
  `tree/src/`.
- Avoid generic catch-all `shared/` areas, premature helper frameworks, or moving
  slice semantics into suite core merely because several callers exist.
- Registries contain policy data, not parser control flow, traversal, sorting
  mechanics, finding derivation, or other engine mechanics.

### Slice-local loader, converter, and runtime trigger

For **any** slice-local runtime, loader, converter, wiring, or logic change—including
Naming-owned and Tree-owned implementations—read and follow:

- `doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md`

That trigger does not by itself require the suite-owned capability inventory or the
shared-helper routing convention. Read those additional references only when the
task also changes or evaluates suite-wide, cross-slice, CLI, scope/target, report,
exit-policy, or shared-helper ownership.

Keep these boundaries explicit:

- loaders validate, resolve, canonicalize, and maintain bounded registry state;
- converters produce deterministic runtime-ready structures;
- runtime/wiring/logic own execution, ordering, traversal, decisions, findings, and
  report derivation;
- a registry-state owner is appropriate for multi-source composition and explicit
  state/digest lifecycle, while a bounded direct builtin loader remains appropriate
  for locally consumed slice policy. Do not force all registries through one state
  layer.

## Structural addressing

For structural addresses, address examples, NL/comment address synchronization, or
structural-address validator work, also read:

- `doc/ConventionRoutines/DeterministicStructuralAddressingSpec-Draft.md`

Use its canonical grammar and explicitly closed repository scope only as documented.
Keep illustrative/placeholding addresses labeled, keep canonical addresses concrete,
and do not present deferred parser, validator, or cross-repository decisions as
implemented. Structural addressing owns address grammar; it does not take over
Naming interpretation or Tree placement policy.

## Registries and deterministic reasoning

For registry-model work, read these sources in this order:

1. `doc/ConventionRoutines/FileNamingMasterList-V1_1.md`
2. `doc/ConventionRoutines/NamingValidatorSpec.md`
3. `doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md`
4. `doc/ValidatorSpecs/cross-cutting/registry-model-and-slice-interaction.spec.md`
5. `doc/ValidatorSpecs/cross-cutting/registry-blueprint-implementation-map.spec.md`

This sequence is conditional on registry-model work and is not an additional
baseline for every task. Keep task-specific supporting references task-scoped.

When a task actually owns a registry migration, use this sequence:

1. Docs/spec alignment
2. Data-only registry payloads
3. Registry shape tests
4. Loader compatibility bridges
5. Runtime behavior migration
6. Extraction preparation

Do not imply that a documentation-only task or other work that does not own a
registry migration performs this sequence.

- Treat the owning canonical spec as semantic authority and the owning registry as
  policy data implementing that authority. Do not let navigation documents,
  examples, report metadata, or consumer configuration silently become policy.
- Preserve stable normalization, deduplication, ordering, precedence, immutable
  runtime preparation, and digest/report provenance where the current contract
  requires them.
- Prefer bounded, inspectable semantic models that make ownership and reasoning
  explicit. Avoid broad heuristics, duplicated literals, and generic modules that
  blur owner boundaries.
- When a task spans multiple authority surfaces, state in the task/PR summary which
  sources were runtime authority, navigation-only metadata, draft-scoped guidance,
  and task-specific supporting context.

## Verification and history

- Use the narrowest checks that prove the requested change, followed by broader
  checks only when the change warrants them. Relevant root commands currently
  defined in `package.json` include:

  ```bash
  npm test
  npm run validate:naming
  npm run validate:all
  npm run validate:tree
  npm run health:validator
  npm run addressing:get-tree
  npm run report:verify
  ```

- Forward validator flags after `--`, for example:
  `npm run validate:tree -- --scope=validator`.
- Do not substitute direct internal script invocation for the documented root npm
  interface unless the task specifically tests that internal boundary.
- Record exact commands and observed outcomes in the PR. Distinguish a passing
  check, an environment-limited check, and a check not run; do not rewrite history
  as a generic “tests passed.”
- If runtime tests are not run for an instructions-only change, record exactly:
  **Not run — instructions-only change.**
- Before committing, verify referenced local paths exist, command names match
  `package.json`, and the diff contains only intended files. Review for conflicting
  instructions, duplicated authority, stale embedded/React-root assumptions, an
  incorrect Tree reading order, and accidental suite-wide requirements on a purely
  slice-local loader/converter/runtime task.
- Keep commits focused and preserve reviewable verification history in the commit
  and PR descriptions. Do not claim checks that were not executed.
