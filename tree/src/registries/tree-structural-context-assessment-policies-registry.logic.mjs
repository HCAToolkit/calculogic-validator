import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertAllowedFields } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_STRUCTURAL_CONTEXT_ASSESSMENT_POLICIES_REGISTRY_PATH = fileURLToPath(
  new URL('structural-context-assessment-policies.registry.json', BUILTIN_REGISTRY_ROOT),
);

const REQUIRED_MATCH_SELECTORS = [
  'structuralClass',
  'structuralKind',
  'relationshipQualified',
  'classificationEvidenceKind',
  'relationshipPerspective',
  'relationshipInterpretation',
];

let cachedBuiltinStructuralContextAssessmentPoliciesRegistry = null;

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

export const normalizeStructuralContextAssessmentPoliciesRegistryPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid structural-context assessment policies registry: expected object payload.');
  }

  if (!Array.isArray(payload.policies)) {
    throw new Error('Invalid structural-context assessment policies registry: policies must be an array.');
  }

  const seenPolicyIds = new Set();
  const seenMatchKeys = new Map();

  payload.policies.forEach((policy, index) => {
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}] must be an object.`);
    }

    assertAllowedFields(policy, ['policyId', 'match', 'assessment'], {
      registryLabel: 'structural-context assessment policies',
      label: `policies[${index}]`,
    });

    if (!isNonEmptyString(policy.policyId)) {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].policyId must be a non-empty string.`);
    }

    if (seenPolicyIds.has(policy.policyId)) {
      throw new Error(`Invalid structural-context assessment policies registry: duplicate policyId "${policy.policyId}".`);
    }
    seenPolicyIds.add(policy.policyId);

    if (!policy.match || typeof policy.match !== 'object' || Array.isArray(policy.match)) {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].match must be an object.`);
    }

    assertAllowedFields(policy.match, REQUIRED_MATCH_SELECTORS, {
      registryLabel: 'structural-context assessment policies',
      label: `policies[${index}].match`,
    });

    for (const selector of REQUIRED_MATCH_SELECTORS) {
      if (!Object.hasOwn(policy.match, selector)) {
        throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].match.${selector} is required.`);
      }

      if (selector === 'relationshipQualified') {
        if (typeof policy.match[selector] !== 'boolean') {
          throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].match.${selector} must be a boolean.`);
        }
      } else if (!isNonEmptyString(policy.match[selector])) {
        throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].match.${selector} must be a non-empty string.`);
      }
    }

    // Runtime matches all selectors exactly and treats a second matching policy as ambiguity, so a
    // repeated selector tuple is unusable policy.
    const matchKey = JSON.stringify(REQUIRED_MATCH_SELECTORS.map((selector) => policy.match[selector]));
    if (seenMatchKeys.has(matchKey)) {
      throw new Error(
        `Invalid structural-context assessment policies registry: policies[${index}].match duplicates the selectors of policyId "${seenMatchKeys.get(matchKey)}".`,
      );
    }
    seenMatchKeys.set(matchKey, policy.policyId);

    if (!policy.assessment || typeof policy.assessment !== 'object' || Array.isArray(policy.assessment)) {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].assessment must be an object.`);
    }

    assertAllowedFields(policy.assessment, ['outcome', 'kind', 'reportable', 'rationale'], {
      registryLabel: 'structural-context assessment policies',
      label: `policies[${index}].assessment`,
    });

    if (!isNonEmptyString(policy.assessment.outcome)) {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].assessment.outcome must be a non-empty string.`);
    }

    if (!isNonEmptyString(policy.assessment.kind)) {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].assessment.kind must be a non-empty string.`);
    }

    if (typeof policy.assessment.reportable !== 'boolean') {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].assessment.reportable must be a boolean.`);
    }

    if (!isNonEmptyString(policy.assessment.rationale)) {
      throw new Error(`Invalid structural-context assessment policies registry: policies[${index}].assessment.rationale must be a non-empty string.`);
    }
  });

  return payload;
};

const loadBuiltinStructuralContextAssessmentPoliciesRegistry = () => {
  const payload = JSON.parse(fs.readFileSync(BUILTIN_STRUCTURAL_CONTEXT_ASSESSMENT_POLICIES_REGISTRY_PATH, 'utf8'));
  return normalizeStructuralContextAssessmentPoliciesRegistryPayload(payload);
};

export const getBuiltinStructuralContextAssessmentPoliciesRegistry = () => {
  if (cachedBuiltinStructuralContextAssessmentPoliciesRegistry === null) {
    cachedBuiltinStructuralContextAssessmentPoliciesRegistry = loadBuiltinStructuralContextAssessmentPoliciesRegistry();
  }

  return cachedBuiltinStructuralContextAssessmentPoliciesRegistry;
};
