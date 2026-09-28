import fs from 'node:fs';
import path from 'node:path';
import {
  getScopeProfile,
  runNamingValidator,
  summarizeFindings,
} from '../naming-validator.host.mjs';
import { resolveValidatorDevelopmentContext } from '../../../src/core/validator-development-context.logic.mjs';
import {
  getValidatorScopeProfile,
  resolveContextualValidatorScopeProfile,
} from '../../../src/core/validator-scopes.logic.mjs';

export const NAMING_HEALTH_SCOPES = ['repo', 'app', 'docs', 'validator', 'system'];

// Validator-owned documents checked by the bounded docs sanity check, relative to the
// validator development root. They are never resolved against a consumer checkout.
export const NAMING_HEALTH_DOC_PATHS = [
  'doc/ConventionRoutines/NamingValidatorSpec.md',
  'doc/ValidatorSpecs/nl-config/cfg-namingValidator.md',
];

export const NAMING_HEALTH_DOC_PHRASE = 'validator development root';

const COMPARABLE_SUMMARY_KEYS = [
  'counts',
  'codeCounts',
  'specialCaseTypeCounts',
  'warningRoleStatusCounts',
  'warningRoleCategoryCounts',
];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runScopeSummary = (repositoryRoot, scope, packageRoot) => {
  const { findings, totalFilesScanned } = runNamingValidator(repositoryRoot, { scope, packageRoot });
  const summary = summarizeFindings(findings);

  return {
    totalFilesScanned,
    counts: summary.counts,
    codeCounts: summary.codeCounts,
    specialCaseTypeCounts: summary.specialCaseTypeCounts,
    warningRoleStatusCounts: summary.warningRoleStatusCounts,
    warningRoleCategoryCounts: summary.warningRoleCategoryCounts,
  };
};

export const assertDeterministicNamingScope = (repositoryRoot, scope, { packageRoot } = {}) => {
  const profile = getScopeProfile(scope);
  assert(profile, `Missing naming validator scope profile: ${scope}`);

  const firstRun = runScopeSummary(repositoryRoot, scope, packageRoot);
  const secondRun = runScopeSummary(repositoryRoot, scope, packageRoot);

  assert(
    firstRun.totalFilesScanned === secondRun.totalFilesScanned,
    `Non-deterministic totalFilesScanned for scope=${scope}`,
  );

  for (const key of COMPARABLE_SUMMARY_KEYS) {
    const firstSerialized = JSON.stringify(firstRun[key]);
    const secondSerialized = JSON.stringify(secondRun[key]);

    assert(
      firstSerialized === secondSerialized,
      `Non-deterministic summary.${key} for scope=${scope}`,
    );
  }
};

// Mentions every health doc must contain: each app-scope include root from the scope
// registry, plus the development-root concept that the validator scope depends on.
export const getNamingHealthRequiredDocMentions = () => [
  ...getValidatorScopeProfile('app').includeRoots.map((includeRoot) => `${includeRoot}/`),
  NAMING_HEALTH_DOC_PHRASE,
];

// Absolute doc paths for a resolved development context. An installed consumer has no
// validator development root, so it gets no doc paths and no document is ever read.
export const getNamingHealthDocPaths = (context) =>
  context.validatorDevelopmentRoot
    ? NAMING_HEALTH_DOC_PATHS.map((docPath) => path.join(context.validatorDevelopmentRoot, docPath))
    : [];

export const assertNamingHealthDocs = (context) => {
  const requiredMentions = getNamingHealthRequiredDocMentions();

  for (const absoluteDocPath of getNamingHealthDocPaths(context)) {
    const displayPath = path.relative(context.validatorDevelopmentRoot, absoluteDocPath).split(path.sep).join('/');
    assert(fs.existsSync(absoluteDocPath), `Missing required health doc: ${displayPath}`);

    const content = fs.readFileSync(absoluteDocPath, 'utf8');
    for (const requiredMention of requiredMentions) {
      assert(
        content.includes(requiredMention),
        `Docs drift detected in ${displayPath}: missing "${requiredMention}" mention`,
      );
    }
  }
};

const getUnavailableReason = (resolution) =>
  resolution.message ? resolution.message.split(':')[0] : resolution.status;

// `assertScope` defaults to the determinism check; it is injectable so tests can prove a
// failing scope aborts the health check before it is ever reported as checked.
export const runNamingHealthCheck = (
  targetRepositoryRoot,
  { packageRoot, assertScope = assertDeterministicNamingScope } = {},
) => {
  const context = resolveValidatorDevelopmentContext({ targetRepositoryRoot, packageRoot });
  const checkedScopes = [];
  const unavailableScopes = [];

  for (const scope of NAMING_HEALTH_SCOPES) {
    const resolution = resolveContextualValidatorScopeProfile(scope, { targetRepositoryRoot, packageRoot });

    if (resolution.status !== 'available') {
      unavailableScopes.push({ scope, reason: getUnavailableReason(resolution) });
      continue;
    }

    assertScope(targetRepositoryRoot, scope, { packageRoot });
    checkedScopes.push(scope);
  }

  const docPaths = getNamingHealthDocPaths(context);
  if (docPaths.length > 0) {
    assertNamingHealthDocs(context);
  }

  return {
    contextKind: context.kind,
    checkedScopes,
    unavailableScopes,
    docs: {
      status: docPaths.length > 0 ? 'checked' : 'not-applicable',
      paths: docPaths.length > 0 ? [...NAMING_HEALTH_DOC_PATHS] : [],
    },
  };
};
