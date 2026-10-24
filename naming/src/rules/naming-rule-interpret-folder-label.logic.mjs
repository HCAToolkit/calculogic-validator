import { NAMING_SUPPORTED_SEMANTIC_NAME_STYLES } from '../naming-validator.contracts.mjs';
import { getSemanticNameCaseRule } from './naming-rule-check-semantic-case.logic.mjs';
import { CONNECTOR_TOKENS, splitSemanticTokens } from './naming-rule-derive-semantic-family.logic.mjs';

// Context-free folder-label interpretation (Naming semantic interpretation spec §13; bridge contract
// §4.6, §6.3). The only inputs are the label and the effective case rule: no path, address, parent,
// depth, or contents. The label is lexical material only, so no family, subgroup, or ambiguity
// interpretation is produced.

export const NAMING_FOLDER_LABEL_PARSE_OUTCOMES = Object.freeze({
  PARSED: 'parsed',
  NOT_PARSED: 'not-parsed',
});

// §13.4 reasons, each a decomposition of the `kebab-case` style. They cover every way that style's
// pattern can fail; the vocabulary is reviewed whenever the supported style changes.
const NOT_PARSED_REASON_CHECKS = Object.freeze([
  Object.freeze({ reason: 'label-empty', applies: (label) => label.length === 0 }),
  Object.freeze({ reason: 'label-has-malformed-separator', applies: (label) => /^-|-$|--/u.test(label) }),
  Object.freeze({ reason: 'label-has-unsupported-character', applies: (label) => /[^A-Za-z0-9-]/u.test(label) }),
  Object.freeze({ reason: 'label-has-uppercase', applies: (label) => /[A-Z]/u.test(label) }),
]);

const CONTAINS_CONNECTOR_TOKEN = 'contains-connector-token';

const toNotParsedReasons = (label) =>
  NOT_PARSED_REASON_CHECKS.filter(({ applies }) => applies(label))
    .map(({ reason }) => reason)
    .sort((left, right) => left.localeCompare(right));

const toSupportedCaseRule = (caseRulesRuntime) => {
  const caseRule = caseRulesRuntime ? getSemanticNameCaseRule(caseRulesRuntime) : null;
  if (!caseRule || !NAMING_SUPPORTED_SEMANTIC_NAME_STYLES.includes(caseRule.style) || !(caseRule.pattern instanceof RegExp)) {
    throw new Error('Folder-label interpretation requires a prepared case-rules runtime with a supported semantic-name style.');
  }
  return caseRule;
};

export const interpretNamingFolderLabel = (label, { caseRulesRuntime } = {}) => {
  const caseRule = toSupportedCaseRule(caseRulesRuntime);
  const labelText = typeof label === 'string' ? label : '';

  if (!caseRule.pattern.test(labelText)) {
    const notParsedReasons = toNotParsedReasons(labelText);
    // Fail closed rather than emit a not-parsed record without reasons: only a hand-built runtime
    // whose pattern differs from its declared style can reach this.
    if (notParsedReasons.length === 0) {
      throw new Error(`Folder label "${labelText}" was rejected by a case rule the not-parsed reason vocabulary cannot describe.`);
    }
    return { parseOutcome: NAMING_FOLDER_LABEL_PARSE_OUTCOMES.NOT_PARSED, notParsedReasons };
  }

  const labelTokens = splitSemanticTokens(labelText);
  const containsConnectorToken = labelTokens.slice(1).some((token) => CONNECTOR_TOKENS.has(token));

  return {
    parseOutcome: NAMING_FOLDER_LABEL_PARSE_OUTCOMES.PARSED,
    labelTokens,
    labelRoot: labelTokens[0],
    ...(containsConnectorToken ? { labelFacts: [CONTAINS_CONNECTOR_TOKEN] } : {}),
  };
};
