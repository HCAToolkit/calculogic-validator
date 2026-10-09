import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { VALIDATOR_CONFIG_VERSION } from '../src/core/config/validator-config.contracts.mjs';

test('validator config schema version const matches runtime contract version', () => {
  const schemaPath = path.join(
    process.cwd(),
    'src/validator-config.schema.json',
  );
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  assert.equal(schema?.properties?.version?.const, VALIDATOR_CONFIG_VERSION);
});


test('validator config schema declares no registry-record surfaces (#41)', () => {
  const schemaPath = path.join(
    process.cwd(),
    'src/validator-config.schema.json',
  );
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['$schema', 'strictExit', 'version']);
});

test('legacy core schema path is not independently maintained', () => {
  const legacySchemaPath = path.join(
    process.cwd(),
    'src/core/config/validator-config.schema.json',
  );

  assert.equal(fs.existsSync(legacySchemaPath), false);
});

