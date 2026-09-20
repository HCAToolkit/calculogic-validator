# Structural Addressing get-tree V0 Commands Spec

## Status and scope

This documents the implemented Structural Addressing get-tree V0 command path.
It records the implemented addressing:get-tree and report:addressing:get-tree:validator commands, output modes, npm forwarding rule, and inspection-vs-validation namespace boundary.
It does not add new runtime behavior, new commands, validate:addressing behavior, Tree advisor integration, Naming integration, NL addressing, or validator findings/severity.

- **current runtime truth:** get-tree V0 is an inspection/evidence-preparation path focused on validator scope.
- **current implementation reality:** command wiring exists in root package scripts and forwards to the direct host implementation.
- **not current runtime truth:** validate:addressing* evaluation commands, validator findings/severity output, Tree advisor integration, Naming integration, semantic-home interpretation, structural-home interpretation, NL addressing, code-file addressing, and NL-to-code comparison are not implemented in this slice.
- **staged implementation path:** keep inspection/report-capture boundaries explicit now; evaluate validate:addressing* surfaces in later slices.

Issue lineage: Refs #487. Refs #502.

---

## Implemented V0 command path

Implemented scope for this V0 path:

- Structural Addressing target knowledge.
- addressed occurrence snapshot preparation.
- renderedTree output.
- direct non-validation host.
- root npm command.
- report-capture command.

### Root npm inspection command

```bash
npm run addressing:get-tree -- --scope=validator
```

NPM forwarding separator is required:

- Correct: `npm run addressing:get-tree -- --scope=validator`
- Incorrect: `npm run addressing:get-tree --scope=validator`

### Direct host command (non-validation)

```bash
node --experimental-strip-types calculogic-validator/scripts/addressing-get-tree.host.mjs --scope=validator --format=both
```

The direct host command is useful for local inspection and mirrors the npm command target.

### Validator development root layouts

`--scope=validator` resolves its development root from the found repository root in either of
two supported layouts, checked in this order:

1. **Embedded layout** - a `calculogic-validator/` directory exists beneath the repository root
   (the historical form shown above, when this package is vendored inside a consumer repository).
2. **Standalone layout** - no such nested directory exists, but the repository root itself is
   this package (its own `package.json` `name` is `@calculogic/validator`) *and* carries an
   `AGENTS.md` file at its root - covers running the command directly inside this repository,
   including via a consumer's
   `npm --prefix node_modules/@calculogic/validator run addressing:get-tree -- ...` invocation
   against an `npm link`-ed development checkout.

The `AGENTS.md` check exists because the package name alone is not a reliable signal: an
ordinary installed copy (an `npm pack` tarball or a git-dependency install) declares the same
`package.json` `name` but is a stripped subset per the package `files` allowlist (it excludes
`doc/`, `test/`, `tools/`, and `AGENTS.md`). Without this check, an installed/packaged copy that
happened to sit at its own repository root would be silently accepted as a development checkout
and scanned as if complete, when only the packaged subset is actually present. `--scope=validator`
is described as "validator development-root scan (available only in validator owner/development
contexts)" - an installed consumer copy is not such a context, matching the restriction other
consumer contexts already receive.

In both layouts, `sourceNamespace` and all reported occurrence paths remain prefixed with the
stable `calculogic-validator/` namespace label - this label is a naming convention, not a literal
on-disk directory, and does not change based on physical nesting. A repository matching neither
layout - including an installed/packaged copy lacking `AGENTS.md` - fails with a
`validator-development-root-unavailable` error rather than silently scanning
an unrelated tree.

### Report-capture wrapper command

```bash
npm run report:addressing:get-tree:validator
```

This command captures:

```bash
npm run addressing:get-tree -- --scope=validator --format=both
```

using:

- `calculogic-report-capture`
- `--json`
- `--dir ./.reports`
- `--keep 20`
- `--prefix addressing-get-tree-validator`

The capture artifact is inspection output and is not a validator findings/severity report.

---

## Namespace boundary (inspection vs validation)

- `addressing:*` = prepare/inspect/render addressed evidence.
- `report:addressing:*` = captured inspection artifacts for addressed evidence.
- `validate:addressing*` = future evaluation against rules/contracts/comparisons/policy.

Explicit boundary statements:

- `addressing:get-tree` is inspection, not validation.
- `report:addressing:get-tree:validator` is captured inspection output, not validation.
- `validate:addressing*` commands are intentionally not implemented by this V0 get-tree slice.

---

## Implemented output modes

Supported output behavior:

- `--format=text` = renderedTree text only.
- `--format=json` = JSON addressed snapshot output.
- `--format=both` = deterministic combined JSON containing addressed snapshot + renderedTree.

Default format:

- Default format = `text`.

---

## Supported V0 flags

Current supported flags for `addressing:get-tree`:

- `--scope`
- `--target`
- repeatable `--target`
- `--format=text|json|both`
- `--help`
- `-h`

V0 remains validator-scope focused and does not add additional flag families in this slice.

---

## Non-goal reaffirmation for this commands spec

This slice does not implement:

- `validate:addressing*` commands.
- NL addressing.
- code-file addressing.
- NL-to-code comparison.
- Tree advisor integration.
- Naming integration.
- semantic-home interpretation.
- structural-home interpretation.
- validator findings/severity for addressing.

This spec was originally documentation/contract cleanup only. The "Validator development root
layouts" section above documents a subsequent runtime fix (Refs #22): the standalone layout was
not previously resolvable and failed with a filesystem error rather than the
`validator-development-root-unavailable` message reserved for genuinely unsupported contexts.
