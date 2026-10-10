import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllowedFields } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_SPECIAL_CASES_REGISTRY_PATH = fileURLToPath(
  new URL('special-cases.registry.json', BUILTIN_REGISTRY_ROOT),
);

let cachedBuiltinSpecialCaseRules = null;

const SPECIAL_CASES_REGISTRY_FILENAME = 'special-cases.registry.json';

// Supported match forms (cfg-namingValidator: basenameEquals, suffixEquals, regex).
const SPECIAL_CASE_MATCH_FORMS = Object.freeze(['basenameEquals', 'suffixEquals', 'regex']);

const loadSpecialCaseRulesFromFile = (registryFilePath) => {
  const payload = JSON.parse(fs.readFileSync(registryFilePath, 'utf8'));

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.specialCases)) {
    throw new Error('Invalid special-cases registry: missing specialCases array.');
  }

  return payload.specialCases.map((specialCase, index) => {
    const entryPrefix = `Invalid special-cases registry entry at index ${index}`;

    if (!specialCase || typeof specialCase !== 'object') {
      throw new Error(`${entryPrefix}: expected object.`);
    }

    assertAllowedFields(specialCase, ['type', 'match'], { registryLabel: 'special-cases', label: `entry ${index}` });
    if (typeof specialCase.type !== 'string' || specialCase.type.length === 0) {
      throw new Error(`${entryPrefix}: expected non-empty string type.`);
    }

    const match = specialCase.match;
    if (!match || typeof match !== 'object') {
      throw new Error(`${entryPrefix}: missing match object.`);
    }

    assertAllowedFields(match, SPECIAL_CASE_MATCH_FORMS, { registryLabel: 'special-cases', label: `entry ${index} match` });

    // Each entry declares exactly one match form; runtime evaluates one, so a second form would be
    // silently ignored.
    const declaredForms = SPECIAL_CASE_MATCH_FORMS.filter((form) => match[form] !== undefined);
    if (declaredForms.length !== 1) {
      throw new Error(
        `${entryPrefix}: match must declare exactly one of ${SPECIAL_CASE_MATCH_FORMS.join(', ')}.`,
      );
    }

    if (match.regex !== undefined && (typeof match.regex !== 'string' || match.regex.length === 0)) {
      throw new Error(`${entryPrefix}: match.regex must be a non-empty string.`);
    }

    for (const listField of ['basenameEquals', 'suffixEquals']) {
      const values = match[listField];
      if (
        values !== undefined &&
        (!Array.isArray(values) ||
          values.length === 0 ||
          !values.every((value) => typeof value === 'string' && value.length > 0))
      ) {
        throw new Error(`${entryPrefix}: match.${listField} must be a non-empty array of non-empty strings.`);
      }
    }

    if (Array.isArray(match.basenameEquals)) {
      return {
        type: specialCase.type,
        matches: ({ basename }) => match.basenameEquals.includes(basename),
      };
    }

    if (Array.isArray(match.suffixEquals)) {
      return {
        type: specialCase.type,
        matches: ({ basename }) => match.suffixEquals.some((suffix) => basename.endsWith(suffix)),
      };
    }

    if (typeof match.regex === 'string') {
      const regex = new RegExp(match.regex, 'u');
      return {
        type: specialCase.type,
        matches: ({ basename }) => regex.test(basename),
      };
    }

    throw new Error(`${entryPrefix}: unsupported match form.`);
  });
};

// Loads special-case rules from a resolved Naming registry root (#41 registry lifecycle).
export const loadNamingSpecialCaseRulesFromRegistryRoot = (registryRoot) =>
  loadSpecialCaseRulesFromFile(path.join(registryRoot, SPECIAL_CASES_REGISTRY_FILENAME));

export const getBuiltinSpecialCaseRules = () => {
  if (cachedBuiltinSpecialCaseRules === null) {
    cachedBuiltinSpecialCaseRules = loadSpecialCaseRulesFromFile(BUILTIN_SPECIAL_CASES_REGISTRY_PATH);
  }

  return cachedBuiltinSpecialCaseRules;
};
