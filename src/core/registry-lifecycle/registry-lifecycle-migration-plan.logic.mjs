/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.16)
 * Responsibility: The migration plan (lifecycle spec §12.8): the plan for every `version-changed`
 *   registry, built by running its slice-declared path over the verified Baseline copy and the
 *   Custom registry, and the plan's check against the current state.
 * Invariants: read-only; never reads or changes the active set; never derives the migrated Baseline
 *   from Builtin and never advances a Baseline; a record is bound to its three inputs, its path and
 *   its results by digest; problems and summaries are deterministic, in ordinal order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { stableStringify } from '../validator-report-meta.logic.mjs';
import { digestRegistryPayload } from './registry-lifecycle-canonical-digest.logic.mjs';
import { walkComparisonEntries } from './registry-lifecycle-comparison.logic.mjs';
import { compareRegistryLifecycle, summarizeEntryDiff } from './registry-lifecycle-diff.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  assertMigrationDeclaration,
  descriptorForPayload,
  migrateRegistryPayload,
  migrationPath,
} from './registry-lifecycle-migration.logic.mjs';
import { SLICE_MIGRATION_TRANSFORMS } from './registry-lifecycle-slice-migrations.logic.mjs';
import {
  isLifecyclePathContained,
  readRegistrySetManifest,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import {
  MIGRATION_PLAN_DECISIONS,
  MIGRATION_PLAN_KIND,
  MIGRATION_PLAN_PROBLEMS as PROBLEMS,
  MIGRATION_PLAN_SCHEMA_VERSION,
  NOT_MIGRATABLE_REASONS as REASONS,
} from './registry-lifecycle.contracts.mjs';

const DOCUMENT_FIELDS = Object.freeze(['kind', 'registries', 'schemaVersion']);
// The plan's informative parts, which the check accepts and ignores.
const INFORMATIVE_DOCUMENT_FIELDS = Object.freeze(['notMigratable']);
const RECORD_FIELDS = Object.freeze(['basedOn', 'decision', 'fromVersion', 'path', 'registryId', 'result', 'toVersion']);
const INFORMATIVE_RECORD_FIELDS = Object.freeze(['preview']);
const BASED_ON_FIELDS = Object.freeze(['baselineDigest', 'builtinDigest', 'customDigest']);
const RESULT_FIELDS = Object.freeze(['baselineDigest', 'customDigest']);
const STEP_FIELDS = Object.freeze(['from', 'to', 'transform']);
const INPUT_LABELS = Object.freeze({ baselineDigest: 'baseline', builtinDigest: 'builtin', customDigest: 'custom' });

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

// True when `value` is a plain object with every `required` field and nothing beyond `optional`.
const hasFields = (value, required, optional = []) =>
  isPlainObject(value) &&
  required.every((field) => Object.hasOwn(value, field)) &&
  Object.keys(value).every((field) => required.includes(field) || optional.includes(field));

const transformsOf = (migrationTransforms, sliceId) =>
  Object.hasOwn(migrationTransforms, sliceId) ? migrationTransforms[sliceId] : {};

const toValues = (walked) => new Map(walked.map(({ address, value }) => [address, value]));

// [5.2.16] cfg-registryLifecycle · Derived value · "planRegistryMigration"
// One `version-changed` registry: its plan record, or why it cannot be migrated, by the reason
// precedence of spec §12.8. B0′ comes from the verified `.baseline/` copy, never from Builtin.
const planRegistryMigration = ({ paths, slice, entry, statusEntry, manifestEntry, transforms }) => {
  const registryId = entry.registryId;
  const notMigratable = (reason, detail) => ({ notMigratable: { registryId, reason, detail } });

  const builtinPayload = readJsonFile(path.join(slice.builtinRoot, entry.fileName));
  const fromVersion = manifestEntry.version;
  const toVersion = builtinPayload.version;
  // Without a path this release has no descriptor for the Baseline's version either, so the path
  // comes first: an unverifiable copy is not a mismatched one.
  const steps = migrationPath(entry, fromVersion, toVersion);
  if (!steps) {
    return notMigratable(
      REASONS.noMigrationPath,
      `No declared migration path leads from version ${JSON.stringify(fromVersion)} to version ${JSON.stringify(toVersion ?? null)}.`,
    );
  }

  const baselinePath = path.join(paths.baselineRoot, slice.sliceId, entry.fileName);
  const customPath = path.join(paths.customRoot, slice.sliceId, entry.fileName);
  // The assessment verified the copy and read the Custom file only when contained; both are read
  // here, so containment is checked again.
  if (statusEntry.baselineMismatch !== false || !isLifecyclePathContained(paths, baselinePath)) {
    return notMigratable(
      REASONS.baselineMismatch,
      'The .baseline copy is missing, resolves outside the validation target, or does not match its manifest digest.',
    );
  }
  if (statusEntry.classification === 'missing') {
    return notMigratable(REASONS.missing, 'Absent from the Custom set.');
  }
  if (statusEntry.customDigest === null || !isLifecyclePathContained(paths, customPath)) {
    return notMigratable(REASONS.invalid, statusEntry.detail ?? 'The Custom registry cannot be read.');
  }

  const baselinePayload = readJsonFile(baselinePath);
  const customPayload = readJsonFile(customPath);
  if (customPayload?.version !== fromVersion) {
    return notMigratable(
      REASONS.customVersionMismatch,
      `The Custom registry is at version ${JSON.stringify(customPayload?.version ?? null)}, the Baseline at ${JSON.stringify(fromVersion)}; both must take the same path.`,
    );
  }

  const baseline = migrateRegistryPayload({ entry, path: steps, transforms, payload: baselinePayload, label: 'Baseline' });
  if (baseline.failure) {
    return notMigratable(REASONS.transformFailed, baseline.failure);
  }
  const custom = migrateRegistryPayload({ entry, path: steps, transforms, payload: customPayload, label: 'Custom' });
  if (custom.failure) {
    return notMigratable(REASONS.transformFailed, custom.failure);
  }

  const summary = summarizeEntryDiff({
    baseline: toValues(baseline.walked),
    builtin: toValues(walkComparisonEntries(builtinPayload, entry)),
    custom: toValues(custom.walked),
  });
  return {
    record: {
      registryId,
      fromVersion,
      toVersion,
      path: steps.map(({ from, to, transform }) => ({ from, to, transform })),
      basedOn: {
        baselineDigest: statusEntry.baselineDigest,
        builtinDigest: statusEntry.builtinDigest,
        customDigest: statusEntry.customDigest,
      },
      result: {
        baselineDigest: digestRegistryPayload(baseline.payload, descriptorForPayload(entry, baseline.payload)),
        customDigest: digestRegistryPayload(custom.payload, descriptorForPayload(entry, custom.payload)),
      },
      preview: {
        class: summary.entries.length === 0 ? 'unchanged' : 'differs',
        ...summary,
        baseline: baseline.payload,
        custom: custom.payload,
      },
    },
  };
};

// [5.2.16] cfg-registryLifecycle · Workflow · "currentMigrations"
// The current plan records and not-migratable registries, with the comparison they come from. Every
// inventory entry's migration declaration is checked first, so an invalid declaration always fails.
const currentMigrations = ({ targetRoot, lifecycleRootOverride, registryIds, slices, migrationTransforms }) => {
  for (const slice of slices) {
    for (const entry of slice.inventory) {
      assertMigrationDeclaration(entry, transformsOf(migrationTransforms, slice.sliceId));
    }
  }

  const compared = compareRegistryLifecycle({ targetRoot, lifecycleRootOverride, registryIds, slices });
  if (!compared.comparison.customExists) {
    throw new Error('No Custom registry set exists. Run registry:init-custom first.');
  }

  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const located = new Map(slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, { slice, entry }])));
  const records = [];
  const notMigratable = [];
  // `version-changed` needs a readable manifest with an entry for the registry (spec §12.3).
  const manifestEntries = compared.comparison.registries.some((registry) => registry.class === 'version-changed')
    ? readRegistrySetManifest(paths).manifest.basedOn.registries
    : {};
  for (const registry of compared.comparison.registries) {
    if (registry.class !== 'version-changed') {
      continue;
    }

    const { slice, entry } = located.get(registry.registryId);
    const outcome = planRegistryMigration({
      paths,
      slice,
      entry,
      statusEntry: compared.statusById.get(registry.registryId),
      manifestEntry: manifestEntries[registry.registryId],
      transforms: transformsOf(migrationTransforms, slice.sliceId),
    });
    if (outcome.record) {
      records.push(outcome.record);
    } else {
      notMigratable.push(outcome.notMigratable);
    }
  }

  return { comparison: compared.comparison, records, notMigratable };
};

// [5.2.16] cfg-registryLifecycle · Workflow · "buildRegistryMigrationPlan"
// `registryIds` restricts the plan the same way it restricts `diff`. `migrationTransforms` maps each
// slice id to its transforms; it defaults to the slices' own (5.2.15).
export const buildRegistryMigrationPlan = ({
  targetRoot,
  lifecycleRootOverride,
  registryIds,
  slices = REGISTRY_LIFECYCLE_SLICES,
  migrationTransforms = SLICE_MIGRATION_TRANSFORMS,
} = {}) => {
  const { records, notMigratable } = currentMigrations({
    targetRoot,
    lifecycleRootOverride,
    registryIds,
    slices,
    migrationTransforms,
  });
  return {
    kind: MIGRATION_PLAN_KIND,
    schemaVersion: MIGRATION_PLAN_SCHEMA_VERSION,
    registries: records.map((record) => ({ ...record, decision: null })),
    notMigratable,
  };
};

const isStep = (step) => hasFields(step, STEP_FIELDS) && STEP_FIELDS.every((field) => typeof step[field] === 'string');
const isDigestOrNull = (value) => value === null || typeof value === 'string';

// Why a record does not have the plan's record shape, or null when it does.
const recordShapeProblem = (record) => {
  if (!hasFields(record, RECORD_FIELDS, INFORMATIVE_RECORD_FIELDS)) {
    const extra = isPlainObject(record)
      ? Object.keys(record).filter((field) => !RECORD_FIELDS.includes(field) && !INFORMATIVE_RECORD_FIELDS.includes(field))
      : [];
    return extra.length > 0
      ? `Unexpected field(s): ${extra.sort(compareOrdinal).join(', ')}.`
      : `A record has exactly the fields ${RECORD_FIELDS.join(', ')}, and may have preview.`;
  }
  if (typeof record.fromVersion !== 'string' || typeof record.toVersion !== 'string') {
    return '"fromVersion" and "toVersion" are version strings.';
  }
  if (!Array.isArray(record.path) || !record.path.every(isStep)) {
    return '"path" is a list of { from, to, transform } steps.';
  }
  if (!hasFields(record.basedOn, BASED_ON_FIELDS) || !BASED_ON_FIELDS.every((field) => isDigestOrNull(record.basedOn[field]))) {
    return '"basedOn" has exactly baselineDigest, builtinDigest and customDigest, each a digest or null.';
  }
  if (!hasFields(record.result, RESULT_FIELDS) || !RESULT_FIELDS.every((field) => typeof record.result[field] === 'string')) {
    return '"result" has exactly baselineDigest and customDigest, each a digest.';
  }
  return null;
};

// What changed since the record was made: its inputs and path, or, when they still match, its result.
const staleParts = (record, expected) => {
  const changed = BASED_ON_FIELDS.filter((field) => record.basedOn[field] !== expected.basedOn[field]).map(
    (field) => INPUT_LABELS[field],
  );
  if (
    record.fromVersion !== expected.fromVersion ||
    record.toVersion !== expected.toVersion ||
    stableStringify(record.path) !== stableStringify(expected.path)
  ) {
    changed.push('path');
  }
  if (changed.length > 0) {
    return changed;
  }

  return RESULT_FIELDS.some((field) => record.result[field] !== expected.result[field]) ? ['result'] : [];
};

const describeStale = (parts) =>
  parts[0] === 'result'
    ? 'Changed since the plan was made: result (the migration transforms now produce another payload).'
    : `Changed since the plan was made: ${parts.join(', ')}.`;

const compareProblems = (left, right) =>
  (left.registryId === right.registryId
    ? 0
    : left.registryId === null
      ? -1
      : right.registryId === null
        ? 1
        : compareOrdinal(left.registryId, right.registryId)) ||
  compareOrdinal(left.problem, right.problem) ||
  compareOrdinal(left.detail, right.detail);

// [5.2.16] cfg-registryLifecycle · Workflow · "checkRegistryMigrationPlan"
// Returns `{ valid, complete, problems, registries }`. Each record has at most one problem; a record
// with a problem is never summarized, so it can never read as accepted.
export const checkRegistryMigrationPlan = ({
  document,
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
  migrationTransforms = SLICE_MIGRATION_TRANSFORMS,
} = {}) => {
  const current = currentMigrations({ targetRoot, lifecycleRootOverride, slices, migrationTransforms });

  const problems = [];
  const problem = (code, detail, registryId = null) => {
    problems.push({ registryId, problem: code, detail });
  };
  const finish = (registries) => {
    const sortedProblems = problems.sort(compareProblems);
    const sortedRegistries = registries.sort((left, right) => compareOrdinal(left.registryId, right.registryId));
    return {
      valid: sortedProblems.length === 0,
      complete: sortedProblems.length === 0 && sortedRegistries.every((registry) => registry.accepted),
      problems: sortedProblems,
      registries: sortedRegistries,
    };
  };

  if (
    !hasFields(document, DOCUMENT_FIELDS, INFORMATIVE_DOCUMENT_FIELDS) ||
    document.kind !== MIGRATION_PLAN_KIND ||
    document.schemaVersion !== MIGRATION_PLAN_SCHEMA_VERSION ||
    !Array.isArray(document.registries)
  ) {
    const extra = isPlainObject(document)
      ? Object.keys(document).filter((field) => !DOCUMENT_FIELDS.includes(field) && !INFORMATIVE_DOCUMENT_FIELDS.includes(field))
      : [];
    problem(
      PROBLEMS.malformed,
      extra.length > 0
        ? `Unexpected field(s): ${extra.sort(compareOrdinal).join(', ')}.`
        : `The document is an object with "kind": "${MIGRATION_PLAN_KIND}", "schemaVersion": "${MIGRATION_PLAN_SCHEMA_VERSION}" and a "registries" array.`,
    );
    return finish([]);
  }

  const inventoryIds = new Set(slices.flatMap((slice) => slice.inventory.map((entry) => entry.registryId)));
  const expectedById = new Map(current.records.map((record) => [record.registryId, record]));
  const notMigratableById = new Map(current.notMigratable.map((item) => [item.registryId, item]));
  const classById = new Map(current.comparison.registries.map((registry) => [registry.registryId, registry.class]));
  const seenIds = new Set();
  const summaries = [];

  for (const record of document.registries) {
    if (!isPlainObject(record) || typeof record.registryId !== 'string') {
      problem(PROBLEMS.malformed, 'Every registry record needs a string "registryId".');
      continue;
    }

    const { registryId } = record;
    if (seenIds.has(registryId)) {
      problem(PROBLEMS.duplicateRegistry, 'The registry is listed more than once.', registryId);
      continue;
    }
    seenIds.add(registryId);

    if (!inventoryIds.has(registryId)) {
      problem(PROBLEMS.unknownRegistry, 'Not a current Builtin registry.', registryId);
      continue;
    }

    const shapeProblem = recordShapeProblem(record);
    if (shapeProblem) {
      problem(PROBLEMS.malformed, shapeProblem, registryId);
      continue;
    }

    const expected = expectedById.get(registryId);
    if (!expected) {
      const reason = notMigratableById.get(registryId);
      problem(
        PROBLEMS.notMigratable,
        reason
          ? `It cannot be migrated now (${reason.reason}): ${reason.detail}`
          : `Its current diff class is ${classById.get(registryId)}; there is nothing to migrate.`,
        registryId,
      );
      continue;
    }

    const stale = staleParts(record, expected);
    if (stale.length > 0) {
      problem(PROBLEMS.stale, describeStale(stale), registryId);
      continue;
    }

    if (record.decision !== null && record.decision !== MIGRATION_PLAN_DECISIONS.accept) {
      problem(
        PROBLEMS.unsupportedDecision,
        `The decision is null (undecided) or "${MIGRATION_PLAN_DECISIONS.accept}".`,
        registryId,
      );
      continue;
    }

    summaries.push({
      registryId,
      fromVersion: record.fromVersion,
      toVersion: record.toVersion,
      accepted: record.decision === MIGRATION_PLAN_DECISIONS.accept,
    });
  }

  return finish(summaries);
};
