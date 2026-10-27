/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.23)
 * Responsibility: The run resolution of a candidate preview (lifecycle spec §12.13): a portable-set
 *   artifact checked, written to one temporary candidate root, assessed and gated exactly as an
 *   active Custom set, and handed to the run as its registry roots.
 * Invariants: reads only the artifact bytes it is given; never reads `registry-state.json`, the
 *   repository's Custom set or its transaction directory; uses the portable set's checks, the
 *   lifecycle assessment and the active-Custom blockers, never a rule of its own; loads the
 *   candidate whole, with no fallback; the candidate root is removed on refusal and by `dispose()`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../validator-report-meta.logic.mjs';
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { customBridgeSides, resolveBridgeCompatibility } from './registry-lifecycle-bridge-compatibility.logic.mjs';
import { digestRegistrySet } from './registry-lifecycle-canonical-digest.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { artifactProblems, materializePortableSet, relocate } from './registry-lifecycle-portable-set.logic.mjs';
import { buildRegistryProvenance, findCustomSetBlockers } from './registry-lifecycle-resolution.logic.mjs';
import { RegistryLifecycleError } from './registry-lifecycle-state.logic.mjs';
import { REGISTRY_RUN_SOURCE_CANDIDATE } from './registry-lifecycle.contracts.mjs';

const CANDIDATE_ROOT_LABEL = '<candidate>';

const refuse = (lines, conditions) =>
  new RegistryLifecycleError(
    [
      'The registry candidate cannot be used for this run:',
      ...lines,
      'Check it with `registry:import-check` (its status lists every registry); nothing was activated or written.',
    ].join('\n'),
    { conditions },
  );

// [5.2.23] cfg-registryLifecycle · Workflow · "resolveCandidateRegistrySet"
// `artifactBytes` are the candidate artifact file's exact bytes. Returns the run resolution
// `{ source: 'candidate', registryRoots, registrySet, registryProvenance, baselineReference, dispose }`, or throws a
// lifecycle error naming each artifact problem or blocking condition.
export const resolveCandidateRegistrySet = ({ artifactBytes, slices = REGISTRY_LIFECYCLE_SLICES }) => {
  let document;
  try {
    document = JSON.parse(Buffer.from(artifactBytes).toString('utf8'));
  } catch (error) {
    throw refuse([`  - the artifact is not JSON: ${error.message}`], [{ condition: 'malformed' }]);
  }

  const problems = artifactProblems(document, new Set(slices.map((slice) => slice.sliceId)));
  if (problems.length > 0) {
    throw refuse(
      problems.map((item) => `  - ${item.path ?? 'artifact'}: ${item.problem}: ${item.detail}`),
      problems.map(({ path: filePath, problem }) => ({ ...(filePath === undefined ? {} : { path: filePath }), condition: problem })),
    );
  }

  const { temporaryRoot, paths, temporaryPaths } = materializePortableSet(document.files, 'calculogic-registry-candidate-');
  const dispose = () => fs.rmSync(temporaryRoot, { recursive: true, force: true });
  try {
    const replacements = temporaryPaths.map((from) => [from, CANDIDATE_ROOT_LABEL]);
    const assessment = relocate(assessCustomRegistrySet({ paths, slices }), replacements);
    const blockers = findCustomSetBlockers(assessment);
    if (blockers.length > 0) {
      throw refuse(
        blockers.map((blocker) => `  - ${blocker.registryId ?? 'registry set'}: ${blocker.condition}: ${blocker.detail}`),
        blockers.map((blocker) => ({ ...blocker })),
      );
    }

    // A candidate that passes has a canonical digest for every inventory registry, as an active
    // Custom set does.
    const resolvedDigests = assessment.customDigests;
    return {
      source: REGISTRY_RUN_SOURCE_CANDIDATE,
      registryRoots: Object.freeze(Object.fromEntries(slices.map((slice) => [slice.sliceId, path.join(paths.customRoot, slice.sliceId)]))),
      registrySet: {
        source: REGISTRY_RUN_SOURCE_CANDIDATE,
        candidate: { artifactSha256: sha256Hex(Buffer.from(artifactBytes)), exportedBy: { ...document.exportedBy } },
        customDiffers: assessment.customDiffers,
        ...(assessment.basedOn ? { basedOn: assessment.basedOn } : {}),
        ...(assessment.builtinDriftSinceBaseline !== undefined ? { builtinDriftSinceBaseline: assessment.builtinDriftSinceBaseline } : {}),
        orphanRegistries: [...assessment.orphanRegistries],
        customIssues: assessment.customIssues.map((issue) => ({ ...issue })),
        resolvedSetDigest: digestRegistrySet(resolvedDigests),
        // The candidate's own bridges (spec §9.4), read from the materialized candidate files.
        bridgeCompatibility: relocate(
          resolveBridgeCompatibility({
            set: REGISTRY_RUN_SOURCE_CANDIDATE,
            sideOf: customBridgeSides({ paths, assessment, slices }),
            slices,
          }),
          replacements,
        ),
      },
      registryProvenance: buildRegistryProvenance({ source: REGISTRY_RUN_SOURCE_CANDIDATE, resolvedDigests, slices }),
      // The candidate root's own manifest and `.baseline/` copies (spec §11.4), never the repository's.
      baselineReference: Object.freeze({ paths, slices }),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};
