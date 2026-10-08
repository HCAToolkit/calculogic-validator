import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const validatorPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The documentation distribution policy (README "Packaged documentation"): consumer-facing
// convention and contract documents ship with the package; audits, inventories, notes and other
// development documentation do not. This is a packaging decision, not an authority classification.
const EXPECTED_PACKAGED_DOCS = Object.freeze([
  'doc/ConventionRoutines/CCPP.md',
  'doc/ConventionRoutines/CCS.md',
  'doc/ConventionRoutines/CSCS.md',
  'doc/ConventionRoutines/DeterministicStructuralAddressingSpec-Draft.md',
  'doc/ConventionRoutines/DocumentContentClassificationConvention-V1.md',
  'doc/ConventionRoutines/FileNamingMasterList-V1_1.md',
  'doc/ConventionRoutines/General-NL-Skeletons.md',
  'doc/ConventionRoutines/NL-First-Workflow.md',
  'doc/ConventionRoutines/NamingValidatorSpec.md',
  'doc/ConventionRoutines/TerminologyScoping-Conventions-V1.md',
  'doc/ConventionRoutines/ValidatorBridgeContracts.md',
  'doc/ConventionRoutines/ValidatorHelperAreas-And-Reuse-Conventions.md',
  'doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md',
  'doc/ConventionRoutines/ValidatorReportSchema-V0_1.md',
  'doc/ConventionRoutines/ValidatorRuleIds-Contract.md',
  'doc/ConventionRoutines/ValidatorSliceAndReportFormula.md',
  'doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md',
  'doc/ConventionRoutines/ValidatorSuiteOwnedSharedHelpers-And-Capabilities.md',
  // Explicit exception: canonical contract for the public --config option.
  'doc/ValidatorSpecs/validator-config.spec.md',
]);

// Documents consumers are directed to read (Calculogic_React_App's active docs and AGENTS.md
// reference these), plus the config contract NamingValidatorSpec.md relies on.
const REQUIRED_CONSUMER_DOCS = Object.freeze([
  'doc/ConventionRoutines/CCPP.md',
  'doc/ConventionRoutines/CCS.md',
  'doc/ConventionRoutines/FileNamingMasterList-V1_1.md',
  'doc/ConventionRoutines/TerminologyScoping-Conventions-V1.md',
  'doc/ConventionRoutines/NamingValidatorSpec.md',
  'doc/ConventionRoutines/ValidatorSuite-Contracts-And-Modes.md',
  'doc/ConventionRoutines/DeterministicStructuralAddressingSpec-Draft.md',
  'doc/ValidatorSpecs/validator-config.spec.md',
]);

// Every reference from a packaged document to a document that is NOT in the package, reviewed and
// classified. Anything not listed here fails the test, so a new unresolved reference must be
// either packaged or reviewed and added with a classification.
//   illustrative - example paths inside a code sample, not a reference to follow
//   external - a document in a consuming repository (Calculogic_React_App), not a Validator doc
//   development-only - provenance or related Validator-internal reading, not needed to apply the doc
//   runtime-value - a documented value the runtime emits verbatim (the current ruleRef format),
//                   not a path to follow as written
// "external" also covers paths in the repository that applies a convention or is validated (for
// example NL-First-Workflow's doc/nl-config/, or the docs/ and test/ scope roots).
const REVIEWED_UNPACKAGED_REFERENCES = Object.freeze({
  'doc/ConventionRoutines/CCPP.md -> doc/nl-shell/shell-globalHeader.md': 'illustrative',
  'doc/ConventionRoutines/CCPP.md -> doc/nl-config/cfg-tabNavigation.md': 'illustrative',
  'doc/ConventionRoutines/DeterministicStructuralAddressingSpec-Draft.md -> doc/Architecture/BuildSurfaceGlobalHostSequencePlan.md':
    'external',
  'doc/ConventionRoutines/ValidatorBridgeContracts.md -> doc/Audits/validator-slice-formula-alignment.audit.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorBridgeContracts.md -> doc/ValidatorSpecs/structural-addressing-tree-codebase-validation-input.spec.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorBridgeContracts.md -> doc/ValidatorSpecs/tree-owned/tree-structural-address-probe-contract.spec.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md -> doc/ValidatorSpecs/cross-cutting/registry-model-and-slice-interaction.spec.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorRuleIds-Contract.md -> doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md':
    'development-only',
  'doc/ConventionRoutines/NamingValidatorSpec.md -> doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md -> doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorReportSchema-V0_1.md -> doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md':
    'development-only',
  'doc/ValidatorSpecs/validator-config.spec.md -> doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorReportSchema-V0_1.md -> test/fixtures/report-examples/validate-naming.system.report.example.json':
    'development-only',
  'doc/ConventionRoutines/ValidatorReportSchema-V0_1.md -> test/fixtures/report-examples/validate-all.system.naming.report.example.json':
    'development-only',
  'doc/ConventionRoutines/NamingValidatorSpec.md -> docs': 'external',
  'doc/ConventionRoutines/NamingValidatorSpec.md -> test': 'external',
  'doc/ConventionRoutines/NL-First-Workflow.md -> doc/nl-config': 'external',
  'doc/ConventionRoutines/NL-First-Workflow.md -> doc/nl-shell': 'external',
  'doc/ConventionRoutines/ValidatorRuleIds-Contract.md -> calculogic-validator/doc/ConventionRoutines/NamingValidatorSpec.md':
    'runtime-value',
  'doc/ConventionRoutines/ValidatorRuleIds-Contract.md -> calculogic-validator/doc/ConventionRoutines/FileNamingMasterList-V1_1.md':
    'runtime-value',
});

// Any path with the embedded-tree prefix, whatever its file type (.md, .mjs, .json, directories).
// The prefix does not exist in this repository or in an installed package, so every such mention
// must be a reviewed runtime-value reference.
const EMBEDDED_PREFIX_PATTERN = /calculogic-validator\/[A-Za-z0-9_./<>-]+/gu;

// Matches doc paths written in prose (`doc/...md`, including any legacy
// `calculogic-validator/doc/...md` prefix, captured literally) and relative Markdown link targets.
// Paths are resolved exactly as written against the installed package root, with no prefix
// rewriting: a stale embedded-tree path such as `calculogic-validator/doc/...` does not exist in an
// installed package, so it surfaces as an unresolved reference instead of being silently accepted.
const DOC_REFERENCE_PATTERN =
  /((?:calculogic-validator\/)?doc\/[A-Za-z0-9_./-]+\.md)|\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/gu;

// Also matches backticked repository paths of any file type or directory (for example
// `test/fixtures/...json`, `src/core/`, `docs/`), so non-Markdown assets are checked too. A path
// must contain a `/`: a bare word such as `docs` or `test` is naming vocabulary, not a path.
const REPOSITORY_ROOTS = ['src', 'naming', 'tree', 'structural-addressing', 'bin', 'scripts', 'test', 'tools', 'doc', 'docs'];
const BACKTICKED_PATH_PATTERN = new RegExp(
  `\`((?:calculogic-validator/)?(?:${REPOSITORY_ROOTS.join('|')})/[^\`\\s]*)\``,
  'gu',
);

// A path template or glob describes a pattern (where files go, what a scope matches), not a
// specific file to open, so it is not checked as a reference.
const isPathTemplate = (target) => /[*<>[\]]|\.\.\./u.test(target);

// Returns every repository path a document refers to, relative to the package root, as written.
const listDocReferences = (docPath, content) => {
  const references = new Set();
  for (const match of content.matchAll(DOC_REFERENCE_PATTERN)) {
    const target = match[1]
      ? match[1]
      : path.posix.normalize(path.posix.join(path.posix.dirname(docPath), match[2]));
    if (target.startsWith('doc/') || target.startsWith('calculogic-validator/')) {
      references.add(target);
    }
  }
  for (const [, rawTarget] of content.matchAll(BACKTICKED_PATH_PATTERN)) {
    const target = rawTarget.replace(/#.*$/u, '').replace(/\/+$/u, '');
    if (!isPathTemplate(target)) {
      references.add(target);
    }
  }
  return [...references];
};

const runCommand = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: process.env });
  assert.equal(result.error, undefined, `${command} ${args.join(' ')}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
};

const listFilesRecursively = (rootDirectory, relativeDirectory) => {
  const absoluteDirectory = path.join(rootDirectory, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) {
    return [];
  }
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(rootDirectory, relativePath) : [relativePath];
  });
};

test('packed validator ships exactly the documented documentation set, byte-identical, with only reviewed external references', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calculogic-validator-docs-'));

  try {
    const packRoot = path.join(tempRoot, 'pack');
    const consumerRoot = path.join(tempRoot, 'consumer');
    fs.mkdirSync(packRoot, { recursive: true });
    fs.mkdirSync(consumerRoot, { recursive: true });
    fs.writeFileSync(path.join(consumerRoot, 'package.json'), '{"name":"docs-consumer","private":true}\n');

    const packResult = runCommand('npm', ['pack', '--json', '--pack-destination', packRoot], validatorPackageRoot);
    const [packInfo] = JSON.parse(packResult.stdout);
    const packedDocs = packInfo.files
      .map((file) => file.path)
      .filter((filePath) => filePath.startsWith('doc/'))
      .sort();
    assert.deepEqual(packedDocs, [...EXPECTED_PACKAGED_DOCS].sort(), 'packed doc inventory differs from the policy');

    runCommand(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(packRoot, packInfo.filename)],
      consumerRoot,
    );
    const installedRoot = path.join(consumerRoot, 'node_modules', '@calculogic', 'validator');

    const installedDocs = listFilesRecursively(installedRoot, 'doc').sort();
    assert.deepEqual(installedDocs, [...EXPECTED_PACKAGED_DOCS].sort(), 'installed doc inventory differs from the policy');

    for (const docPath of EXPECTED_PACKAGED_DOCS) {
      assert.ok(
        fs.readFileSync(path.join(installedRoot, docPath)).equals(fs.readFileSync(path.join(validatorPackageRoot, docPath))),
        `${docPath} is not byte-identical after installation`,
      );
    }

    for (const docPath of REQUIRED_CONSUMER_DOCS) {
      assert.ok(fs.existsSync(path.join(installedRoot, docPath)), `required consumer doc missing: ${docPath}`);
    }

    const unpackagedReferences = new Set();
    for (const docPath of EXPECTED_PACKAGED_DOCS) {
      const content = fs.readFileSync(path.join(installedRoot, docPath), 'utf8');
      for (const target of listDocReferences(docPath, content)) {
        if (!fs.existsSync(path.join(installedRoot, target))) {
          unpackagedReferences.add(`${docPath} -> ${target}`);
        }
      }
    }
    assert.deepEqual(
      [...unpackagedReferences].sort(),
      Object.keys(REVIEWED_UNPACKAGED_REFERENCES).sort(),
      'references from packaged docs to unpackaged docs must each be reviewed and classified',
    );

    const unreviewedEmbeddedPrefixPaths = new Set();
    for (const docPath of EXPECTED_PACKAGED_DOCS) {
      const content = fs.readFileSync(path.join(installedRoot, docPath), 'utf8');
      for (const [literal] of content.matchAll(EMBEDDED_PREFIX_PATTERN)) {
        const reference = `${docPath} -> ${literal.replace(/[.]$/u, '')}`;
        if (REVIEWED_UNPACKAGED_REFERENCES[reference] !== 'runtime-value') {
          unreviewedEmbeddedPrefixPaths.add(reference);
        }
      }
    }
    assert.deepEqual(
      [...unreviewedEmbeddedPrefixPaths].sort(),
      [],
      'packaged docs must not use embedded-tree calculogic-validator/ paths except reviewed runtime values',
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('path templates and globs are recognized as patterns, not references', () => {
  for (const template of ['src/**', 'doc/nl-config/cfg-*.md', 'src/configs/<configId>/<ConfigName>.build.tsx', 'doc/nl-config/cfg-[name].md', 'doc/HealthChecks/...']) {
    assert.equal(isPathTemplate(template), true, template);
  }
  for (const concrete of ['docs', 'test/fixtures/report-examples/validate-naming.system.report.example.json', 'src/core/cli']) {
    assert.equal(isPathTemplate(concrete), false, concrete);
  }
});

test('reviewed unpackaged references use only the documented classifications', () => {
  const allowed = new Set(['illustrative', 'external', 'development-only', 'runtime-value']);
  for (const [reference, classification] of Object.entries(REVIEWED_UNPACKAGED_REFERENCES)) {
    assert.ok(allowed.has(classification), `${reference} has unknown classification ${classification}`);
  }
});

// The documented ruleRef resolution (ValidatorRuleIds-Contract.md section 4): drop the historical
// `calculogic-validator/` segment and resolve the rest from the repository root. Every ruleRef the
// runtime emits must reach an existing document and, when it has a fragment, an existing anchor: a
// GitHub-style heading anchor or an explicit `<a id="...">`.
const toHeadingAnchor = (headingText) =>
  headingText
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .replace(/ /gu, '-');

const listDocumentAnchors = (content) => {
  const anchors = new Set();
  const seen = new Map();
  for (const line of content.split('\n')) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/u.exec(line);
    if (heading) {
      const base = toHeadingAnchor(heading[1]);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      anchors.add(count === 0 ? base : `${base}-${count}`);
    }
  }
  for (const [, id] of content.matchAll(/<a\s+(?:id|name)="([^"]+)"/gu)) {
    anchors.add(id);
  }
  return anchors;
};

const listEmittedRuleRefs = () => {
  const ruleRefs = [];
  const collect = (value, source) => {
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, source));
    } else if (value && typeof value === 'object') {
      if (typeof value.ruleRef === 'string') {
        ruleRefs.push({ source, ruleRef: value.ruleRef });
      }
      Object.values(value).forEach((item) => collect(item, source));
    }
  };
  const namingRegistry = 'naming/src/registries/_builtin/finding-policy.registry.json';
  collect(JSON.parse(fs.readFileSync(path.join(validatorPackageRoot, namingRegistry), 'utf8')), namingRegistry);

  for (const relativePath of listFilesRecursively(validatorPackageRoot, 'tree/src')) {
    if (!relativePath.endsWith('.mjs')) {
      continue;
    }
    const content = fs.readFileSync(path.join(validatorPackageRoot, relativePath), 'utf8');
    for (const [, ruleRef] of content.matchAll(/ruleRef:\s*'([^']+)'/gu)) {
      ruleRefs.push({ source: relativePath, ruleRef });
    }
  }
  return ruleRefs;
};

test('every ruleRef the runtime emits resolves to an existing document and anchor', () => {
  const ruleRefs = listEmittedRuleRefs();
  assert.ok(ruleRefs.length > 0, 'expected to find emitted ruleRefs');

  for (const { source, ruleRef } of ruleRefs) {
    const [targetPath, fragment] = ruleRef.split('#');
    const documentPath = targetPath.replace(/^calculogic-validator\//u, '');
    const absolutePath = path.join(validatorPackageRoot, documentPath);
    assert.ok(fs.existsSync(absolutePath), `${source}: ruleRef ${ruleRef} does not resolve to a document`);
    if (fragment) {
      assert.ok(
        listDocumentAnchors(fs.readFileSync(absolutePath, 'utf8')).has(fragment),
        `${source}: ruleRef ${ruleRef} has no matching anchor #${fragment} in ${documentPath}`,
      );
    }
  }
});
