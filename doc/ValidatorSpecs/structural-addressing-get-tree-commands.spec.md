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

`--scope=validator` resolves its development root by delegating identity to the canonical
`resolveValidatorDevelopmentContext` contract
(`src/core/validator-development-context.logic.mjs`) - the same mechanism `--scope=validator`'s
other entrypoints already use (see `src/core/validator-scopes.logic.mjs`). That contract compares
two things, both filesystem locations, never file content:

- `packageRoot` - where this executing implementation module actually, physically lives on disk
  (its own real, symlink-resolved location, anchored in `import.meta.url`).
- `targetRepositoryRoot` - the repository root the command is invoked against (the found
  repository root beneath `cwd`).

This yields two supported layouts:

1. **Embedded layout** - `packageRoot` is `targetRepositoryRoot/calculogic-validator` (the
   historical form shown above, when this package is vendored inside a consumer repository).
2. **Standalone layout** - `packageRoot` and `targetRepositoryRoot` are the same directory -
   covers running the command directly inside this repository, including via a consumer's
   `npm --prefix node_modules/@calculogic/validator run addressing:get-tree -- ...` invocation
   against an `npm link`-ed development checkout, where the linked target's own real (symlink-
   resolved) location is both the executing code's home and the found repository root.

Deliberately **not** used: `package.json` `name`, an `AGENTS.md` file, or any other content the
target repository controls. A consumer repository can declare any package name or ship any marker
file it likes; it cannot make itself *be* the directory this implementation's own code is actually
running from. `--scope=validator` is described as "validator development-root scan (available
only in validator owner/development contexts)" - an ordinary installed/packaged copy invoked from
inside an unrelated consumer's repository is not such a context (its `targetRepositoryRoot`
resolves to the consumer's own root, not to `packageRoot` or `packageRoot`'s parent), matching the
restriction other consumer contexts already receive, regardless of what that consumer's own
`package.json` or `AGENTS.md` happen to say.

In both layouts, `sourceNamespace` and all reported occurrence paths remain prefixed with the
stable `calculogic-validator/` namespace label - this label is a naming convention, not a literal
on-disk directory, and does not change based on physical nesting. A repository matching neither
layout fails with a `validator-development-root-unavailable` error rather than silently scanning
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
