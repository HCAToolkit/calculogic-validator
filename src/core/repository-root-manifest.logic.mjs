// Repository root manifest read (capability inventory §3.10, §3.11). The one place suite core reads
// the validation target's root `package.json` for its neutral repository facts.
//
// The manifest qualifies only when `<target>/package.json` is spelled exactly as a directory entry,
// resolves inside the target (§3.9) and parses as a JSON object. Anything else is no manifest, never
// an error: the Validator does not validate manifests.

import fs from 'node:fs';
import path from 'node:path';
import { isPathInsideTarget } from './target-path-containment.logic.mjs';

export const MANIFEST_FILENAME = 'package.json';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// A contained JSON object, or null for anything that is absent, escaping, unreadable or not an object.
export const readContainedJsonObject = (targetRoot, filePath) => {
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

// True when `name` is spelled exactly as an entry of `directoryPath`. Existence checks alone accept
// another spelling on a case-insensitive filesystem, so evidence would differ between hosts.
export const hasExactEntry = (directoryPath, name) => {
  try {
    return fs.readdirSync(directoryPath).includes(name);
  } catch {
    return false;
  }
};

// The target's root manifest as a plain object, or null.
export const readTargetRootManifest = (targetRoot) =>
  hasExactEntry(targetRoot, MANIFEST_FILENAME)
    ? readContainedJsonObject(targetRoot, path.join(targetRoot, MANIFEST_FILENAME))
    : null;
