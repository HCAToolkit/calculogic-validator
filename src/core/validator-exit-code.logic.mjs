import path from 'node:path';
import {
  getBuiltinExitPolicies,
  loadExitPoliciesFromRegistryRoot,
} from '../registries/validator-exit-policy.logic.mjs';
import { SUITE_BUILTIN_REGISTRY_ROOT } from '../registries/suite-registry-inventory.knowledge.mjs';

// Exit policies for a run: the resolved suite registry root when the lifecycle supplied one
// (`registryRoots.suite`), otherwise Builtin.
const getExitPolicies = ({ registryRoots } = {}) => {
  const suiteRegistryRoot = registryRoots?.suite;
  if (!suiteRegistryRoot || path.resolve(suiteRegistryRoot) === path.resolve(SUITE_BUILTIN_REGISTRY_ROOT)) {
    return getBuiltinExitPolicies();
  }

  return loadExitPoliciesFromRegistryRoot(suiteRegistryRoot);
};

const toBooleanStrictOption = (options) => Boolean(options?.strict);

const getExitSemantics = (findings, options) => ({
  strictMode: toBooleanStrictOption(options),
  anyWarnFindings: findings.some((finding) => finding?.severity === 'warn'),
  anyLegacyExceptionFindings: findings.some(
    (finding) => finding?.classification === 'legacy-exception',
  ),
});

const doesPolicyMatchSemantics = (policy, semantics) => {
  const { predicate } = policy;

  if (predicate.always) {
    return true;
  }

  if (predicate.strictMode && !semantics.strictMode) {
    return false;
  }

  if (predicate.anyWarnFindings && !semantics.anyWarnFindings) {
    return false;
  }

  if (predicate.noWarnFindings && semantics.anyWarnFindings) {
    return false;
  }

  if (predicate.anyLegacyExceptionFindings && !semantics.anyLegacyExceptionFindings) {
    return false;
  }

  return true;
};

export const deriveExitCodeFromFindings = (findings = [], options = {}) => {
  const semantics = getExitSemantics(findings, options);
  const matchingPolicy = getExitPolicies(options).find((policy) =>
    doesPolicyMatchSemantics(policy, semantics),
  );

  return matchingPolicy?.exitCode ?? 0;
};

export const deriveExitCodeFromRunnerReport = (report, options = {}) => {
  const findings = Array.isArray(report?.validators)
    ? report.validators.flatMap((validator) =>
        Array.isArray(validator?.findings) ? validator.findings : [],
      )
    : [];

  return deriveExitCodeFromFindings(findings, options);
};
