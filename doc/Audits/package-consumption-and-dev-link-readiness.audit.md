# Package consumption and dev-link readiness audit

**Authority:** audit snapshot.

**Classification:** Informative. This document records observed behavior at the tested commit and in the tested environment. It is not a canonical contract, package policy, runtime specification, or promise about future releases.

## 1. Purpose and scope

This document persists the package-consumption evidence gathered for issue #10 under parent roadmap issue #7, following the standalone-root work in issue #8 / PR #9. The audit tested the standalone validator from clean consumer repositories through the package and development modes relevant to the roadmap:

- packed tarball installation;
- a deterministic pinned Git/GitHub installation attempt;
- local-folder installation;
- `npm link` live development;
- unlink and restoration of a stable dependency; and
- replacement of one deterministic packed artifact with another.

This was an audit-only slice. It did not include package metadata, runtime, root/path, Tree, Naming, report, or public CLI fixes. Expected validator findings and deliberate unavailable-scope exits were recorded as execution outcomes rather than treated as package failures.

## 2. Tested baseline

| Item | Observed value |
|---|---|
| Validator commit | `c9c906550b2aa876745d88d26b17168d53d0641b` |
| Package | `@calculogic/validator@0.1.0` |
| Node | `v24.15.0` |
| npm | `11.4.2` |
| OS | Ubuntu 24.04.4 LTS, Linux 6.18.35, x86_64 |
| Initial `git status --short` | empty (clean) |
| `npm test` | passed |
| `npm pack --dry-run --json` | passed: 141 files, 106,547 packed bytes, 559,249 unpacked bytes; artifact name `calculogic-validator-0.1.0.tgz` |

npm printed `Unknown env config "http-proxy"` during commands. It was a non-fatal environment/configuration deprecation warning and did not change any tested outcome.

## 3. Package surface inspected

The consumption-relevant metadata at the tested commit was:

- name `@calculogic/validator` and version `0.1.0`;
- `private: true` and Node engine `>=22.6.0`;
- public bins `calculogic-validate`, `calculogic-validate-naming`, `calculogic-validate-tree`, and `calculogic-validator-health`;
- root export plus `./runner`, `./registry`, `./scopes`, `./naming`, and `./tree` subpath exports;
- packed-file allowlist entries for `src/**`, Naming, Tree, Structural Addressing, `bin/**`, `scripts/**`, `README.md`, and `LICENSE`;
- no runtime `dependencies` entry; and
- no `install`, `prepare`, `prepack`, or `postinstall` hook.

The real packed artifact contained the runtime and public-bin surfaces needed by a consumer. Ordinary packed-consumer operation did not require validator test files, an embedded `calculogic-validator/` directory, or an install-time preparation/build step.

## 4. Packed tarball install

### Arrangement and commands

A clean Git/npm consumer was created outside the validator checkout at `/tmp/calculogic-audit-10/pack`:

```bash
git init -q
npm init -y

# In the validator checkout
npm pack --json

# In the consumer
npm install /workspace/calculogic-validator/calculogic-validator-0.1.0.tgz
mkdir -p src
printf 'export const auditValue = 1;\n' > src/audit-fixture.logic.js
```

The installed package resolved to:

```text
file:///tmp/calculogic-audit-10/pack/node_modules/@calculogic/validator/src/index.mjs
```

### Public bins and report evidence

These commands all resolved and exited `0`:

```bash
npx --no-install calculogic-validate --help
npx --no-install calculogic-validate-naming --help
npx --no-install calculogic-validate-tree --help
npx --no-install calculogic-validator-health --help
```

The health bin performed its health check rather than displaying a separate help page. It reported deterministic Naming behavior and skipped the embedded-doc check outside an embedded repository docs host.

Ordinary validation succeeded:

```bash
npx --no-install calculogic-validate-naming --scope=repo
npx --no-install calculogic-validate --scope=repo
```

Both exited `0`. Focused Naming report evidence was:

```json
{
  "sourceSnapshot": {
    "source": "fs",
    "repositoryRoot": "/tmp/calculogic-audit-10/pack"
  },
  "totalFilesScanned": 3,
  "paths": [
    "package-lock.json",
    "package.json",
    "src/audit-fixture.logic.js"
  ]
}
```

This demonstrated that the consumer was the target repository, the installed package directory was not the target, and `node_modules` was not scanned merely because the validator was installed there. No embedded `calculogic-validator/` repair and no validator-owned tests were required.

### Validator scope

```bash
npx --no-install calculogic-validate --scope=validator
```

The command exited `1` and reported `validator-development-root-unavailable`, with guidance to use `repo`, `app`, `docs`, or `system`. This was the deliberate installed-consumer contract, not a runtime failure.

**Classification:** supported.

## 5. Pinned Git/GitHub install

A separate clean consumer was created at `/tmp/calculogic-audit-10/git`. The deterministic current commit was attempted with npm's GitHub dependency mechanism:

```bash
npm install github:HCAToolkit/calculogic-validator#c9c906550b2aa876745d88d26b17168d53d0641b
```

The command exited `128` before checkout or package installation:

```text
npm error command git --no-replace-objects ls-remote ssh://git@github.com/HCAToolkit/calculogic-validator.git
npm error ssh: Could not resolve hostname github.com: Temporary failure in name resolution
npm error fatal: Could not read from remote repository.
```

Because npm could not reach GitHub, package resolution, bins, target-root behavior, validator scope behavior, and package preparation could not be observed in this mode. No package build-hook failure was observed; npm never reached that stage.

**Classification:** environment-only. This run did not prove pinned-Git suitability, but it also did not establish a package defect. The smallest follow-up boundary is to repeat only this deterministic install and its consumer checks in a GitHub-capable environment; no implementation child issue is warranted from this result.

## 6. Local folder install

### Commands and representation

A separate clean consumer was created at `/tmp/calculogic-audit-10/folder`:

```bash
git init -q
npm init -y
npm install /workspace/calculogic-validator
```

npm 11 represented the dependency as a symbolic link rather than copied contents:

```text
node_modules/@calculogic/validator
  -> ../../../../../workspace/calculogic-validator
```

The package resolved to:

```text
file:///workspace/calculogic-validator/src/index.mjs
```

All four public bins resolved and exited `0` for the audit invocation. Naming validation exited `0` and reported:

```json
{
  "sourceSnapshot": {
    "source": "fs",
    "repositoryRoot": "/tmp/calculogic-audit-10/folder"
  },
  "totalFilesScanned": 3,
  "paths": [
    "package-lock.json",
    "package.json",
    "src/audit-fixture.logic.js"
  ]
}
```

The validator checkout supplied the implementation while the consumer remained the target. The consumer did not become a validator development root, and `--scope=validator` returned the expected unavailable-scope exit `1`. No root/path confusion or embedded-layout repair occurred.

**Classification:** development-only. The mode worked, but its observed symlink representation couples the consumer directly to a source checkout. A packed artifact is more isolated for stable consumption, while `npm link` makes live-development intent more explicit.

## 7. `npm link` live-development audit

### Two-repository workflow

A dedicated clean consumer was created at `/tmp/calculogic-audit-10/link`. The actual scoped package name from the manifest was used:

```bash
# Validator checkout
npm link

# Consumer repository
npm link @calculogic/validator
```

Both commands exited `0`. The consumer package path was a symlink to the validator checkout:

```text
node_modules/@calculogic/validator
  -> ../../../../../workspace/calculogic-validator
```

Runtime resolution confirmed that the implementation source was the checkout:

```text
file:///workspace/calculogic-validator/src/index.mjs
```

All four public bins resolved and exited `0`. Naming validation exited `0`, while its report proved that the consumer remained the validation target:

```json
{
  "sourceSnapshot": {
    "source": "fs",
    "repositoryRoot": "/tmp/calculogic-audit-10/link"
  },
  "totalFilesScanned": 2,
  "paths": [
    "package.json",
    "src/audit-fixture.logic.js"
  ]
}
```

The linked checkout was not mistaken for the target repository. The consumer was not silently treated as validator development: `--scope=validator` produced the expected unavailable-scope exit `1`.

### Live-edit proof

The smallest temporary non-committed probe was used and then reverted; it was not recreated for this documentation update.

| Stage | Observation |
|---|---|
| Before edit | Consumer import reported `before=false` for `issue10LiveProbe`. |
| Temporary edit | `export const issue10LiveProbe = "visible-without-reinstall";` was temporarily appended to `src/index.mjs`. |
| Consumer observation | A new consumer process, without reinstalling or relinking, reported `after=visible-without-reinstall`. |
| Revert | `git checkout -- src/index.mjs` restored the file; a new consumer process reported `after_revert=false`; `git diff -- src/index.mjs` was empty. |

This demonstrated the intended live-development relationship:

```text
validator checkout -> runtime implementation source
consumer repository -> validation target
```

**Classification:** supported for active cross-repository development.

## 8. Unlink and restore stable dependency

The linked consumer returned to a packed dependency with:

```bash
npm unlink @calculogic/validator
npm install /workspace/calculogic-validator/calculogic-validator-0.1.0.tgz
```

Observed results:

- unlink exited `0`;
- `node_modules/@calculogic/validator` was absent immediately after unlink, so no stale package symlink remained;
- the tarball install exited `0` and created a normal directory, not a symlink;
- resolution moved to `file:///tmp/calculogic-audit-10/link/node_modules/@calculogic/validator/src/index.mjs`;
- all four public bins continued to resolve and exit `0`; and
- Naming validation exited `0` with `sourceSnapshot.repositoryRoot` still equal to `/tmp/calculogic-audit-10/link`.

The final global development link was also removed during workspace cleanup:

```bash
npm unlink -g @calculogic/validator
```

No stale checkout/link path or manual root repair remained.

## 9. Update behavior

A deterministic prior artifact was produced outside the working checkout from commit `96cd85d`, then the consumer was returned to the current tested artifact:

```bash
mkdir -p /tmp/calculogic-audit-10/prior-source
git -C /workspace/calculogic-validator archive 96cd85d \
  | tar -x -C /tmp/calculogic-audit-10/prior-source

cd /tmp/calculogic-audit-10/prior-source
npm pack --json

cd /tmp/calculogic-audit-10/link
npm install /tmp/calculogic-audit-10/prior-source/calculogic-validator-0.1.0.tgz
npm install /workspace/calculogic-validator/calculogic-validator-0.1.0.tgz
```

Both installs exited `0`. The repository version was not modified or faked; both commits declared `0.1.0`. After replacement:

- resolution remained in the consumer's `node_modules`;
- the package was not a symlink;
- the public Naming bin continued to resolve and exited `0`;
- `sourceSnapshot.repositoryRoot` remained `/tmp/calculogic-audit-10/link`; and
- only `package-lock.json`, `package.json`, and `src/audit-fixture.logic.js` appeared in the focused report paths.

**Answer:** yes. In the tested packed-artifact path, another repository could replace/update the validator without another rootization pass, path repair, or stale-link cleanup.

## 10. Public command matrix

| Public command | Packed | Local folder | npm link | Restored packed | Runtime/findings interpretation |
|---|---:|---:|---:|---:|---|
| `calculogic-validate` | resolved, help `0`; repo run `0` | resolved, audit invocation `0` | resolved, audit invocation `0` | resolved, audit invocation `0` | Runner execution and report generation succeeded. `--scope=validator` exit `1` in consumer contexts was a deliberate unavailable-scope result. |
| `calculogic-validate-naming` | resolved, help `0`; repo run `0` | resolved; repo run `0` | resolved; repo run `0` | resolved; repo run `0` | Representative filenames produced report findings, but findings were successful validator output rather than command/package failure. |
| `calculogic-validate-tree` | resolved, help `0` | resolved, audit invocation `0` | resolved, audit invocation `0` | resolved, audit invocation `0` | Public bin resolution was verified; no Tree-policy remediation was part of the audit. |
| `calculogic-validator-health` | resolved, audit invocation `0` | resolved, audit invocation `0` | resolved, audit invocation `0` | resolved, audit invocation `0` | `--help` runs the health check; installed-consumer docs behavior was healthy. |

Pinned-Git cells are omitted because the environment failed before installation and bin resolution.

## 11. Root-context findings

### Installed consumer

The packed consumer demonstrated:

```text
target repository root = consumer repository
package root = installed validator dependency
validator development root = absent by default
```

The focused source snapshot pointed to the consumer, never to `node_modules`, and validator scope was explicitly unavailable rather than redirected to either the consumer or installed package.

### Linked development

The linked consumer demonstrated:

```text
consumer repository = validation target
validator checkout = runtime implementation source
package resolution = validator checkout through npm-managed symlink
validator development root in consumer context = absent
```

The temporary export became visible without reinstalling, proving live checkout execution, while the report root remained the consumer. This is direct evidence that linked package location and target-root identity did not become confused.

## 12. Blocker classification

| Mode/result | Observation | Classification | Owning area | Smallest follow-up boundary | Child issue? |
|---|---|---|---|---|---:|
| Pinned Git/GitHub | npm/Git could not resolve `github.com`; install stopped before checkout. | environment-only | audit environment/network/DNS | Repeat only pinned-SHA install and consumer checks in a GitHub-capable environment. | No |
| Packed, local, linked | `--scope=validator` exited `1` with `validator-development-root-unavailable`. | not-a-blocker / expected-behavior | suite consumer-context contract | None. | No |
| Consumer fixtures | Naming reports contained ordinary findings while command execution succeeded. | not-a-blocker / expected-behavior | Naming report output | None; unrelated findings were intentionally not repaired. | No |
| All npm modes | npm warned about unknown `http-proxy` environment configuration. | not-a-blocker / expected-behavior | command environment | Environment configuration cleanup outside package scope, if desired. | No |
| Local folder | npm represented the dependency as a live checkout symlink. | not-a-blocker / expected-behavior | npm local dependency behavior | Document as development-only rather than stable consumption. | No |

No `package-metadata`, `runtime-path-or-root`, `Tree-policy`, `Naming-policy`, or `docs-only` implementation blocker was confirmed.

## 13. Recommended current workflow

### Stable consumption

The packed artifact is the preferred current-stage stable workflow because it was fully exercised, produced ordinary installed contents rather than a live checkout link, preserved target-root identity, required no preparation hook, and supported deterministic replacement/update.

The pinned Git SHA workflow was attempted but is not proven by this audit because the environment could not reach GitHub. This is an evidence gap, not a package defect. Do not present pinned Git as verified by this snapshot until the focused mode is rerun in a network-capable environment.

### Active cross-repository development

`npm link` is appropriate and was proven to provide live implementation visibility:

```bash
# Validator checkout
npm link

# Consumer repository
npm link @calculogic/validator
```

This preserves the validator checkout as implementation source and the consumer as validation target.

### Returning to stable mode

The tested exit path is:

```bash
npm unlink @calculogic/validator
npm install /absolute/path/to/pinned/calculogic-validator-0.1.0.tgz
```

It removed the live symlink, restored normal installed contents, retained public-bin resolution, and required no manual root cleanup.

## 14. Slice 3 decision

**No Slice 3 implementation blocker is required.**

Proceed directly to workflow documentation. The pinned-Git environment limitation supports a narrow verification rerun when network access is available, not a package/runtime implementation issue. No blocker-fix child issue is recommended from this audit.

## 15. Final verification and workspace state

Before this audit artifact was requested, temporary tarballs, consumers, the prior-source tree, global npm link, and live probe had been removed. At that point:

```text
git diff --check   -> exit 0
git status --short -> empty
```

For the repository-owned artifact update, the required verification was rerun after adding only this audit and its index entry:

```bash
git diff --check
git diff -- doc/Audits/package-consumption-and-dev-link-readiness.audit.md doc/Indexes/validator-docs.index.md
git status --short
```

The resulting intentional workspace diff is limited to:

```text
 M doc/Indexes/validator-docs.index.md
?? doc/Audits/package-consumption-and-dev-link-readiness.audit.md
```
