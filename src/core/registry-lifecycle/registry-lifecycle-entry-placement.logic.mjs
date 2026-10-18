/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.13, §5.2.19)
 * Responsibility: Writing a raw registry payload at comparison sites (lifecycle spec §8.4): placing
 *   or removing one entry, arranging an ordered collection, and comparing the result with an
 *   expected image. Shared by the update candidate (§12.6) and the edit construction (§12.10).
 * Invariants: pure; acts only at the sites `walkComparisonEntries` or `parseComparisonAddress`
 *   name, never interprets registry content; properties are written as own properties, so a key such
 *   as `__proto__` stays data; containers that are not entries are created only when a placement
 *   needs them, and a group of a wildcard map is never created implicitly; nothing is repaired.
 */
import { stableStringify } from '../validator-report-meta.logic.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const keyOf = (value) => (value === undefined ? undefined : stableStringify(value));

// [5.2.13] cfg-registryLifecycle · Primitive · "copyJson"
// A deep copy of plain JSON. JSON.parse defines every key as an own property, so a key such as
// `__proto__` stays data.
export const copyJson = (value) => JSON.parse(JSON.stringify(value));

const setOwn = (object, key, value) => {
  Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
};

// [5.2.13] cfg-registryLifecycle · Primitive · "readAt"
// The node at `segments` in a raw payload, or undefined.
export const readAt = (payload, segments) => {
  let node = payload;
  for (const segment of segments) {
    if (!isPlainObject(node) || !Object.hasOwn(node, segment)) {
      return undefined;
    }
    node = node[segment];
  }
  return node;
};

// The object that holds the last segment of `segments`. Missing objects on the way are created when
// `create` is set; they are never entries (spec §12.6 item 3). Undefined when there is none, or
// when something other than an object is in the way: the exact-image check then reports it.
const holderOf = (payload, segments, create) => {
  let node = payload;
  for (const segment of segments.slice(0, -1)) {
    if (!Object.hasOwn(node, segment)) {
      if (!create) {
        return undefined;
      }
      setOwn(node, segment, {});
    }
    node = node[segment];
    if (!isPlainObject(node)) {
      return undefined;
    }
  }
  return node;
};

// [5.2.13] cfg-registryLifecycle · Primitive · "listAt"
// The list at `container`, created empty when `create` is set and it is missing.
export const listAt = (payload, container, create) => {
  const holder = holderOf(payload, container, create);
  if (!holder) {
    return undefined;
  }
  const field = container.at(-1);
  if (!Object.hasOwn(holder, field)) {
    if (!create) {
      return undefined;
    }
    setOwn(holder, field, []);
  }
  return Array.isArray(holder[field]) ? holder[field] : undefined;
};

const removeAt = (payload, container) => {
  const holder = holderOf(payload, container, false);
  if (holder && Object.hasOwn(holder, container.at(-1))) {
    delete holder[container.at(-1)];
  }
};

const removeWhere = (list, predicate) => {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (predicate(list[index])) {
      list.splice(index, 1);
    }
  }
};

// [5.2.13] cfg-registryLifecycle · Primitive · "hasKey"
export const hasKey = (site) => (record) => isPlainObject(record) && record[site.keyField] === site.key;

// [5.2.13] cfg-registryLifecycle · Primitive · "placeEntry"
// Makes the entry at `site` present with the raw `form` (values and records; members and groups
// take none), or absent (spec §12.6 item 3, §12.10):
// - value: the value is set, or removed;
// - member: the member is appended, or every occurrence is removed;
// - record: the record is replaced in place, or appended, or removed (with any duplicate of its key);
// - group: the map property is created as an empty list, or removed with whatever it still holds.
// Order entries are arranged by `applyOrder`, after every other placement.
export const placeEntry = ({ payload, site, present, form }) => {
  const { container } = site;
  switch (site.kind) {
    case 'value': {
      const holder = holderOf(payload, container, present);
      if (holder && present) {
        setOwn(holder, container.at(-1), copyJson(form));
      } else if (holder) {
        delete holder[container.at(-1)];
      }
      return;
    }
    case 'member': {
      const list = listAt(payload, container, present);
      if (!list) {
        return;
      }
      if (!present) {
        removeWhere(list, (member) => member === site.member);
      } else if (!list.includes(site.member)) {
        list.push(site.member);
      }
      return;
    }
    case 'record': {
      // A group of a wildcard map is an entry of its own, so it is never created implicitly.
      const list = listAt(payload, container, present && !site.grouped);
      if (!list) {
        return;
      }
      if (!present) {
        removeWhere(list, hasKey(site));
        return;
      }
      const record = copyJson(form);
      const index = list.findIndex(hasKey(site));
      if (index === -1) {
        list.push(record);
        return;
      }
      list[index] = record;
      removeWhere(list, (other) => other !== record && hasKey(site)(other));
      return;
    }
    case 'group': {
      if (!present) {
        removeAt(payload, container);
        return;
      }
      const holder = holderOf(payload, container, true);
      if (holder && !Object.hasOwn(holder, container.at(-1))) {
        setOwn(holder, container.at(-1), []);
      }
      return;
    }
    default:
      return;
  }
};

// [5.2.13] cfg-registryLifecycle · Primitive · "applyOrder"
// Arranges one ordered collection by its key sequence, or removes it when the order is absent and
// the collection is empty (spec §12.6 item 4). A collection whose records are not exactly the
// sequence's keys is left as it is; the exact-image check refuses it.
export const applyOrder = ({ payload, site, order }) => {
  const { container, keyField } = site;
  if (order === undefined) {
    const list = listAt(payload, container, false);
    if (list?.length === 0) {
      removeAt(payload, container);
    }
    return;
  }

  const list = listAt(payload, container, order.length === 0 && !site.grouped);
  if (!list) {
    return;
  }
  const keys = list.map((record) => (isPlainObject(record) ? record[keyField] : undefined));
  const sameKeys = keys.length === order.length && new Set(keys).size === keys.length && order.every((key) => keys.includes(key));
  if (sameKeys) {
    const arranged = order.map((key) => list[keys.indexOf(key)]);
    list.splice(0, list.length, ...arranged);
  }
};

// [5.2.13] cfg-registryLifecycle · Primitive · "ANY_PRESENT_VALUE"
// An expected-image value meaning "present, with the value written there".
export const ANY_PRESENT_VALUE = Symbol('anyPresentValue');

// [5.2.13] cfg-registryLifecycle · Derived value · "imageMismatches"
// Every address, of `addresses` and of the actual image, whose actual canonical value is not the
// expected one (`expectedAt(address)`: a canonical value, `undefined` for absent, or
// `ANY_PRESENT_VALUE`), in ordinal order, as `{ address, expected?, actual? }`.
export const imageMismatches = ({ addresses, expectedAt, actual }) =>
  [...new Set([...addresses, ...actual.keys()])].sort(compareOrdinal).flatMap((address) => {
    const expected = expectedAt(address);
    const value = actual.get(address);
    const matches = expected === ANY_PRESENT_VALUE ? value !== undefined : keyOf(expected) === keyOf(value);
    return matches
      ? []
      : [
          {
            address,
            ...(expected === undefined || expected === ANY_PRESENT_VALUE ? {} : { expected }),
            ...(value === undefined ? {} : { actual: value }),
          },
        ];
  });
