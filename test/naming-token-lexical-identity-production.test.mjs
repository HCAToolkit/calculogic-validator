// Naming lexical-evidence production and first-consumer integration (bridge contract §4.7; validator
// config spec §10; Linguistic Foundation shared contract §8.5, §15.4; calculogic-validator#150).
// The acceptance standard: with no selected profile every run keeps its behavior and output; with an
// explicitly selected profile the run carries the promised evidence or stops with the prescribed error.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveActiveRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { runValidatorRunner } from '../src/core/validator-runner.logic.mjs';
import { prepareRunLinguisticFoundation } from '../src/core/config/validator-linguistic-profile.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../naming/src/naming-validator.host.mjs';
import { projectNamingTokenLexicalIdentities } from '../naming/src/naming-token-lexical-identity-projection.logic.mjs';
import { prepareTreeStructureAdvisorInputs, runTreeStructureAdvisor } from '../tree/src/tree-structure-advisor.host.mjs';
import { compareLexicalResolutions } from '../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = 'repo';

// One real run, staged with and without the english profile.
const registryResolution = resolveActiveRegistrySet({ targetRoot: ROOT });
const namingRun = runNamingValidator(ROOT, { scope: SCOPE, registryResolution });
const foundation = prepareRunLinguisticFoundation({ version: '0.1', linguisticProfile: { profileId: 'english' } });
const stagedWithout = prepareNamingTreeStagingInputs(namingRun, { registryResolution });
const stagedWith = prepareNamingTreeStagingInputs(namingRun, { registryResolution, linguisticFoundation: foundation });
const treeInputs = (staged) => prepareTreeStructureAdvisorInputs(ROOT, { scope: SCOPE, registryResolution, ...staged });
const [inputsWithout, inputsWith] = [treeInputs(stagedWithout), treeInputs(stagedWith)];
const bridgeWithout = inputsWithout.preparedDependencies.addressedNamingOccurrenceBridge;
const bridgeWith = inputsWith.preparedDependencies.addressedNamingOccurrenceBridge;
const section = bridgeWith.namingTokenLexicalIdentities;

const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : /\.mjs$/u.test(entry.name) ? [full] : [];
  });

test('R3: Naming owns production; no Tree or suite-core module resolves, compares or builds the section', () => {
  const forbidden = ['resolveSurfaceForm', 'compareLexicalResolutions', 'projectNamingTokenLexicalIdentities', 'naming-token-lexical-identity-projection', 'linguistic-foundation-resolution'];
  for (const root of ['tree/src', 'src', 'structural-addressing/src', 'bin', 'scripts']) {
    for (const file of walk(path.join(ROOT, root))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const name of forbidden) assert.equal(source.includes(name), false, `${path.relative(ROOT, file)} references ${name}`);
    }
  }
  // Exactly two modules outside the foundation import it: Naming's projection (resolution) and suite
  // core's run selection (the prepared foundation).
  const importers = ['src', 'naming/src', 'tree/src', 'structural-addressing/src', 'bin', 'scripts']
    .flatMap((root) => walk(path.join(ROOT, root)))
    .filter((file) => fs.readFileSync(file, 'utf8').includes('linguistic-foundation/src/'))
    .map((file) => path.relative(ROOT, file))
    .sort();
  assert.deepEqual(importers, ['naming/src/naming-token-lexical-identity-projection.logic.mjs', 'src/core/config/validator-linguistic-profile.logic.mjs']);
});

test('R3: staging adds the opaque profile only when one is active; Tree transports it unchanged', () => {
  assert.equal('lexicalProfile' in stagedWithout, false);
  assert.equal(stagedWith.lexicalProfile, foundation.profile, 'the same frozen runtime profile, not a copy or a derivation');
  assert.deepEqual(Object.keys(stagedWith).sort(), [...Object.keys(stagedWithout), 'lexicalProfile'].sort());
});

test('R3: the payload Tree builds equals what the Naming producer builds from the same inputs', () => {
  assert.ok(section, 'the Tree-built payload carries the section');
  const { namingTokenLexicalIdentities, ...rest } = bridgeWith;
  assert.deepEqual(rest, bridgeWithout, 'nothing else in the payload changes');
  assert.equal('namingTokenLexicalIdentities' in bridgeWithout, false);
  assert.deepEqual(
    namingTokenLexicalIdentities,
    projectNamingTokenLexicalIdentities({
      semanticEvidenceEnrichmentSection: bridgeWith.namingSemanticEvidenceEnrichment,
      folderLabelObservationSection: bridgeWith.namingFolderLabelObservations,
      lexicalProfile: foundation.profile,
    }),
  );
  const eligible =
    bridgeWith.namingSemanticEvidenceEnrichment.records.filter((record) => record.semanticTokens?.length > 0).length +
    bridgeWith.namingFolderLabelObservations.records.filter((record) => record.parseOutcome === 'parsed').length;
  assert.equal(section.recordCount, eligible);
});

test('Tree conclusions are unchanged with the section present: every prepared evidence record and every finding', () => {
  const dependenciesWithout = inputsWithout.preparedDependencies;
  const dependenciesWith = inputsWith.preparedDependencies;
  // Data only: prepared runtimes hold functions created per call, which are not evidence.
  const asData = (value) =>
    JSON.stringify(value, (_, item) => (typeof item === 'function' ? '<function>' : item instanceof Map ? [...item.entries()] : item instanceof Set ? [...item] : item));
  for (const key of Object.keys(dependenciesWithout)) {
    if (key === 'addressedNamingOccurrenceBridge') continue;
    assert.equal(asData(dependenciesWith[key]), asData(dependenciesWithout[key]), key);
  }
  const findings = (staged) => runTreeStructureAdvisor(ROOT, { scope: SCOPE, registryResolution, registryRoots: registryResolution.registryRoots, ...staged }).findings;
  assert.deepEqual(findings(stagedWith), findings(stagedWithout));
});

test('measured coverage: the section relates the E10, E10.1 and E11 folder labels to their member tokens', () => {
  const pathOf = (record) => record.repoRelativePath;
  const asResolution = (entry) => ({ ...entry, provenance: section.lexicalProfile });
  const labelOf = (folder) => section.records.find((record) => record.tokenSource === 'label-tokens' && pathOf(record) === folder);
  const membersOf = (folder) => section.records.filter((record) => record.tokenSource === 'semantic-tokens' && pathOf(record).startsWith(`${folder}/`) && !pathOf(record).slice(folder.length + 1).includes('/'));
  for (const [folder, lexemeId] of [['naming/src/rules', 'english.rule'], ['tree/src/registries', 'english.registry'], ['naming/src/registries', 'english.registry']]) {
    const label = labelOf(folder);
    assert.deepEqual(label.tokens.map((entry) => [entry.status, entry.readings.map((reading) => reading.lexemeId)]), [['resolved', [lexemeId]]], folder);
    const related = membersOf(folder).filter((record) => record.tokens.some((entry) => compareLexicalResolutions(asResolution(label.tokens[0]), asResolution(entry)) === 'same-lexeme'));
    assert.ok(related.length > 0, `${folder}: at least one member token is the same lexeme as the label`);
  }
  // Undeclared forms stay `unknown`, never derived.
  const statuses = new Map(section.records.flatMap((record) => record.tokens).map((entry) => [entry.surface, entry.status]));
  for (const surface of ['status', 'address', 'policies', 'contributors']) if (statuses.has(surface)) assert.equal(statuses.get(surface), 'unknown', surface);
});

test('provenance: the runner report carries linguisticProfile only with an active profile', () => {
  const report = (options) => runValidatorRunner(ROOT, { scope: 'system', registryResolution, ...options });
  assert.equal('linguisticProfile' in report({}), false);
  assert.deepEqual(report({ linguisticFoundation: foundation }).linguisticProfile, { profileId: 'english', profileVersion: '1', lexiconDigest: foundation.profile.lexiconDigest });
});

test('R2: all three CLIs behave identically for every selection case', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'linguistic-profile-cli-'));
  const configs = {
    plain: { version: '0.1' },
    malformedNotObject: { version: '0.1', linguisticProfile: 'english' },
    malformedEmptyId: { version: '0.1', linguisticProfile: { profileId: '' } },
    malformedExtraField: { version: '0.1', linguisticProfile: { profileId: 'english', locale: 'en' } },
    malformedVersionType: { version: '0.1', linguisticProfile: { profileId: 'english', profileVersion: 1 } },
    malformedExtraFieldPinned: { version: '0.1', linguisticProfile: { profileId: 'english', profileVersion: '1', locale: 'en' } },
    malformedIdType: { version: '0.1', linguisticProfile: { profileId: 7, profileVersion: '1' } },
    unregistered: { version: '0.1', linguisticProfile: { profileId: 'french' } },
    mismatch: { version: '0.1', linguisticProfile: { profileId: 'english', profileVersion: '2' } },
    valid: { version: '0.1', linguisticProfile: { profileId: 'english' } },
    validPinned: { version: '0.1', linguisticProfile: { profileId: 'english', profileVersion: '1' } },
  };
  try {
    for (const [name, value] of Object.entries(configs)) fs.writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(value));
    const run = (bin, name) =>
      spawnSync(process.execPath, [path.join(ROOT, 'bin', bin), '--scope=system', ...(name ? [`--config=${path.join(directory, `${name}.json`)}`] : [])], { cwd: ROOT, encoding: 'utf8' });
    const outcomes = {};
    for (const bin of ['calculogic-validate-naming.host.mjs', 'calculogic-validate-tree.host.mjs', 'calculogic-validate.host.mjs']) {
      const none = run(bin, null);
      const plain = run(bin, 'plain');
      const noneReport = JSON.parse(none.stdout);
      assert.equal('linguisticProfile' in noneReport, false, `${bin}: no selection, no provenance`);
      assert.equal('linguisticProfile' in JSON.parse(plain.stdout), false, `${bin}: a config without the key, no provenance`);
      const summary = {};
      for (const name of Object.keys(configs).filter((key) => key !== 'plain')) {
        const result = run(bin, name);
        if (name.startsWith('valid')) {
          assert.equal(result.status, none.status, `${bin} ${name}: runs with the same exit code`);
          const report = JSON.parse(result.stdout);
          assert.deepEqual(report.linguisticProfile, { profileId: 'english', profileVersion: '1', lexiconDigest: foundation.profile.lexiconDigest }, `${bin} ${name}`);
          assert.notEqual(report.configDigest, JSON.parse(plain.stdout).configDigest, `${bin} ${name}: the selection changes configDigest`);
          summary[name] = 'continue';
          continue;
        }
        assert.equal(result.status, 1, `${bin} ${name}: stops`);
        assert.equal(result.stdout, '', `${bin} ${name}: no report`);
        summary[name] = 'stop';
        if (name === 'unregistered') assert.match(result.stderr, /profile-not-registered\): requested profileId "french"\./u, bin);
        if (name === 'mismatch') assert.match(result.stderr, /profile-version-mismatch\): requested profileId "english", profileVersion "2"\./u, bin);
        if (name.startsWith('malformed')) assert.match(result.stderr, /Invalid validator config: linguisticProfile/u, `${bin} ${name}`);
        // §10.4: stage-1 diagnostics name the valid parts of the request, or the malformed field.
        const expected = {
          malformedNotObject: /linguisticProfile must be an object when provided\./u,
          malformedEmptyId: /linguisticProfile\.profileId must be a non-empty string\./u,
          malformedExtraField: /linguisticProfile contains unknown key "locale" \(requested profileId "english"\)\./u,
          malformedExtraFieldPinned: /linguisticProfile contains unknown key "locale" \(requested profileId "english", profileVersion "1"\)\./u,
          malformedVersionType: /linguisticProfile\.profileVersion must be a non-empty string when provided \(requested profileId "english"\)\./u,
          malformedIdType: /linguisticProfile\.profileId must be a non-empty string \(requested profileVersion "1"\)\./u,
        }[name];
        if (expected) assert.match(result.stderr, expected, `${bin} ${name}: diagnostic`);
      }
      outcomes[bin] = summary;
    }
    const [first, ...rest] = Object.values(outcomes);
    for (const other of rest) assert.deepEqual(other, first, 'identical outcomes across CLIs');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
