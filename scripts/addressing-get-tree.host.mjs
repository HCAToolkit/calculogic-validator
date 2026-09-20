import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  prepareTreeCodebaseAddressedSnapshot,
} from '../structural-addressing/src/structural-addressing-tree-codebase.logic.mjs';
import {
  renderTreeCodebaseAddressedSnapshot,
} from '../structural-addressing/src/structural-addressing-render-tree.logic.mjs';
import {
  GET_TREE_RENDER_VIEW,
  STRUCTURAL_ADDRESSING_RENDER_FORMATS,
  STRUCTURAL_ADDRESSING_OCCURRENCE_TYPES,
} from '../structural-addressing/src/structural-addressing-profile.knowledge.mjs';
import { resolveValidatorDevelopmentContext } from '../src/core/validator-development-context.logic.mjs';

const SUPPORTED_SCOPE = 'validator';
const SOURCE_NAMESPACE = 'calculogic-validator';
const EMBEDDED_SCOPE_ROOT = 'calculogic-validator';
const STANDALONE_SCOPE_ROOT = '.';
const EXCLUDED_WALK_NAMES = new Set(['.git', 'node_modules', '.reports', 'dist', 'build', 'coverage']);

const USAGE_TEXT =
  'Usage: node --experimental-strip-types calculogic-validator/scripts/addressing-get-tree.host.mjs --scope=validator [--target <path>] [--format text|json|both]';

const normalizeCliPath = (inputPath) => inputPath.trim().replaceAll('\\', '/');

// Occurrence paths are always expressed relative to the scope root and prefixed with the
// stable `sourceNamespace` label (see DeterministicStructuralAddressingSpec-Draft.md) - this
// label is a naming convention, not a physical directory: it is literally the scope root's own
// name for embedded-nested layouts, and a synthesized prefix for the standalone-checkout layout
// (where the scope root and the repository root are the same directory on disk).
const namespacedRelativePath = ({ absolutePath, allowedRootAbsolute, sourceNamespace }) => {
  const relativeToScopeRoot = normalizeCliPath(path.relative(allowedRootAbsolute, absolutePath));
  return relativeToScopeRoot === '' ? sourceNamespace : `${sourceNamespace}/${relativeToScopeRoot}`;
};

const resolveRepoRelativeTarget = ({ repoRoot, target }) => path.resolve(repoRoot, target);

const isInsideOrEqual = ({ child, parent }) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const findRepositoryRoot = async ({ cwd }) => {
  let cursor = path.resolve(cwd);

  while (true) {
    try {
      await fs.access(path.join(cursor, '.git'));
      return cursor;
    } catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        throw new Error('Unable to locate repository root.');
      }
      cursor = parent;
    }
  }
};

// Resolves the validator development root by delegating identity to the canonical
// `resolveValidatorDevelopmentContext` contract (src/core/validator-development-context.logic.mjs),
// the same mechanism `--scope=validator`'s other entrypoints (validator-scopes.logic.mjs) already
// use. That contract compares `packageRoot` - where THIS EXECUTING implementation module actually,
// physically lives on disk (its own real, symlink-resolved location, anchored in `import.meta.url`
// when the caller does not override it for testing) - against `targetRepositoryRoot` - the
// repository the command is invoked against. This is deliberately NOT based on any content the
// target repository controls (package.json `name`, an AGENTS.md file, or any other file the
// target could plausibly contain): a consumer repository can declare any package name or ship any
// marker file it likes, but it cannot make itself BE the directory the Validator's own code is
// actually running from. `kind` is one of:
//   - 'standalone-development': packageRoot === targetRepositoryRoot (running this package's own
//     code from inside its own repository root).
//   - 'embedded-development': packageRoot === targetRepositoryRoot/calculogic-validator (the
//     historical React-app-embedded, vendored-nested shape).
//   - 'installed-consumer': neither - includes the ordinary `npm --prefix
//     node_modules/@calculogic/validator run ...` case against an installed (non-linked) copy,
//     where `targetRepositoryRoot` resolves to the outer consumer's own unrelated repository root.
// Neither matching is a clear, explicit error rather than silently treating an unrelated
// repository, or an installed package, as the validator development root.
const resolveScopeRootLayout = ({ repoRoot, packageRoot }) => {
  const context = resolveValidatorDevelopmentContext({ targetRepositoryRoot: repoRoot, packageRoot });

  if (context.kind === 'embedded-development') {
    return { relativeRoot: EMBEDDED_SCOPE_ROOT, allowedRootAbsolute: context.validatorDevelopmentRoot };
  }

  if (context.kind === 'standalone-development') {
    return { relativeRoot: STANDALONE_SCOPE_ROOT, allowedRootAbsolute: context.validatorDevelopmentRoot };
  }

  return null;
};

const buildScopeConfig = ({ scope, repoRoot, packageRoot }) => {
  if (scope !== SUPPORTED_SCOPE) {
    throw new Error(`Unsupported scope: ${scope ?? '(missing)'}`);
  }

  const layout = resolveScopeRootLayout({ repoRoot, packageRoot });
  if (!layout) {
    throw new Error(
      `validator-development-root-unavailable: --scope=validator requires either a ` +
        `'${EMBEDDED_SCOPE_ROOT}/' directory beneath the repository root or the repository ` +
        `root itself being the actual standalone development checkout this code is running ` +
        `from (an installed/packaged copy is not sufficient).`,
    );
  }

  return {
    scope: SUPPORTED_SCOPE,
    sourceNamespace: SOURCE_NAMESPACE,
    defaultRoots: [layout.relativeRoot],
    allowedRootAbsolute: layout.allowedRootAbsolute,
  };
};

export const parseAddressingGetTreeArgs = (argv) => {
  let scope;
  let format = GET_TREE_RENDER_VIEW.defaultFormat;
  const targets = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      return { helpRequested: true, scope, format, targets };
    }

    if (argument === '--scope') {
      const rawScope = argv[index + 1];
      if (!rawScope || rawScope.startsWith('--')) {
        throw new Error('Missing required value for --scope');
      }
      scope = rawScope;
      index += 1;
      continue;
    }

    if (argument.startsWith('--scope=')) {
      scope = argument.slice('--scope='.length);
      continue;
    }

    if (argument === '--target') {
      const rawTarget = argv[index + 1];
      if (!rawTarget || rawTarget.startsWith('--')) {
        throw new Error('Missing required value for --target');
      }
      targets.push(normalizeCliPath(rawTarget));
      index += 1;
      continue;
    }

    if (argument.startsWith('--target=')) {
      const rawTarget = argument.slice('--target='.length);
      if (!rawTarget) {
        throw new Error('Missing required value for --target');
      }
      targets.push(normalizeCliPath(rawTarget));
      continue;
    }

    if (argument === '--format') {
      const rawFormat = argv[index + 1];
      if (!rawFormat || rawFormat.startsWith('--')) {
        throw new Error('Missing required value for --format');
      }
      format = rawFormat;
      index += 1;
      continue;
    }

    if (argument.startsWith('--format=')) {
      const rawFormat = argument.slice('--format='.length);
      if (!rawFormat) {
        throw new Error('Missing required value for --format');
      }
      format = rawFormat;
      continue;
    }

    throw new Error(`Unknown flag: ${argument}`);
  }

  if (!scope) {
    throw new Error('Missing required --scope');
  }

  if (scope !== SUPPORTED_SCOPE) {
    throw new Error(`Unsupported scope: ${scope}`);
  }

  if (!GET_TREE_RENDER_VIEW.supportedFormats.includes(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }

  return { helpRequested: false, scope, format, targets };
};


const assertNoSymlinkPathSegments = async ({ absolutePath, allowedRootAbsolute, target }) => {
  const relative = path.relative(allowedRootAbsolute, absolutePath);

  if (relative === '') {
    const rootStat = await fs.lstat(absolutePath);
    if (rootStat.isSymbolicLink()) {
      throw new Error(`Target path is a symbolic link and cannot be walked safely: ${target}`);
    }
    return;
  }

  const segments = relative.split(path.sep).filter(Boolean);
  let cursor = allowedRootAbsolute;

  for (const segment of segments) {
    cursor = path.join(cursor, segment);

    let segmentStat;
    try {
      segmentStat = await fs.lstat(cursor);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Target path does not exist: ${target}`);
      }
      throw error;
    }

    if (segmentStat.isSymbolicLink()) {
      throw new Error(`Target path traverses a symbolic link and cannot be walked safely: ${target}`);
    }
  }
};

const toOccurrenceNode = async ({ absolutePath, allowedRootAbsolute, sourceNamespace }) => {
  const stat = await fs.lstat(absolutePath);

  if (stat.isSymbolicLink()) {
    return null;
  }

  const relativePath = namespacedRelativePath({ absolutePath, allowedRootAbsolute, sourceNamespace });
  const name = absolutePath === allowedRootAbsolute ? sourceNamespace : path.basename(absolutePath);

  if (stat.isDirectory()) {
    const children = await fs.readdir(absolutePath);
    const includedChildren = children.filter((childName) => !EXCLUDED_WALK_NAMES.has(childName));
    includedChildren.sort((left, right) => left.localeCompare(right));

    const childNodes = [];

    for (const childName of includedChildren) {
      const childNode = await toOccurrenceNode({
        absolutePath: path.join(absolutePath, childName),
        allowedRootAbsolute,
        sourceNamespace,
      });
      if (childNode) {
        childNodes.push(childNode);
      }
    }

    return {
      name,
      path: relativePath,
      occurrenceType: STRUCTURAL_ADDRESSING_OCCURRENCE_TYPES.FOLDER,
      children: childNodes,
    };
  }

  return {
    name,
    path: relativePath,
    occurrenceType: STRUCTURAL_ADDRESSING_OCCURRENCE_TYPES.FILE,
  };
};

export const buildTreeCodebaseInputFromFileSystem = async ({ scope, targets, cwd, packageRoot }) => {
  const repoRoot = await findRepositoryRoot({ cwd });
  const scopeConfig = buildScopeConfig({ scope, repoRoot, packageRoot });

  const selectedTargets = targets.length > 0 ? [...targets] : scopeConfig.defaultRoots;
  const scopeRoots = [];

  for (const target of selectedTargets) {
    const resolvedTarget = resolveRepoRelativeTarget({ repoRoot, target });

    if (!isInsideOrEqual({ child: resolvedTarget, parent: scopeConfig.allowedRootAbsolute })) {
      throw new Error(`Target is outside supported scope: ${target}`);
    }

    await assertNoSymlinkPathSegments({
      absolutePath: resolvedTarget,
      allowedRootAbsolute: scopeConfig.allowedRootAbsolute,
      target,
    });

    const rootNode = await toOccurrenceNode({
      absolutePath: resolvedTarget,
      allowedRootAbsolute: scopeConfig.allowedRootAbsolute,
      sourceNamespace: scopeConfig.sourceNamespace,
    });

    if (!rootNode) {
      throw new Error(`Target path is a symbolic link and cannot be walked safely: ${target}`);
    }

    scopeRoots.push(rootNode);
  }

  scopeRoots.sort((left, right) => left.path.localeCompare(right.path));

  return {
    sourceNamespace: scopeConfig.sourceNamespace,
    scope: scopeConfig.scope,
    target: targets.length > 0 ? [...targets] : null,
    scopeRoots,
  };
};

export const runAddressingGetTreeHost = async ({ argv, cwd, stdout, stderr, packageRoot }) => {
  try {
    const parsed = parseAddressingGetTreeArgs(argv);

    if (parsed.helpRequested) {
      stdout.write(`${USAGE_TEXT}\n`);
      return 0;
    }

    const input = await buildTreeCodebaseInputFromFileSystem({
      scope: parsed.scope,
      targets: parsed.targets,
      cwd,
      packageRoot,
    });
    const addressedTreeSnapshot = prepareTreeCodebaseAddressedSnapshot(input);
    const { renderedTree } = renderTreeCodebaseAddressedSnapshot(addressedTreeSnapshot);

    if (parsed.format === STRUCTURAL_ADDRESSING_RENDER_FORMATS.TEXT) {
      stdout.write(`${renderedTree}\n`);
      return 0;
    }

    if (parsed.format === STRUCTURAL_ADDRESSING_RENDER_FORMATS.JSON) {
      stdout.write(`${JSON.stringify({ addressedTreeSnapshot }, null, 2)}\n`);
      return 0;
    }

    stdout.write(`${JSON.stringify({ addressedTreeSnapshot, renderedTree }, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
};

export const isDirectCliEntrypoint = ({ importMetaUrl, argvPath }) => {
  if (!argvPath) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvPath).href;
};

if (isDirectCliEntrypoint({ importMetaUrl: import.meta.url, argvPath: process.argv[1] })) {
  const exitCode = await runAddressingGetTreeHost({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
