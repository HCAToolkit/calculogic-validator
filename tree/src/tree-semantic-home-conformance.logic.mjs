// Tree Semantic Home conformance (Tree slice spec RR4; calculogic-validator#102 K2, K5-K7).
// Decides a parameter set's run-time conformance from its four values and the source digest of the
// reasoning modules actually installed, against the one recorded binding. Pure: it reads no file, and
// it never reads origin, Baseline comparison, rationale or source, so `passed` cannot stand in for
// provenance. Runs never evaluate the catalogue, so the result is `passed` or `not-checked`, never `failed`.

import crypto from 'node:crypto';
import { TREE_SEMANTIC_HOME_CONFORMANCE_BINDING } from './tree-semantic-home-conformance.knowledge.mjs';

export const SEMANTIC_HOME_CONFORMANCE = Object.freeze({ passed: 'passed', notChecked: 'not-checked' });

const NOT_CHECKED = Object.freeze({ conformance: SEMANTIC_HOME_CONFORMANCE.notChecked });

// K2: SHA-256 over the bound modules, each as its package-relative path and its text with line
// endings normalized to LF, in path order. `sources` is `[{ path, text }]`.
export const digestTreeSemanticHomeReasoningSources = (sources) => {
  const hash = crypto.createHash('sha256');
  for (const { path, text } of [...sources].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))) {
    const normalized = text.replace(/\r\n?/gu, '\n');
    // Path and length frame each module, so no two module lists share a digest by concatenation.
    hash.update(`${path}\n${normalized.length}\n${normalized}`, 'utf8');
  }
  return hash.digest('hex');
};

// `values` are the set's four values keyed by S2.5 name; `reasoningSourceDigest` is the installed
// digest, or null when it could not be computed (fail closed).
export const evaluateTreeSemanticHomeConformance = ({ values, reasoningSourceDigest, binding = TREE_SEMANTIC_HOME_CONFORMANCE_BINDING }) => {
  const boundNames = Object.keys(binding.values);
  const valuesMatch =
    values !== null &&
    typeof values === 'object' &&
    Object.keys(values).length === boundNames.length &&
    boundNames.every((name) => Object.hasOwn(values, name) && values[name] === binding.values[name]);
  if (!valuesMatch || typeof reasoningSourceDigest !== 'string' || reasoningSourceDigest !== binding.reasoning.sourceDigest) {
    return NOT_CHECKED;
  }
  return Object.freeze({
    conformance: SEMANTIC_HOME_CONFORMANCE.passed,
    conformanceBinding: Object.freeze({
      catalogue: Object.freeze({ id: binding.catalogue.id, version: binding.catalogue.version, digest: binding.catalogue.digest }),
      reasoning: Object.freeze({ version: binding.reasoning.version, sourceDigest: binding.reasoning.sourceDigest }),
    }),
  });
};
