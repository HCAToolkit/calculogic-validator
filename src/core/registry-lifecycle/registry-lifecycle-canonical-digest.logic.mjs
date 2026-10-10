/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md
 * Responsibility: Comparison canonicalization and digests of registry payloads (spec §5).
 * Invariants: descriptor-driven only; never interprets registry meaning; output is used solely for
 *   digests and equality and is never handed to slices as runtime input.
 */
import { sha256Hex, stableStringify } from '../validator-report-meta.logic.mjs';

const ARRAY_ELEMENT_SEGMENT = '[]';
const ANY_KEY_SEGMENT = '*';

// Descriptor paths use dot-separated segments: an object key, `*` for any object key, and a
// trailing `[]` on a segment for "each element of this array", e.g. `roles[].notes` or
// `rolesByCategory.*`.
const parseDescriptorPath = (descriptorPath) =>
  descriptorPath.split('.').flatMap((segment) =>
    segment.endsWith(ARRAY_ELEMENT_SEGMENT)
      ? [segment.slice(0, -ARRAY_ELEMENT_SEGMENT.length), ARRAY_ELEMENT_SEGMENT]
      : [segment],
  );

const pathMatches = (patternSegments, pathSegments) =>
  patternSegments.length === pathSegments.length &&
  patternSegments.every(
    (patternSegment, index) =>
      patternSegment === pathSegments[index] ||
      (patternSegment === ANY_KEY_SEGMENT && pathSegments[index] !== ARRAY_ELEMENT_SEGMENT),
  );

const isEmptyOptionalValue = (value) =>
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

const compileDescriptor = (descriptor = {}) => ({
  setLike: (descriptor.setLike ?? []).map((entry) => ({
    segments: parseDescriptorPath(entry.path),
    key: entry.key,
  })),
  omitEmpty: (descriptor.omitEmpty ?? []).map(parseDescriptorPath),
});

const toSortKey = (item, key) => {
  if (key !== undefined && item !== null && typeof item === 'object' && !Array.isArray(item)) {
    return stableStringify(item[key] ?? null);
  }

  return stableStringify(item);
};

const compareSetLikeItems = (left, right, key) => {
  const leftKey = toSortKey(left, key);
  const rightKey = toSortKey(right, key);
  if (leftKey !== rightKey) {
    return leftKey < rightKey ? -1 : 1;
  }

  const leftWhole = stableStringify(left);
  const rightWhole = stableStringify(right);
  if (leftWhole === rightWhole) {
    return 0;
  }

  return leftWhole < rightWhole ? -1 : 1;
};

const canonicalizeNode = (value, pathSegments, compiled) => {
  if (Array.isArray(value)) {
    const elements = value.map((element) =>
      canonicalizeNode(element, [...pathSegments, ARRAY_ELEMENT_SEGMENT], compiled),
    );
    const setLikeEntry = compiled.setLike.find((entry) => pathMatches(entry.segments, pathSegments));
    if (!setLikeEntry) {
      return elements;
    }

    // Membership is the meaning of a set-like array (spec §5): identical members collapse to one.
    const sorted = [...elements].sort((left, right) => compareSetLikeItems(left, right, setLikeEntry.key));
    return sorted.filter(
      (element, index) => index === 0 || stableStringify(element) !== stableStringify(sorted[index - 1]),
    );
  }

  if (value !== null && typeof value === 'object') {
    // Built with Object.fromEntries so a JSON `__proto__` key stays an own property instead of
    // invoking the prototype setter.
    const canonicalEntries = [];
    for (const key of Object.keys(value).sort()) {
      const childPath = [...pathSegments, key];
      const childValue = value[key];
      const isOmittable = compiled.omitEmpty.some((segments) => pathMatches(segments, childPath));
      if (isOmittable && isEmptyOptionalValue(childValue)) {
        continue;
      }

      canonicalEntries.push([key, canonicalizeNode(childValue, childPath, compiled)]);
    }

    return Object.fromEntries(canonicalEntries);
  }

  // JSON can spell numbers outside the double range (e.g. 1e400); JSON.parse turns them into
  // Infinity, which stableStringify would write as null, so they are rejected rather than hashed.
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Registry payload contains a number outside the finite JSON range.');
    }

    return value;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (value === null) {
    return null;
  }

  throw new Error(`Registry payload contains a non-JSON value of type ${typeof value}.`);
};

// [5.2.2] cfg-registryLifecycle · Primitive · "canonicalizeRegistryPayload"
export const canonicalizeRegistryPayload = (payload, descriptor) =>
  canonicalizeNode(payload, [], compileDescriptor(descriptor));

// [5.2.3] cfg-registryLifecycle · Primitive · "digestRegistryPayload"
export const digestRegistryPayload = (payload, descriptor) =>
  sha256Hex(stableStringify(canonicalizeRegistryPayload(payload, descriptor)));

// [5.2.3] cfg-registryLifecycle · Primitive · "digestRegistrySet"
// Set digest over registry digests in sorted registry-id order (spec §2).
export const digestRegistrySet = (registryDigestsById) =>
  sha256Hex(
    stableStringify(
      Object.fromEntries(
        Object.keys(registryDigestsById)
          .sort()
          .map((registryId) => [registryId, registryDigestsById[registryId]]),
      ),
    ),
  );
