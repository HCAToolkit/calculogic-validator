// Suite-core repository package identity (capability inventory §3.11; calculogic-validator#159).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectDeclaredRepositoryPackageIdentity, toRepositoryPackageIdentity } from '../src/core/repository-package-identity.logic.mjs';
import { readTargetRootManifest } from '../src/core/repository-root-manifest.logic.mjs';

// A validation target whose root manifest is written as given text (or not at all).
const withTarget = (run, manifestText) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-package-identity-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  try {
    if (manifestText !== undefined) fs.writeFileSync(path.join(targetRoot, 'package.json'), manifestText);
    return run({ targetRoot, outsideRoot: fixtureRoot });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};
const identityOf = (manifestText) => withTarget(({ targetRoot }) => collectDeclaredRepositoryPackageIdentity(targetRoot), manifestText);

test('a scoped or unscoped `name` is the fact, as raw segments', () => {
  assert.deepEqual(identityOf(JSON.stringify({ name: '@calculogic/validator', version: '0.1.0' })), { scope: 'calculogic', name: 'validator' });
  assert.deepEqual(identityOf(JSON.stringify({ name: 'ledger' })), { scope: null, name: 'ledger' });
  // No normalization: case and separators are kept for Naming to interpret.
  assert.deepEqual(identityOf(JSON.stringify({ name: '@Acme/Widget_Kit' })), { scope: 'Acme', name: 'Widget_Kit' });
});

test('no manifest, an unreadable or non-object manifest, or no supported `name` gives no fact and no error', () => {
  assert.equal(identityOf(undefined), null, 'no manifest');
  assert.equal(identityOf('{"name": "@acme/widget",'), null, 'malformed JSON');
  assert.equal(identityOf('["@acme/widget"]'), null, 'not an object');
  assert.equal(identityOf('{}'), null, 'no name');
  for (const name of [5, null, true, ['a'], { scope: 'a' }]) assert.equal(identityOf(JSON.stringify({ name })), null, `non-string ${JSON.stringify(name)}`);
});

test('the `name` forms: exactly `@<scope>/<name>` or `<name>`, never trimmed or repaired', () => {
  for (const name of ['', '@', '@acme', '@acme/', '@/widget', '@acme/widget/extra', 'acme/widget', '/widget', ' widget', 'widget ', '@acme /widget', 'wid get', '@acme/wid\tget']) {
    assert.equal(toRepositoryPackageIdentity(name), null, JSON.stringify(name));
  }
  assert.deepEqual(toRepositoryPackageIdentity('@acme/widget-kit'), { scope: 'acme', name: 'widget-kit' });
  assert.deepEqual(toRepositoryPackageIdentity('widget-kit'), { scope: null, name: 'widget-kit' });
});

test('the manifest must be contained and spelled exactly (shared root-manifest read, §3.9-§3.11)', () => {
  withTarget(({ targetRoot, outsideRoot }) => {
    fs.writeFileSync(path.join(outsideRoot, 'outside.json'), JSON.stringify({ name: '@outside/package' }));
    fs.symlinkSync(path.join(outsideRoot, 'outside.json'), path.join(targetRoot, 'package.json'));
    assert.equal(readTargetRootManifest(targetRoot), null, 'escaping manifest');
    assert.equal(collectDeclaredRepositoryPackageIdentity(targetRoot), null);
  });
  withTarget(({ targetRoot }) => {
    fs.writeFileSync(path.join(targetRoot, 'Package.json'), JSON.stringify({ name: '@acme/widget' }));
    assert.equal(collectDeclaredRepositoryPackageIdentity(targetRoot), null, 'another spelling is not the manifest');
  });
});
