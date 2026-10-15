import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digestRegistryPayload } from '../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryBinPath = path.join(packageRoot, 'bin/calculogic-validator-registry.host.mjs');
const validateNamingScriptPath = path.join(packageRoot, 'scripts/validate-naming.host.mjs');
const validateAllScriptPath = path.join(packageRoot, 'scripts/validate-all.host.mjs');
const validateTreeScriptPath = path.join(packageRoot, 'scripts/validate-tree.host.mjs');
const validateBinPath = path.join(packageRoot, 'bin/calculogic-validate.host.mjs');

const run = (scriptPath, args, cwd) =>
  spawnSync(process.execPath, ['--experimental-strip-types', scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
  });

// A minimal consumer repository: package.json marks the validation target root.
const withTargetRepository = (runTest) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-cli-'));

  try {
    fs.writeFileSync(path.join(targetRoot, 'package.json'), '{"name":"fixture","private":true}\n');
    fs.mkdirSync(path.join(targetRoot, 'src'));
    fs.writeFileSync(path.join(targetRoot, 'src', 'app.logic.ts'), 'export {};\n');
    return runTest(targetRoot);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

test('package.json declares the registry lifecycle bin and repository scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.bin['calculogic-validator-registry'], './bin/calculogic-validator-registry.host.mjs');
  assert.match(packageJson.scripts['registry:init-custom'], /registry-lifecycle\.host\.mjs init-custom$/u);
  assert.match(packageJson.scripts['registry:use'], /registry-lifecycle\.host\.mjs use$/u);
  assert.match(packageJson.scripts['registry:status'], /registry-lifecycle\.host\.mjs status$/u);
  assert.match(packageJson.scripts['registry:diff'], /registry-lifecycle\.host\.mjs diff$/u);
  assert.match(packageJson.scripts['registry:decisions-template'], /registry-lifecycle\.host\.mjs decisions-template$/u);
  assert.match(packageJson.scripts['registry:decisions-check'], /registry-lifecycle\.host\.mjs decisions-check$/u);
  assert.match(packageJson.scripts['registry:update'], /registry-lifecycle\.host\.mjs update$/u);
});

test('status prints the Builtin-only state as JSON without writing lifecycle files', () => {
  withTargetRepository((targetRoot) => {
    const result = run(registryBinPath, ['status'], targetRoot);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      activeSet: 'builtin',
      customExists: false,
      customDiffers: false,
      orphanRegistries: [],
      customIssues: [],
      registries: [],
    });
    assert.equal(fs.existsSync(path.join(targetRoot, '.calculogic')), false);
  });
});

test('init-custom creates the Custom set once, keeps Builtin active, and refuses a second run', () => {
  withTargetRepository((targetRoot) => {
    const first = run(registryBinPath, ['init-custom'], targetRoot);
    assert.equal(first.status, 0, first.stderr);
    const firstOutput = JSON.parse(first.stdout);
    assert.equal(firstOutput.command, 'init-custom');
    assert.equal(fs.realpathSync(firstOutput.customRoot), fs.realpathSync(path.join(targetRoot, '.calculogic/registries/custom')));
    assert.equal(firstOutput.stateFileCreated, true);

    const status = JSON.parse(run(registryBinPath, ['status'], targetRoot).stdout);
    assert.equal(status.activeSet, 'builtin');
    assert.equal(status.customExists, true);
    assert.equal(status.customDiffers, false);
    assert.equal(status.registries.length, firstOutput.registryCount);
    assert.ok(status.registries.every((entry) => entry.classification === 'unchanged'));

    const second = run(registryBinPath, ['init-custom'], targetRoot);
    assert.equal(second.status, 1);
    assert.equal(second.stdout, '');
    assert.match(second.stderr, /A Custom registry set already exists/u);
  });
});

test('use switches the active set, refuses a missing Custom set, and rejects bad arguments', () => {
  withTargetRepository((targetRoot) => {
    const refused = run(registryBinPath, ['use', 'custom'], targetRoot);
    assert.equal(refused.status, 1);
    assert.equal(refused.stdout, '');
    assert.match(refused.stderr, /missing-set/u);
    assert.match(refused.stderr, /registry:use builtin/u);
    assert.equal(fs.existsSync(path.join(targetRoot, '.calculogic')), false);

    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    const activated = run(registryBinPath, ['use', 'custom'], targetRoot);
    assert.equal(activated.status, 0, activated.stderr);
    assert.deepEqual(JSON.parse(activated.stdout), {
      command: 'use',
      activeSet: 'custom',
      previousActiveSet: 'builtin',
      stateFileCreated: false,
    });
    assert.equal(JSON.parse(run(registryBinPath, ['status'], targetRoot).stdout).activeSet, 'custom');

    const restored = run(registryBinPath, ['use', 'builtin'], targetRoot);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(JSON.parse(restored.stdout).activeSet, 'builtin');

    for (const args of [['use'], ['use', 'mixed'], ['use', 'custom', 'extra']]) {
      const usageError = run(registryBinPath, args, targetRoot);
      assert.equal(usageError.status, 1, args.join(' '));
      assert.equal(usageError.stdout, '', args.join(' '));
      assert.match(usageError.stderr, /"use" needs exactly one of: builtin, custom\./u, args.join(' '));
    }
  });
});

test('usage errors go to stderr; help goes to stdout', () => {
  withTargetRepository((targetRoot) => {
    const missing = run(registryBinPath, [], targetRoot);
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /Missing command\./u);

    const unknown = run(registryBinPath, ['nope'], targetRoot);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown command: nope/u);

    const extra = run(registryBinPath, ['status', '--json'], targetRoot);
    assert.equal(extra.status, 1);
    assert.match(extra.stderr, /Unexpected arguments for "status"/u);

    const help = run(registryBinPath, ['--help'], targetRoot);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: calculogic-validator-registry <command>/u);
  });
});

test('validation runs report an inactive Custom set and keep Builtin provenance', () => {
  withTargetRepository((targetRoot) => {
    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    const extensionsPath = path.join(
      targetRoot,
      '.calculogic/registries/custom/naming/reportable-extensions.registry.json',
    );
    const extensions = JSON.parse(fs.readFileSync(extensionsPath, 'utf8'));
    extensions.reportableExtensions.push('.py');
    fs.writeFileSync(extensionsPath, JSON.stringify(extensions, null, 2));

    const result = run(validateNamingScriptPath, ['--scope=repo'], targetRoot);
    assert.ok([0, 1, 2].includes(result.status), result.stderr);
    const report = JSON.parse(result.stdout);

    assert.equal(report.registrySet.activeSet, 'builtin');
    assert.equal(report.registrySet.customExists, true);
    assert.equal(report.registrySet.customDiffers, true);
    assert.equal(report.registrySource, 'builtin');
    assert.equal(report.registryDigests.resolved, report.registryDigests.builtin);
    assert.notEqual(report.registryDigests.custom, report.registryDigests.builtin);
    assert.equal(report.registryProvenance['naming/reportable-extensions'].source, 'builtin');
  });
});

test('an active Custom set with a blocking condition stops every validation entry point with no report', () => {
  withTargetRepository((targetRoot) => {
    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    assert.equal(run(registryBinPath, ['use', 'custom'], targetRoot).status, 0);
    fs.writeFileSync(path.join(targetRoot, '.calculogic/registries/custom/tree/folder-kinds.registry.json'), '{ broken');

    for (const scriptPath of [validateNamingScriptPath, validateAllScriptPath, validateTreeScriptPath]) {
      const result = run(scriptPath, ['--scope=repo'], targetRoot);

      assert.equal(result.status, 1, path.basename(scriptPath));
      assert.equal(result.stdout, '', path.basename(scriptPath));
      assert.match(result.stderr, /tree\/folder-kinds: invalid/u, path.basename(scriptPath));
      assert.match(result.stderr, /registry:use builtin/u, path.basename(scriptPath));

      // Help still works: usage falls back to Builtin roots when the lifecycle cannot be resolved.
      const help = run(scriptPath, ['--help'], targetRoot);
      assert.equal(help.status, 0, path.basename(scriptPath));
      assert.match(help.stdout, /Usage:/u, path.basename(scriptPath));
    }

    const status = run(registryBinPath, ['status'], targetRoot);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).activeSet, 'custom');

    // The way back keeps the Custom set as it is.
    assert.equal(run(registryBinPath, ['use', 'builtin'], targetRoot).status, 0);
    assert.equal(run(validateTreeScriptPath, ['--scope=repo'], targetRoot).status, 0);
    assert.equal(
      fs.readFileSync(path.join(targetRoot, '.calculogic/registries/custom/tree/folder-kinds.registry.json'), 'utf8'),
      '{ broken',
    );
  });
});

const updateCustomRegistry = (targetRoot, registryId, update) => {
  const [sliceId, name] = registryId.split('/');
  const filePath = path.join(targetRoot, '.calculogic/registries/custom', sliceId, `${name}.registry.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(update(JSON.parse(fs.readFileSync(filePath, 'utf8'))), null, 2)}\n`);
};

const snapshotDirectory = (directoryPath) =>
  Object.fromEntries(
    fs
      .readdirSync(directoryPath, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort()
      .map((filePath) => [path.relative(directoryPath, filePath), fs.readFileSync(filePath, 'base64')]),
  );

const findingKeys = (validatorEntry) => validatorEntry.findings.map((finding) => `${finding.code}:${finding.path}`);
const sourcesOf = (provenance) => [...new Set(Object.values(provenance).map((entry) => entry.source))];

const runValidateAll = (targetRoot, scope) => {
  const result = run(validateBinPath, [`--scope=${scope}`], targetRoot);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  return {
    report,
    naming: report.validators.find((entry) => entry.validatorId === 'naming'),
    tree: report.validators.find((entry) => entry.validatorId === 'tree-structure-advisor'),
  };
};

test('an activated Custom set is used by Naming, Tree and suite core in one run; use builtin restores Builtin', () => {
  withTargetRepository((targetRoot) => {
    fs.writeFileSync(path.join(targetRoot, 'src', 'tool.py'), 'print(1)\n');
    fs.mkdirSync(path.join(targetRoot, 'src', 'interop'));
    fs.writeFileSync(path.join(targetRoot, 'src', 'interop', 'thing.logic.ts'), 'export const value = 1;\n');
    fs.mkdirSync(path.join(targetRoot, 'lib'));
    fs.writeFileSync(path.join(targetRoot, 'lib', 'util.logic.ts'), 'export {};\n');

    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    // One Custom edit per owner: Naming candidates, Tree repo shape and shim signals, suite scopes.
    updateCustomRegistry(targetRoot, 'naming/reportable-extensions', (payload) => ({
      ...payload,
      reportableExtensions: [...payload.reportableExtensions, '.py'],
    }));
    updateCustomRegistry(targetRoot, 'tree/repo-shape-policy', (payload) => ({
      ...payload,
      allowedTopLevelDirectories: [...payload.allowedTopLevelDirectories, 'lib'],
    }));
    updateCustomRegistry(targetRoot, 'tree/shim-detection-signals', (payload) => ({
      ...payload,
      shimDetectionSignals: {
        ...payload.shimDetectionSignals,
        folderSignals: [...payload.shimDetectionSignals.folderSignals, 'interop'],
      },
    }));
    updateCustomRegistry(targetRoot, 'suite/scope-profiles', (payload) => ({
      ...payload,
      profiles: { ...payload.profiles, app: { ...payload.profiles.app, includeRoots: [...payload.profiles.app.includeRoots, 'lib'] } },
    }));
    const customRoot = path.join(targetRoot, '.calculogic/registries/custom');
    const customBefore = snapshotDirectory(customRoot);

    const builtinRepo = runValidateAll(targetRoot, 'repo');
    const builtinApp = runValidateAll(targetRoot, 'app');

    assert.equal(run(registryBinPath, ['use', 'custom'], targetRoot).status, 0);
    const customRepo = runValidateAll(targetRoot, 'repo');
    const customApp = runValidateAll(targetRoot, 'app');

    // Provenance: one set, everywhere.
    for (const { report, naming, tree } of [customRepo, customApp]) {
      assert.equal(report.registrySet.activeSet, 'custom');
      assert.deepEqual(sourcesOf(report.registryProvenance), ['custom']);
      assert.deepEqual(sourcesOf(naming.meta.registryProvenance), ['custom']);
      assert.deepEqual(sourcesOf(tree.meta.registryProvenance), ['custom']);
      assert.equal(Object.keys(tree.meta.registryProvenance).length, 11);
    }
    for (const { report, naming, tree } of [builtinRepo, builtinApp]) {
      assert.equal(report.registrySet.activeSet, 'builtin');
      assert.deepEqual(sourcesOf(report.registryProvenance), ['builtin']);
      assert.deepEqual(sourcesOf(naming.meta.registryProvenance), ['builtin']);
      assert.deepEqual(sourcesOf(tree.meta.registryProvenance), ['builtin']);
    }

    // Naming: the Custom reportable extension makes the .py file a candidate.
    assert.ok(!findingKeys(builtinRepo.naming).some((key) => key.endsWith(':src/tool.py')));
    assert.ok(findingKeys(customRepo.naming).some((key) => key.endsWith(':src/tool.py')));
    // Tree: the Custom repo shape allows lib/, and the Custom shim signal flags src/interop/.
    assert.ok(findingKeys(builtinRepo.tree).includes('TREE_UNEXPECTED_TOP_LEVEL_FOLDER:lib'));
    assert.ok(!findingKeys(customRepo.tree).includes('TREE_UNEXPECTED_TOP_LEVEL_FOLDER:lib'));
    assert.ok(!findingKeys(builtinRepo.tree).some((key) => key.endsWith(':src/interop/thing.logic.ts')));
    assert.ok(findingKeys(customRepo.tree).some((key) => key.endsWith(':src/interop/thing.logic.ts')));
    // Suite core: the Custom app scope includes lib/ for both slices.
    assert.ok(!findingKeys(builtinApp.naming).some((key) => key.endsWith(':lib/util.logic.ts')));
    assert.ok(findingKeys(customApp.naming).some((key) => key.endsWith(':lib/util.logic.ts')));
    // Tree already scans every file under src/; the Custom scope adds lib/util.logic.ts.
    assert.equal(customApp.tree.totalFilesScanned, builtinApp.tree.totalFilesScanned + 1);

    // Switching back restores Builtin results and leaves Custom byte for byte as it was.
    assert.equal(run(registryBinPath, ['use', 'builtin'], targetRoot).status, 0);
    const restoredRepo = runValidateAll(targetRoot, 'repo');
    assert.equal(restoredRepo.report.registrySet.activeSet, 'builtin');
    assert.deepEqual(findingKeys(restoredRepo.naming), findingKeys(builtinRepo.naming));
    assert.deepEqual(findingKeys(restoredRepo.tree), findingKeys(builtinRepo.tree));
    assert.deepEqual(snapshotDirectory(customRoot), customBefore);
  });
});

test('validate:tree reports Tree registry provenance from the run resolution', () => {
  withTargetRepository((targetRoot) => {
    const result = run(validateTreeScriptPath, ['--scope=repo'], targetRoot);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const treeProvenance = report.validators[0].meta.registryProvenance;

    assert.equal(report.registrySet.activeSet, 'builtin');
    assert.deepEqual(Object.keys(treeProvenance).sort(), Object.keys(treeProvenance).filter((id) => id.startsWith('tree/')).sort());
    assert.equal(Object.keys(treeProvenance).length, 11);
    assert.deepEqual(sourcesOf(treeProvenance), ['builtin']);
  });
});

test('diff prints the read-only comparison as JSON and rejects an unknown registry id', () => {
  withTargetRepository((targetRoot) => {
    const withoutCustom = run(registryBinPath, ['diff'], targetRoot);
    assert.equal(withoutCustom.status, 0, withoutCustom.stderr);
    assert.deepEqual(JSON.parse(withoutCustom.stdout), { activeSet: 'builtin', customExists: false, counts: {}, registries: [] });

    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    const extensionsPath = path.join(targetRoot, '.calculogic/registries/custom/naming/reportable-extensions.registry.json');
    const extensions = JSON.parse(fs.readFileSync(extensionsPath, 'utf8'));
    extensions.reportableExtensions.push('.py');
    fs.writeFileSync(extensionsPath, JSON.stringify(extensions, null, 2));
    const before = fs.readFileSync(extensionsPath, 'utf8');

    const result = run(registryBinPath, ['diff', 'naming/reportable-extensions'], targetRoot);
    assert.equal(result.status, 0, result.stderr);
    const diff = JSON.parse(result.stdout);
    assert.deepEqual(diff.registries, [
      {
        registryId: 'naming/reportable-extensions',
        class: 'differs',
        counts: { 'custom-only': 1 },
        entries: [{ address: 'reportableExtensions[".py"]', class: 'custom-only', custom: '.py' }],
      },
    ]);
    assert.equal(fs.readFileSync(extensionsPath, 'utf8'), before);

    const unknown = run(registryBinPath, ['diff', 'naming/nope'], targetRoot);
    assert.equal(unknown.status, 1);
    assert.equal(unknown.stdout, '');
    assert.match(unknown.stderr, /Unknown registry id\(s\): naming\/nope\./u);
  });
});

test('decisions-template and decisions-check print JSON, write nothing, and exit 1 on problems', () => {
  withTargetRepository((targetRoot) => {
    const withoutCustom = run(registryBinPath, ['decisions-template'], targetRoot);
    assert.equal(withoutCustom.status, 1);
    assert.equal(withoutCustom.stdout, '');
    assert.match(withoutCustom.stderr, /No Custom registry set exists/u);

    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    const lifecycleRoot = path.join(targetRoot, '.calculogic/registries');
    const snapshot = () =>
      fs
        .readdirSync(lifecycleRoot, { recursive: true })
        .sort()
        .map((relativePath) => {
          const filePath = path.join(lifecycleRoot, relativePath);
          return [relativePath, fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
        });
    const before = snapshot();

    const template = run(registryBinPath, ['decisions-template'], targetRoot);
    assert.equal(template.status, 0, template.stderr);
    const document = JSON.parse(template.stdout);
    assert.deepEqual(document, { kind: 'calculogic-registry-update-decisions', schemaVersion: '2', registries: [] });

    const documentPath = path.join(targetRoot, 'decisions.json');
    fs.writeFileSync(documentPath, template.stdout);
    const valid = run(registryBinPath, ['decisions-check', 'decisions.json'], targetRoot);
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout), { valid: true, complete: true, problems: [], registries: [] });

    document.registries.push({ registryId: 'naming/nope' });
    fs.writeFileSync(documentPath, JSON.stringify(document));
    const invalid = run(registryBinPath, ['decisions-check', documentPath], targetRoot);
    assert.equal(invalid.status, 1);
    assert.deepEqual(JSON.parse(invalid.stdout).problems.map((item) => item.problem), ['unknown-registry']);

    fs.writeFileSync(documentPath, '{ broken');
    const unreadable = run(registryBinPath, ['decisions-check', documentPath], targetRoot);
    assert.equal(unreadable.status, 1);
    assert.equal(unreadable.stdout, '');
    assert.match(unreadable.stderr, /Cannot read /u);

    for (const args of [['decisions-check'], ['decisions-check', 'a.json', 'b.json']]) {
      const usage = run(registryBinPath, args, targetRoot);
      assert.equal(usage.status, 1);
      assert.equal(usage.stdout, '');
      assert.match(usage.stderr, /needs exactly one document path/u);
    }

    const unknown = run(registryBinPath, ['decisions-template', 'naming/nope'], targetRoot);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown registry id\(s\): naming\/nope\./u);

    assert.deepEqual(snapshot(), before);
  });
});

test('update applies an inherit decision through the bin and refuses an invalid document', () => {
  withTargetRepository((targetRoot) => {
    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    // Emulate a Custom set made before naming/case-rules existed.
    const customRoot = path.join(targetRoot, '.calculogic/registries/custom');
    fs.rmSync(path.join(customRoot, 'naming/case-rules.registry.json'));
    fs.rmSync(path.join(customRoot, '.baseline/naming/case-rules.registry.json'));
    const manifestPath = path.join(customRoot, 'registry-set.manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.basedOn.registries['naming/case-rules'];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const statePath = path.join(targetRoot, '.calculogic/registries/registry-state.json');
    const stateBefore = fs.readFileSync(statePath, 'utf8');

    const document = JSON.parse(run(registryBinPath, ['decisions-template'], targetRoot).stdout);
    assert.deepEqual(document.registries.map((record) => [record.registryId, record.class]), [['naming/case-rules', 'registry-added']]);
    const documentPath = path.join(targetRoot, 'decisions.json');

    fs.writeFileSync(documentPath, JSON.stringify({ ...document, registries: [{ ...document.registries[0], decision: 'take-builtin' }] }));
    const refused = run(registryBinPath, ['update', 'decisions.json'], targetRoot);
    assert.equal(refused.status, 1);
    assert.deepEqual(JSON.parse(refused.stdout).problems.map((item) => item.problem), ['unsupported-decision']);
    assert.equal(fs.existsSync(path.join(customRoot, 'naming/case-rules.registry.json')), false);

    fs.writeFileSync(documentPath, JSON.stringify({ ...document, registries: [{ ...document.registries[0], decision: 'inherit' }] }));
    const applied = run(registryBinPath, ['update', documentPath], targetRoot);
    assert.equal(applied.status, 0, applied.stderr);
    assert.deepEqual(JSON.parse(applied.stdout), { command: 'update', applied: ['naming/case-rules'], skipped: [] });

    const diff = JSON.parse(run(registryBinPath, ['diff', 'naming/case-rules'], targetRoot).stdout);
    assert.deepEqual(diff.registries, [{ registryId: 'naming/case-rules', class: 'unchanged' }]);
    assert.deepEqual(JSON.parse(run(registryBinPath, ['status'], targetRoot).stdout).customIssues, []);
    assert.equal(fs.readFileSync(statePath, 'utf8'), stateBefore);

    // An interrupted transaction is recovered even when the document cannot be read.
    const transactionRoot = path.join(targetRoot, '.calculogic/registries/.lifecycle-transaction');
    fs.mkdirSync(transactionRoot);
    const unreadable = run(registryBinPath, ['update', 'missing.json'], targetRoot);
    assert.equal(unreadable.status, 1);
    assert.equal(unreadable.stdout, '');
    assert.match(unreadable.stderr, /Cannot read the decisions document: .*recovered first \(rolled-back\)/u);
    assert.equal(fs.existsSync(transactionRoot), false);

    const usage = run(registryBinPath, ['update'], targetRoot);
    assert.equal(usage.status, 1);
    assert.match(usage.stderr, /"update" needs exactly one document path/u);
  });
});

test('update applies entry decisions through the bin, and the declined entries read custom-only afterwards', () => {
  withTargetRepository((targetRoot) => {
    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    // Emulate a Custom set made when Builtin lacked `.tsx` and `.jsx`: its Baseline copy, its Custom
    // file and its manifest digest all lack them, so the current Builtin reports both builtin-added.
    const customRoot = path.join(targetRoot, '.calculogic/registries/custom');
    const registryPath = (root) => path.join(root, 'naming/reportable-extensions.registry.json');
    const older = JSON.parse(fs.readFileSync(registryPath(customRoot), 'utf8'));
    older.reportableExtensions = older.reportableExtensions.filter((extension) => !['.tsx', '.jsx'].includes(extension));
    for (const root of [customRoot, path.join(customRoot, '.baseline')]) {
      fs.writeFileSync(registryPath(root), `${JSON.stringify(older, null, 2)}\n`);
    }
    const descriptor = REGISTRY_LIFECYCLE_SLICES.flatMap((slice) => slice.inventory).find(
      (entry) => entry.registryId === 'naming/reportable-extensions',
    ).descriptor;
    const manifestPath = path.join(customRoot, 'registry-set.manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.basedOn.registries['naming/reportable-extensions'].digest = digestRegistryPayload(older, descriptor);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const document = JSON.parse(run(registryBinPath, ['decisions-template'], targetRoot).stdout);
    assert.deepEqual(document.registries.map((record) => record.entries), [
      [
        { address: 'reportableExtensions[".jsx"]', class: 'builtin-added', choices: ['keep-custom', 'take-builtin'], decision: null },
        { address: 'reportableExtensions[".tsx"]', class: 'builtin-added', choices: ['keep-custom', 'take-builtin'], decision: null },
      ],
    ]);
    document.registries[0].entries[0].decision = 'keep-custom';
    document.registries[0].entries[1].decision = 'take-builtin';
    fs.writeFileSync(path.join(targetRoot, 'decisions.json'), JSON.stringify(document));

    const applied = run(registryBinPath, ['update', 'decisions.json'], targetRoot);
    assert.equal(applied.status, 0, applied.stderr);
    assert.deepEqual(JSON.parse(applied.stdout), { command: 'update', applied: ['naming/reportable-extensions'], skipped: [] });

    const diff = JSON.parse(run(registryBinPath, ['diff', 'naming/reportable-extensions'], targetRoot).stdout);
    assert.deepEqual(diff.registries[0].entries.map((entry) => [entry.address, entry.class]), [
      ['reportableExtensions[".jsx"]', 'custom-only'],
    ]);
    assert.deepEqual(JSON.parse(run(registryBinPath, ['status'], targetRoot).stdout).customIssues, []);
    assert.deepEqual(JSON.parse(run(registryBinPath, ['decisions-template'], targetRoot).stdout).registries, []);
  });
});
