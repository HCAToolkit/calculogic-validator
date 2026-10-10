import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAMING_CONFIGURABLE_SECONDARY_BUCKET_FAMILIES } from '../naming-validator.contracts.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_SUMMARY_BUCKETS_REGISTRY_PATH = fileURLToPath(
  new URL('summary-buckets.registry.json', BUILTIN_REGISTRY_ROOT),
);

let cachedBuiltinSummaryBuckets = null;

const ensureStringArray = (value, fieldName) => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid summary-buckets registry: missing ${fieldName} array.`);
  }

  const seen = new Set();
  const normalized = [];

  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(
        `Invalid summary-buckets registry: ${fieldName}[${index}] must be a non-empty string.`,
      );
    }

    if (!seen.has(entry)) {
      seen.add(entry);
      normalized.push(entry);
    }
  });

  return normalized;
};

export const loadSummaryBucketsFromFile = (registryPath) => {
  const payload = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid summary-buckets registry: expected object payload.');
  }

  const secondaryBucketFamilies = ensureStringArray(payload.secondaryBucketFamilies, 'secondaryBucketFamilies');
  // The summary reports only the families it knows how to count; another family would be ignored.
  const configurableFamilies = Object.values(NAMING_CONFIGURABLE_SECONDARY_BUCKET_FAMILIES);
  const unknownFamilies = secondaryBucketFamilies.filter((family) => !configurableFamilies.includes(family)).sort();
  if (unknownFamilies.length > 0) {
    throw new Error(
      `Invalid summary-buckets registry: unsupported secondaryBucketFamilies ${unknownFamilies.join(', ')}; supported: ${configurableFamilies.join(', ')}.`,
    );
  }

  return {
    classificationBuckets: ensureStringArray(payload.classificationBuckets, 'classificationBuckets'),
    secondaryBucketFamilies,
  };
};

export const getBuiltinSummaryBuckets = () => {
  if (cachedBuiltinSummaryBuckets === null) {
    cachedBuiltinSummaryBuckets = loadSummaryBucketsFromFile(BUILTIN_SUMMARY_BUCKETS_REGISTRY_PATH);
  }

  return cachedBuiltinSummaryBuckets;
};
