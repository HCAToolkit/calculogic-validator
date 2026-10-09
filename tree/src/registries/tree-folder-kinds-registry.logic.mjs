import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertTreeRegistryEntries } from './tree-registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_FOLDER_KINDS_REGISTRY_PATH = fileURLToPath(
  new URL('folder-kinds.registry.json', BUILTIN_REGISTRY_ROOT),
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

  assertTreeRegistryEntries(payload.folderKinds, {
    registryLabel: 'folder-kinds',
    listLabel: 'folderKinds',
    keyField: 'folderKind',
    requiredStringFields: ['definition'],
    enumFields: { status: FOLDER_KIND_STATUSES },
  });

  return payload;
};

const loadBuiltinFolderKindsRegistry = () => {
  const payload = JSON.parse(fs.readFileSync(BUILTIN_FOLDER_KINDS_REGISTRY_PATH, 'utf8'));
  return normalizeFolderKindsRegistryPayload(payload);
};

export const getBuiltinFolderKindsRegistry = () => {
  if (cachedBuiltinFolderKindsRegistry === null) {
    cachedBuiltinFolderKindsRegistry = loadBuiltinFolderKindsRegistry();
  }

  return cachedBuiltinFolderKindsRegistry;
};
