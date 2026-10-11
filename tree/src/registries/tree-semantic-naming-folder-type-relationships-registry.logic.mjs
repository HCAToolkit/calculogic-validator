import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

const SEMANTIC_NAMING_FOLDER_TYPE_RELATIONSHIPS_REGISTRY_FILENAME = 'semantic-naming-folder-type-relationships.registry.json';

export const BUILTIN_SEMANTIC_NAMING_FOLDER_TYPE_RELATIONSHIPS_REGISTRY_PATH = fileURLToPath(
  new URL(SEMANTIC_NAMING_FOLDER_TYPE_RELATIONSHIPS_REGISTRY_FILENAME, BUILTIN_REGISTRY_ROOT),
);

// Tree runtime consumers read only `active` entries; `deprecated` keeps an entry declared but unused.
const RELATIONSHIP_STATUSES = Object.freeze(['active', 'deprecated']);

let cachedBuiltinRelationshipsRegistry = null;

export const assertValidSemanticNamingFolderTypeRelationshipsRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid semantic naming folder-type relationships registry: expected object payload.');
  }

  if (!Array.isArray(payload.semanticNamingFolderTypeRelationships)) {
    throw new Error('Invalid semantic naming folder-type relationships registry: semanticNamingFolderTypeRelationships must be an array.');
  }

  assertRegistryEntries(payload.semanticNamingFolderTypeRelationships, {
    registryLabel: 'Tree semantic-naming-folder-type-relationships',
    listLabel: 'semanticNamingFolderTypeRelationships',
    keyField: 'relationshipPerspective',
    requiredStringFields: ['namingPerspective', 'treeFolderType', 'structuralHomeCondition', 'repoShapeCondition', 'definition'],
    enumFields: { status: RELATIONSHIP_STATUSES },
  });

  return payload;
};

// Loads from one resolved Tree registry root, Builtin or Custom (#41 registry lifecycle, spec §9.3).
export const loadSemanticNamingFolderTypeRelationshipsRegistryFromRegistryRoot = (registryRoot) =>
  assertValidSemanticNamingFolderTypeRelationshipsRegistry(
    JSON.parse(
      fs.readFileSync(path.join(registryRoot, SEMANTIC_NAMING_FOLDER_TYPE_RELATIONSHIPS_REGISTRY_FILENAME), 'utf8'),
    ),
  );

export const getBuiltinSemanticNamingFolderTypeRelationshipsRegistry = () => {
  if (!cachedBuiltinRelationshipsRegistry) {
    cachedBuiltinRelationshipsRegistry = loadSemanticNamingFolderTypeRelationshipsRegistryFromRegistryRoot(
      fileURLToPath(BUILTIN_REGISTRY_ROOT),
    );
  }

  return cachedBuiltinRelationshipsRegistry;
};
