import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { exportPortableSet, importPortableSet } from '../src/core/registry-lifecycle/registry-lifecycle-portable-set.logic.mjs';
import { resolveCandidateRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-candidate.logic.mjs';
import { getBuiltinRegistryRoots } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { extractRegistryCandidateArgument } from '../src/core/cli/validator-cli-registry-resolution.logic.mjs';
import { detectNpmArgForwardingFootgun } from '../src/core/npm-arg-forwarding-guard.logic.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validateBin = path.join(packageRoot, 'bin/calculogic-validate.host.mjs');
const validateNamingBin = path.join(packageRoot, 'bin/calculogic-validate-naming.host.mjs');
const validateTreeBin = path.join(packageRoot, 'bin/calculogic-validate-tree.host.mjs');
const validateAllScript = path.join(packageRoot, 'scripts/validate-all.host.mjs');
const validateNamingScript = path.join(packageRoot, 'scripts/validate-naming.host.mjs');
const validateTreeScript = path.join(packageRoot, 'scripts/validate-tree.host.mjs');
const VERSION = '0.0.0-test';
const CANDIDATE_PREFIX = 'calculogic-registry-candidate-';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const candidateRoots = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(CANDIDATE_PREFIX)).sort();

const snapshotTree = (root) =>
  fs.existsSync(root)
    ? fs
        .readdirSync(root, { recursive: true })
        .sort()
        .map((relativePath) => {
          const filePath = path.join(root, relativePath);
          return [relativePath, fs.lstatSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
        })
    : null;

// An artifact with one file's JSON changed, its hash kept consistent.
const withJson = (artifact, filePath, update) => ({
  ...artifact,
  files: artifact.files.map((file) => {
    if (file.path !== filePath) {
      return file;
    }
    const payload = JSON.parse(file.text);
    update(payload);
    const text = `${JSON.stringify(payload, null, 2)}\n`;
    return { path: file.path, text, sha256: sha256(Buffer.from(text, 'utf8')) };
  }),
});
const withoutFile = (artifact, filePath) => ({ ...artifact, files: artifact.files.filter((file) => file.path !== filePath) });

// A source repository with a Custom set, whose export is the base candidate, and a target
// repository to validate. `deprecateLogic` and `dropSrc` are candidate edits that change Naming and
// Tree findings for the target's `src/app.logic.ts`.
const withRepositories = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-candidate-'));
  const repository = (name) => {
    const targetRoot = path.join(fixtureRoot, name);
    fs.mkdirSync(path.join(targetRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(targetRoot, 'package.json'), `{"name":"${name}","private":true}\n`);
    fs.writeFileSync(path.join(targetRoot, 'src', 'app.logic.ts'), 'export {};\n');
    return { targetRoot, paths: resolveRegistryLifecyclePaths({ targetRoot }) };
  };
  try {
    const source = repository('source');
    const target = repository('target');
    initCustomRegistrySet({ targetRoot: source.targetRoot, validatorVersion: VERSION });
    const base = exportPortableSet({ targetRoot: source.targetRoot, validatorVersion: VERSION });
    const deprecateLogic = (artifact) => withJson(artifact, 'naming/roles.registry.json', (payload) => {
      payload.roles.find((entry) => entry.role === 'logic').status = 'deprecated';
    });
    const dropSrc = (artifact) => withJson(artifact, 'tree/repo-shape-policy.registry.json', (payload) => {
      payload.allowedTopLevelDirectories = payload.allowedTopLevelDirectories.filter((name) => name !== 'src');
    });
    let written = 0;
    const writeArtifact = (artifact) => {
      written += 1;
      const artifactPath = path.join(fixtureRoot, `candidate-${written}.json`);
      fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
      return artifactPath;
    };
    const run = (script, args, cwd = target.targetRoot, env = {}) =>
      spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
    const report = (result) => {
      assert.ok(result.stdout.length > 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    return runTest({ fixtureRoot, source, target, base, deprecateLogic, dropSrc, writeArtifact, run, report });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  function runTest(context) {
    return run(context);
  }
};

const codesOf = (report, validatorId) => report.validators.find((entry) => entry.id === validatorId).findings.map((finding) => finding.code).sort();

// The report without what describes the environment or the provenance rather than the set: times,
// the source snapshot, `registrySet`, provenance sources and Naming's transitional fields.
const normalized = (report) => {
  const withoutSources = (provenance) =>
    Object.fromEntries(Object.entries(provenance).map(([registryId, entry]) => [registryId, { digest: entry.digest }]));
  const { startedAt, endedAt, durationMs, sourceSnapshot, registrySet, registryProvenance, ...rest } = report;
  return {
    ...rest,
    registryProvenance: withoutSources(registryProvenance),
    validators: report.validators.map((entry) => {
      const { registry, registrySet: entrySet, registryProvenance: entryProvenance, ...meta } = entry.meta ?? {};
      return { ...entry, meta: { ...meta, registryProvenance: withoutSources(entryProvenance ?? {}) } };
    }),
  };
};

test('a candidate run uses the candidate: Naming and Tree findings change, with candidate provenance', () => {
  withRepositories(({ target, base, deprecateLogic, dropSrc, writeArtifact, run, report }) => {
    const ordinary = run(validateBin, []);
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.deepEqual(codesOf(report(ordinary), 'naming'), ['NAMING_ALLOWED_SPECIAL_CASE', 'NAMING_CANONICAL']);
    assert.deepEqual(codesOf(report(ordinary), 'tree-structure-advisor'), []);

    const artifactPath = writeArtifact(dropSrc(deprecateLogic(base)));
    const previewed = run(validateBin, ['--registry-candidate', artifactPath]);
    assert.equal(previewed.status, 2, previewed.stderr);
    const candidateReport = report(previewed);
    assert.ok(codesOf(candidateReport, 'naming').includes('NAMING_DEPRECATED_ROLE'));
    assert.deepEqual(codesOf(candidateReport, 'tree-structure-advisor'), ['TREE_UNEXPECTED_TOP_LEVEL_FOLDER']);

    const { registrySet } = candidateReport;
    assert.equal(registrySet.source, 'candidate');
    assert.deepEqual(registrySet.candidate, { artifactSha256: sha256(fs.readFileSync(artifactPath)), exportedBy: { validatorVersion: VERSION } });
    assert.equal(registrySet.activeSet, undefined);
    assert.equal(registrySet.customExists, undefined);
    assert.deepEqual(Object.keys(registrySet), ['source', 'candidate', 'customDiffers', 'basedOn', 'builtinDriftSinceBaseline', 'orphanRegistries', 'customIssues', 'resolvedSetDigest']);
    assert.equal(registrySet.customDiffers, true);
    const provenances = [candidateReport.registryProvenance, ...candidateReport.validators.map((entry) => entry.meta.registryProvenance)];
    for (const provenance of provenances) {
      assert.ok(Object.values(provenance).every((entry) => entry.source === 'candidate'));
    }
    const namingMeta = candidateReport.validators.find((entry) => entry.id === 'naming').meta.registry;
    assert.deepEqual([namingMeta.registryState, namingMeta.registrySource], ['candidate', 'candidate']);
    assert.equal(namingMeta.registryDigests.custom, namingMeta.registryDigests.builtin, 'the repository Custom set is not read');
    assert.notEqual(namingMeta.registryDigests.resolved, namingMeta.registryDigests.builtin);
    // The target repository was never written.
    assert.equal(fs.existsSync(target.paths.lifecycleRoot), false);
  });
});

test('equivalence: a candidate run reports what the same set reports once imported and activated', () => {
  withRepositories(({ target, base, deprecateLogic, dropSrc, writeArtifact, run, report }) => {
    const artifact = dropSrc(deprecateLogic(base));
    const previewed = run(validateBin, ['--registry-candidate', writeArtifact(artifact)]);
    assert.equal(importPortableSet({ document: artifact, targetRoot: target.targetRoot }).installed, true);
    useRegistrySet({ targetRoot: target.targetRoot, activeSet: 'custom' });
    const installed = run(validateBin, []);

    assert.equal(previewed.status, installed.status);
    const [candidateReport, installedReport] = [report(previewed), report(installed)];
    assert.deepEqual(normalized(candidateReport), normalized(installedReport));
    assert.equal(candidateReport.registrySet.resolvedSetDigest, installedReport.registrySet.resolvedSetDigest);
    const resolvedOf = (r) => r.validators.find((entry) => entry.id === 'naming').meta.registry.registryDigests.resolved;
    assert.equal(resolvedOf(candidateReport), resolvedOf(installedReport));
    assert.equal(installedReport.registrySet.activeSet, 'custom');
  });
});

test('ordinary runs are unchanged by a preview, and a preview writes nothing', () => {
  withRepositories(({ target, base, deprecateLogic, writeArtifact, run, report }) => {
    initCustomRegistrySet({ targetRoot: target.targetRoot, validatorVersion: VERSION });
    const ordinaryBefore = normalized(report(run(validateBin, [])));
    const lifecycleBefore = snapshotTree(target.paths.lifecycleRoot);

    assert.equal(run(validateBin, ['--registry-candidate', writeArtifact(deprecateLogic(base))]).status, 2);
    assert.deepEqual(snapshotTree(target.paths.lifecycleRoot), lifecycleBefore);
    assert.deepEqual(normalized(report(run(validateBin, []))), ordinaryBefore);
    assert.equal(report(run(validateBin, [])).registrySet.activeSet, 'builtin');
  });
});

test('a candidate run never reads registry-state.json or recovers a pending transaction', () => {
  withRepositories(({ target, base, writeArtifact, run, report }) => {
    const artifactPath = writeArtifact(base);
    fs.mkdirSync(target.paths.lifecycleRoot, { recursive: true });
    for (const state of ['{ not json', '{"schemaVersion":"1","activeSet":"custom"}\n']) {
      fs.writeFileSync(target.paths.statePath, state);
      assert.equal(run(validateBin, []).status, 1, 'an ordinary run is blocked');
      const previewed = run(validateBin, ['--registry-candidate', artifactPath]);
      assert.equal(previewed.status, 0, previewed.stderr);
      assert.equal(report(previewed).registrySet.source, 'candidate');
    }

    const transactionRoot = path.join(target.paths.lifecycleRoot, '.lifecycle-transaction');
    fs.mkdirSync(transactionRoot);
    fs.writeFileSync(path.join(transactionRoot, 'marker'), 'pending\n');
    const before = snapshotTree(target.paths.lifecycleRoot);
    assert.equal(run(validateBin, ['--registry-candidate', artifactPath]).status, 0);
    assert.deepEqual(snapshotTree(target.paths.lifecycleRoot), before);
  });
});

test('a candidate is gated as an active Custom set: blocking conditions refuse, baseline-mismatch does not', () => {
  withRepositories(({ base }) => {
    const refused = (artifact, pattern) => {
      const before = candidateRoots();
      assert.throws(
        () => resolveCandidateRegistrySet({ artifactBytes: Buffer.from(JSON.stringify(artifact)) }),
        (error) => error.code === 'REGISTRY_LIFECYCLE_ERROR' && pattern.test(error.message) && !/calculogic-registry-candidate-/u.test(error.message),
      );
      assert.deepEqual(candidateRoots(), before, 'the candidate root is removed');
    };
    // Incomplete: a registry is missing, so nothing falls back to Builtin.
    refused(withoutFile(base, 'naming/roles.registry.json'), /naming\/roles: missing/u);
    refused(withJson(base, 'naming/categories.registry.json', (payload) => {
      payload.categories = payload.categories.filter((entry) => entry.category !== 'concern-style');
    }), /naming\/category-role-perspective: invalid/u);
    refused(withJson(base, 'suite/exit-policy.registry.json', (payload) => {
      payload.version = '2';
    }), /suite\/exit-policy: version-incompatible/u);
    refused(withoutFile(base, 'registry-set.manifest.json'), /manifest-malformed/u);
    // Artifact problems: integrity and paths.
    refused({ ...base, files: base.files.map((file) => (file.path === 'naming/roles.registry.json' ? { ...file, text: `${file.text} ` } : file)) }, /naming\/roles\.registry\.json: integrity/u);
    refused({ ...base, files: [...base.files, { path: '../escape.registry.json', text: '{}', sha256: sha256(Buffer.from('{}')) }] }, /unexpected-path/u);
    assert.throws(() => resolveCandidateRegistrySet({ artifactBytes: Buffer.from('{ not json') }), /the artifact is not JSON/u);

    // A changed Baseline copy is reported and never blocks.
    const resolution = resolveCandidateRegistrySet({
      artifactBytes: Buffer.from(JSON.stringify(withJson(base, '.baseline/naming/roles.registry.json', (payload) => {
        payload.roles = payload.roles.slice(1);
      }))),
    });
    try {
      assert.deepEqual(resolution.registrySet.customIssues.map((issue) => [issue.registryId, issue.condition]), [['naming/roles', 'baseline-mismatch']]);
      assert.doesNotMatch(JSON.stringify(resolution.registrySet), /calculogic-registry-candidate-/u);
    } finally {
      resolution.dispose();
    }
  });
});

test('one coherent candidate root per run, removed by dispose and when the process exits', () => {
  withRepositories(({ base, writeArtifact, run }) => {
    const before = candidateRoots();
    const resolution = resolveCandidateRegistrySet({ artifactBytes: Buffer.from(JSON.stringify(base)) });
    const roots = Object.values(resolution.registryRoots);
    const builtinRoots = Object.values(getBuiltinRegistryRoots());
    assert.equal(new Set(roots.map((root) => path.dirname(root))).size, 1, 'every slice root is in one candidate root');
    assert.ok(roots.every((root) => !builtinRoots.includes(root) && fs.existsSync(root)));
    assert.equal(candidateRoots().length, before.length + 1);
    resolution.dispose();
    resolution.dispose();
    assert.deepEqual(candidateRoots(), before);

    // CLI runs: completed, findings exit and refused alike leave nothing behind.
    run(validateBin, ['--registry-candidate', writeArtifact(base)]);
    run(validateBin, ['--registry-candidate', writeArtifact(withoutFile(base, 'naming/roles.registry.json'))]);
    run(validateBin, ['--registry-candidate', writeArtifact(base), '--scope=unknown']);
    assert.deepEqual(candidateRoots(), before);
  });
});

test('the CLI hosts: option forms, refusals, usage, and every Validator command', () => {
  withRepositories(({ base, writeArtifact, run, report, fixtureRoot }) => {
    const artifactPath = writeArtifact(base);
    for (const script of [validateBin, validateNamingBin, validateTreeBin, validateAllScript, validateNamingScript, validateTreeScript]) {
      const result = run(script, [`--registry-candidate=${artifactPath}`]);
      assert.ok([0, 2].includes(result.status), `${path.basename(script)}: ${result.stderr}`);
      const output = report(result);
      const provenance = output.registryProvenance ?? output.meta?.registryProvenance ?? output.validators?.[0]?.meta?.registryProvenance;
      assert.ok(provenance && Object.values(provenance).every((entry) => entry.source === 'candidate'), path.basename(script));
    }
    assert.equal(run(validateBin, ['--registry-candidate', artifactPath, '--validators=naming', '--scope=app']).status, 0);

    // Refused candidates go through the lifecycle-error path: stderr, exit 1, no report.
    const refused = run(validateBin, ['--registry-candidate', writeArtifact(withoutFile(base, 'naming/roles.registry.json'))]);
    assert.equal(refused.status, 1);
    assert.equal(refused.stdout, '');
    assert.match(refused.stderr, /registry candidate cannot be used for this run/u);
    assert.match(refused.stderr, /naming\/roles: missing/u);
    const unreadable = run(validateBin, ['--registry-candidate', path.join(fixtureRoot, 'absent.json')]);
    assert.equal(unreadable.status, 1);
    assert.match(unreadable.stderr, /Cannot read the registry candidate/u);
    for (const args of [['--registry-candidate'], ['--registry-candidate='], ['--registry-candidate', '--scope=app'], ['--registry-candidate', artifactPath, '--registry-candidate', artifactPath]]) {
      const result = run(validateBin, args);
      assert.equal(result.status, 1, args.join(' '));
      assert.match(result.stderr, /--registry-candidate (needs an artifact path|may be given once)/u, args.join(' '));
    }

    // Usage text lists the option; `--help` works with a candidate and, as for any failed
    // resolution, with a refused one (usage then reads Builtin roots).
    const help = run(validateBin, ['--registry-candidate', artifactPath, '--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /\[--registry-candidate=<artifact\.json>\]/u);
    const extraScope = withJson(base, 'suite/scope-profiles.registry.json', (payload) => {
      payload.profiles.preview = { includeRoots: ['src'], includeRootFiles: [] };
    });
    const refusedHelp = run(validateBin, ['--registry-candidate', writeArtifact(extraScope), '--help']);
    assert.equal(refusedHelp.status, 0, refusedHelp.stderr);
    assert.equal(refusedHelp.stdout, run(validateBin, ['--help']).stdout);
  });
});

test('npm forwarding: the guard sees the forwarded option, so a candidate-only run is not refused', () => {
  withRepositories(({ base, writeArtifact, run }) => {
    const artifactPath = writeArtifact(base);
    const hosts = [
      [validateBin, 'validate:all'],
      [validateAllScript, 'validate:all'],
      [validateNamingBin, 'validate:naming'],
      [validateNamingScript, 'validate:naming'],
      [validateTreeBin, 'validate:tree'],
      [validateTreeScript, 'validate:tree'],
    ];
    for (const [script, lifecycleEvent] of hosts) {
      for (const forwarded of [[`--registry-candidate=${artifactPath}`], ['--registry-candidate', artifactPath]]) {
        const env = {
          npm_lifecycle_event: lifecycleEvent,
          npm_config_argv: JSON.stringify({ original: ['run', lifecycleEvent, '--', ...forwarded] }),
        };
        const label = `${path.basename(script)} ${forwarded.join(' ')}`;
        const result = run(script, forwarded, undefined, env);
        assert.ok([0, 2].includes(result.status), `${label}: ${result.stderr}`);
        assert.doesNotMatch(result.stderr, /npm argument forwarding/u, label);
      }

      // Not forwarded (no `--`): npm kept the option, so the script got no arguments.
      const env = {
        npm_lifecycle_event: lifecycleEvent,
        npm_config_argv: JSON.stringify({ original: ['run', lifecycleEvent, `--registry-candidate=${artifactPath}`] }),
      };
      const missing = run(script, [], undefined, env);
      assert.equal(missing.status, 1, path.basename(script));
      assert.match(missing.stderr, /Detected npm argument forwarding issue: use "npm run [a-z:]+ -- --registry-candidate=/u, path.basename(script));
    }
  });
});

test('the option never reaches a slice parser, and the npm guard knows it', () => {
  assert.deepEqual(extractRegistryCandidateArgument(['--scope=app', '--registry-candidate', 'a.json', '--strict']), {
    argv: ['--scope=app', '--strict'],
    candidate: { path: 'a.json' },
  });
  assert.deepEqual(extractRegistryCandidateArgument(['--registry-candidate=b.json']), { argv: [], candidate: { path: 'b.json' } });
  assert.deepEqual(extractRegistryCandidateArgument(['--scope=app']), { argv: ['--scope=app'], candidate: undefined });
  assert.match(extractRegistryCandidateArgument(['--registry-candidate']).candidate.error, /needs an artifact path/u);

  const message = detectNpmArgForwardingFootgun({
    argv: [],
    npmConfigArgvJson: undefined,
    lifecycleEvent: 'validate:all',
    expectedLifecycleEvent: 'validate:all',
    supportedFlagNames: ['scope', 'registry-candidate'],
    env: { npm_config_registry_candidate: 'set.json' },
  });
  assert.match(message ?? '', /registry-candidate/u);
});
