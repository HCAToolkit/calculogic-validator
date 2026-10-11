import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

const FOLDER_KINDS_REGISTRY_FILENAME = 'folder-kinds.registry.json';

export const BUILTIN_FOLDER_KINDS_REGISTRY_PATH = fileURLToPath(
  new URL(FOLDER_KINDS_REGISTRY_FILENAME, BUILTIN_REGISTRY_ROOT),
);

// Tree runtime consumers read only `active` entries; `deprecated` keeps an entry declared but unused.
const FOLDER_KIND_STATUSES = Object.freeze(['active', 'deprecated']);

let cachedBuiltinFolderKindsRegistry = null;

export const normalizeFolderKindsRegistryPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid folder-kinds registry: expected object payload.');
  }

  if (!Array.isArray(payload.folderKinds)) {
    throw new Error('Invalid folder-kinds registry: folderKinds must be an array.');
  }

  assertRegistryEntries(payload.folderKinds, {
    registryLabel: 'Tree folder-kinds',
    listLabel: 'folderKinds',
    keyField: 'folderKind',
    requiredStringFields: ['definition'],
    enumFields: { status: FOLDER_KIND_STATUSES },
  });

  return payload;
};

// Loads from one resolved Tree registry root, Builtin or Custom (#41 registry lifecycle, spec §9.3).
export const loadFolderKindsRegistryFromRegistryRoot = (registryRoot) =>
  normalizeFolderKindsRegistryPayload(
    JSON.parse(fs.readFileSync(path.join(registryRoot, FOLDER_KINDS_REGISTRY_FILENAME), 'utf8')),
  );

export const getBuiltinFolderKindsRegistry = () => {
  if (cachedBuiltinFolderKindsRegistry === null) {
    cachedBuiltinFolderKindsRegistry = loadFolderKindsRegistryFromRegistryRoot(fileURLToPath(BUILTIN_REGISTRY_ROOT));
  }

  return cachedBuiltinFolderKindsRegistry;
};
