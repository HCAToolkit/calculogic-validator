/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.22)
 * Responsibility: The portable set (lifecycle spec §12.12): `export` of a Custom set as one artifact
 *   of exact file bytes, `import-check` of an artifact against the receiving repository, and
 *   `import` of it as a new Custom set.
 * Invariants: files are opaque bytes, judged only by the lifecycle's assessment and the slices'
 *   validation; every artifact path is one of the Custom layout's, so none can leave `custom/`;
 *   `export` and `import-check` never write the repository; `import` only creates `custom/`, through
 *   the staging protocol `init-custom` uses, never writes `registry-state.json` and never activates.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha256Hex } from '../validator-report-meta.logic.mjs';
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { assertNewCustomSetAllowed, findNewCustomSetConditions, installNewCustomSet } from './registry-lifecycle-init.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  RegistryLifecycleError,
  customSetExists,
  isLifecyclePathContained,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import { lifecycleTransactionPending } from './registry-lifecycle-transaction.logic.mjs';
import {
  BASELINE_DIRNAME,
  CUSTOM_ISSUE_CONDITIONS,
  PORTABLE_SET_ENVIRONMENT_CONDITIONS as ENVIRONMENT,
  PORTABLE_SET_KIND,
  PORTABLE_SET_PROBLEMS as PROBLEMS,
  PORTABLE_SET_SCHEMA_VERSION,
  REGISTRY_SET_MANIFEST_FILENAME,
} from './registry-lifecycle.contracts.mjs';

const REGISTRY_FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.registry\.json$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isProvenanceString = (value) => typeof value === 'string' && value.length > 0 && value === value.trim();
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const hasExactKeys = (value, keys) =>
  isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sliceIdsOf = (slices) => new Set(slices.map((slice) => slice.sliceId));

// [5.2.22] cfg-registryLifecycle · Primitive · "portableSetPath"
// Whether a path, relative to `custom/` with `/` separators, is one of the Custom layout's files:
// the manifest, a slice registry, or a slice registry's Baseline copy (spec §12.12 "Paths").
export const portableSetPath = (relativePath, sliceIds) => {
  if (relativePath === REGISTRY_SET_MANIFEST_FILENAME) {
    return true;
  }
  const segments = relativePath.split('/');
  const [slice, name] = segments[0] === BASELINE_DIRNAME ? segments.slice(1) : segments;
  const expectedLength = segments[0] === BASELINE_DIRNAME ? 3 : 2;
  return segments.length === expectedLength && sliceIds.has(slice) && REGISTRY_FILE_NAME.test(name);
};

// The directories the Custom layout has: a slice folder, `.baseline`, and a slice folder in it.
const isLayoutDirectory = (relativePath, sliceIds) => {
  const segments = relativePath.split('/');
  return (
    (segments.length === 1 && (sliceIds.has(segments[0]) || segments[0] === BASELINE_DIRNAME)) ||
    (segments.length === 2 && segments[0] === BASELINE_DIRNAME && sliceIds.has(segments[1]))
  );
};

// The text of exactly these bytes, or null when they are not valid UTF-8 or would not encode back
// to themselves (spec §12.12 "Exact bytes"). A byte order mark is kept.
const exactText = (bytes) => {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return Buffer.from(text, 'utf8').equals(bytes) ? text : null;
  } catch {
    return null;
  }
};

const openExistingSet = (paths, command) => {
  for (const lifecyclePath of [paths.lifecycleRoot, paths.customRoot]) {
    if (!isLifecyclePathContained(paths, lifecyclePath)) {
      throw new RegistryLifecycleError(
        `Registry lifecycle path resolves outside the validation target (${lifecyclePath}); ${command} reads only inside the target repository.`,
      );
    }
  }
  if (!customSetExists(paths)) {
    throw new RegistryLifecycleError(`No Custom registry set exists. ${command} needs one; run registry:init-custom or registry:import first.`);
  }
};

// [5.2.22] cfg-registryLifecycle · Workflow · "exportPortableSet"
// The Custom set as an artifact: every layout file's exact bytes and SHA-256, in ordinal path
// order. Read-only. Refuses a pending transaction, an entry outside the layout, an escaping entry
// and a file that is not valid UTF-8, naming each.
export const exportPortableSet = ({ targetRoot, lifecycleRootOverride, validatorVersion, slices = REGISTRY_LIFECYCLE_SLICES }) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  openExistingSet(paths, 'export');
  if (lifecycleTransactionPending(paths)) {
    throw new RegistryLifecycleError(
      `An interrupted lifecycle transaction is pending (${paths.lifecycleRoot}): the Custom files may be an intermediate state, so export refuses until the next update, migrate or edit recovers it.`,
    );
  }

  const sliceIds = sliceIdsOf(slices);
  const files = [];
  const refusals = [];
  const walk = (directory, relativeDirectory) => {
    for (const name of fs.readdirSync(directory).sort(compareOrdinal)) {
      const absolutePath = path.join(directory, name);
      const relativePath = relativeDirectory === '' ? name : `${relativeDirectory}/${name}`;
      if (!isLifecyclePathContained(paths, absolutePath)) {
        refusals.push(`${relativePath} resolves outside the validation target`);
        continue;
      }
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory() && isLayoutDirectory(relativePath, sliceIds)) {
        walk(absolutePath, relativePath);
      } else if (stat.isFile() && portableSetPath(relativePath, sliceIds)) {
        const bytes = fs.readFileSync(absolutePath);
        const text = exactText(bytes);
        if (text === null) {
          refusals.push(`${relativePath} is not valid UTF-8`);
        } else {
          files.push({ path: relativePath, text, sha256: sha256Hex(bytes) });
        }
      } else {
        refusals.push(`${relativePath} is not part of the Custom set layout`);
      }
    }
  };
  walk(paths.customRoot, '');
  if (refusals.length > 0) {
    throw new RegistryLifecycleError(`export refuses the Custom set (${paths.customRoot}):\n${refusals.map((item) => `  - ${item}`).join('\n')}`);
  }

  return {
    kind: PORTABLE_SET_KIND,
    schemaVersion: PORTABLE_SET_SCHEMA_VERSION,
    exportedBy: { validatorVersion },
    files: files.sort((left, right) => compareOrdinal(left.path, right.path)),
  };
};

// [5.2.22] cfg-registryLifecycle · Derived value · "artifactProblems"
// The artifact's own problems (spec §12.12 `import-check`): shape and schema first, then paths and
// integrity. Paths and hashes are checked only on a well-formed document. Shared with candidate
// preview (5.2.23).
export const artifactProblems = (document, sliceIds) => {
  const problems = [];
  const problem = (code, detail, filePath) => problems.push({ ...(filePath === undefined ? {} : { path: filePath }), problem: code, detail });
  if (!hasExactKeys(document, ['kind', 'schemaVersion', 'exportedBy', 'files']) || document.kind !== PORTABLE_SET_KIND) {
    problem(PROBLEMS.malformed, `An artifact is { kind: "${PORTABLE_SET_KIND}", schemaVersion, exportedBy, files }.`);
    return problems;
  }
  if (document.schemaVersion !== PORTABLE_SET_SCHEMA_VERSION) {
    problem(PROBLEMS.unsupportedSchema, `Schema ${JSON.stringify(document.schemaVersion)} is not ${JSON.stringify(PORTABLE_SET_SCHEMA_VERSION)}, the one this release reads.`);
    return problems;
  }
  if (!hasExactKeys(document.exportedBy, ['validatorVersion']) || !isProvenanceString(document.exportedBy.validatorVersion)) {
    problem(PROBLEMS.malformed, 'exportedBy is { validatorVersion }, a non-empty string.');
  }
  if (!Array.isArray(document.files)) {
    problem(PROBLEMS.malformed, 'files is a list of { path, text, sha256 }.');
    return problems;
  }
  document.files.forEach((file, index) => {
    const isValid =
      hasExactKeys(file, ['path', 'text', 'sha256']) &&
      typeof file.path === 'string' &&
      typeof file.text === 'string' &&
      typeof file.sha256 === 'string' &&
      SHA256.test(file.sha256);
    if (!isValid) {
      problem(PROBLEMS.malformed, `files[${index}] is not { path, text, sha256 } with a lowercase SHA-256.`, typeof file?.path === 'string' ? file.path : undefined);
    }
  });
  if (problems.length > 0) {
    return problems;
  }

  const counts = new Map();
  for (const file of document.files) {
    counts.set(file.path, (counts.get(file.path) ?? 0) + 1);
  }
  for (const [filePath, count] of [...counts].sort(([left], [right]) => compareOrdinal(left, right))) {
    if (!portableSetPath(filePath, sliceIds)) {
      problem(PROBLEMS.unexpectedPath, 'The path is not one of the Custom set layout\'s files.', filePath);
    } else if (count > 1) {
      problem(PROBLEMS.unexpectedPath, `The path is given ${count} times.`, filePath);
    }
  }
  for (const file of document.files) {
    if (portableSetPath(file.path, sliceIds) && sha256Hex(Buffer.from(file.text, 'utf8')) !== file.sha256) {
      problem(PROBLEMS.integrity, 'The SHA-256 of the text\'s UTF-8 bytes is not the recorded sha256.', file.path);
    }
  }
  return problems;
};

// [5.2.22] cfg-registryLifecycle · Primitive · "relocate"
// Replaces every string's temporary paths with the given ones, so nothing reported depends on where
// a copy was assessed.
export const relocate = (value, replacements) => {
  if (typeof value === 'string') {
    return replacements.reduce((text, [from, to]) => text.split(from).join(to), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => relocate(item, replacements));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item, replacements)]));
  }
  return value;
};

// [5.2.22] cfg-registryLifecycle · Primitive · "materializePortableSet"
// Writes a checked artifact's files, as exact bytes, into `custom/` of a new temporary target under
// the OS temp directory, outside any repository. Returns `{ temporaryRoot, paths, temporaryPaths }`,
// where `temporaryPaths` are the spellings of its lifecycle root to relocate in reports; the caller
// removes `temporaryRoot`.
export const materializePortableSet = (files, prefix = 'calculogic-registry-import-') => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    const paths = resolveRegistryLifecyclePaths({ targetRoot: temporaryRoot });
    fs.mkdirSync(paths.customRoot, { recursive: true });
    for (const file of files) {
      const filePath = path.join(paths.customRoot, ...file.path.split('/'));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(file.text, 'utf8'));
    }
    const temporaryPaths = [...new Set([fs.realpathSync(paths.lifecycleRoot), paths.lifecycleRoot])].sort(
      (left, right) => right.length - left.length,
    );
    return { temporaryRoot, paths, temporaryPaths };
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
};

// The set as it would be installed: written to a temporary target outside the repository,
// assessed by the lifecycle (spec §7, §12.1), then removed. Returns the merge-base problems and the
// status, with temporary paths reported as the receiving repository's.
const assessPortableSet = ({ files, receivingPaths, slices }) => {
  const { temporaryRoot, paths, temporaryPaths } = materializePortableSet(files);
  try {
    const assessment = assessCustomRegistrySet({ paths, slices });
    const replacements = temporaryPaths.map((from) => [from, receivingPaths.lifecycleRoot]);

    const problems = [];
    for (const issue of assessment.customIssues) {
      if (issue.condition === CUSTOM_ISSUE_CONDITIONS.manifestMalformed) {
        problems.push({ problem: PROBLEMS.manifestMalformed, detail: issue.detail });
      } else if (issue.condition === CUSTOM_ISSUE_CONDITIONS.baselineMismatch) {
        problems.push({ registryId: issue.registryId, problem: PROBLEMS.baselineMismatch, detail: issue.detail });
      }
    }
    // A current registry's merge base must be verifiable; an orphan's is never used.
    if (!assessment.manifestError) {
      for (const entry of assessment.registries) {
        if (entry.classification !== 'orphan' && entry.baselineDigest !== null && entry.baselineMismatch === null) {
          problems.push({
            registryId: entry.registryId,
            problem: PROBLEMS.baselineUnverifiable,
            detail: 'This release has no canonical-form descriptor for the manifest version, so the Baseline copy cannot be verified.',
          });
        }
      }
    }

    const { customDiffers, orphanRegistries, customIssues, registries } = assessment;
    return relocate({ problems, status: { customDiffers, orphanRegistries, customIssues, registries } }, replacements);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

// The receiving repository's conditions that would refuse `import` (spec §12.12): the new Custom set
// conditions `init-custom` shares (5.2.6), with import's details. An escaping lifecycle root, state
// file or `custom/` is a lifecycle error.
const ENVIRONMENT_DETAILS = Object.freeze({
  [ENVIRONMENT.customSetExists]: 'A Custom set exists; import never replaces or merges into it.',
  [ENVIRONMENT.transactionPending]: 'A lifecycle transaction is pending; the next update, migrate or edit recovers it.',
  [ENVIRONMENT.customSelected]: 'registry-state.json selects custom, so an installed set would be active without use custom; run use builtin first.',
});

const environmentOf = (paths) =>
  findNewCustomSetConditions({ paths, command: 'import' }).conditions.map((condition) => ({
    condition,
    detail: ENVIRONMENT_DETAILS[condition],
  }));

const checkAgainst = ({ document, paths, slices }) => {
  const problems = artifactProblems(document, sliceIdsOf(slices));
  const environment = environmentOf(paths);
  if (problems.length > 0) {
    return { valid: false, problems, environment, status: null };
  }
  const assessed = assessPortableSet({ files: document.files, receivingPaths: paths, slices });
  return { valid: assessed.problems.length === 0, problems: assessed.problems, environment, status: assessed.status };
};

// [5.2.22] cfg-registryLifecycle · Workflow · "checkPortableSet"
// `{ valid, problems, environment, status }` for an artifact in the receiving repository. Never
// writes the repository.
export const checkPortableSet = ({ document, targetRoot, lifecycleRootOverride, slices = REGISTRY_LIFECYCLE_SLICES }) =>
  checkAgainst({ document, paths: resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride }), slices });

// [5.2.22] cfg-registryLifecycle · Workflow · "importPortableSet"
// Installs an artifact as a new Custom set when the check passes and the repository allows it:
// `{ installed: true, activated: false, status }`, or `{ installed: false, problems, environment }`
// with nothing written. Installed means the files are in place, not that the set is valid.
export const importPortableSet = ({ document, targetRoot, lifecycleRootOverride, slices = REGISTRY_LIFECYCLE_SLICES }) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const check = checkAgainst({ document, paths, slices });
  if (!check.valid || check.environment.length > 0) {
    return { installed: false, problems: check.problems, environment: check.environment };
  }

  // The same checks `init-custom` runs, immediately before staging.
  assertNewCustomSetAllowed({ paths, command: 'import' });
  installNewCustomSet({
    paths,
    stagingPrefix: '.custom-import-',
    populate: (stagingRoot) => {
      for (const file of document.files) {
        const filePath = path.join(stagingRoot, ...file.path.split('/'));
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(file.text, 'utf8'));
      }
    },
  });
  return { installed: true, activated: false, status: check.status };
};
