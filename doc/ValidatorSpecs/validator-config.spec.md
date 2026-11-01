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

`linguisticProfile` is contract-approved but not yet an allowed key (§10). Until its implementation slice, a config carrying it is rejected like any unknown key (§5).

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

## 10) Linguistic profile selection (contract-approved by calculogic-validator#150; not current runtime)

This section is a contract for a later implementation slice. The schema file, runtime validation and every CLI are unchanged until that slice lands. Today a config carrying `linguisticProfile` is rejected as an unknown key (§5).

### 10.1 Key

- `linguisticProfile` (optional object): `{ profileId, profileVersion? }`.
  - `profileId`: non-empty string, the language profile to activate for the run.
  - `profileVersion`: optional non-empty string. It pins the profile version; when it is absent, the registered version is used.
  - No other field is allowed.
- It is the run-level source of the Linguistic Foundation's explicit profile selection (Linguistic Foundation shared contract §5.3, calculogic-validator#146). It is the only way a run activates a profile. Nothing is inferred from the environment, the locale or the repository. With the key absent, no profile is active.

### 10.2 Purpose amendment

This is the first config key that shapes evidence: it decides which lexical identities the Naming bridge carries to Tree. The run stays report-first. The key adds no fix execution, mode selection, registry record or finding policy, and it changes no finding by itself.

### 10.3 `configDigest`

- `configDigest` covers the normalized config, so a config carrying `linguisticProfile` has a different `configDigest` from the same config without it. That change is expected and permitted.
- An equivalent run without a selection (no config, or a config without the key) is byte-identical to the same run before this key existed, `configDigest` included.
- Normalization keeps `linguisticProfile` only when provided, with `profileVersion` only when provided.

### 10.4 Validation and selection failures

Validation has two stages, in this order.

1. **Schema validation** checks the key's shape: an object with a non-empty string `profileId`, an optional non-empty string `profileVersion`, and no other field. It runs before any profile is resolved.
2. **Profile resolution** applies the well-formed selection to the registered profiles. The Linguistic Foundation decides whether the selection is valid and supplies the problem classification. The suite decides what that classification does to the run.

An explicitly requested evidence source never silently becomes optional, so every failure in either stage stops the run:

| Situation | Behavior |
|---|---|
| No `linguisticProfile` | Normal run; existing behavior preserved, including report bytes and `configDigest` |
| Malformed `linguisticProfile` (stage 1) | Stop: stderr diagnostic, exit code 1, no report |
| Well-formed, unregistered profile (stage 2) | Stop with `profile-not-registered`: stderr diagnostic, exit code 1, no report |
| Well-formed, version mismatch (stage 2) | Stop with `profile-version-mismatch`: stderr diagnostic, exit code 1, no report |
| Valid, registered profile | Continue with that profile active |
| Profile active, a token resolves `unknown` | Continue; `unknown` is a valid lexical evidence status, not a failure |

- **Diagnostics are actionable.** Every stopping diagnostic names the requested `profileId` and, when one was pinned, the requested `profileVersion`, together with the problem.
- **Same behavior in every CLI.** `validate:naming`, `validate:tree` and `validate:all` load the key through this contract and behave identically in every case above, including the order of the two stages. This holds even where a CLI's own output does not carry lexical evidence.
- A stage-1 failure is the same failure mode as any other invalid config content (§8).
