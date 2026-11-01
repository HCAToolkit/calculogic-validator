// Active profile selection and the prepared foundation (cfg-linguisticFoundation 5.2.4, 5.2.7; contract
// §5.3 D2, §15; calculogic-validator#148).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareLinguisticFoundation } from '../src/linguistic-foundation.wiring.mjs';
import { selectActiveLanguageProfile } from '../src/linguistic-foundation-profile-selection.logic.mjs';
import { resolveSurfaceForm } from '../src/linguistic-foundation-resolution.logic.mjs';
import { BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT, getBuiltinLanguageProfileRegistries, loadLanguageProfileRegistriesFromRegistryRoot } from '../src/registries/linguistic-foundation-language-profile-registry.logic.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('D2: selection is explicit, with exactly one status per selection and no fallback', () => {
  const registeredProfiles = [{ profileId: 'english', profileVersion: '1' }];
  const cases = [
    [undefined, 'none', [], null],
    [null, 'none', [], null],
    [{ profileId: 'english' }, 'active', [], 'english'],
    [{ profileId: 'english', profileVersion: '1' }, 'active', [], 'english'],
    [{ profileId: 'english', profileVersion: '2' }, 'invalid', ['profile-version-mismatch'], null],
    [{ profileId: 'french' }, 'invalid', ['profile-not-registered'], null],
    [{ profileId: 'English' }, 'invalid', ['profile-not-registered'], null],
    ['english', 'invalid', ['selection-malformed'], null],
    [{}, 'invalid', ['selection-malformed'], null],
    [{ profileId: '' }, 'invalid', ['selection-malformed'], null],
    [{ profileId: 'english', profileVersion: 1 }, 'invalid', ['selection-malformed'], null],
    [{ profileId: 'english', locale: 'en' }, 'invalid', ['selection-malformed'], null],
    [['english'], 'invalid', ['selection-malformed'], null],
  ];
  for (const [selection, status, problems, profileId] of cases) {
    const result = selectActiveLanguageProfile({ selection, registeredProfiles });
    const label = JSON.stringify(selection);
    assert.equal(result.status, status, label);
    assert.deepEqual(result.problems, problems, label);
    assert.equal(result.profile?.profileId ?? null, profileId, label);
    assert.ok(Object.isFrozen(result), label);
  }
});

test('no profile is active without a selection: no default, and nothing is read from the environment', () => {
  const saved = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL };
  try {
    process.env.LANG = 'en_US.UTF-8';
    process.env.LC_ALL = 'en_US.UTF-8';
    const foundation = prepareLinguisticFoundation();
    assert.deepEqual(foundation.selection, { status: 'none', requested: null, problems: [] });
    assert.equal(foundation.profile, null);
    assert.equal(resolveSurfaceForm(foundation.profile, 'rules').status, 'profile-unavailable');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('an explicit english selection activates english v1; an invalid one leaves every resolution profile-unavailable', () => {
  const active = prepareLinguisticFoundation({ profileSelection: { profileId: 'english', profileVersion: '1' } });
  assert.equal(active.selection.status, 'active');
  assert.equal(resolveSurfaceForm(active.profile, 'rules').status, 'resolved');
  for (const profileSelection of [{ profileId: 'french' }, { profileId: 'english', profileVersion: '0' }]) {
    const invalid = prepareLinguisticFoundation({ profileSelection });
    assert.equal(invalid.selection.status, 'invalid');
    assert.equal(invalid.profile, null);
    assert.equal(resolveSurfaceForm(invalid.profile, 'rules').status, 'profile-unavailable');
  }
  assert.ok(Object.isFrozen(active) && Object.isFrozen(active.selection));
});

test('a further language profile is an inventory entry and a registry file, with no change to the foundation logic', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'linguistic-foundation-profiles-'));
  try {
    fs.copyFileSync(path.join(BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT, 'english-language-profile.registry.json'), path.join(root, 'english-language-profile.registry.json'));
    // A language without grammatical number declares the space not-applicable (contract §5.1).
    const numberless = {
      version: '1',
      profileId: 'numberless-sample',
      profileVersion: '1',
      featureSupport: { number: { singular: 'not-applicable', plural: 'not-applicable' } },
      entries: [{ lexemeId: 'numberless-sample.regel', forms: [{ surface: 'regel', features: {} }] }],
    };
    fs.writeFileSync(path.join(root, 'numberless-sample-language-profile.registry.json'), JSON.stringify(numberless));
    const inventory = [
      { profileId: 'english', registryFilename: 'english-language-profile.registry.json' },
      { profileId: 'numberless-sample', registryFilename: 'numberless-sample-language-profile.registry.json' },
    ];
    const foundation = prepareLinguisticFoundation({ registryRoot: root, inventory, profileSelection: { profileId: 'numberless-sample' } });
    assert.equal(foundation.selection.status, 'active');
    assert.deepEqual(resolveSurfaceForm(foundation.profile, 'regel').readings, [{ lexemeId: 'numberless-sample.regel', features: {}, basis: 'lexicon-entry' }]);
    assert.equal(resolveSurfaceForm(foundation.profile, 'rule').status, 'unknown', 'english entries do not leak into another profile');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the generic foundation modules hold no language-specific content', () => {
  const generic = [
    'linguistic-foundation.knowledge.mjs',
    'linguistic-foundation-runtime-converters.logic.mjs',
    'linguistic-foundation-profile-selection.logic.mjs',
    'linguistic-foundation-resolution.logic.mjs',
    'linguistic-foundation.wiring.mjs',
    'registries/linguistic-foundation-language-profile-registry.logic.mjs',
  ];
  // Language content is whatever a profile registry declares: its id, lexemes and surface forms.
  const english = JSON.parse(fs.readFileSync(path.join(BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT, 'english-language-profile.registry.json'), 'utf8'));
  const literals = [english.profileId, ...english.entries.flatMap((entry) => [entry.lexemeId, ...entry.forms.map((form) => form.surface)])];
  for (const file of generic) {
    const source = fs.readFileSync(path.join(REPOSITORY_ROOT, 'linguistic-foundation/src', file), 'utf8');
    assert.doesNotMatch(source, /english/iu, `${file}: names a language`);
    for (const literal of literals) {
      assert.equal(source.includes(`'${literal}'`) || source.includes(`"${literal}"`), false, `${file}: holds the form or identifier ${literal}`);
    }
  }
});

test('boundaries: no slice, suite module or package entry reads the foundation yet (contract §15.4)', () => {
  const consumers = ['src', 'naming/src', 'tree/src', 'structural-addressing/src', 'bin', 'scripts'];
  const walk = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : /\.(mjs|js|json)$/u.test(entry.name) ? [full] : [];
    });
  for (const root of consumers) {
    for (const file of walk(path.join(REPOSITORY_ROOT, root))) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /linguistic-foundation/u, path.relative(REPOSITORY_ROOT, file));
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.files.some((entry) => entry.startsWith('linguistic-foundation')), false, 'not packaged until its first consumer');
});

test('regression (PR #149 review): the cached builtin registries cannot be changed by a caller', () => {
  const resolveRule = () => resolveSurfaceForm(prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile, 'rule');
  const before = resolveRule();
  assert.equal(before.status, 'resolved');
  const cached = getBuiltinLanguageProfileRegistries();
  const [record] = cached;
  const attempts = [
    () => { record.payload.entries.length = 0; },
    () => { record.payload.entries[0].forms.pop(); },
    () => { record.payload.entries.push({ lexemeId: 'english.status', forms: [{ surface: 'status', features: {} }] }); },
    () => { record.payload.entries[1].forms[0].surface = 'rulez'; },
    () => { record.payload.featureSupport.number.plural = 'unsupported'; },
    () => { record.payload.profileVersion = '2'; },
    () => { record.lexiconDigest = 'x'; },
    () => { cached.length = 0; },
    () => { cached.push(record); },
  ];
  for (const attempt of attempts) assert.throws(attempt, TypeError);
  assert.deepEqual(resolveRule(), before, 'a later preparation resolves exactly as before');
  // A registry loaded from any root is frozen the same way.
  const [fromRoot] = loadLanguageProfileRegistriesFromRegistryRoot(BUILTIN_LANGUAGE_PROFILE_REGISTRY_ROOT);
  assert.ok(Object.isFrozen(fromRoot) && Object.isFrozen(fromRoot.payload.entries[0].forms[0].features));
});
