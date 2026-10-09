import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_STRUCTURAL_HOMES_REGISTRY_PATH = fileURLToPath(
  new URL('structural-homes.registry.json', BUILTIN_REGISTRY_ROOT),
);

// Tree runtime consumers read only `active` entries; `deprecated` keeps an entry declared but unused.
const STRUCTURAL_HOME_STATUSES = Object.freeze(['active', 'deprecated']);

let cachedBuiltinStructuralHomesRegistry = null;

export const normalizeStructuralHomesRegistryPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid structural-homes registry: expected object payload.');
  }

  if (!Array.isArray(payload.structuralHomes)) {
    throw new Error('Invalid structural-homes registry: structuralHomes must be an array.');
  }

  assertRegistryEntries(payload.structuralHomes, {
    registryLabel: 'Tree structural-homes',
    listLabel: 'structuralHomes',
    keyField: 'structuralHome',
    requiredStringFields: ['definition'],
    enumFields: { status: STRUCTURAL_HOME_STATUSES },
  });

  return payload;
};

const loadBuiltinStructuralHomesRegistry = () => {
  const payload = JSON.parse(fs.readFileSync(BUILTIN_STRUCTURAL_HOMES_REGISTRY_PATH, 'utf8'));
  return normalizeStructuralHomesRegistryPayload(payload);
};

export const getBuiltinStructuralHomesRegistry = () => {
  if (cachedBuiltinStructuralHomesRegistry === null) {
    cachedBuiltinStructuralHomesRegistry = loadBuiltinStructuralHomesRegistry();
  }

  return cachedBuiltinStructuralHomesRegistry;
};
