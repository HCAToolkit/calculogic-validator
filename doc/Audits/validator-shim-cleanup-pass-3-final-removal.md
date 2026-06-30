# Validator shim cleanup pass 3 (final removal)

## 1. Purpose

This pass completes validator shim-debt removal for the final five root shim-debt files after the tree and naming slice boundary corrections established canonical ownership under `tree/src/**` and `naming/src/**`.

## 2. Readiness re-verification

Before deletion, the remaining five shim-debt files were re-verified as thin re-export forwarders with no canonical implementation ownership:

1. `src/validator-runner.logic.mjs` → `./core/validator-runner.logic.mjs`
2. `src/validator-registry.knowledge.mjs` → `./core/validator-registry.knowledge.mjs`
3. `src/validator-scopes.logic.mjs` → `./core/validator-scopes.logic.mjs`
4. `src/tree-structure-advisor.host.mjs` → `../tree/src/tree-structure-advisor.host.mjs`
5. `src/tree-structure-advisor.logic.mjs` → `../tree/src/tree-structure-advisor.logic.mjs`

The remaining live contracts preserving these files were package export targets for core subpaths and the shim-parity test surface in `test/core-compat-shims.test.mjs`.

## 3. Package export retargeting

Updated package subpath export targets to canonical core ownership modules:

- `exports["./runner"]`: `./src/validator-runner.logic.mjs` → `./src/core/validator-runner.logic.mjs`
- `exports["./registry"]`: `./src/validator-registry.knowledge.mjs` → `./src/core/validator-registry.knowledge.mjs`
- `exports["./scopes"]`: `./src/validator-scopes.logic.mjs` → `./src/core/validator-scopes.logic.mjs`

Public subpath contracts are preserved:

- `@calculogic/validator/runner`
- `@calculogic/validator/registry`
- `@calculogic/validator/scopes`

Only the target files changed from root shims to canonical core modules.

## 4. Tree temporary root-shim compatibility end

Ended temporary root tree shim compatibility for:

- `src/tree-structure-advisor.host.mjs`
- `src/tree-structure-advisor.logic.mjs`

Canonical tree ownership remains unchanged at `tree/src/**`, including intentional public/canonical host boundary at `tree/src/tree-structure-advisor.host.mjs`.

## 5. Compat test transition

Retired shim-parity preservation test:

- removed: `test/core-compat-shims.test.mjs`

Replaced with a canonical entrypoint contract test:

- added: `test/core-entrypoints-contract.test.mjs`

The replacement validates:

- canonical export target mapping in `package.json`
- canonical runtime contracts for core runner/registry/scopes modules
- canonical slice host availability (`tree/src/**`, `naming/src/**`) and root index surface wiring

This removes test pressure that previously preserved deleted shim paths.

## 6. Final five shim-debt files removed

Deleted from `src/**`:

1. `validator-runner.logic.mjs`
2. `validator-registry.knowledge.mjs`
3. `validator-scopes.logic.mjs`
4. `tree-structure-advisor.host.mjs`
5. `tree-structure-advisor.logic.mjs`

## 7. Direct residue cleanup

- Updated README wording to remove temporary root tree shim support language and align ownership notes to canonical `src/core/**`, `naming/src/**`, and `tree/src/**` boundaries.

## 8. Boundary confirmation

This pass preserves intentional boundaries:

- kept: `src/index.mjs`
- kept: `naming/src/naming-validator.host.mjs`
- kept: `tree/src/tree-structure-advisor.host.mjs`

No new shims were added.

## 9. Outcome

Pass 3 completes final validator shim-debt removal for the previously deferred five files while preserving public subpath contracts and canonical owned slice roots.
