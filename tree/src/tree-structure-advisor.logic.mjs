import path from 'node:path';
import { getBuiltinTreeSignalPolicy } from './registries/tree-signal-policy-registry.logic.mjs';
import { getBuiltinTreeRepoShapePolicy } from './registries/tree-repo-shape-policy-registry.logic.mjs';
import { toValidatorDevelopmentPathPrefix } from './tree-validator-development-root.logic.mjs';
import { toTreeSemanticHomeReasoningReport } from './tree-semantic-home-reasoning-report.logic.mjs';

// Registry policy comes from the prepared dependencies Tree wiring builds from the run's resolved
// registry root (#41 registry lifecycle). Direct runtime callers that omit it get Builtin.
const resolveTreeSignalPolicy = (preparedDependencies) =>
  preparedDependencies?.treeSignalPolicy ?? getBuiltinTreeSignalPolicy();

// Suite-core carveouts are relative to the suite-core root, which is derived per run from the prepared
// validator development root (`src/` standalone, `<embedded-root>/src/` embedded).
const SUITE_CORE_BOUNDARY_DRIFT_CARVEOUT_PREFIXES = ['core/', 'compat/', 'registries/'];
const SUITE_CORE_BOUNDARY_DRIFT_CARVEOUT_EXACT_PATHS = new Set(['index.mjs', 'validator-config.schema.json']);
const SUITE_CORE_BOUNDARY_DRIFT_OWNED_SUBSYSTEM_MIN_FILES = 2;

const BOUNDARY_DRIFT_BASENAME_SIGNAL_MATCHER =
  /(?:\.host\.|\.wiring\.|\.logic\.|\.knowledge\.|\.contracts\.|\.runtime\.|registry|registries)/u;

const sortByPathThenCode = (left, right) => {
  const byPath = left.path.localeCompare(right.path);
  if (byPath !== 0) {
    return byPath;
  }

  return left.code.localeCompare(right.code);
};

const isValidatorOwnedBasenameSignal = (basename, signalPolicy) =>
  signalPolicy.validatorOwnedBasenameSignalMatchers.some(({ matcher }) => matcher.test(basename));

// Classification that keeps records as they are, used when no replacement runtime is prepared.
const neutralClassifyOccurrenceRecords = (occurrenceRecords = []) => occurrenceRecords;

// `TREE_UNEXPECTED_TOP_LEVEL_FOLDER` membership: the top-level folders the effective repo-shape policy
// does not allow. The policy is the only authority; occurrence classification is not consulted (Tree
// spec, "Classification migration machinery: retired").
// `assertPreparedTreeInputs` has already required `topLevelDirectoryNames` to be an array.
const collectUnexpectedTopLevelDirectoryNames = (topLevelDirectoryNames, allowedTopLevelDirectoryNameSet) =>
  topLevelDirectoryNames
    .filter((directoryName) => typeof directoryName === 'string' && directoryName.length > 0)
    .filter((directoryName) => !allowedTopLevelDirectoryNameSet.has(directoryName))
    .sort((left, right) => left.localeCompare(right));

// The effective repo-shape policy is prepared by Tree wiring for each run from the resolved registry
// root; direct runtime callers that omit it fall back to the Builtin policy.
const resolveAllowedTopLevelDirectoryNames = (preparedDependencies) => {
  const preparedPolicy = preparedDependencies?.treeRepoShapePolicy;
  return Array.isArray(preparedPolicy?.allowedTopLevelDirectories)
    ? preparedPolicy.allowedTopLevelDirectories
    : getBuiltinTreeRepoShapePolicy().allowedTopLevelDirectories;
};

// The prepared runtime's recognition shape (both methods) is unchanged; file reasoning uses only
// `classifyOccurrenceRecords`.
const isReplacementRuntime = (replacementRuntime) => (
  replacementRuntime &&
  typeof replacementRuntime === 'object' &&
  !Array.isArray(replacementRuntime) &&
  typeof replacementRuntime.classifyOccurrenceRecords === 'function' &&
  typeof replacementRuntime.collectUnexpectedTopLevelDirectoryNames === 'function'
);

// File reasoning needs only classification, so without a prepared runtime it keeps records as they
// are and reads no repo-shape policy.
const resolveOccurrenceClassifier = (replacementRuntime) =>
  isReplacementRuntime(replacementRuntime)
    ? replacementRuntime
    : { classifyOccurrenceRecords: neutralClassifyOccurrenceRecords };

const collectTopLevelUnexpectedFolderFindings = (preparedInputs) => {
  if ((preparedInputs.scope ?? 'repo') !== 'repo') {
    return [];
  }

  const allowedTopLevelDirectoryNames = resolveAllowedTopLevelDirectoryNames(preparedInputs.preparedDependencies);
  const allowedTopLevelDirectoryNameSet = new Set(allowedTopLevelDirectoryNames);
  const unexpectedDirectoryNames = collectUnexpectedTopLevelDirectoryNames(
    preparedInputs.topLevelDirectoryNames,
    allowedTopLevelDirectoryNameSet,
  );
  const allowedTopLevelDirectories = [...allowedTopLevelDirectoryNames];

  return unexpectedDirectoryNames
    .map((directoryName) => ({
      code: 'TREE_UNEXPECTED_TOP_LEVEL_FOLDER',
      severity: 'info',
      path: directoryName,
      classification: 'advisory-structure',
      message:
        'Top-level folder is outside the known project shape for this repository and may indicate structural drift.',
      ruleRef: 'calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md',
      details: {
        allowedTopLevelDirectories,
      },
    }));
};

const isPathWithinValidatorDevelopmentRoot = (relativePath, validatorDevelopmentRoot) =>
  validatorDevelopmentRoot === '.' ||
  relativePath === validatorDevelopmentRoot ||
  relativePath.startsWith(`${validatorDevelopmentRoot}/`);

const collectValidatorOwnedOutsideTreeFindings = (paths, validatorDevelopmentRoot, signalPolicy) => {
  if (typeof validatorDevelopmentRoot !== 'string' || validatorDevelopmentRoot.length === 0) {
    return [];
  }

  const expectedRoot = validatorDevelopmentRoot === '.' ? '.' : `${validatorDevelopmentRoot}/`;

  return paths
    .filter((relativePath) => !isPathWithinValidatorDevelopmentRoot(relativePath, validatorDevelopmentRoot))
    .filter((relativePath) => isValidatorOwnedBasenameSignal(path.posix.basename(relativePath), signalPolicy))
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => ({
      code: 'TREE_VALIDATOR_OWNED_FILE_OUTSIDE_TREE',
      severity: 'info',
      path: relativePath,
      classification: 'advisory-structure',
      message:
        `Path appears validator-owned by basename signal but is located outside ${expectedRoot}.`,
      ruleRef: 'calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md',
      details: {
        expectedRoot,
      },
    }));
};

// Without a validator development root (installed consumer) there is no Validator suite core: a
// consumer's own `src/**` is never treated as one.
const resolveSuiteCoreRoot = (validatorDevelopmentRoot) => {
  const pathPrefix = toValidatorDevelopmentPathPrefix(validatorDevelopmentRoot);
  return pathPrefix === null ? null : `${pathPrefix}src/`;
};

const isBoundaryDriftCarveoutSuffix = (suiteCoreRelativePath) =>
  SUITE_CORE_BOUNDARY_DRIFT_CARVEOUT_EXACT_PATHS.has(suiteCoreRelativePath) ||
  SUITE_CORE_BOUNDARY_DRIFT_CARVEOUT_PREFIXES.some((prefix) => suiteCoreRelativePath.startsWith(prefix));

const collectOwnedSliceBoundaryDriftFindings = (paths, validatorDevelopmentRoot) => {
  const suiteCoreRoot = resolveSuiteCoreRoot(validatorDevelopmentRoot);
  if (suiteCoreRoot === null) {
    return [];
  }

  const filesBySuiteCoreSubtree = new Map();

  for (const relativePath of paths) {
    if (!relativePath.startsWith(suiteCoreRoot)) {
      continue;
    }

    const suffix = relativePath.slice(suiteCoreRoot.length);
    if (isBoundaryDriftCarveoutSuffix(suffix)) {
      continue;
    }

    const [topLevelSegment] = suffix.split('/');
    if (!topLevelSegment || topLevelSegment.includes('.')) {
      continue;
    }

    const siblingPaths = filesBySuiteCoreSubtree.get(topLevelSegment) ?? [];
    siblingPaths.push(relativePath);
    filesBySuiteCoreSubtree.set(topLevelSegment, siblingPaths);
  }

  return Array.from(filesBySuiteCoreSubtree.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([topLevelSegment, siblingPaths]) => {
      const matchedOwnedSignals = siblingPaths
        .filter((candidatePath) =>
          BOUNDARY_DRIFT_BASENAME_SIGNAL_MATCHER.test(path.posix.basename(candidatePath)),
        )
        .sort((left, right) => left.localeCompare(right));

      if (matchedOwnedSignals.length < SUITE_CORE_BOUNDARY_DRIFT_OWNED_SUBSYSTEM_MIN_FILES) {
        return [];
      }

      return [
        {
          code: 'TREE_OWNED_SLICE_BOUNDARY_DRIFT',
          severity: 'info',
          path: `${suiteCoreRoot}${topLevelSegment}/`,
          classification: 'advisory-structure',
          message:
            `Likely validator-owned subsystem growth is accumulating under suite-core ${suiteCoreRoot}** rather than an owned slice root.`,
          ruleRef: 'calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md',
          details: {
            suiteCoreRoot,
            observedSubtree: topLevelSegment,
            matchedOwnedSignalPaths: matchedOwnedSignals,
            threshold: {
              minOwnedSignalFiles: SUITE_CORE_BOUNDARY_DRIFT_OWNED_SUBSYSTEM_MIN_FILES,
            },
          },
        },
      ];
    });
};


// File-path reasoning input for Tree core: occurrence-derived records from `structuralAddressSnapshot`,
// or a deterministic fallback to `selectedPaths` when the snapshot is missing or malformed (Refs #49).
export const collectFileReasoningInput = (preparedInputs, replacementRuntime) => {
  const occurrenceRecords = preparedInputs?.structuralAddressSnapshot?.occurrenceRecords;

  if (Array.isArray(occurrenceRecords)) {
    const runtime = resolveOccurrenceClassifier(replacementRuntime);
    let classifiedOccurrenceRecords;

    try {
      classifiedOccurrenceRecords = runtime.classifyOccurrenceRecords(occurrenceRecords);
    } catch {
      classifiedOccurrenceRecords = null;
    }

    if (!Array.isArray(classifiedOccurrenceRecords)) {
      return {
        source: 'selectedPaths-fallback',
        fileRecords: [],
        resolvedFilePaths: preparedInputs.selectedPaths,
      };
    }

    const fileRecords = classifiedOccurrenceRecords.filter(
      (record) =>
        record &&
        record.occurrenceType === 'file' &&
        typeof record.resolvedPath === 'string' &&
        record.resolvedPath.length > 0,
    );
    const resolvedFilePaths = [...new Set(fileRecords.map((record) => record.resolvedPath))].sort((left, right) =>
      left.localeCompare(right),
    );

    return {
      source: 'structuralAddressSnapshot',
      occurrenceRecords: classifiedOccurrenceRecords,
      fileRecords,
      resolvedFilePaths,
    };
  }

  return {
    source: 'selectedPaths-fallback',
    fileRecords: [],
    resolvedFilePaths: preparedInputs.selectedPaths,
  };
};

const incrementCounter = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const sortCountObject = (counts) =>
  Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));

export const summarizeFindings = (findings) => {
  const counts = {
    'advisory-structure': 0,
  };
  const codeCounts = {};

  for (const finding of findings) {
    incrementCounter(counts, finding.classification);
    incrementCounter(codeCounts, finding.code);
  }

  return {
    counts,
    codeCounts: sortCountObject(codeCounts),
  };
};

const assertPreparedTreeInputs = (preparedInputs) => {
  const hasPreparedRuntimeInputs =
    preparedInputs &&
    Array.isArray(preparedInputs.selectedPaths) &&
    Array.isArray(preparedInputs.topLevelDirectoryNames) &&
    Array.isArray(preparedInputs.targets);

  if (hasPreparedRuntimeInputs) {
    return preparedInputs;
  }

  throw new Error(
    'Tree runtime requires prepared tree-core inputs from wiring/runtime adapter: selectedPaths[], topLevelDirectoryNames[], and targets[].',
  );
};

const collectContributorFindings = (preparedInputs) => {
  const { findingContributors } = preparedInputs;

  if (!Array.isArray(findingContributors) || findingContributors.length === 0) {
    return [];
  }

  return findingContributors.flatMap((contributor) => {
    if (typeof contributor !== 'function') {
      throw new Error('Tree runtime findingContributors must contain functions only.');
    }

    const contributedFindings = contributor(preparedInputs);
    if (!Array.isArray(contributedFindings)) {
      throw new Error('Tree runtime finding contributor must return an array of findings.');
    }

    return contributedFindings;
  });
};

export const runTreeStructureAdvisor = (preparedInputs = {}) => {
  const prepared = assertPreparedTreeInputs(preparedInputs);
  const replacementRuntime = prepared.preparedDependencies?.treeOccurrenceClassificationReplacementRuntime;
  const fileReasoningInput = collectFileReasoningInput(prepared, replacementRuntime);
  const selectedPathsForReasoning = fileReasoningInput.resolvedFilePaths;

  const findings = [
    ...collectTopLevelUnexpectedFolderFindings(prepared),
    ...collectValidatorOwnedOutsideTreeFindings(
      selectedPathsForReasoning,
      prepared.validatorDevelopmentRoot,
      resolveTreeSignalPolicy(prepared.preparedDependencies),
    ),
    ...collectOwnedSliceBoundaryDriftFindings(selectedPathsForReasoning, prepared.validatorDevelopmentRoot),
    ...collectContributorFindings(prepared),
  ].sort(sortByPathThenCode);

  // S2.12 B6: what the Stage 2-governed codes rested on; absent when Stage 2 was not prepared.
  const semanticHomeReasoning = toTreeSemanticHomeReasoningReport(prepared.preparedDependencies?.treeFolderSemanticHomeReasoning);

  return {
    findings,
    totalFilesScanned: selectedPathsForReasoning.length,
    scope: prepared.scope ?? 'repo',
    ...(prepared.scopeExclusions?.length > 0 ? { scopeExclusions: prepared.scopeExclusions } : {}),
    filters: {
      isFiltered: prepared.targets.length > 0,
      ...(prepared.targets.length > 0
        ? {
            targets: prepared.targets,
          }
        : {}),
    },
    ...(semanticHomeReasoning ? { semanticHomeReasoning } : {}),
  };
};
