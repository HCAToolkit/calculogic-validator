# Validator Config Spec (V0.1)

Status: **Canonical**

## Report-only note (current behavior)

The naming validator remains **report-first** for detection and findings emission. Supplying validator config adds report metadata (`configDigest`) and may enable strict exit semantics via `strictExit`. It does **not** enable fix execution or broader mode selection.

## Registry records are not configuration (Issue #41)

Configuration never carries registry records (`doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md` §10). Registry customization lives in the consumer's complete Custom registry set (`calculogic-validator-registry init-custom`, then edit `.calculogic/registries/custom/`).

#41 slice 2 retired Naming's record-carrying config surfaces. There is no overlay compatibility bridge:
- `naming.roles.add` and `naming.reportableExtensions.add`: edit Naming's roles, category-role-perspective and reportable-extensions registries in the Custom set instead;
- the hard-coded role `category` enum: categories are validated against the resolved registry set;
- `naming.caseRules`: edit Naming's case-rules registry in the Custom set instead.

A config that still contains a `naming` key is rejected (§8).

## 1) Purpose

This spec defines the canonical validator config contract for current suite runtime behavior: a strict, deterministic run input that controls strict exit semantics and makes reports reproducible through `configDigest`.

## 2) Versioning

- Required field: `version`
- Required value: `"0.1"`
- Contract source: `VALIDATOR_CONFIG_VERSION` in `src/core/config/validator-config.contracts.mjs`

Any other version value is invalid.

## 3) Schema

Canonical JSON Schema file:

- `src/validator-config.schema.json`, relative to the Validator package root. In a consuming repository it is installed at `node_modules/@calculogic/validator/src/validator-config.schema.json`.

Schema and runtime validation are aligned:

- Unknown keys are rejected.
- Root `$schema` is allowed as an editor/tooling hint and is ignored by runtime normalization.

## 4) Allowed keys (current)

Allowed root keys:

- `version` (required, const `"0.1"`)
- `$schema` (optional string hint)
- `strictExit` (optional boolean; enables strict exit semantics)

## 5) Strictness rules

- Unknown root keys are rejected.
- A `naming` key is rejected with a notice naming the Custom registry set as the customization path (§ "Registry records are not configuration").
- Root `$schema` is explicitly allowed as a hint key and is not retained in normalized config output.

## 6) Normalization rules (deterministic)

Runtime loading returns normalized config with deterministic shaping:

- Output always sets `version: "0.1"`.
- `strictExit` is retained only when provided.

## 7) Registry inputs

Config does not shape registry inputs. Each run resolves the active registry set once through the suite registry lifecycle and every slice reads that resolved set (lifecycle spec §6, §10).

## 8) CLI consumption (current implementation policy)

Config flag (exact form):

- `--config=<path>`

Current failure modes when config is supplied (each stops the run with no report, stderr output and exit code 1):

- cannot read file → error
- cannot parse JSON → error
- invalid config shape/content, including a retired `naming` surface → error

Current runtime support boundaries:

- `validate:naming`, `validate:all` and `validate:tree` load, validate and normalize config through the same contract.

When a valid config is supplied, emitted reports may include:

- `configDigest`

Strict-exit resolution uses existing exit-policy semantics:

- Effective strictness is `true` when CLI `--strict` is present.
- Otherwise, effective strictness is `true` when `config.strictExit === true`.
- Otherwise, effective strictness is `false`.
- Report JSON is emitted before exit code is derived/applied.

## 9) Valid examples

The examples show a config file at the root of a consuming repository that has installed `@calculogic/validator`, so `$schema` points into `node_modules`. In a config file inside this Validator repository, use `"$schema": "./src/validator-config.schema.json"` instead. `$schema` is an editor hint only; the runtime ignores it.

### 9.1 Minimal

```json
{
  "version": "0.1"
}
```

### 9.2 Strict exit via config

```json
{
  "$schema": "./node_modules/@calculogic/validator/src/validator-config.schema.json",
  "version": "0.1",
  "strictExit": true
}
```
