import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

const STRUCTURAL_ROLE_TOKENS_REGISTRY_FILENAME = 'structural-role-tokens.registry.json';

export const BUILTIN_STRUCTURAL_ROLE_TOKENS_REGISTRY_PATH = fileURLToPath(
  new URL(STRUCTURAL_ROLE_TOKENS_REGISTRY_FILENAME, BUILTIN_REGISTRY_ROOT),
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

  assertRegistryEntries(payload.structuralRoleTokens, {
    registryLabel: 'Tree structural-role-tokens',
    listLabel: 'structuralRoleTokens',
    keyField: 'token',
    requiredStringFields: ['structuralRole', 'relationshipPerspective', 'definition'],
    enumFields: { status: STRUCTURAL_ROLE_TOKEN_STATUSES },
  });
  return payload;
};

// Loads from one resolved Tree registry root, Builtin or Custom (#41 registry lifecycle, spec §9.3).
export const loadStructuralRoleTokensRegistryFromRegistryRoot = (registryRoot) =>
  assertValidStructuralRoleTokensRegistry(
    JSON.parse(fs.readFileSync(path.join(registryRoot, STRUCTURAL_ROLE_TOKENS_REGISTRY_FILENAME), 'utf8')),
  );

export const getBuiltinStructuralRoleTokensRegistry = () => {
  if (!cachedBuiltinStructuralRoleTokensRegistry) {
    cachedBuiltinStructuralRoleTokensRegistry = loadStructuralRoleTokensRegistryFromRegistryRoot(
      fileURLToPath(BUILTIN_REGISTRY_ROOT),
    );
  }
  return cachedBuiltinStructuralRoleTokensRegistry;
};
