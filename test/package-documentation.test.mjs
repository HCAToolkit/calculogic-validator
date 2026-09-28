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
const REVIEWED_UNPACKAGED_REFERENCES = Object.freeze({
  'doc/ConventionRoutines/CCPP.md -> doc/nl-shell/shell-globalHeader.md': 'illustrative',
  'doc/ConventionRoutines/CCPP.md -> doc/nl-config/cfg-tabNavigation.md': 'illustrative',
  'doc/ConventionRoutines/DeterministicStructuralAddressingSpec-Draft.md -> doc/Architecture/BuildSurfaceGlobalHostSequencePlan.md':
    'external',
  'doc/ConventionRoutines/ValidatorBridgeContracts.md -> doc/Audits/validator-slice-formula-alignment.audit.md':
    'development-only',
  'doc/ConventionRoutines/ValidatorLoaderConverterRuntimeOwnership-Contract.md -> doc/ValidatorSpecs/cross-cutting/registry-model-and-slice-interaction.spec.md':
    'development-only',
});

// Matches doc paths written in prose (`doc/...md`, including any legacy
// `calculogic-validator/doc/...md` prefix, captured literally) and relative Markdown link targets.
// Paths are resolved exactly as written against the installed package root, with no prefix
// rewriting: a stale embedded-tree path such as `calculogic-validator/doc/...` does not exist in an
// installed package, so it surfaces as an unresolved reference instead of being silently accepted.
const DOC_REFERENCE_PATTERN =
  /((?:calculogic-validator\/)?doc\/[A-Za-z0-9_./-]+\.md)|\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/gu;

// Returns every doc path a document refers to, relative to the package root, as written.
const listDocReferences = (docPath, content) => {
  const references = [];
  for (const match of content.matchAll(DOC_REFERENCE_PATTERN)) {
    const target = match[1]
      ? match[1]
      : path.posix.normalize(path.posix.join(path.posix.dirname(docPath), match[2]));
    if (target.startsWith('doc/') || target.startsWith('calculogic-validator/')) {
      references.push(target);
    }
  }
  return references;
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
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('reviewed unpackaged references use only the documented classifications', () => {
  const allowed = new Set(['illustrative', 'external', 'development-only']);
  for (const [reference, classification] of Object.entries(REVIEWED_UNPACKAGED_REFERENCES)) {
    assert.ok(allowed.has(classification), `${reference} has unknown classification ${classification}`);
  }
});
