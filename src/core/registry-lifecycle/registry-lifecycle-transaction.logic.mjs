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
// Rollback progress: `rolling-back/<i>` is written before step `i` is undone, so an interrupted
// rollback can be resumed (spec §4.6 item 5).
const ROLLING_BACK_DIRNAME = 'rolling-back';

// [5.2.11] cfg-registryLifecycle · Primitive · "LIFECYCLE_TRANSACTION_SIMULATED_CRASH"
// Internal, for tests only: an error carrying this key stops the transaction where it is, without
// rollback, as a killed process would. Never consumer-facing.
export const LIFECYCLE_TRANSACTION_SIMULATED_CRASH = Symbol('lifecycleTransactionSimulatedCrash');

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const transactionRootOf = (paths) => path.join(paths.lifecycleRoot, LIFECYCLE_TRANSACTION_DIRNAME);

const RETIRED_PREFIX = `${LIFECYCLE_TRANSACTION_DIRNAME}-retired-`;
// `fs.mkdtempSync` appends six characters to the prefix.
const RETIRED_NAME_PATTERN = new RegExp(`^${RETIRED_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}[A-Za-z0-9]{6}$`, 'u');

// Retires the transaction directory: one atomic rename takes it out of recovery's view, then the
// retired copy is deleted. Recursive deletion is not atomic, so deleting in place could remove the
// journal and fail on another entry, leaving a directory recovery would misread as uncommitted.
// A retired copy that cannot be deleted is harmless and is swept by the next recovery.
const retireTransactionDirectory = (paths, transactionRoot) => {
  const retiredRoot = fs.mkdtempSync(path.join(paths.lifecycleRoot, RETIRED_PREFIX));
  fs.renameSync(transactionRoot, path.join(retiredRoot, LIFECYCLE_TRANSACTION_DIRNAME));
  try {
    fs.rmSync(retiredRoot, { recursive: true, force: true });
  } catch {
    // Left for the next sweep.
  }
};

const sweepRetiredTransactionDirectories = (paths) => {
  let names = [];
  try {
    names = fs.readdirSync(paths.lifecycleRoot);
  } catch {
    return;
  }
  // Only entries `retireTransactionDirectory` produced are removed: the exact generated name, an
  // ordinary directory, holding nothing but (what is left of) the retired transaction directory.
  // Anything else that merely shares the prefix is left alone.
  for (const name of names.filter((entry) => RETIRED_NAME_PATTERN.test(entry))) {
    const retiredRoot = path.join(paths.lifecycleRoot, name);
    try {
      const stats = fs.lstatSync(retiredRoot);
      const contents = stats.isDirectory() ? fs.readdirSync(retiredRoot) : null;
      if (!contents || contents.some((entry) => entry !== LIFECYCLE_TRANSACTION_DIRNAME)) {
        continue;
      }
      fs.rmSync(retiredRoot, { recursive: true, force: true });
    } catch {
      // Left for a later sweep.
    }
  }
};

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
  // Only a regular file or a symlink can be backed up and restored (spec §4.6 item 3).
  if (!stats.isFile() && !stats.isSymbolicLink()) {
    throw new RegistryLifecycleError(
      `A lifecycle write target is neither a file nor a symlink (${targetPath}); nothing was written.`,
    );
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

// The missing ancestors of `filePath` below the lifecycle root, shallowest first. The nearest
// existing ancestor must be a directory (a symlink to one is checked by containment): anything
// else would fail the commit after the journal is installed, so it is refused before staging.
const missingDirectories = (paths, filePath) => {
  const missing = [];
  for (let directory = path.dirname(filePath); directory !== paths.lifecycleRoot; directory = path.dirname(directory)) {
    if (entryPresent(directory)) {
      let isDirectory = false;
      try {
        isDirectory = fs.statSync(directory).isDirectory();
      } catch {
        // A dangling link: not a directory.
      }
      if (!isDirectory) {
        throw new RegistryLifecycleError(
          `A lifecycle write target's parent is not a directory (${directory}); nothing was written.`,
        );
      }
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

// The transaction directory and its `backup/` must be ordinary directories the transaction created:
// a symlink there would make a restore move a file from wherever it points (spec §4.1, §4.6).
const assertOwnedDirectory = (paths, directoryPath) => {
  let stats;
  try {
    stats = fs.lstatSync(directoryPath);
  } catch {
    stats = null;
  }
  if (!stats?.isDirectory() || stats.isSymbolicLink() || !isLifecyclePathContained(paths, directoryPath)) {
    throw new RegistryLifecycleError(
      `The lifecycle transaction directory ${directoryPath} is not an ordinary directory inside the validation target. Nothing was changed; inspect it by hand.`,
    );
  }
};

// Undoes the journaled steps in reverse (spec §4.6 item 4). A step whose backup is present is
// restored; a target that did not exist is removed; created directories are removed when empty.
// The transaction directory holds exactly what the transaction wrote: `staged/` with one regular
// file per step not yet applied, `backup/` with the moved original (a file or a symlink, never a
// directory) of steps that replaced an existing entry, and `journal.json`. Any other entry, type
// or name means the directory was altered, so nothing in it is trusted for a rollback.
const assertTransactionShape = (paths, transactionRoot, journal) => {
  const altered = (detail) => {
    throw new RegistryLifecycleError(
      `The lifecycle transaction directory was altered (${detail}). Nothing was changed; inspect ${transactionRoot} by hand.`,
    );
  };
  const stagedRoot = path.join(transactionRoot, STAGED_DIRNAME);
  const backupRoot = path.join(transactionRoot, BACKUP_DIRNAME);
  // Both are created before the journal is published, so a journaled transaction lacks neither.
  assertOwnedDirectory(paths, stagedRoot);
  assertOwnedDirectory(paths, backupRoot);

  const allowedTopLevel = new Set([STAGED_DIRNAME, BACKUP_DIRNAME, ROLLING_BACK_DIRNAME, LIFECYCLE_TRANSACTION_JOURNAL_FILENAME]);
  for (const name of fs.readdirSync(transactionRoot)) {
    if (!allowedTopLevel.has(name)) {
      altered(`unexpected entry ${name}`);
    }
  }

  const stepIndex = (name) => (/^(0|[1-9][0-9]*)$/u.test(name) && Number(name) < journal.steps.length ? Number(name) : null);
  for (const name of fs.readdirSync(stagedRoot)) {
    if (stepIndex(name) === null || !fs.lstatSync(path.join(stagedRoot, name)).isFile()) {
      altered(`staged/${name}`);
    }
  }
  const rollingBackRoot = path.join(transactionRoot, ROLLING_BACK_DIRNAME);
  if (entryPresent(rollingBackRoot)) {
    assertOwnedDirectory(paths, rollingBackRoot);
    for (const name of fs.readdirSync(rollingBackRoot)) {
      if (stepIndex(name) === null || !fs.lstatSync(path.join(rollingBackRoot, name)).isFile()) {
        altered(`${ROLLING_BACK_DIRNAME}/${name}`);
      }
    }
  }
  for (const name of fs.readdirSync(backupRoot)) {
    const index = stepIndex(name);
    const stats = fs.lstatSync(path.join(backupRoot, name));
    if (index === null || !journal.steps[index].existed || !(stats.isFile() || stats.isSymbolicLink())) {
      altered(`backup/${name}`);
    }
  }
};

const rollBack = (paths, transactionRoot, journal, onStep = () => {}) => {
  const { targets, directories } = resolveJournalPaths(paths, journal);
  assertOwnedDirectory(paths, transactionRoot);
  assertTransactionShape(paths, transactionRoot, journal);
  const backupRoot = path.join(transactionRoot, BACKUP_DIRNAME);

  // Every step must be in one state its own commit sequence can produce (spec §4.6 item 5):
  // - replacing an existing entry: unstarted (target and `staged/<i>`, no backup), backed up
  //   (`backup/<i>` and `staged/<i>`, no target) or applied (`backup/<i>` and target, no staged);
  // - creating a new entry: unstarted (`staged/<i>`, no target) or applied (target, no staged).
  // Any other combination means an original was lost or something else appeared at a target, so
  // a rollback could not restore the pre-command state. Checked for every step first.
  // A step marked in `rolling-back/` may also already be undone: a replaced entry restored (target,
  // no backup) or a created entry removed (no target).
  const rollingBackRoot = path.join(transactionRoot, ROLLING_BACK_DIRNAME);
  journal.steps.forEach((step, index) => {
    const backup = entryPresent(path.join(backupRoot, String(index)));
    const staged = entryPresent(path.join(transactionRoot, STAGED_DIRNAME, String(index)));
    const target = entryPresent(targets[index]);
    const undone = entryPresent(path.join(rollingBackRoot, String(index))) && (step.existed ? !backup && target : !target);
    const consistent =
      undone ||
      (step.existed
        ? (!backup && target && staged) || (backup && !target && staged) || (backup && target && !staged)
        : !backup && target !== staged);
    if (!consistent) {
      throw new RegistryLifecycleError(
        `The lifecycle transaction step for ${step.target} is in a state its commit cannot produce; it cannot be rolled back. Nothing was changed; inspect ${transactionRoot} by hand.`,
      );
    }
  });

  // Undoing a step is idempotent, so a resumed rollback simply repeats the marked steps.
  fs.mkdirSync(rollingBackRoot, { recursive: true });
  for (let index = journal.steps.length - 1; index >= 0; index -= 1) {
    const step = journal.steps[index];
    const target = targets[index];
    const backup = path.join(backupRoot, String(index));
    fs.writeFileSync(path.join(rollingBackRoot, String(index)), '');
    if (step.existed) {
      if (entryPresent(backup)) {
        fs.renameSync(backup, target);
      }
    } else {
      fs.rmSync(target, { force: true });
    }
    onStep(`rollback-step-${index}:done`);
  }

  for (const directory of [...directories].reverse()) {
    try {
      fs.rmdirSync(directory);
    } catch {
      // Absent, or no longer empty: left as it is.
    }
  }

  retireTransactionDirectory(paths, transactionRoot);
};

const readJournal = (transactionRoot) => {
  const journalPath = path.join(transactionRoot, LIFECYCLE_TRANSACTION_JOURNAL_FILENAME);
  if (!entryPresent(journalPath)) {
    return null;
  }
  // Only the journal the transaction wrote is trusted: a symlink, even a dangling one, is refused,
  // never followed and never taken for "no journal".
  if (!fs.lstatSync(journalPath).isFile()) {
    throw new RegistryLifecycleError(
      `The lifecycle transaction journal is not an ordinary file (${journalPath}). Nothing was changed; inspect ${transactionRoot} by hand.`,
    );
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
    typeof journal.commitSha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(journal.commitSha256);
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
  sweepRetiredTransactionDirectories(paths);
  const transactionRoot = transactionRootOf(paths);
  if (!entryPresent(transactionRoot)) {
    return null;
  }
  assertOwnedDirectory(paths, transactionRoot);

  // The journal is renamed into place after staging and before the first commit step, so without
  // it nothing was committed.
  const journal = readJournal(transactionRoot);
  if (!journal) {
    retireTransactionDirectory(paths, transactionRoot);
    return { outcome: LIFECYCLE_TRANSACTION_OUTCOMES.rolledBack };
  }

  // Journal paths, then the directory's shape, are checked before the commit point is read, for
  // both outcomes (spec §4.6 item 5).
  const commitTarget = resolveJournalPaths(paths, journal).targets.at(-1);
  assertTransactionShape(paths, transactionRoot, journal);
  if (isFile(commitTarget) && sha256Hex(fs.readFileSync(commitTarget)) === journal.commitSha256) {
    // A committed transaction applied every step: nothing is left in `staged/`, and every step that
    // replaced an existing entry has its backup. Anything else was altered after the fact.
    const stagedLeft = fs.readdirSync(path.join(transactionRoot, STAGED_DIRNAME));
    const backupMissing = journal.steps.some(
      (step, index) => step.existed && !entryPresent(path.join(transactionRoot, BACKUP_DIRNAME, String(index))),
    );
    const rollingBack = entryPresent(path.join(transactionRoot, ROLLING_BACK_DIRNAME));
    // Every target was written by renaming a regular staged file into place.
    const targetMissing = resolveJournalPaths(paths, journal).targets.some((target) => !isFile(target));
    if (stagedLeft.length > 0 || backupMissing || rollingBack || targetMissing) {
      throw new RegistryLifecycleError(
        `The lifecycle transaction directory was altered (it does not match a committed transaction). Nothing was changed; inspect ${transactionRoot} by hand.`,
      );
    }
    retireTransactionDirectory(paths, transactionRoot);
    return { outcome: LIFECYCLE_TRANSACTION_OUTCOMES.committed };
  }

  // The commit point's staged copy is consumed exactly when the commit point is applied. Consumed,
  // yet the commit point does not hold the journaled bytes: the journal or the target was altered,
  // and a rollback would undo a committed transaction.
  const commitStaged = path.join(transactionRoot, STAGED_DIRNAME, String(journal.steps.length - 1));
  if (!entryPresent(commitStaged)) {
    throw new RegistryLifecycleError(
      `The lifecycle transaction directory was altered (the commit point was applied but does not hold the journaled bytes). Nothing was changed; inspect ${transactionRoot} by hand.`,
    );
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
      retireTransactionDirectory(paths, transactionRoot);
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
      rollBack(paths, transactionRoot, journal, onStep);
    } catch (rollbackError) {
      if (rollbackError?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
        throw rollbackError;
      }
      throw new RegistryLifecycleError(
        `A lifecycle write failed (${error.message}) and its rollback failed too (${rollbackError.message}). ` +
          `The transaction directory ${transactionRoot} is kept; the next writing lifecycle command recovers it.`,
      );
    }
    throw error;
  }

  // Committed: nothing after this point reports a failure. A directory that cannot be retired is a
  // committed transaction, which recovery recognizes by the commit point's bytes and only retires.
  try {
    onStep('committed');
    retireTransactionDirectory(paths, transactionRoot);
  } catch (error) {
    if (error?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
      throw error;
    }
  }
};
