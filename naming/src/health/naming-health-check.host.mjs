import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNamingHealthCheck } from './naming-health-check.logic.mjs';
import { resolveRepositoryRoot } from '../../../src/core/repository-root.logic.mjs';

export const resolveNamingHealthPackageRoot = ({ moduleUrl = import.meta.url } = {}) =>
  path.resolve(path.dirname(fileURLToPath(moduleUrl)), '..', '..', '..');

export const formatNamingHealthResult = (healthResult) => {
  const lines = [`OK: naming validator deterministic for ${healthResult.checkedScopes.join('|')}`];

  for (const { scope, reason } of healthResult.unavailableScopes) {
    lines.push(`SKIP: scope ${scope} not checked (${reason})`);
  }

  lines.push(
    healthResult.docs.status === 'checked'
      ? `OK: docs sanity check passed (${healthResult.docs.paths.join(', ')})`
      : `OK: docs sanity check not applicable (${healthResult.contextKind}: no validator development root)`,
  );

  return lines;
};

export const runNamingHealthCheckEntrypoint = () => {
  try {
    const repositoryRoot = resolveRepositoryRoot();
    const packageRoot = resolveNamingHealthPackageRoot();
    const healthResult = runNamingHealthCheck(repositoryRoot, { packageRoot });

    for (const line of formatNamingHealthResult(healthResult)) {
      console.log(line);
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Validator health check failed: ${message}`);
    process.exit(1);
  }
};
