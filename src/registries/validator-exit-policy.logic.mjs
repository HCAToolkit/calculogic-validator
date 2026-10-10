import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllowedFields } from '../core/registry-entry-shape.logic.mjs';

const MAX_PROCESS_EXIT_CODE = 255;

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXIT_POLICY_REGISTRY_FILENAME = 'exit-policy.registry.json';

const BUILTIN_EXIT_POLICY_REGISTRY_PATH = path.join(
  MODULE_DIR,
  '_builtin',
  EXIT_POLICY_REGISTRY_FILENAME,
);

const ALLOWED_PREDICATE_KEYS = new Set([
  'always',
  'strictMode',
  'anyWarnFindings',
  'noWarnFindings',
  'anyLegacyExceptionFindings',
]);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const loadJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const validatePredicateShape = (predicate, { policyId }) => {
  if (!isPlainObject(predicate)) {
    throw new Error(
      `Invalid exit policy registry: predicate for policy "${policyId}" must be an object.`,
    );
  }

  const predicateKeys = Object.keys(predicate);
  if (predicateKeys.length === 0) {
    throw new Error(
      `Invalid exit policy registry: predicate for policy "${policyId}" must declare at least one condition.`,
    );
  }

  for (const key of predicateKeys) {
    if (!ALLOWED_PREDICATE_KEYS.has(key)) {
      throw new Error(
        `Invalid exit policy registry: unsupported predicate key "${key}" in policy "${policyId}".`,
      );
    }

    if (typeof predicate[key] !== 'boolean') {
      throw new Error(
        `Invalid exit policy registry: predicate key "${key}" in policy "${policyId}" must be boolean.`,
      );
    }
  }

  // Matching treats a false condition as absent, so a predicate needs at least one true condition;
  // otherwise it would match every run.
  if (!predicateKeys.some((key) => predicate[key] === true)) {
    throw new Error(
      `Invalid exit policy registry: predicate for policy "${policyId}" must set at least one condition to true.`,
    );
  }

  // `always` matches before any other condition is read, so a true condition beside it is ignored.
  if (predicate.always === true && predicateKeys.some((key) => key !== 'always' && predicate[key] === true)) {
    throw new Error(
      `Invalid exit policy registry: predicate for policy "${policyId}" cannot combine always=true with other true conditions.`,
    );
  }
};

const canonicalizeExitPolicyEntry = (policyEntry) => {
  if (!isPlainObject(policyEntry)) {
    throw new Error('Invalid exit policy registry: each policy entry must be an object.');
  }

  assertAllowedFields(policyEntry, ['id', 'exitCode', 'predicate'], {
    registryLabel: 'exit policy',
    label: 'a policy entry',
  });
  const id = typeof policyEntry.id === 'string' ? policyEntry.id.trim() : '';
  if (!id) {
    throw new Error('Invalid exit policy registry: each policy entry requires a non-empty id.');
  }

  // A process exit status is portable only in 0–255; POSIX truncates larger values, so 256 would
  // exit as success.
  if (!Number.isInteger(policyEntry.exitCode) || policyEntry.exitCode < 0 || policyEntry.exitCode > MAX_PROCESS_EXIT_CODE) {
    throw new Error(
      `Invalid exit policy registry: exitCode for policy "${id}" must be an integer from 0 to ${MAX_PROCESS_EXIT_CODE}.`,
    );
  }

  validatePredicateShape(policyEntry.predicate, { policyId: id });

  return {
    id,
    exitCode: policyEntry.exitCode,
    predicate: {
      always: policyEntry.predicate.always === true,
      strictMode: policyEntry.predicate.strictMode === true,
      anyWarnFindings: policyEntry.predicate.anyWarnFindings === true,
      noWarnFindings: policyEntry.predicate.noWarnFindings === true,
      anyLegacyExceptionFindings: policyEntry.predicate.anyLegacyExceptionFindings === true,
    },
  };
};

export const loadExitPolicyRegistryFromPayload = (payload) => {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid exit policy registry: expected root object payload.');
  }

  if (!Array.isArray(payload.policies)) {
    throw new Error('Invalid exit policy registry: expected policies array.');
  }

  const canonicalPolicies = payload.policies.map((policyEntry) =>
    canonicalizeExitPolicyEntry(policyEntry),
  );

  if (canonicalPolicies.length === 0) {
    throw new Error('Invalid exit policy registry: policies array must not be empty.');
  }

  const dedupedPolicyIds = new Set();
  for (const policy of canonicalPolicies) {
    if (dedupedPolicyIds.has(policy.id)) {
      throw new Error(
        `Invalid exit policy registry: duplicate policy id "${policy.id}" is not allowed.`,
      );
    }

    dedupedPolicyIds.add(policy.id);
  }

  if (!canonicalPolicies.some((policy) => policy.predicate.always)) {
    throw new Error(
      'Invalid exit policy registry: policies must include a deterministic fallback predicate with always=true.',
    );
  }

  // Matching is a conjunction of the true conditions, evaluated first-to-last. A policy can never
  // match when it needs both anyWarnFindings and noWarnFindings, or when an earlier policy's true
  // conditions are a subset of its own (the earlier one matches every run this one would).
  const trueConditions = (policy) =>
    Object.keys(policy.predicate).filter((key) => key !== 'always' && policy.predicate[key] === true);
  canonicalPolicies.forEach((policy, index) => {
    if (policy.predicate.anyWarnFindings && policy.predicate.noWarnFindings) {
      throw new Error(
        `Invalid exit policy registry: policy "${policy.id}" requires both anyWarnFindings and noWarnFindings and can never match.`,
      );
    }

    if (policy.predicate.always) {
      return;
    }

    const conditions = trueConditions(policy);
    const shadowingPolicy = canonicalPolicies
      .slice(0, index)
      .find((earlier) => !earlier.predicate.always && trueConditions(earlier).every((key) => conditions.includes(key)));
    if (shadowingPolicy) {
      throw new Error(
        `Invalid exit policy registry: policy "${policy.id}" can never match, because earlier policy "${shadowingPolicy.id}" matches every run it would.`,
      );
    }
  });

  // Policies match first-to-last and always=true matches every run, so the fallback is the single
  // last policy; a policy after it would never be evaluated.
  const fallbackIndexes = canonicalPolicies
    .map((policy, index) => (policy.predicate.always ? index : -1))
    .filter((index) => index >= 0);
  if (fallbackIndexes.length !== 1 || fallbackIndexes[0] !== canonicalPolicies.length - 1) {
    throw new Error(
      'Invalid exit policy registry: exactly one always=true fallback policy is allowed, and it must be last.',
    );
  }

  return canonicalPolicies;
};

let cachedBuiltinExitPolicies = null;

const copyExitPolicies = (policies) =>
  policies.map((policy) => ({
    id: policy.id,
    exitCode: policy.exitCode,
    predicate: { ...policy.predicate },
  }));

// Loads exit policies from a resolved suite registry root (#41 registry lifecycle).
export const loadExitPoliciesFromRegistryRoot = (registryRoot) =>
  copyExitPolicies(
    loadExitPolicyRegistryFromPayload(loadJsonFile(path.join(registryRoot, EXIT_POLICY_REGISTRY_FILENAME))),
  );

export const getBuiltinExitPolicies = () => {
  if (!cachedBuiltinExitPolicies) {
    cachedBuiltinExitPolicies = loadExitPolicyRegistryFromPayload(
      loadJsonFile(BUILTIN_EXIT_POLICY_REGISTRY_PATH),
    );
  }

  return cachedBuiltinExitPolicies.map((policy) => ({
    id: policy.id,
    exitCode: policy.exitCode,
    predicate: { ...policy.predicate },
  }));
};
