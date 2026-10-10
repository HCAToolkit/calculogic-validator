import fs from 'node:fs';
import { assertAllowedFields } from '../../../src/core/registry-entry-shape.logic.mjs';
import {
  NAMING_DECISION_OUTCOME_IDS,
  NAMING_FINDING_CLASSIFICATIONS,
  NAMING_FINDING_SEVERITIES,
} from '../naming-validator.contracts.mjs';

const REQUIRED_KEYS = ['code', 'severity', 'classification', 'message', 'ruleRef'];
const ENTRY_FIELDS = Object.freeze([...REQUIRED_KEYS, 'suggestedFix']);

const assertNonEmptyString = (value, fieldName) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid finding-policy registry: ${fieldName} must be a non-empty string.`);
  }

  return value.trim();
};

const canonicalizeEntry = (entry, outcomeId) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(
      `Invalid finding-policy registry: outcome "${outcomeId}" must map to an object.`,
    );
  }

  assertAllowedFields(entry, ENTRY_FIELDS, { registryLabel: 'finding-policy', label: `outcome "${outcomeId}"` });

  const canonicalEntry = Object.fromEntries(
    REQUIRED_KEYS.map((key) => [key, assertNonEmptyString(entry[key], `${outcomeId}.${key}`)]),
  );

  if (entry.suggestedFix !== undefined) {
    canonicalEntry.suggestedFix = assertNonEmptyString(
      entry.suggestedFix,
      `${outcomeId}.suggestedFix`,
    );
  }

  return canonicalEntry;
};

export const loadFindingPolicyFromFile = (registryFilePath) => {
  const parsed = JSON.parse(fs.readFileSync(registryFilePath, 'utf8'));

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid finding-policy registry: expected object payload.');
  }

  if (!parsed.outcomes || typeof parsed.outcomes !== 'object' || Array.isArray(parsed.outcomes)) {
    throw new Error('Invalid finding-policy registry: expected outcomes object.');
  }

  const entries = Object.entries(parsed.outcomes);
  if (entries.length === 0) {
    throw new Error('Invalid finding-policy registry: outcomes must not be empty.');
  }

  // Outcome ids compare trimmed; two ids that trim alike would leave the surviving policy to JSON
  // property order, which the canonical digest ignores.
  const seenOutcomeIds = new Set();
  const findingPolicy = Object.fromEntries(
    entries
      .map(([outcomeId, entry]) => {
        const canonicalOutcomeId = assertNonEmptyString(outcomeId, 'outcome id');
        if (seenOutcomeIds.has(canonicalOutcomeId)) {
          throw new Error(`Invalid finding-policy registry: outcome id "${canonicalOutcomeId}" is duplicated.`);
        }

        seenOutcomeIds.add(canonicalOutcomeId);
        return [canonicalOutcomeId, canonicalizeEntry(entry, canonicalOutcomeId)];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  // The runtime looks policies up by the outcomes it emits, so any other outcome id is never read.
  const knownOutcomeIds = Object.values(NAMING_DECISION_OUTCOME_IDS);
  const unknownOutcomeIds = Object.keys(findingPolicy)
    .filter((outcomeId) => !knownOutcomeIds.includes(outcomeId))
    .sort();
  if (unknownOutcomeIds.length > 0) {
    throw new Error(`Invalid finding-policy registry: unknown outcomes ${unknownOutcomeIds.join(', ')}.`);
  }

  // Every outcome the runtime emits needs a policy, and severities follow the report schema.
  const missingOutcomeIds = Object.values(NAMING_DECISION_OUTCOME_IDS)
    .filter((outcomeId) => !Object.hasOwn(findingPolicy, outcomeId))
    .sort();
  if (missingOutcomeIds.length > 0) {
    throw new Error(`Invalid finding-policy registry: missing outcomes ${missingOutcomeIds.join(', ')}.`);
  }

  for (const [outcomeId, policy] of Object.entries(findingPolicy)) {
    if (!NAMING_FINDING_SEVERITIES.includes(policy.severity)) {
      throw new Error(
        `Invalid finding-policy registry: ${outcomeId}.severity must be one of ${NAMING_FINDING_SEVERITIES.join(', ')}.`,
      );
    }

    if (!NAMING_FINDING_CLASSIFICATIONS.includes(policy.classification)) {
      throw new Error(
        `Invalid finding-policy registry: ${outcomeId}.classification must be one of ${NAMING_FINDING_CLASSIFICATIONS.join(', ')}.`,
      );
    }
  }

  return findingPolicy;
};
