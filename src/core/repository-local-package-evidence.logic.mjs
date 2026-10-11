// Repository local-package evidence (#37). Contract: capability inventory §3.10
// (doc/ConventionRoutines/ValidatorSuiteOwnedSharedHelpers-And-Capabilities.md).
//
// One neutral repository fact: which top-level folders the target's root manifest explicitly
// declares as local packages, where each folder also has its own contained package manifest. Both
// sides are required. Only the documented forms qualify; anything else (nested paths, globs, other
// protocols, external workspace formats) does not, and is never reinterpreted into a supported
// form. Consumers decide what the fact allows.

import fs from 'node:fs';
import path from 'node:path';
import { isPathInsideTarget } from './target-path-containment.logic.mjs';

const MANIFEST_FILENAME = 'package.json';
const DEPENDENCY_FIELDS = Object.freeze(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']);
const LOCAL_PACKAGE_PROTOCOLS = Object.freeze(['file:', 'link:']);
const GLOB_CHARACTERS = /[*?[\]{}!]/u;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

// A contained JSON object, or null for anything that is absent, escaping, unreadable or not an object.
const readContainedJsonObject = (targetRoot, filePath) => {
  if (!isPathInsideTarget(targetRoot, filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// The top-level folder a declaration names exactly, or null. Accepted spellings: `<folder>`,
// `./<folder>`, each with or without one trailing `/`. Surrounding whitespace, on the reference or
// on the folder name inside it, is unsupported rather than trimmed.
const toDeclaredTopLevelFolder = (reference) => {
  if (reference !== reference.trim()) {
    return null;
  }

  const withoutDotSlash = reference.startsWith('./') ? reference.slice(2) : reference;
  const folder = withoutDotSlash.endsWith('/') ? withoutDotSlash.slice(0, -1) : withoutDotSlash;
  const isSingleSegment =
    folder.length > 0 &&
    folder === folder.trim() &&
    !folder.includes('/') &&
    !folder.includes('\\') &&
    folder !== '.' &&
    folder !== '..' &&
    !GLOB_CHARACTERS.test(folder);

  return isSingleSegment ? folder : null;
};

const collectDependencyDeclarations = (manifest) =>
  DEPENDENCY_FIELDS.flatMap((field) => {
    const section = manifest[field];
    if (!isPlainObject(section)) {
      return [];
    }

    return Object.entries(section).flatMap(([key, value]) => {
      if (typeof value !== 'string') {
        return [];
      }

      const protocol = LOCAL_PACKAGE_PROTOCOLS.find((candidate) => value.startsWith(candidate));
      const folder = protocol ? toDeclaredTopLevelFolder(value.slice(protocol.length)) : null;
      return folder ? [{ folder, declaration: { field, key, value } }] : [];
    });
  });

// `workspaces` as an array of strings, or as an object whose `packages` is an array of strings.
const collectWorkspaceDeclarations = (manifest) => {
  const { workspaces } = manifest;
  const [field, entries] = Array.isArray(workspaces)
    ? ['workspaces', workspaces]
    : isPlainObject(workspaces) && Array.isArray(workspaces.packages)
      ? ['workspaces.packages', workspaces.packages]
      : [null, []];

  return entries.flatMap((value) => {
    const folder = typeof value === 'string' ? toDeclaredTopLevelFolder(value) : null;
    return folder ? [{ folder, declaration: { field, value } }] : [];
  });
};

const isContainedDirectory = (targetRoot, directoryPath) => {
  if (!isPathInsideTarget(targetRoot, directoryPath)) {
    return false;
  }

  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
};

const compareDeclarations = (left, right) =>
  compareOrdinal(left.field, right.field) ||
  compareOrdinal(left.key ?? '', right.key ?? '') ||
  compareOrdinal(left.value, right.value);

// Returns `[{ folder, manifestPath, declarations }]`, sorted by folder.
export const collectDeclaredLocalPackageEvidence = (targetRoot) => {
  const rootManifest = readContainedJsonObject(targetRoot, path.join(targetRoot, MANIFEST_FILENAME));
  if (!rootManifest) {
    return [];
  }

  const declarationsByFolder = new Map();
  for (const { folder, declaration } of [
    ...collectDependencyDeclarations(rootManifest),
    ...collectWorkspaceDeclarations(rootManifest),
  ]) {
    declarationsByFolder.set(folder, [...(declarationsByFolder.get(folder) ?? []), declaration]);
  }

  return [...declarationsByFolder.keys()]
    .sort(compareOrdinal)
    .filter((folder) => {
      const folderPath = path.join(targetRoot, folder);
      return (
        isContainedDirectory(targetRoot, folderPath) &&
        readContainedJsonObject(targetRoot, path.join(folderPath, MANIFEST_FILENAME)) !== null
      );
    })
    .map((folder) => ({
      folder,
      manifestPath: `${folder}/${MANIFEST_FILENAME}`,
      declarations: [...declarationsByFolder.get(folder)].sort(compareDeclarations),
    }));
};
