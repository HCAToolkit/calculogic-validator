# calculogic-validator

## Origin and purpose

The Validator first developed inside the [Calculogic React app](https://github.com/HCAToolkit/Calculogic_React_App) as its naming, structure, and project conventions became increasingly explicit. Those conventions needed deterministic, inspectable checks rather than relying on memory or one-off manual review. Naming validation was an early deterministic implementation; Tree and structure reasoning followed as the Validator expanded into a reusable, modular validation suite beyond host-specific tooling.

The suite was extracted so it could have independent ownership and be consumed by Calculogic without remaining coupled to the host application. This standalone `HCAToolkit/calculogic-validator` repository is now the **authoritative source for Validator implementation**. `HCAToolkit/Calculogic_React_App` remains the originating Calculogic application and is a current consumer and integration environment for the standalone package. Its historical `Calculogic_React_App/calculogic-validator/` directory is the pre-extraction embedded implementation, not a second independently maintained authoritative source.

## 1) Overview

`calculogic-validator` is a standalone, **modular, configurable, policy-driven validator suite and package**, including CLI binaries, host scripts, schema, and tests for naming and full validation workflows. The suite is **report-first by default** and can escalate through policy modes when explicitly configured. Canonical suite contract and mode semantics are centralized in [`doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md`](./doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md). When working inside this validator repository, the recommended self-development interface is the **repository root** npm scripts so command behavior, arguments, and report capture stay consistent with CI and team workflows.

Registry expansion roadmap note: see [`doc/ConventionRoutines/registry-expansion-candidates.audit.md`](./doc/ConventionRoutines/registry-expansion-candidates.audit.md) for the current hardcoded-policy audit and prioritized extraction plan.

Canonical ownership boundary note: for loader → converter → runtime ownership and policy-data vs engine-mechanics separation, see [`doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md`](./doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md).

## Using the validator from another repository

The workflows below describe the package behavior verified in the package-consumption audit. For the tested environment, commands, root-context evidence, and blocker classifications, see [`doc/Audits/package-consumption-and-dev-link-readiness.audit.md`](./doc/Audits/package-consumption-and-dev-link-readiness.audit.md).

### Consumption model

Keep the implementation source and validation target distinct:

- the validator package or validator checkout supplies the implementation;
- the consumer repository is the repository being validated.

For an ordinary installed consumer, the target repository root is the consumer repository and the validator development root is unavailable by default. The presence of `node_modules/@calculogic/validator` supplies the package; it does not make that installed directory the validation target.

### Stable install: packed artifact

The preferred currently verified stable-consumer workflow is a packed artifact. From the validator checkout, create it with:

```bash
npm pack
```

npm produces an artifact with a name such as `calculogic-validator-<version>.tgz`. From the consumer repository, install that artifact and check the public command surface:

```bash
npm install /absolute/path/to/calculogic-validator-<version>.tgz
npx --no-install calculogic-validate --help
npx --no-install calculogic-validator-health --help
```

The audit verified that this mode installs normal package contents, exposes the public commands, and keeps the consumer repository as the validation target. It does not require an embedded `calculogic-validator/` directory or manual root/path repair, and installation under `node_modules` does not cause `node_modules` to be scanned. This workflow does not imply that the package is currently published to the npm registry.

### Active development: `npm link`

Use `npm link` when actively changing the validator from a separate checkout. From the validator checkout:

```bash
npm link
```

Then, from the consumer repository:

```bash
npm link @calculogic/validator
npx --no-install calculogic-validate --help
```

In this mode, the validator checkout is the live runtime implementation source while the consumer repository remains the validation target. The audit verified that changes in the validator checkout become visible to new consumer processes without reinstalling the package. This is a cross-repository development workflow, not the preferred stable distribution mode.

### Return to stable mode

From the consumer repository, remove its live link and reinstall a packed artifact:

```bash
npm unlink @calculogic/validator
npm install /absolute/path/to/calculogic-validator-<version>.tgz
```

This removes the consumer's live validator link, restores ordinary installed package contents, and retains the consumer as the validation target without manual path or root cleanup.

If the workstation-level link is no longer needed, clean it up separately from the validator checkout:

```bash
npm unlink -g @calculogic/validator
```

Global link cleanup removes the link registered with the workstation's npm installation; it does not replace the consumer dependency, so restore the consumer install separately as shown above.

### Update the installed validator

Create the newer artifact from the validator checkout and install it from the consumer repository:

```bash
# In the validator checkout
npm pack

# In the consumer repository
npm install /absolute/path/to/newer/calculogic-validator-<version>.tgz
```

The audit verified npm replacing an existing package with genuinely different validator runtime contents. The public bins continued to resolve, the package remained an ordinary installed directory, the consumer remained the target repository, and no stale npm-link path or root/path repair remained. Deleting `node_modules` is not a normal part of this update workflow. This evidence does not establish a semantic-version publishing or version-bump policy.

### Local-folder development install

An optional development-oriented form is:

```bash
npm install /absolute/path/to/calculogic-validator
```

In the npm environment tested by the audit, this resolved to a symlink to the validator checkout. Treat it as a development convenience rather than the preferred stable workflow; representation may differ across npm versions or platforms. When explicit live-development behavior is intended, `npm link` communicates that intent more clearly.

### Pinned Git install status

The intended deterministic Git form is:

```bash
npm install github:HCAToolkit/calculogic-validator#<commit-sha>
```

This is a **candidate workflow, not a workflow verified by the package-consumption audit**. The audit environment could not reach GitHub, so the test could not proceed far enough to evaluate Git installation behavior; that result does not show that Git installs are broken. Once separately verified, a stable Git dependency should remain pinned to a deterministic commit, tag, or ref rather than `main`.

### Public consumer commands

Use the package's public bins, rather than invoking `bin/**` or `scripts/**` as the normal consumer integration contract:

```bash
npx --no-install calculogic-validate --help
npx --no-install calculogic-validate-naming --help
npx --no-install calculogic-validate-tree --help
npx --no-install calculogic-validator-health --help
```

### Consumer validator-scope note

In an ordinary installed or linked consumer repository, this command may report `validator-development-root-unavailable`:

```bash
npx --no-install calculogic-validate --scope=validator
```

That result is expected: the consumer repository is not being treated as the validator's own development checkout. Do not point validator scope at `node_modules`, create a fake `calculogic-validator/` directory, or manually override package-root behavior. For normal consumer validation, use the appropriate consumer scope, such as `repo`, according to the existing CLI contract.

## 2) Projected package layout (target)

This is the intended target structure for the validator suite as refactors continue.
Some folders and files shown below may not exist yet in the current state.
Suite-core canonical modules are owned under `src/core/`; `src/` is reserved for suite-level infrastructure boundaries (for example `src/index.mjs`) rather than root-level shim forwarders.
The naming reflects modular suite-core boundaries, owned validator slice roots (`naming/` and `tree/`), and configurable policy surfaces.

```text
calculogic-validator/
├─ LICENSE
├─ README.md
├─ package.json
├─ doc/
│  ├─ ConventionRoutines/             # validator-operationalized conventions only
│  ├─ ValidatorSpecs/                 # specs that are package-owned (runner/tree advisor/etc.)
│  └─ Indexes/                        # optional: “where to find things” maps
├─ bin/                               # suite-level CLIs (entrypoints)
│  ├─ calculogic-validate.host.mjs
│  ├─ calculogic-validate-naming.host.mjs
│  └─ calculogic-validator-health.host.mjs
├─ scripts/                           # suite-level workflows (thin orchestration)
│  ├─ validate-all.host.mjs
│  ├─ validate-naming.host.mjs
│  ├─ validator-health-check.host.mjs
│  ├─ report-capture-verify.host.mjs
│  └─ report-capture-summarize.host.mjs
├─ src/                               # suite-core only (suite-level infra + compat boundary)
│  ├─ index.mjs
│  ├─ validator-config.schema.json      # canonical validator config schema authority
│  ├─ core/
│  │  ├─ repository-root.logic.mjs
│  │  ├─ npm-arg-forwarding-guard.logic.mjs
│  │  ├─ validator-exit-code.logic.mjs
│  │  ├─ cli/
│  │  │  ├─ validator-cli-output.logic.mjs
│  │  │  ├─ validator-cli-scopes.logic.mjs
│  │  │  ├─ validator-cli-targets.logic.mjs
│  │  │  └─ validator-cli-usage.logic.mjs
│  │  ├─ validator-report.contracts.mjs
│  │  ├─ validator-report-meta.logic.mjs
│  │  ├─ validator-runner.logic.mjs
│  │  ├─ validator-registry.knowledge.mjs
│  │  ├─ validator-scopes.logic.mjs
│  │  ├─ validator-root-files.knowledge.mjs
│  │  ├─ source-snapshot.logic.mjs
│  │  └─ config/
│  │     ├─ validator-config.contracts.mjs
│  │     ├─ validator-config.logic.mjs
│  ├─ registries/
│  │  └─ _builtin/
│  │     └─ scope-profiles.registry.json
│  └─ compat/                         # SHIMS ONLY (policy-bound)
│     └─ (temporary files only)        # e.g. old-path re-exports during refactor
├─ test/                              # suite-core tests + suite integration tests
│  ├─ core/                           # runner/config/report/scope tests
│  ├─ integration/                    # validate-all.targets.integration, etc.
│  ├─ fixtures/                       # suite-wide fixtures (only if truly shared)
│  └─ compat/                         # optional: tests that assert shims are tracked/overdue/etc.
├─ tree/                              # tree validator scope root (mini-scope)
│  ├─ README.md                       # optional (what lives here)
│  ├─ scripts/                        # optional (suite scripts can delegate here)
│  ├─ src/
│  │  ├─ tree-structure-advisor.host.mjs
│  │  ├─ tree-structure-advisor.wiring.mjs
│  │  ├─ tree-structure-advisor.logic.mjs
│  │  ├─ tree-structure-advisor.contracts.mjs
│  │  └─ tree-shim-detection.logic.mjs
│  └─ test/                           # optional tree-only tests (if split from suite tests)
├─ naming/                            # naming validator scope root (mini-scope)
│  ├─ README.md                       # optional (what lives here)
│  ├─ scripts/                        # optional (suite scripts can delegate here)
│  │  └─ validate-naming.host.mjs
│  ├─ src/
│  │  ├─ naming-validator.host.mjs
│  │  ├─ naming-validator.wiring.mjs
│  │  ├─ naming-validator.logic.mjs
│  │  ├─ naming-validator.contracts.mjs
│  │  ├─ cli/
│  │  │  ├─ naming-cli-args.logic.mjs
│  │  │  ├─ naming-cli-runner.logic.mjs
│  │  │  ├─ naming-cli-usage.logic.mjs
│  │  │  └─ naming-report-builder.logic.mjs
│  │  ├─ health/
│  │  │  ├─ naming-health-check.logic.mjs
│  │  │  └─ naming-health-check.host.mjs
│  │  ├─ registries/                  # *.knowledge.*
│  │  │  └─ _builtin/
│  │  │     ├─ roles.registry.json
│  │  │     └─ reportable-extensions.registry.json
│  │  └─ rules/                       # *.logic.*
│  └─ test/
│     ├─ naming-validator.test.mjs
│     ├─ naming-validator-scope-contract.test.mjs
│     ├─ naming-missing-role.test.mjs
│     └─ fixtures/                    # naming-only fixtures (if any)
└─ tools/
   └─ report-capture/
      ├─ package.json
      └─ src/
         ├─ report-capture.host.mjs
         ├─ report-capture.logic.mjs
         ├─ report-capture.contracts.mjs
         └─ report-capture.knowledge.mjs
```

### Ownership boundaries (semantic areas)

- Suite-wide shared concerns belong in semantic suite-core areas under `src/core/<area>/`.
- Slice-owned shared concerns belong in semantic slice areas under `<slice>/src/<area>/`.
- Prefer semantic owner areas over generic catch-all `shared/` folders when a clearer owner exists.

#### Loader ownership boundary (registry-state vs direct builtin)

- Use a **registry-state owner** when a slice must compose multiple policy payloads (for example builtin + overlay/custom), enforce deterministic precedence/canonicalization, and maintain digest/cache state as a first-class contract.
- Use a **direct builtin loader** when policy vocabulary is intentionally local, bounded, and consumed by one slice path without needing a generic cross-slice state aggregator.
- Keep **suite-core surfaces** as local owners when they are composition/runtime mechanics (runner orchestration, scope/runtime contracts, slice registry composition) rather than slice policy payload normalization.
- Do not force every registry surface through one generic state layer: this creates ownership blur, over-couples independent slices, and encourages catch-all loader sprawl.

Current intentional pattern:

- Naming centralizes extracted registry-state ownership through `naming/src/registries/registry-state.logic.mjs`.
- Tree slice policy payloads remain under direct local builtin-loader ownership in tree-owned registry logic modules.
- Suite-core scope/runtime composition ownership remains local under `src/core/**` instead of acting as a universal registry-state host.

## 3) Quickstart (repo root)

```bash
npm ci
npm test
npm run validate:naming -- --scope=app
```

What this does:

- `npm ci`: installs exact lockfile dependencies.
- `npm test`: runs the project and validator tests.
- `npm run validate:naming -- --scope=app`: runs naming validation against app scope only.

> npm argument forwarding reminder:
>
> - ✅ Correct: `npm run validate:naming -- --scope=app`
> - ❌ Incorrect: `npm run validate:naming --scope=app`
>
> Use `--` before validator flags so npm forwards them to the script.

## 4) Root npm workflows (recommended)

Use these from the repository root.

### Core validation

```bash
npm run validate:naming
npm run validate:all
npm run validate:tree
npm run health:validator
```

- `npm run validate:naming`: naming-only validation using repo defaults.
- `npm run validate:all`: shared-runner validation that stages naming before tree and reports all configured validators.
- `npm run validate:tree`: tree-structure-advisor validation through the shared runner path (tree only in report output).
- `npm run health:validator`: validator environment/health diagnostics.

Bridge behavior note (normal runs):

- `validate:naming` remains naming-only.
- `validate:tree` executes tree through the shared runner path; when tree is selected, the runner stages naming-owned semantic-family evidence first and passes only the bounded naming bridge payload into tree.
- `validate:all` stages naming before tree in deterministic registry order; tree consumes the same bounded naming bridge payload rather than raw naming internals.
- Ownership boundary stays explicit: naming interprets and projects semantic-family evidence, runner orchestrates staged execution, and tree consumes that bounded bridge to emit structural `TREE_*` advisories.

### Reports by scope and target

Naming report capture:

```bash
npm run report:naming:repo
npm run report:naming:app
npm run report:naming:docs
npm run report:naming:validator
npm run report:naming:system
```

Full-suite report capture:

```bash
npm run report:all:repo
npm run report:all:app
npm run report:all:docs
npm run report:all:validator
npm run report:all:system
```

Tree report capture:

```bash
npm run report:tree:repo
npm run report:tree:app
npm run report:tree:docs
npm run report:tree:validator
npm run report:tree:system
```

Report utilities:

```bash
npm run report:verify
npm run report:summarize
```

- `report:naming:*`: capture naming validator output for a specific scope.
- `report:all:*`: capture full-suite output for a specific scope.
- `report:tree:*`: capture tree validator output for a specific scope.
- `report:verify`: checks report-capture wiring/outputs.
- `report:summarize`: summarizes captured reports.

### Validator-internal naming/report presets (bounded convenience wrappers)

These presets are convenience wrappers for validator-internal workflows. They **do not** add new built-in scopes; each command remains `--scope=validator` with explicit `--target` narrowing.

```bash
npm run validate:naming:validator:entry
npm run validate:naming:validator:naming
npm run validate:naming:validator:tree
npm run validate:naming:validator:doc
npm run report:naming:validator:entry
npm run report:naming:validator:naming
npm run report:naming:validator:tree
npm run report:naming:validator:doc
```

Preset target mapping:
- `entry` → `bin` + `scripts`
- `naming` → `naming`
- `tree` → `tree`
- `doc` → `doc`

## 5) Validator entrypoints and direct invocation

This section includes package-defined validator entrypoints plus direct script invocation where useful, all executable from repo root.

```bash
node bin/calculogic-validate.host.mjs
node bin/calculogic-validate-naming.host.mjs
node bin/calculogic-validator-health.host.mjs
node scripts/validate-tree.host.mjs --scope=repo
```

What each entrypoint does:

- `calculogic-validate.host.mjs`: full validator entrypoint.
- `calculogic-validate-naming.host.mjs`: naming-only validator entrypoint.
- `calculogic-validator-health.host.mjs`: validator health/diagnostic entrypoint.
- `scripts/validate-tree.host.mjs`: tree validator script (`--scope`, repeatable `--target`, `--config`, `--help`).

## 6) Scopes and targets

Common scopes used in this repository:

- `repo`
- `app`
- `docs`
- `validator`
- `system`

Examples:

```bash
npm run validate:naming -- --scope=repo
npm run validate:naming -- --scope=app
npm run validate:naming -- --scope=docs
npm run validate:all -- --scope=validator
npm run validate:all -- --scope=system
npm run validate:tree -- --scope=repo
npm run validate:tree -- --scope=validator
npm run validate:tree -- --scope=repo --target tree
```

Use scope-specific `report:*` commands when you want one-command capture per target/scope combination.

Raw target-filter pattern (adaptable to your own validator-focused areas/files):

```bash
npm run validate:naming -- --scope=validator --target doc
npm run validate:naming -- --scope=validator --target naming
npm run validate:naming -- --scope=validator --target tree
npm run validate:naming -- --scope=validator --target bin --target scripts
npm run validate:naming -- --scope=validator --target doc/ConventionRoutines/NamingValidatorSpec.md
calculogic-report-capture --json --dir ./.reports --keep 20 --prefix naming-validator-doc -- node --experimental-strip-types scripts/validate-naming.host.mjs --scope=validator --target doc
```

Scope boundary note: validator-internal presets do not create new built-in scope profiles. `validator` remains the actual scope, and `--target` is the narrowing layer inside that scope.

## 7) Strict config and schema

Validator config schema:

- `src/validator-config.schema.json`

Runtime behavior is strict and rejects unknown keys where the schema disallows them. Root-level `$schema` is allowed as an editor hint.

**Report-first note (current CLI behavior):** Config affects report classification/metadata and can opt into existing strict exit semantics via `strictExit: true`. Detection behavior is unchanged and broader enforcement/fix modes are not implemented yet.

Use `--config=<path>` to pass a config file explicitly:

```bash
npm run validate:naming -- --scope=app --config=./.calculogic/validator/config.json
node bin/calculogic-validate-naming.host.mjs --scope=docs --config=./.calculogic/validator/config.json
```

Canonical config spec: `doc/ValidatorSpecs/validator-config.spec.md`.

Example:

```json
{
  "$schema": "./src/validator-config.schema.json",
  "version": "0.1",
  "naming": {
    "roles": {
      "add": [
        {
          "role": "provider",
          "category": "architecture-support",
          "status": "active"
        }
      ]
    }
  }
}
```

## 8) Report capture notes

- Report scripts write JSON capture metadata to `./.reports` in this repository.
- Keep count/retention is handled by script-level `--keep` values.
- Use `npm run report:verify` after setup changes.
- Use `npm run report:summarize` for a concise overview of recent captures.

## 9) Report output (JSON)

Canonical report contracts:

- `doc/ConventionRoutines/ValidatorReportSchema-V0_1.md` (canonical schema for slice and runner envelopes)
- `doc/ConventionRoutines/ValidatorRuleIds-Contract.md` (canonical rule ID and `ruleRef` linkage contract)

There are two report envelopes:

- slice output (single-slice CLI, for example `validate:naming`)
- runner output (runner-style CLIs, including `validate:all` and `validate:tree`)

Validator reports include stable metadata fields for report envelope identity and reproducibility:

- `validatorId`
- `validatorVersion`
- `sourceSnapshot`

Tiny `sourceSnapshot` example shape:

```json
{
  "sourceSnapshot": {
    "source": "fs",
    "gitRef": "HEAD",
    "gitHeadSha": "abc123def456",
    "diagnostics": {
      "isDirty": false,
      "changedCount": 0,
      "untrackedCount": 0
    }
  }
}
```

`gitRef`, `gitHeadSha`, and `diagnostics` are optional and may vary by environment and capture mode.

## 10) Compatibility note

Legacy root tree shim imports are retired. Use the canonical tree slice entrypoint `tree/src/tree-structure-advisor.host.mjs` (or package subpath `@calculogic/validator/tree`) and canonical logic module `tree/src/tree-structure-advisor.logic.mjs`.
