/**
 * Configuration: cfg-linguisticFoundation
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md
 * Responsibility: Loader for language profile registries: read from a registry root, validate under
 *   contract §4.2 and §5.1, and digest canonically (contract §7, §15.2).
 * Invariants: policy-data checks only; no resolution, no runtime form (the converter owns it); an
 *   invalid payload throws, naming its problem; no language-specific content.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllowedFields, assertNoPaddedStrings, assertRegistryRootFields } from '../../../src/core/registry-entry-shape.logic.mjs';
import { digestRegistryPayload } from '../../../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { LANGUAGE_PROFILE_REGISTRY_VERSIONS, LINGUISTIC_FEATURE_SPACES, LINGUISTIC_SUPPORT_STATUSES } from '../linguistic-foundation.knowledge.mjs';
import { LANGUAGE_PROFILE_INVENTORY } from './linguistic-foundation-language-profile-inventory.knowledge.mjs';

export const BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT = fileURLToPath(new URL('./_builtin/', import.meta.url));

const ROOT_FIELDS = Object.freeze(['profileId', 'profileVersion', 'featureSupport', 'entries']);
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SUPPORT_STATUSES = Object.values(LINGUISTIC_SUPPORT_STATUSES);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const featureKey = (features) =>
  Object.keys(features)
    .sort()
    .map((space) => `${space}=${features[space]}`)
    .join(',');

// [5.2.1] cfg-linguisticFoundation · Primitive · "normalizeLanguageProfileRegistryPayload"
export const normalizeLanguageProfileRegistryPayload = (payload, { expectedProfileId } = {}) => {
  const label = `language profile ${expectedProfileId ?? payload?.profileId ?? '(unnamed)'}`;
  const fail = (message) => {
    throw new Error(`Invalid ${label} registry: ${message}`);
  };

  assertRegistryRootFields(payload, ROOT_FIELDS, { registryLabel: label });
  assertNoPaddedStrings(payload, { registryLabel: label });
  if (!LANGUAGE_PROFILE_REGISTRY_VERSIONS.includes(payload.version)) {
    fail(`version must be one of ${LANGUAGE_PROFILE_REGISTRY_VERSIONS.join(', ')}.`);
  }
  if (typeof payload.profileId !== 'string' || !KEBAB_CASE.test(payload.profileId)) fail('profileId must be kebab-case.');
  if (expectedProfileId !== undefined && payload.profileId !== expectedProfileId) {
    fail(`profileId must be ${expectedProfileId}, as the profile inventory registers it.`);
  }
  if (!isNonEmptyString(payload.profileVersion)) fail('profileVersion must be a non-empty string.');

  // §5.1: every foundation feature space and value has a declared status, and nothing more.
  if (!isPlainObject(payload.featureSupport)) fail('featureSupport must be an object.');
  assertAllowedFields(payload.featureSupport, Object.keys(LINGUISTIC_FEATURE_SPACES), { registryLabel: label, label: 'featureSupport' });
  for (const [space, values] of Object.entries(LINGUISTIC_FEATURE_SPACES)) {
    const declared = payload.featureSupport[space];
    if (!isPlainObject(declared)) fail(`featureSupport.${space} must declare ${values.join(', ')}.`);
    assertAllowedFields(declared, values, { registryLabel: label, label: `featureSupport.${space}` });
    for (const value of values) {
      if (!SUPPORT_STATUSES.includes(declared[value])) fail(`featureSupport.${space}.${value} must be one of ${SUPPORT_STATUSES.join(', ')}.`);
    }
  }

  // §4.2: entries and their forms.
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) fail('entries must be a non-empty array.');
  const lexemeIds = new Set();
  const forms = new Set();
  payload.entries.forEach((entry, entryIndex) => {
    const entryLabel = `entries[${entryIndex}]`;
    if (!isPlainObject(entry)) fail(`${entryLabel} must be an object.`);
    assertAllowedFields(entry, ['lexemeId', 'forms'], { registryLabel: label, label: entryLabel });
    if (!isNonEmptyString(entry.lexemeId) || !entry.lexemeId.startsWith(`${payload.profileId}.`) || entry.lexemeId.length === payload.profileId.length + 1) {
      fail(`${entryLabel}.lexemeId must begin with "${payload.profileId}." and name a lexeme.`);
    }
    if (lexemeIds.has(entry.lexemeId)) fail(`${entryLabel}.lexemeId ${entry.lexemeId} is declared more than once.`);
    lexemeIds.add(entry.lexemeId);
    if (!Array.isArray(entry.forms) || entry.forms.length === 0) fail(`${entryLabel}.forms must be a non-empty array.`);
    entry.forms.forEach((form, formIndex) => {
      const formLabel = `${entryLabel}.forms[${formIndex}]`;
      if (!isPlainObject(form)) fail(`${formLabel} must be an object.`);
      assertAllowedFields(form, ['surface', 'features'], { registryLabel: label, label: formLabel });
      if (!isNonEmptyString(form.surface)) fail(`${formLabel}.surface must be a non-empty string.`);
      if (!isPlainObject(form.features)) fail(`${formLabel}.features must be an object.`);
      for (const [space, value] of Object.entries(form.features)) {
        if (!Object.hasOwn(LINGUISTIC_FEATURE_SPACES, space)) fail(`${formLabel}.features.${space} is not a foundation feature space.`);
        // A value is one of the space's strings, checked before support: an array or other non-string
        // would otherwise coerce to a property key (["plural"] reads as "plural") and pass.
        if (typeof value !== 'string' || !LINGUISTIC_FEATURE_SPACES[space].includes(value)) {
          fail(`${formLabel}.features.${space} must be one of ${LINGUISTIC_FEATURE_SPACES[space].join(', ')}.`);
        }
        if (payload.featureSupport[space][value] !== LINGUISTIC_SUPPORT_STATUSES.supported) {
          fail(`${formLabel}.features.${space} value ${JSON.stringify(value)} is not supported by the profile.`);
        }
      }
      const key = `${form.surface}\u0000${entry.lexemeId}\u0000${featureKey(form.features)}`;
      if (forms.has(key)) fail(`${formLabel} repeats a form of ${entry.lexemeId}.`);
      forms.add(key);
    });
  });

  return payload;
};

// [5.2.2] cfg-linguisticFoundation · Primitive · "digestLanguageProfileRegistry"
// The suite's canonical registry digest; entry and form order never change it (contract §7).
export const LANGUAGE_PROFILE_DIGEST_DESCRIPTOR = Object.freeze({
  setLike: Object.freeze([
    Object.freeze({ path: 'entries', key: 'lexemeId' }),
    Object.freeze({ path: 'entries[].forms', key: 'surface' }),
  ]),
});
export const digestLanguageProfileRegistry = (payload) => digestRegistryPayload(payload, LANGUAGE_PROFILE_DIGEST_DESCRIPTOR);

// [5.2.1] cfg-linguisticFoundation · Primitive · "loadLanguageProfileRegistryFromRegistryRoot"
export const loadLanguageProfileRegistryFromRegistryRoot = (registryRoot, { profileId, registryFilename }) => {
  const payload = normalizeLanguageProfileRegistryPayload(JSON.parse(fs.readFileSync(path.join(registryRoot, registryFilename), 'utf8')), {
    expectedProfileId: profileId,
  });
  return { payload, lexiconDigest: digestLanguageProfileRegistry(payload) };
};

// Every inventoried profile from one registry root, in inventory order.
export const loadLanguageProfileRegistriesFromRegistryRoot = (registryRoot, inventory = LANGUAGE_PROFILE_INVENTORY) =>
  inventory.map((entry) => loadLanguageProfileRegistryFromRegistryRoot(registryRoot, entry));

let cachedBuiltinLanguageProfileRegistries = null;

// [5.2.1] cfg-linguisticFoundation · Primitive · "getBuiltinLanguageProfileRegistries"
export const getBuiltinLanguageProfileRegistries = () => {
  if (cachedBuiltinLanguageProfileRegistries === null) {
    cachedBuiltinLanguageProfileRegistries = loadLanguageProfileRegistriesFromRegistryRoot(BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT);
  }
  return cachedBuiltinLanguageProfileRegistries;
};
