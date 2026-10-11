import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

const STRUCTURAL_HOMES_REGISTRY_FILENAME = 'structural-homes.registry.json';

export const BUILTIN_STRUCTURAL_HOMES_REGISTRY_PATH = fileURLToPath(
  new URL(STRUCTURAL_HOMES_REGISTRY_FILENAME, BUILTIN_REGISTRY_ROOT),
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

// Loads from one resolved Tree registry root, Builtin or Custom (#41 registry lifecycle, spec §9.3).
export const loadStructuralHomesRegistryFromRegistryRoot = (registryRoot) =>
  normalizeStructuralHomesRegistryPayload(
    JSON.parse(fs.readFileSync(path.join(registryRoot, STRUCTURAL_HOMES_REGISTRY_FILENAME), 'utf8')),
  );

export const getBuiltinStructuralHomesRegistry = () => {
  if (cachedBuiltinStructuralHomesRegistry === null) {
    cachedBuiltinStructuralHomesRegistry = loadStructuralHomesRegistryFromRegistryRoot(fileURLToPath(BUILTIN_REGISTRY_ROOT));
  }

  return cachedBuiltinStructuralHomesRegistry;
};
