import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNamingSemanticEvidenceEnrichment } from '../src/naming-semantic-evidence-enrichment-projection.logic.mjs';
import { runNamingValidator, projectNamingSemanticFamilyBridge } from '../src/naming-validator.host.mjs';

const canonicalFinding = (path, details) => ({
  path,
  classification: 'canonical',
  details: { semanticFamily: details.familyRoot, ...details },
});

test('projection copies Naming tokens verbatim: no re-splitting, sorting, or deduplication', () => {
  const { records } = projectNamingSemanticEvidenceEnrichment({
    findings: [
      // A semantic name containing `.` and a repeated token. The token list is copied as Naming
      // stored it; a deliberately unusual list proves the projection never re-derives it.
      canonicalFinding('src/config.v2-config.logic.mjs', {
        semanticName: 'config.v2-config',
        familyRoot: 'config',
        semanticTokens: ['config', 'v2', 'config'],
        role: 'logic',
        roleCategory: 'concern-core',
        roleStatus: 'active',
      }),
      canonicalFinding('src/zeta-alpha.logic.mjs', {
        semanticName: 'zeta-alpha',
        familyRoot: 'zeta',
        semanticTokens: ['zeta', 'alpha'],
      }),
    ],
  });

  assert.deepEqual(records, [
    {
      path: 'src/config.v2-config.logic.mjs',
      semanticTokens: ['config', 'v2', 'config'],
      role: 'logic',
      roleCategory: 'concern-core',
      roleStatus: 'active',
    },
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'] },
  ]);
});

test('projection never reconstructs tokens from semanticName', () => {
  const { records } = projectNamingSemanticEvidenceEnrichment({
    findings: [
      canonicalFinding('src/order-payment.logic.mjs', {
        semanticName: 'order-payment',
        familyRoot: 'order',
        semanticTokens: ['source', 'order', 'differs'],
        role: 'logic',
        roleCategory: 'concern-core',
        roleStatus: 'active',
      }),
    ],
  });

  assert.deepEqual(records[0].semanticTokens, ['source', 'order', 'differs']);
});

test('projection emits the role facts as one group or not at all', () => {
  const tokens = ['build', 'surface'];
  const { records } = projectNamingSemanticEvidenceEnrichment({
    findings: [
      canonicalFinding('a/complete.logic.mjs', {
        semanticName: 'build-surface', familyRoot: 'build', semanticTokens: tokens,
        role: 'logic', roleCategory: 'concern-core', roleStatus: 'active',
      }),
      canonicalFinding('b/missing-category.logic.mjs', {
        semanticName: 'build-surface', familyRoot: 'build', semanticTokens: tokens,
        role: 'logic', roleStatus: 'active',
      }),
      canonicalFinding('c/empty-status.logic.mjs', {
        semanticName: 'build-surface', familyRoot: 'build', semanticTokens: tokens,
        role: 'logic', roleCategory: 'concern-core', roleStatus: '',
      }),
    ],
  });

  assert.deepEqual(records, [
    { path: 'a/complete.logic.mjs', semanticTokens: tokens, role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' },
    { path: 'b/missing-category.logic.mjs', semanticTokens: tokens },
    { path: 'c/empty-status.logic.mjs', semanticTokens: tokens },
  ]);
});

test('projection excludes non-canonical findings, single-token names, and records with no field group', () => {
  const { records } = projectNamingSemanticEvidenceEnrichment({
    findings: [
      {
        path: 'src/legacy-name.logic.mjs',
        classification: 'legacy-exception',
        details: { semanticName: 'legacy-name', familyRoot: 'legacy', semanticFamily: 'legacy', semanticTokens: ['legacy', 'name'] },
      },
      // Single-token semantic names get no semantic-family details from Naming.
      { path: 'src/app.logic.mjs', classification: 'canonical', details: { semanticName: 'app', role: 'logic' } },
      canonicalFinding('src/no-groups.logic.mjs', { semanticName: 'no-groups', familyRoot: 'no' }),
      null,
      'not-a-finding',
    ],
  });

  assert.deepEqual(records, []);
});

test('projection selects the same canonical file observations as the semantic-family bridge projection', () => {
  const namingOutput = runNamingValidator(process.cwd(), { scope: 'repo' });
  const enrichmentPaths = projectNamingSemanticEvidenceEnrichment(namingOutput).records.map((record) => record.path);
  const canonicalFilePaths = projectNamingSemanticFamilyBridge(namingOutput)
    .observations.filter((observation) => observation.occurrenceType === undefined)
    .map((observation) => observation.path)
    .sort((left, right) => left.localeCompare(right));

  assert.ok(enrichmentPaths.length > 0);
  assert.deepEqual(enrichmentPaths, canonicalFilePaths);
});
