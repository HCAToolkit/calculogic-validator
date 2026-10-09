import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_SEMANTIC_NAMING_FOLDER_TYPE_RELATIONSHIPS_REGISTRY_PATH = fileURLToPath(
  new URL('semantic-naming-folder-type-relationships.registry.json', BUILTIN_REGISTRY_ROOT),
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

export const getBuiltinSemanticNamingFolderTypeRelationshipsRegistry = () => {
  if (!cachedBuiltinRelationshipsRegistry) {
    cachedBuiltinRelationshipsRegistry = assertValidSemanticNamingFolderTypeRelationshipsRegistry(
      JSON.parse(fs.readFileSync(BUILTIN_SEMANTIC_NAMING_FOLDER_TYPE_RELATIONSHIPS_REGISTRY_PATH, 'utf8')),
    );
  }

  return cachedBuiltinRelationshipsRegistry;
};
