import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertTreeRegistryEntries } from './tree-registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_STRUCTURAL_ROLE_TOKENS_REGISTRY_PATH = fileURLToPath(
  new URL('structural-role-tokens.registry.json', BUILTIN_REGISTRY_ROOT),
);

// Tree runtime consumers read only `active` entries; `deprecated` keeps an entry declared but unused.
const STRUCTURAL_ROLE_TOKEN_STATUSES = Object.freeze(['active', 'deprecated']);

let cachedBuiltinStructuralRoleTokensRegistry = null;

export const assertValidStructuralRoleTokensRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Tree structural-role tokens registry: expected object payload.');
  }
  if (!Array.isArray(payload.structuralRoleTokens)) {
    throw new Error('Invalid Tree structural-role tokens registry: structuralRoleTokens must be an array.');
  }

  assertTreeRegistryEntries(payload.structuralRoleTokens, {
    registryLabel: 'structural-role-tokens',
    listLabel: 'structuralRoleTokens',
    keyField: 'token',
    requiredStringFields: ['structuralRole', 'relationshipPerspective', 'definition'],
    enumFields: { status: STRUCTURAL_ROLE_TOKEN_STATUSES },
  });
  return payload;
};

export const getBuiltinStructuralRoleTokensRegistry = () => {
  if (!cachedBuiltinStructuralRoleTokensRegistry) {
    cachedBuiltinStructuralRoleTokensRegistry = assertValidStructuralRoleTokensRegistry(
      JSON.parse(fs.readFileSync(BUILTIN_STRUCTURAL_ROLE_TOKENS_REGISTRY_PATH, 'utf8')),
    );
  }
  return cachedBuiltinStructuralRoleTokensRegistry;
};
