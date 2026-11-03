// Repository package identity (calculogic-validator#157, #159). Contract: capability inventory §3.11
// (doc/ConventionRoutines/ValidatorSuiteOwnedSharedHelpers-And-Capabilities.md).
//
// One neutral repository fact: the package identity the target's root manifest declares for itself,
// `{ scope, name }` as raw strings (`scope` is null when unscoped), or null. It reports the fact only:
// Naming interprets the segments (bridge contract §4.8) and Tree decides what they express (S3.2). No
// tokenization, case change or other normalization; a padded value is unsupported, not trimmed.

import { readTargetRootManifest } from './repository-root-manifest.logic.mjs';

const SCOPED_NAME = /^@([^/\s]+)\/([^/\s]+)$/u;
const UNSCOPED_NAME = /^[^@/\s][^/\s]*$/u;

// The fact for one manifest `name` value: `@<scope>/<name>` with exactly one `/`, or `<name>` with no
// `@` prefix and no `/`; neither segment empty or carrying whitespace. Anything else is null.
export const toRepositoryPackageIdentity = (manifestName) => {
  if (typeof manifestName !== 'string') {
    return null;
  }

  const scoped = SCOPED_NAME.exec(manifestName);
  if (scoped) {
    return { scope: scoped[1], name: scoped[2] };
  }

  return UNSCOPED_NAME.test(manifestName) ? { scope: null, name: manifestName } : null;
};

// The target's declared package identity, or null when the manifest is absent, escaping, unreadable,
// malformed or declares no supported `name`.
export const collectDeclaredRepositoryPackageIdentity = (targetRoot) => {
  const manifest = readTargetRootManifest(targetRoot);
  return manifest ? toRepositoryPackageIdentity(manifest.name) : null;
};
