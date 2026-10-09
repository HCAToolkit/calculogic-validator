import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_APP_FILES } from './validator-root-files.knowledge.mjs';
import { resolveValidatorDevelopmentContext } from './validator-development-context.logic.mjs';
import { SUITE_BUILTIN_REGISTRY_ROOT } from '../registries/suite-registry-inventory.knowledge.mjs';

// Ownership decision (2026-03 narrow audit slice):
// - Keep this module as the canonical validator-owned runtime owner for builtin scope profiles.
// - Canonical path is now `validator-scopes.logic.mjs` (rename-only churn-managed pass from
//   `validator-scopes.knowledge.mjs`) with no behavior change.
// - Policy source-of-truth remains the builtin registry payload, not ad hoc static data in this module.

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_VALIDATOR_SCOPE = 'repo';

const SCOPE_PROFILES_REGISTRY_FILENAME = 'scope-profiles.registry.json';

const BUILTIN_SCOPE_PROFILES_REGISTRY_PATH = path.join(
  MODULE_DIR,
  '..',
  'registries',
  '_builtin',
  SCOPE_PROFILES_REGISTRY_FILENAME,
);

const LEGACY_SCOPE_DESCRIPTIONS = {
  repo: 'Repository-wide scan of all reportable files.',
  app: 'Application-only scan (src/** and test/**).',
  docs: 'Documentation-focused scan (doc/docs and root conventional docs: README.md).',
  validator: 'Validator development-root scan (available only in validator owner/development contexts).',
  system: 'System/tooling files scan (root package/tsconfig/eslint/vite files).',
};

const SYSTEM_SCOPE_COMPATIBILITY_PATTERNS = [
  'eslint.config.*',
  'vite.config.*',
  'tsconfig*.json',
];

const SYSTEM_SCOPE_COMPATIBILITY_PATTERN_EXPANSIONS = {
  'eslint.config.*': [...ROOT_APP_FILES]
    .filter((rootFile) => rootFile.startsWith('eslint.config.'))
    .sort((left, right) => left.localeCompare(right)),
  'vite.config.*': [...ROOT_APP_FILES]
    .filter((rootFile) => rootFile.startsWith('vite.config.'))
    .sort((left, right) => left.localeCompare(right)),
  'tsconfig*.json': [...ROOT_APP_FILES]
    .filter((rootFile) => rootFile.startsWith('tsconfig'))
    .sort((left, right) => left.localeCompare(right)),
};

const isKnownSystemScopeCompatibilityPattern = (rootFileToken) =>
  SYSTEM_SCOPE_COMPATIBILITY_PATTERNS.includes(rootFileToken);

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const normalizeIncludeRootFiles = (includeRootFiles = []) => {
  const expandedRootFiles = [];

  for (const rootFile of includeRootFiles) {
    if (isKnownSystemScopeCompatibilityPattern(rootFile)) {
      expandedRootFiles.push(...SYSTEM_SCOPE_COMPATIBILITY_PATTERN_EXPANSIONS[rootFile]);
      continue;
    }

    expandedRootFiles.push(rootFile);
  }

  return Array.from(new Set(expandedRootFiles)).sort((left, right) => left.localeCompare(right));
};

const canonicalizeScopeProfile = (scope, profile) => {
  const includeRoots = Array.isArray(profile?.includeRoots) ? profile.includeRoots : [];
  const includeRootFiles = normalizeIncludeRootFiles(
    Array.isArray(profile?.includeRootFiles) ? profile.includeRootFiles : [],
  );

  return {
    description: LEGACY_SCOPE_DESCRIPTIONS[scope],
    includeRoots: [...includeRoots],
    includeRootFiles,
  };
};

// Canonical runtime-owner behavior in this module:
// validates + normalizes a scope-profile registry payload at load time.
const loadScopeProfilesFromFile = (registryFilePath) => {
  const parsedRegistry = loadJsonFile(registryFilePath);

  if (!parsedRegistry?.profiles || typeof parsedRegistry.profiles !== 'object') {
    throw new Error('Invalid scope profiles registry: expected profiles object.');
  }

  return Object.fromEntries(
    Object.entries(parsedRegistry.profiles).map(([scope, profile]) => [
      scope,
      canonicalizeScopeProfile(scope, profile),
    ]),
  );
};

let cachedBuiltinScopeProfiles = null;

// Primary runtime path: getter-backed scope profile access for validator runtime.
export const getBuiltinScopeProfiles = () => {
  if (!cachedBuiltinScopeProfiles) {
    cachedBuiltinScopeProfiles = loadScopeProfilesFromFile(BUILTIN_SCOPE_PROFILES_REGISTRY_PATH);
  }

  return cachedBuiltinScopeProfiles;
};

// Loads scope profiles from a resolved suite registry root (#41 registry lifecycle).
export const loadScopeProfilesFromRegistryRoot = (registryRoot) =>
  loadScopeProfilesFromFile(path.join(registryRoot, SCOPE_PROFILES_REGISTRY_FILENAME));

// Scope profiles for a run: the resolved suite registry root when the lifecycle supplied one
// (`registryRoots.suite`), otherwise Builtin.
const getScopeProfiles = ({ registryRoots } = {}) => {
  const suiteRegistryRoot = registryRoots?.suite;
  if (!suiteRegistryRoot || path.resolve(suiteRegistryRoot) === path.resolve(SUITE_BUILTIN_REGISTRY_ROOT)) {
    return getBuiltinScopeProfiles();
  }

  return loadScopeProfilesFromRegistryRoot(suiteRegistryRoot);
};

// Primary runtime path helper: immutable copy for callers and compatibility shims.
export const cloneScopeProfile = (profile) => ({
  description: profile.description,
  includeRoots: [...profile.includeRoots],
  includeRootFiles: [...profile.includeRootFiles],
});


export const listValidatorScopes = ({ registryRoots } = {}) =>
  Array.from(new Set(Object.keys(getScopeProfiles({ registryRoots })))).sort((a, b) => a.localeCompare(b));

export const resolveContextualValidatorScopeProfile = (
  scope,
  { targetRepositoryRoot = process.cwd(), packageRoot, registryRoots } = {},
) => {
  const normalizedScope = scope ?? DEFAULT_VALIDATOR_SCOPE;
  const profile = getScopeProfiles({ registryRoots })[normalizedScope];

  if (!profile) {
    return { status: 'invalid-scope', scope: normalizedScope, profile: null };
  }

  if (normalizedScope !== 'validator') {
    return { status: 'available', scope: normalizedScope, profile: cloneScopeProfile(profile) };
  }

  const context = resolveValidatorDevelopmentContext({ targetRepositoryRoot, packageRoot });
  if (!context.validatorDevelopmentRoot) {
    return {
      status: 'unavailable-scope',
      scope: normalizedScope,
      profile: null,
      context,
      message:
        'validator-development-root-unavailable: --scope=validator requires a validator development root and is unavailable in this consumer context. Use an ordinary scope instead: repo, app, docs, system.',
    };
  }

  const relativeValidatorRoot = path.relative(context.targetRepositoryRoot, context.validatorDevelopmentRoot) || '.';
  return {
    status: 'available',
    scope: normalizedScope,
    context,
    profile: {
      ...cloneScopeProfile(profile),
      includeRoots: [relativeValidatorRoot.split(path.sep).join('/')],
      includeRootFiles: [],
    },
  };
};

export const getContextualValidatorScopeProfile = (scope, options = {}) => {
  const result = resolveContextualValidatorScopeProfile(scope, options);
  return result.status === 'available' ? result.profile : null;
};

export const listAvailableValidatorScopes = (options = {}) =>
  listValidatorScopes(options).filter(
    (scope) => resolveContextualValidatorScopeProfile(scope, options).status === 'available',
  );

export const getValidatorScopeProfile = (scope, { registryRoots } = {}) => {
  const normalizedScope = scope ?? DEFAULT_VALIDATOR_SCOPE;
  const profile = getScopeProfiles({ registryRoots })[normalizedScope];
  return profile ? cloneScopeProfile(profile) : null;
};
