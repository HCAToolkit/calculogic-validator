import fs from 'node:fs';
import { assertAllowedFields } from '../../../src/core/registry-entry-shape.logic.mjs';

const CANONICAL_SEGMENT_INDEX_KEY = /^(0|[1-9][0-9]*)$/u;
const MISSING_ROLE_PATTERN_FIELDS = Object.freeze([
  'patternId',
  'dotSegments',
  'semanticSegmentIndex',
  'extensionSegmentIndexes',
  'literalSegmentConstraints',
  'compoundExtension',
]);

const toPositiveInteger = (value, label) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid missing-role patterns registry: ${label} must be a non-negative integer.`);
  }

  return value;
};

const canonicalizeExtensionSegmentIndexes = (indexes) => {
  if (!Array.isArray(indexes) || indexes.length === 0) {
    throw new Error(
      'Invalid missing-role patterns registry: extensionSegmentIndexes must be a non-empty array.',
    );
  }

  const deduped = new Set(indexes.map((index) => toPositiveInteger(index, 'extension segment index')));

  return [...deduped].sort((left, right) => left - right);
};

const canonicalizeLiteralSegmentConstraints = (literalSegmentConstraints = {}) => {
  if (
    !literalSegmentConstraints ||
    typeof literalSegmentConstraints !== 'object' ||
    Array.isArray(literalSegmentConstraints)
  ) {
    throw new Error(
      'Invalid missing-role patterns registry: literalSegmentConstraints must be an object when provided.',
    );
  }

  return Object.fromEntries(
    Object.entries(literalSegmentConstraints)
      .map(([segmentIndexRaw, literalValue]) => {
        // Index keys are plain decimal integers, so no two spellings ("01", "1e0") name one index.
        if (!CANONICAL_SEGMENT_INDEX_KEY.test(segmentIndexRaw)) {
          throw new Error(
            `Invalid missing-role patterns registry: literal segment index "${segmentIndexRaw}" must be a decimal integer without leading zeros.`,
          );
        }

        const segmentIndex = toPositiveInteger(Number(segmentIndexRaw), 'literal segment index');

        if (typeof literalValue !== 'string' || !literalValue.trim()) {
          throw new Error(
            'Invalid missing-role patterns registry: constrained literal values must be non-empty strings.',
          );
        }

        return [segmentIndex, literalValue.trim()];
      })
      .sort(([left], [right]) => left - right),
  );
};

const canonicalizeMissingRolePattern = (patternEntry) => {
  if (!patternEntry || typeof patternEntry !== 'object' || Array.isArray(patternEntry)) {
    throw new Error('Invalid missing-role patterns registry: each pattern must be an object.');
  }

  assertAllowedFields(patternEntry, MISSING_ROLE_PATTERN_FIELDS, {
    registryLabel: 'missing-role patterns',
    label: 'each pattern',
  });
  const patternId = typeof patternEntry.patternId === 'string' ? patternEntry.patternId.trim() : '';
  const dotSegments = toPositiveInteger(patternEntry.dotSegments, 'dotSegments');
  const semanticSegmentIndex = toPositiveInteger(
    patternEntry.semanticSegmentIndex,
    'semanticSegmentIndex',
  );
  const extensionSegmentIndexes = canonicalizeExtensionSegmentIndexes(
    patternEntry.extensionSegmentIndexes,
  );
  const literalSegmentConstraints = canonicalizeLiteralSegmentConstraints(
    patternEntry.literalSegmentConstraints,
  );

  if (!patternId) {
    throw new Error('Invalid missing-role patterns registry: patternId must be a non-empty string.');
  }

  if (semanticSegmentIndex >= dotSegments) {
    throw new Error(
      'Invalid missing-role patterns registry: semanticSegmentIndex must be inside dot segment bounds.',
    );
  }

  if (extensionSegmentIndexes.some((index) => index >= dotSegments)) {
    throw new Error(
      'Invalid missing-role patterns registry: extensionSegmentIndexes must be inside dot segment bounds.',
    );
  }

  const literalConstraintIndexes = Object.keys(literalSegmentConstraints).map(Number);
  if (literalConstraintIndexes.some((index) => index >= dotSegments)) {
    throw new Error(
      'Invalid missing-role patterns registry: literalSegmentConstraints must be inside dot segment bounds.',
    );
  }

  if (
    patternEntry.compoundExtension !== undefined &&
    (typeof patternEntry.compoundExtension !== 'string' || !patternEntry.compoundExtension.trim())
  ) {
    throw new Error(
      'Invalid missing-role patterns registry: compoundExtension must be a non-empty string when provided.',
    );
  }

  const compoundExtension =
    typeof patternEntry.compoundExtension === 'string'
      ? patternEntry.compoundExtension.trim()
      : extensionSegmentIndexes.map((index) => literalSegmentConstraints[index]).filter(Boolean).join('.');

  return {
    patternId,
    dotSegments,
    semanticSegmentIndex,
    extensionSegmentIndexes,
    literalSegmentConstraints,
    compoundExtension,
  };
};

export const loadMissingRolePatternsFromFile = (registryFilePath) => {
  const parsed = JSON.parse(fs.readFileSync(registryFilePath, 'utf8'));

  if (!Array.isArray(parsed?.missingRolePatterns)) {
    throw new Error(
      'Invalid missing-role patterns registry: expected missingRolePatterns array.',
    );
  }

  const patternsById = new Map();

  for (const patternEntry of parsed.missingRolePatterns) {
    const pattern = canonicalizeMissingRolePattern(patternEntry);
    // A repeated patternId is an authoring error, not a first-wins override (#41 lifecycle spec §9.3).
    if (patternsById.has(pattern.patternId)) {
      throw new Error(
        `Invalid missing-role patterns registry: patternId "${pattern.patternId}" is duplicated.`,
      );
    }

    patternsById.set(pattern.patternId, pattern);
  }

  return [...patternsById.values()];
};
