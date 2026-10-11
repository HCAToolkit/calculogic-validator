/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.11)
 * Responsibility: The lifecycle transaction (lifecycle spec §4.6): replaces an ordered list of
 *   lifecycle files so that either all of them change or none does, and recovers a transaction a
 *   stopped process left behind.
 * Invariants: everything is staged and journaled before the first commit step; the last file is
 *   the commit point; a failure before it is rolled back completely; recovery decides from the
 *   journal alone, never guesses and never touches `registry-state.json`; every path is contained
 *   (§4.1); one transaction at a time per lifecycle root.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../validator-report-meta.logic.mjs';
import { RegistryLifecycleError, isLifecyclePathContained } from './registry-lifecycle-state.logic.mjs';
import {
  LIFECYCLE_TRANSACTION_DIRNAME,
  LIFECYCLE_TRANSACTION_JOURNAL_FILENAME,
  LIFECYCLE_TRANSACTION_OUTCOMES,
  LIFECYCLE_TRANSACTION_SCHEMA_VERSION,
} from './registry-lifecycle.contracts.mjs';

const STAGED_DIRNAME = 'staged';
const BACKUP_DIRNAME = 'backup';

// [5.2.11] cfg-registryLifecycle · Primitive · "LIFECYCLE_TRANSACTION_SIMULATED_CRASH"
// Internal, for tests only: an error carrying this key stops the transaction where it is, without
// rollback, as a killed process would. Never consumer-facing.
export const LIFECYCLE_TRANSACTION_SIMULATED_CRASH = Symbol('lifecycleTransactionSimulatedCrash');

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const transactionRootOf = (paths) => path.join(paths.lifecycleRoot, LIFECYCLE_TRANSACTION_DIRNAME);

// A journal path is relative to the lifecycle root and must stay inside it.
const toJournalPath = (paths, absolutePath) => {
  const relativePath = path.relative(paths.lifecycleRoot, absolutePath);
  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new RegistryLifecycleError(`A lifecycle transaction writes only inside the lifecycle root: ${absolutePath}`);
  }
  return relativePath.split(path.sep).join('/');
};

const fromJournalPath = (paths, journalPath) => {
  const absolutePath = path.resolve(paths.lifecycleRoot, ...journalPath.split('/'));
  const relativePath = path.relative(paths.lifecycleRoot, absolutePath);
  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new RegistryLifecycleError(`The lifecycle transaction journal names a path outside the lifecycle root: ${journalPath}`);
  }
  return absolutePath;
};

const assertContained = (paths, candidatePath) => {
  if (!isLifecyclePathContained(paths, candidatePath)) {
    throw new RegistryLifecycleError(
      `A lifecycle write target resolves outside the validation target (${candidatePath}); nothing was written.`,
    );
  }
};

// Whether a directory entry exists at `targetPath`, of any kind but a directory. A symlink counts
// as itself: it is moved to the backup and restored as a link, never followed. A directory cannot
// be replaced by a file, so it is refused.
const targetExists = (targetPath) => {
  let stats;
  try {
    stats = fs.lstatSync(targetPath);
  } catch {
    return false;
  }
  if (stats.isDirectory()) {
    throw new RegistryLifecycleError(`A lifecycle write target is a directory (${targetPath}); nothing was written.`);
  }
  return true;
};

// Whether a directory entry is present, without following a symlink: a moved relative link
// usually dangles in the backup directory, and must still be restored.
const entryPresent = (entryPath) => {
  try {
    fs.lstatSync(entryPath);
    return true;
  } catch {
    return false;
  }
};

const isFile = (filePath) => {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch {
    return false;
  }
};

// The missing ancestors of `filePath` below the lifecycle root, shallowest first.
const missingDirectories = (paths, filePath) => {
  const missing = [];
  for (let directory = path.dirname(filePath); directory !== paths.lifecycleRoot; directory = path.dirname(directory)) {
    if (fs.existsSync(directory)) {
      break;
    }
    missing.unshift(directory);
  }
  return missing;
};

// Every journal path, resolved and checked lexically and by realpath (spec §4.1) before anything
// is read or touched, so a tampered journal or a retargeted symlink is refused, never followed.
const resolveJournalPaths = (paths, journal) => {
  const targets = journal.steps.map((step) => fromJournalPath(paths, step.target));
  const directories = journal.createdDirectories.map((directory) => fromJournalPath(paths, directory));
  for (const candidatePath of [...targets, ...directories]) {
    assertContained(paths, candidatePath);
  }
  return { targets, directories };
};

// Undoes the journaled steps in reverse (spec §4.6 item 4). A step whose backup is present is
// restored; a target that did not exist is removed; created directories are removed when empty.
const rollBack = (paths, transactionRoot, journal) => {
  const { targets, directories } = resolveJournalPaths(paths, journal);

  for (let index = journal.steps.length - 1; index >= 0; index -= 1) {
    const step = journal.steps[index];
    const target = targets[index];
    const backup = path.join(transactionRoot, BACKUP_DIRNAME, String(index));
    if (step.existed) {
      if (entryPresent(backup)) {
        fs.renameSync(backup, target);
      }
    } else {
      fs.rmSync(target, { force: true });
    }
  }

  for (const directory of [...directories].reverse()) {
    try {
      fs.rmdirSync(directory);
    } catch {
      // Absent, or no longer empty: left as it is.
    }
  }

  fs.rmSync(transactionRoot, { recursive: true, force: true });
};

const readJournal = (transactionRoot) => {
  const journalPath = path.join(transactionRoot, LIFECYCLE_TRANSACTION_JOURNAL_FILENAME);
  if (!fs.existsSync(journalPath)) {
    return null;
  }

  let journal;
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  } catch (error) {
    throw new RegistryLifecycleError(`The lifecycle transaction journal is unreadable (${journalPath}): ${error.message}`);
  }

  const isValid =
    isPlainObject(journal) &&
    journal.schemaVersion === LIFECYCLE_TRANSACTION_SCHEMA_VERSION &&
    Array.isArray(journal.steps) &&
    journal.steps.length > 0 &&
    journal.steps.every((step) => isPlainObject(step) && typeof step.target === 'string' && typeof step.existed === 'boolean') &&
    Array.isArray(journal.createdDirectories) &&
    journal.createdDirectories.every((directory) => typeof directory === 'string') &&
    typeof journal.commitSha256 === 'string';
  if (!isValid) {
    throw new RegistryLifecycleError(
      `The lifecycle transaction journal is malformed (${journalPath}). Nothing was changed; inspect ${path.dirname(journalPath)} by hand.`,
    );
  }

  return journal;
};

// [5.2.11] cfg-registryLifecycle · Workflow · "recoverLifecycleTransaction"
// Returns null when no transaction directory exists, otherwise `{ outcome }` (spec §4.6 item 5).
export const recoverLifecycleTransaction = (paths) => {
  const transactionRoot = transactionRootOf(paths);
  if (!entryPresent(transactionRoot)) {
    return null;
  }
  assertContained(paths, transactionRoot);

  // The journal is renamed into place after staging and before the first commit step, so without
  // it nothing was committed.
  const journal = readJournal(transactionRoot);
  if (!journal) {
    fs.rmSync(transactionRoot, { recursive: true, force: true });
    return { outcome: LIFECYCLE_TRANSACTION_OUTCOMES.rolledBack };
  }

  const commitTarget = resolveJournalPaths(paths, journal).targets.at(-1);
  if (isFile(commitTarget) && sha256Hex(fs.readFileSync(commitTarget)) === journal.commitSha256) {
    fs.rmSync(transactionRoot, { recursive: true, force: true });
    return { outcome: LIFECYCLE_TRANSACTION_OUTCOMES.committed };
  }

  rollBack(paths, transactionRoot, journal);
  return { outcome: LIFECYCLE_TRANSACTION_OUTCOMES.rolledBack };
};

// [5.2.11] cfg-registryLifecycle · Workflow · "runLifecycleTransaction"
// `writes` is `[{ targetPath, contents }]` in commit order; the last one is the commit point
// (spec §4.6). `onStep(name)` is an internal test seam called at each step boundary.
export const runLifecycleTransaction = ({ paths, writes, onStep = () => {} }) => {
  if (!Array.isArray(writes) || writes.length === 0) {
    throw new Error('A lifecycle transaction needs at least one write.');
  }

  const transactionRoot = transactionRootOf(paths);
  const createdDirectories = [...new Set(writes.flatMap(({ targetPath }) => missingDirectories(paths, targetPath)))].sort(
    (left, right) => left.length - right.length || (left < right ? -1 : left > right ? 1 : 0),
  );
  for (const candidatePath of [paths.lifecycleRoot, transactionRoot, ...createdDirectories, ...writes.map((write) => write.targetPath)]) {
    assertContained(paths, candidatePath);
  }
  const journal = {
    schemaVersion: LIFECYCLE_TRANSACTION_SCHEMA_VERSION,
    steps: writes.map(({ targetPath }) => ({ target: toJournalPath(paths, targetPath), existed: targetExists(targetPath) })),
    createdDirectories: createdDirectories.map((directory) => toJournalPath(paths, directory)),
    commitSha256: sha256Hex(Buffer.from(writes.at(-1).contents)),
  };

  // Stage (spec §4.6 item 2). Exclusive creation: an existing directory is an interrupted
  // transaction, which the command recovers before starting a new one.
  try {
    fs.mkdirSync(transactionRoot);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new RegistryLifecycleError(
        `An interrupted lifecycle transaction exists (${transactionRoot}); it must be recovered first.`,
      );
    }
    throw error;
  }

  const stagedPath = (index) => path.join(transactionRoot, STAGED_DIRNAME, String(index));
  const backupPath = (index) => path.join(transactionRoot, BACKUP_DIRNAME, String(index));
  try {
    fs.mkdirSync(path.join(transactionRoot, STAGED_DIRNAME));
    fs.mkdirSync(path.join(transactionRoot, BACKUP_DIRNAME));
    writes.forEach(({ contents }, index) => fs.writeFileSync(stagedPath(index), contents));
    onStep('staged');
    const journalPath = path.join(transactionRoot, LIFECYCLE_TRANSACTION_JOURNAL_FILENAME);
    fs.writeFileSync(`${journalPath}.tmp`, `${JSON.stringify(journal, null, 2)}\n`);
    fs.renameSync(`${journalPath}.tmp`, journalPath);
    onStep('journaled');
  } catch (error) {
    if (!error?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
    }
    throw error;
  }

  // Commit, in order (spec §4.6 item 3). The last rename is the commit point.
  const lastIndex = writes.length - 1;
  try {
    for (const directory of createdDirectories) {
      fs.mkdirSync(directory);
    }
    onStep('directories-created');

    writes.forEach(({ targetPath }, index) => {
      if (journal.steps[index].existed) {
        fs.renameSync(targetPath, backupPath(index));
        onStep(`step-${index}:backed-up`);
      }
      fs.renameSync(stagedPath(index), targetPath);
      if (index < lastIndex) {
        onStep(`step-${index}:applied`);
      }
    });
  } catch (error) {
    if (error?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
      throw error;
    }

    try {
      rollBack(paths, transactionRoot, journal);
    } catch (rollbackError) {
      throw new RegistryLifecycleError(
        `A lifecycle write failed (${error.message}) and its rollback failed too (${rollbackError.message}). ` +
          `The transaction directory ${transactionRoot} is kept; the next writing lifecycle command recovers it.`,
      );
    }
    throw error;
  }

  // Committed: nothing after this point reports a failure. A directory that cannot be removed is a
  // committed transaction, which recovery recognizes by the commit point's bytes and only removes.
  try {
    onStep('committed');
    fs.rmSync(transactionRoot, { recursive: true, force: true });
  } catch (error) {
    if (error?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
      throw error;
    }
  }
};
