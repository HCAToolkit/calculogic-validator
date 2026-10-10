/**
 * Naming agnostic-core-meanings registry shape validation (#41 registry lifecycle).
 *
 * The registry has no runtime consumer yet; this module owns its shape check so Naming's
 * registry-set validation entry point covers every Naming inventory registry (lifecycle spec §9.3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { assertAllowedFields } from '../../../src/core/registry-entry-shape.logic.mjs';

const AGNOSTIC_CORE_MEANINGS_REGISTRY_FILENAME = 'agnostic-core-meanings.registry.json';

// Naming's registry status vocabulary, shared with roles.
const ALLOWED_MEANING_STATUSES = new Set(['active', 'deprecated']);
const MEANING_FIELDS = Object.freeze(['meaning', 'definition', 'status']);

const fail = (message) => {
  throw new Error(`Invalid agnostic-core-meanings registry: ${message}`);
};

const assertNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
};

export const assertValidAgnosticCoreMeaningsRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('expected an object payload.');
  }

  if (!Array.isArray(payload.meanings) || payload.meanings.length === 0) {
    fail('expected a non-empty meanings array.');
  }

  const seenMeanings = new Set();
  payload.meanings.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`meanings[${index}] must be an object.`);
    }

    assertAllowedFields(entry, MEANING_FIELDS, { registryLabel: 'agnostic-core-meanings', label: `meanings[${index}]` });
    assertNonEmptyString(entry.meaning, `meanings[${index}].meaning`);
    assertNonEmptyString(entry.definition, `meanings[${index}].definition`);
    if (!ALLOWED_MEANING_STATUSES.has(entry.status)) {
      fail(`meanings[${index}].status must be "active" or "deprecated".`);
    }

    const meaning = entry.meaning.trim();
    if (seenMeanings.has(meaning)) {
      fail(`meanings[${index}].meaning "${meaning}" is duplicated.`);
    }

    seenMeanings.add(meaning);
  });

  return payload;
};

export const validateAgnosticCoreMeaningsRegistryFromRegistryRoot = (registryRoot) =>
  assertValidAgnosticCoreMeaningsRegistry(
    JSON.parse(fs.readFileSync(path.join(registryRoot, AGNOSTIC_CORE_MEANINGS_REGISTRY_FILENAME), 'utf8')),
  );
