import { getValidatorById } from '../../../src/core/validator-registry.knowledge.mjs';
import { listAvailableValidatorScopes, getContextualValidatorScopeProfile } from '../../../src/core/validator-scopes.logic.mjs';

const preferredScopeOrder = ['repo', 'app', 'docs', 'validator', 'system'];

const buildScopeToken = (supportedScopes) =>
  preferredScopeOrder.filter((scope) => supportedScopes.includes(scope)).join('|');

export const buildNamingCliUsageLines = ({
  validatorId = 'naming',
  commandPrefix,
  strictExampleCommand,
  repositoryRoot,
  // The run's resolved registry roots (#41), so scope lists match the active set; Builtin without.
  registryRoots,
} = {}) => {
  const supportedScopes = listAvailableValidatorScopes({ targetRepositoryRoot: repositoryRoot, registryRoots });
  const supportedScopesToken = buildScopeToken(supportedScopes);
  const validator = getValidatorById(validatorId);
  if (!validator) {
    throw new Error(`Unknown validator: ${validatorId}`);
  }

  const repoLocalNpmInvocation = validator.metadata?.commands?.repoLocalNpmInvocation;
  if (!repoLocalNpmInvocation) {
    throw new Error(`Missing repo-local npm invocation metadata for validator: ${validatorId}`);
  }

  const effectiveCommandPrefix = commandPrefix ?? repoLocalNpmInvocation;
  const effectiveStrictExampleCommand =
    strictExampleCommand ?? `${repoLocalNpmInvocation} --scope=repo --strict`;

  return [
    `Usage: ${effectiveCommandPrefix} [--scope=<${supportedScopesToken}>] [--target=<path>]... [--config=<path>] [--strict] [--registry-candidate=<artifact.json>]`,
    'Scopes:',
    ...supportedScopes.map((scope) => {
      const profile = getContextualValidatorScopeProfile(scope, { targetRepositoryRoot: repositoryRoot, registryRoots });
      return `  - ${scope}: ${profile?.description ?? ''}`;
    }),
    'Default scope: repo',
    'Examples:',
    `  ✅ ${repoLocalNpmInvocation} --scope=app`,
    `  ✅ ${repoLocalNpmInvocation} --scope=app --target src/buildsurface`,
    `  ✅ ${repoLocalNpmInvocation} --scope=app --target src/buildsurface --target src/shared`,
    '  ✅ npm run validate:all -- --validators=naming --scope=docs',
    '  ✅ node bin/calculogic-validate-naming.host.mjs --scope=app',
    '  ✅ node bin/calculogic-validate.host.mjs --scope=docs',
    `  ✅ ${effectiveStrictExampleCommand}`,
  ];
};
