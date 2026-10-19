/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.15)
 * Responsibility: Shape migration mechanics (lifecycle spec §8.3, §5): checks a slice's migration
 *   declaration against its transforms, names the descriptor of a payload's version, finds the one
 *   path between two versions and runs it.
 * Invariants: applies slice declarations only; never infers a default, a rename or a mapping, and
 *   never reads Builtin into a migrated payload; transforms receive deep-frozen copies and nothing
 *   else; deterministic.
 */
import { ComparisonExtractionError, walkComparisonEntries } from './registry-lifecycle-comparison.logic.mjs';

const STEP_FIELDS = Object.freeze(['from', 'fromDescriptor', 'to', 'transform']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// Versions and transform ids are written into the manifest as provenance (spec §4.3), which accepts
// only non-empty strings without surrounding whitespace.
const isProvenanceString = (value) => typeof value === 'string' && value.length > 0 && value === value.trim();
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const describeStep = (step) => `${JSON.stringify(step.from)} → ${JSON.stringify(step.to)}`;

const stepsOf = (entry) => entry.migrations ?? [];

// [5.2.15] cfg-registryLifecycle · Primitive · "assertMigrationDeclaration"
// Every step is `{ from, to, transform, fromDescriptor }`, its transform an own function of the
// slice's `transforms`; no two steps leave one version; and the chain from every declared version
// ends, without a cycle, at a readable version (spec §8.3). Throws on anything else: a declaration is
// slice code, so an invalid one is a programming error.
export const assertMigrationDeclaration = (entry, transforms = {}) => {
  const fail = (detail) => {
    throw new Error(`Registry ${entry.registryId} has a malformed migration declaration: ${detail}`);
  };
  const steps = stepsOf(entry);
  if (!Array.isArray(steps)) {
    fail('it must be a list.');
  }

  const stepByFrom = new Map();
  for (const step of steps) {
    const fields = isPlainObject(step) ? Object.keys(step).sort(compareOrdinal) : [];
    if (fields.join() !== STEP_FIELDS.join()) {
      fail(`${JSON.stringify(step)} must be { from, to, transform, fromDescriptor } and nothing else.`);
    }
    if (!isProvenanceString(step.from) || !isProvenanceString(step.to) || step.from === step.to) {
      fail(`step ${describeStep(step)} needs two different non-empty version strings without surrounding whitespace.`);
    }
    if (!isProvenanceString(step.transform)) {
      fail(`step ${describeStep(step)} needs a non-empty transform id without surrounding whitespace.`);
    }
    if ( !Object.hasOwn(transforms, step.transform) || typeof transforms[step.transform] !== 'function') {
      fail(`step ${describeStep(step)} names transform ${JSON.stringify(step.transform)}, which the slice does not provide.`);
    }
    if (!isPlainObject(step.fromDescriptor)) {
      fail(`step ${describeStep(step)} needs the canonical-form descriptor of version ${JSON.stringify(step.from)}.`);
    }
    if (stepByFrom.has(step.from)) {
      fail(`more than one step leaves version ${JSON.stringify(step.from)}, so its path is ambiguous.`);
    }
    stepByFrom.set(step.from, step);
  }

  for (const start of stepByFrom.keys()) {
    const visited = new Set([start]);
    let version = stepByFrom.get(start).to;
    while (stepByFrom.has(version)) {
      if (visited.has(version)) {
        fail(`the steps from version ${JSON.stringify(start)} form a cycle.`);
      }
      visited.add(version);
      version = stepByFrom.get(version).to;
    }
    if (!entry.readableVersions.includes(version)) {
      fail(
        `the chain from version ${JSON.stringify(start)} ends at version ${JSON.stringify(version)}, which is not readable (readable: ${entry.readableVersions.join(', ')}).`,
      );
    }
  }
};

// [5.2.15] cfg-registryLifecycle · Primitive · "descriptorForPayload"
// The canonical-form descriptor of the payload's own `version` (spec §5): the `fromDescriptor` of the
// step that leaves that version, otherwise the registry's descriptor.
export const descriptorForPayload = (entry, payload) => {
  const version = isPlainObject(payload) ? payload.version : undefined;
  return stepsOf(entry).find((step) => step.from === version)?.fromDescriptor ?? entry.descriptor;
};

// [5.2.15] cfg-registryLifecycle · Primitive · "isVersionDescribed"
// Whether this release has a canonical-form descriptor for payloads at `version`: a readable version,
// or one a declared step leaves (spec §5, §8.3). A copy at any other version cannot be verified.
export const isVersionDescribed = (entry, version) =>
  entry.readableVersions.includes(version) || stepsOf(entry).some((step) => step.from === version);

// [5.2.15] cfg-registryLifecycle · Primitive · "migrationPath"
// The steps from `fromVersion` up to `toVersion` along the one declared chain, or null when the chain
// does not lead there (spec §8.3).
export const migrationPath = (entry, fromVersion, toVersion) => {
  const steps = stepsOf(entry);
  const stepByFrom = new Map(steps.map((step) => [step.from, step]));
  const path = [];
  let version = fromVersion;
  while (version !== toVersion) {
    const step = stepByFrom.get(version);
    if (!step || path.length === steps.length) {
      return null;
    }
    path.push(step);
    version = step.to;
  }

  return path.length > 0 ? path : null;
};

// [5.2.15] cfg-registryLifecycle · Primitive · "deepFreeze"
// Freezes a parsed JSON value in place, so a slice-owned function handed it cannot change it.
// Migration transforms and reference resolvers receive their payload this way.
export const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

// Why a transform's output is not plain JSON, or null when it is.
const jsonProblem = (value, at = '$', ancestors = new Set()) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : `a non-finite number at ${at}`;
  }
  if (typeof value !== 'object') {
    return `a value of type ${typeof value} at ${at}`;
  }
  if (ancestors.has(value)) {
    return `a cycle at ${at}`;
  }

  const inner = new Set([...ancestors, value]);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const problem = jsonProblem(value[index], `${at}[${index}]`, inner);
      if (problem) {
        return problem;
      }
    }
    return null;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return `a non-plain object at ${at}`;
  }
  for (const key of Object.keys(value)) {
    const problem = jsonProblem(value[key], `${at}[${JSON.stringify(key)}]`, inner);
    if (problem) {
      return problem;
    }
  }
  return null;
};

// [5.2.15] cfg-registryLifecycle · Workflow · "runMigrationPath"
// Runs each step's slice-owned transform on a deep-frozen copy of the previous payload (spec §8.3).
// Returns `{ payload }`, or `{ failure: { step, detail } }` when a transform throws (an attempted
// mutation included) or returns anything but a plain JSON object at the step's `to` version.
export const runMigrationPath = (path, transforms, payload) => {
  let current = payload;
  for (const step of path) {
    const transform = Object.hasOwn(transforms, step.transform) ? transforms[step.transform] : undefined;
    if (typeof transform !== 'function') {
      return { failure: { step, detail: `the slice provides no transform ${JSON.stringify(step.transform)}.` } };
    }

    let output;
    try {
      output = transform(deepFreeze(structuredClone(current)));
    } catch (error) {
      return { failure: { step, detail: `the transform threw: ${error?.message ?? String(error)}` } };
    }

    const problem = jsonProblem(output);
    if (problem) {
      return { failure: { step, detail: `the transform returned ${problem}, which is not plain JSON.` } };
    }
    if (!isPlainObject(output)) {
      return { failure: { step, detail: 'the transform did not return an object.' } };
    }
    if (output.version !== step.to) {
      return {
        failure: {
          step,
          detail: `the transform returned version ${JSON.stringify(output.version ?? null)}, not ${JSON.stringify(step.to)}.`,
        },
      };
    }
    current = output;
  }

  return { payload: structuredClone(current) };
};

const describeStepFor = (step) =>
  `step ${JSON.stringify(step.from)} → ${JSON.stringify(step.to)} (transform ${JSON.stringify(step.transform)})`;

// [5.2.15] cfg-registryLifecycle · Workflow · "migrateRegistryPayload"
// One input (`label`: Baseline or Custom) along the path, then its comparison entries under the
// registry's current declaration (spec §8.3 "Running a path"). Returns `{ payload, walked }`, or
// `{ failure }`, the detail of a `transform-failed` reason. The migration plan and `migrate` both
// run inputs through it, so what is applied is exactly what was planned.
export const migrateRegistryPayload = ({ entry, path, transforms, payload, label }) => {
  const run = runMigrationPath(path, transforms, payload);
  if (run.failure) {
    return { failure: `The ${label} input: ${describeStepFor(run.failure.step)}: ${run.failure.detail}` };
  }

  try {
    return { payload: run.payload, walked: walkComparisonEntries(run.payload, entry) };
  } catch (error) {
    if (error instanceof ComparisonExtractionError) {
      return { failure: `The migrated ${label} payload has no valid comparison entries: ${error.message}` };
    }
    throw error;
  }
};
