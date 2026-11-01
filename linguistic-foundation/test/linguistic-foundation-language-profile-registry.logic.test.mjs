// Language profile registry loader and digest (cfg-linguisticFoundation 5.2.1, 5.2.2; contract §4.2,
// §5.1, §7, §15.2; calculogic-validator#148).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT,
  digestLanguageProfileRegistry,
  getBuiltinLanguageProfileRegistries,
  loadLanguageProfileRegistryFromRegistryRoot,
  normalizeLanguageProfileRegistryPayload,
} from '../src/registries/linguistic-foundation-language-profile-registry.logic.mjs';
import { LANGUAGE_PROFILE_INVENTORY } from '../src/registries/linguistic-foundation-language-profile-inventory.knowledge.mjs';

const builtinEnglish = () => JSON.parse(fs.readFileSync(path.join(BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT, 'english-language-profile.registry.json'), 'utf8'));

test('the builtin inventory loads: one english profile, version 1, the measured E10/E11 vocabulary', () => {
  assert.deepEqual(LANGUAGE_PROFILE_INVENTORY.map((entry) => entry.profileId), ['english']);
  const [{ payload, lexiconDigest }] = getBuiltinLanguageProfileRegistries();
  assert.equal(payload.profileId, 'english');
  assert.equal(payload.profileVersion, '1');
  assert.deepEqual(
    payload.entries.map((entry) => [entry.lexemeId, entry.forms.map((form) => `${form.surface}:${form.features.number}`)]),
    [
      ['english.registry', ['registry:singular', 'registries:plural']],
      ['english.rule', ['rule:singular', 'rules:plural']],
    ],
  );
  assert.match(lexiconDigest, /^[0-9a-f]{64}$/u);
  assert.equal(getBuiltinLanguageProfileRegistries(), getBuiltinLanguageProfileRegistries(), 'loaded once per process');
});

test('the digest ignores entry and form order and changes with any content or version change', () => {
  const payload = builtinEnglish();
  const digest = digestLanguageProfileRegistry(payload);
  const reordered = { ...payload, entries: [...payload.entries].reverse().map((entry) => ({ ...entry, forms: [...entry.forms].reverse() })) };
  assert.equal(digestLanguageProfileRegistry(reordered), digest);
  const changed = [
    { ...payload, profileVersion: '2' },
    { ...payload, version: '1', featureSupport: { number: { singular: 'supported', plural: 'unsupported' } } },
    { ...payload, entries: payload.entries.slice(1) },
    { ...payload, entries: payload.entries.map((entry, index) => (index === 0 ? { ...entry, forms: entry.forms.slice(0, 1) } : entry)) },
    { ...payload, entries: payload.entries.map((entry, index) => (index === 0 ? { ...entry, lexemeId: 'english.registries' } : entry)) },
  ];
  for (const variant of changed) assert.notEqual(digestLanguageProfileRegistry(variant), digest);
});

// Each invalid payload fails on its own rule.
const INVALID = [
  ['unknown root field', (p) => ({ ...p, notes: 'x' }), /unsupported field\(s\) notes/u],
  ['unreadable version', (p) => ({ ...p, version: '2' }), /version must be one of 1/u],
  ['profileId not kebab-case', (p) => ({ ...p, profileId: 'English' }), /profileId must be/u],
  ['profileId not the inventory one', (p) => ({ ...p, profileId: 'englisch', entries: p.entries.map((e) => ({ ...e, lexemeId: e.lexemeId.replace('english.', 'englisch.') })) }), /as the profile inventory registers it/u],
  ['profileVersion missing', (p) => ({ ...p, profileVersion: '' }), /profileVersion must be a non-empty string/u],
  ['feature support incomplete', (p) => ({ ...p, featureSupport: { number: { singular: 'supported' } } }), /featureSupport\.number\.plural must be one of/u],
  ['feature value added by the profile', (p) => ({ ...p, featureSupport: { number: { singular: 'supported', plural: 'supported', dual: 'supported' } } }), /featureSupport\.number has unsupported field\(s\) dual/u],
  ['feature space added by the profile', (p) => ({ ...p, featureSupport: { ...p.featureSupport, tense: { past: 'supported' } } }), /featureSupport has unsupported field\(s\) tense/u],
  ['unknown support status', (p) => ({ ...p, featureSupport: { number: { singular: 'supported', plural: 'maybe' } } }), /plural must be one of supported, unsupported, not-applicable/u],
  ['entries empty', (p) => ({ ...p, entries: [] }), /entries must be a non-empty array/u],
  ['lexeme outside the profile', (p) => ({ ...p, entries: [...p.entries, { lexemeId: 'other.rule', forms: [{ surface: 'x', features: {} }] }] }), /must begin with "english\."/u],
  ['lexeme without a name', (p) => ({ ...p, entries: [...p.entries, { lexemeId: 'english.', forms: [{ surface: 'x', features: {} }] }] }), /name a lexeme/u],
  ['lexeme declared twice', (p) => ({ ...p, entries: [...p.entries, { lexemeId: 'english.rule', forms: [{ surface: 'x', features: {} }] }] }), /declared more than once/u],
  ['unknown entry field', (p) => ({ ...p, entries: [{ ...p.entries[0], gloss: 'x' }, ...p.entries.slice(1)] }), /unsupported field\(s\) gloss/u],
  ['forms empty', (p) => ({ ...p, entries: [{ ...p.entries[0], forms: [] }, ...p.entries.slice(1)] }), /forms must be a non-empty array/u],
  ['surface empty', (p) => ({ ...p, entries: [{ ...p.entries[0], forms: [{ surface: '', features: {} }] }, ...p.entries.slice(1)] }), /surface must be a non-empty string/u],
  ['features missing', (p) => ({ ...p, entries: [{ ...p.entries[0], forms: [{ surface: 'x' }] }, ...p.entries.slice(1)] }), /features must be an object/u],
  ['unknown feature space on a form', (p) => ({ ...p, entries: [{ ...p.entries[0], forms: [{ surface: 'x', features: { tense: 'past' } }] }, ...p.entries.slice(1)] }), /not a foundation feature space/u],
  ['unsupported feature value on a form', (p) => ({ ...p, featureSupport: { number: { singular: 'supported', plural: 'unsupported' } } }), /value "plural" is not supported/u],
  ['form repeated', (p) => ({ ...p, entries: [{ ...p.entries[0], forms: [...p.entries[0].forms, p.entries[0].forms[0]] }, ...p.entries.slice(1)] }), /repeats a form/u],
  ['padded string', (p) => ({ ...p, entries: [{ ...p.entries[0], forms: [{ surface: 'rule ', features: {} }] }, ...p.entries.slice(1)] }), /leading or trailing whitespace/u],
];

test('each invalid registry payload is rejected, naming its problem', () => {
  assert.doesNotThrow(() => normalizeLanguageProfileRegistryPayload(builtinEnglish(), { expectedProfileId: 'english' }));
  for (const [name, change, message] of INVALID) {
    assert.throws(() => normalizeLanguageProfileRegistryPayload(change(builtinEnglish()), { expectedProfileId: 'english' }), message, name);
  }
});

test('the from-root variant reads one inventoried profile from any registry root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'linguistic-foundation-registry-'));
  try {
    const payload = builtinEnglish();
    fs.writeFileSync(path.join(root, 'english-language-profile.registry.json'), JSON.stringify(payload));
    const loaded = loadLanguageProfileRegistryFromRegistryRoot(root, LANGUAGE_PROFILE_INVENTORY[0]);
    assert.equal(loaded.lexiconDigest, getBuiltinLanguageProfileRegistries()[0].lexiconDigest);
    fs.writeFileSync(path.join(root, 'english-language-profile.registry.json'), JSON.stringify({ ...payload, version: '9' }));
    assert.throws(() => loadLanguageProfileRegistryFromRegistryRoot(root, LANGUAGE_PROFILE_INVENTORY[0]), /version must be one of 1/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
