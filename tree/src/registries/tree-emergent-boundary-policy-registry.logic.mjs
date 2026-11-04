// Tree emergent-boundary-policy registry shape validation and direct loader (#41 registry lifecycle;
// Tree spec S3.8, S3.13.6; calculogic-validator#171). The registry holds the adopted Stage 3 policy:
// one `policies` record (its identity and `policyStatus: adopted`) and one `decisions` record per S3.8
// decision, resolved with a value or explicitly unresolved. This module owns the shape, so Tree's
// registry-set validation entry point covers it (lifecycle spec §9.3). Whether a resolved value is one
// Stage 3 can apply is decided by the reasoning's own policy check, never restated here.
import fs from 'node:fs';
import path from 'node:path';
import { assertAllowedFields, assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';
import {
  EMERGENT_BOUNDARY_DECISIONS,
  EMERGENT_BOUNDARY_POLICY_STATUSES,
} from '../tree-emergent-boundary-reasoning.knowledge.mjs';
import { validateTreeEmergentBoundaryPolicy } from '../tree-emergent-boundary-reasoning.logic.mjs';
import { TREE_BUILTIN_REGISTRY_ROOT } from './tree-registry-inventory.knowledge.mjs';

export const EMERGENT_BOUNDARY_POLICY_REGISTRY_ID = 'tree/emergent-boundary-policy';
const EMERGENT_BOUNDARY_POLICY_REGISTRY_FILENAME = 'emergent-boundary-policy.registry.json';
const REGISTRY_LABEL = 'Tree emergent-boundary-policy';
const READABLE_VERSIONS = Object.freeze(['1']);
const DECISION_IDS = Object.freeze(Object.values(EMERGENT_BOUNDARY_DECISIONS));
const DECISION_STATUSES = Object.freeze(['resolved', 'unresolved']);
const MAPPING_VALUE_FIELDS = Object.freeze(['primary', 'supporting', 'documentation']);

export const EMERGENT_BOUNDARY_POLICY_ROOT_FIELDS = Object.freeze(['policies', 'decisions']);

const fail = (message) => {
  throw new Error(`Invalid ${REGISTRY_LABEL} registry: ${message}`);
};

// The prepared policy shape Stage 3 reads (S3.8): identity, status and every decision by id.
export const toTreeEmergentBoundaryAdoptedPolicy = (payload) => {
  const [record] = payload.policies;
  return Object.freeze({
    policyId: record.policyId,
    policyVersion: record.policyVersion,
    policyStatus: record.policyStatus,
    decisions: Object.freeze(
      Object.fromEntries(
        payload.decisions.map((entry) => [
          entry.decisionId,
          Object.freeze(
            entry.status === 'resolved'
              ? { status: 'resolved', value: structuredClone(entry.value) }
              : { status: 'unresolved' },
          ),
        ]),
      ),
    ),
  });
};

export const assertValidEmergentBoundaryPolicyRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('expected object payload.');
  }
  if (!READABLE_VERSIONS.includes(payload.version)) {
    fail(`version ${JSON.stringify(payload.version ?? null)} is not readable; readable versions: ${READABLE_VERSIONS.join(', ')}.`);
  }

  assertRegistryEntries(payload.policies, {
    registryLabel: REGISTRY_LABEL,
    listLabel: 'policies',
    keyField: 'policyId',
    requiredStringFields: ['policyVersion', 'definition'],
    // An adopted-policy registry never carries an experimental policy (S3.13.6).
    enumFields: { policyStatus: [EMERGENT_BOUNDARY_POLICY_STATUSES.adopted] },
  });
  if (payload.policies.length !== 1) {
    fail('policies must hold exactly one policy.');
  }

  assertRegistryEntries(payload.decisions, {
    registryLabel: REGISTRY_LABEL,
    listLabel: 'decisions',
    keyField: 'decisionId',
    requiredStringFields: ['rationale'],
    enumFields: { decisionId: DECISION_IDS, status: DECISION_STATUSES },
    otherFields: ['value'],
  });
  payload.decisions.forEach((entry, index) => {
    const hasValue = Object.hasOwn(entry, 'value');
    if (entry.status === 'resolved' && !hasValue) fail(`decisions[${index}] is resolved and must carry a value.`);
    if (entry.status === 'unresolved' && hasValue) fail(`decisions[${index}] is unresolved and must not carry a value.`);
    // An object value is closed like every record: a field Stage 3 does not read could never take effect.
    if (entry.decisionId === EMERGENT_BOUNDARY_DECISIONS.responsibilityClassMapping && hasValue && entry.value !== null && typeof entry.value === 'object' && !Array.isArray(entry.value)) {
      assertAllowedFields(entry.value, MAPPING_VALUE_FIELDS, { registryLabel: REGISTRY_LABEL, label: `decisions[${index}].value` });
    }
  });
  const missing = DECISION_IDS.filter((id) => !payload.decisions.some((entry) => entry.decisionId === id));
  if (missing.length > 0) {
    fail(`decisions must state every decision, resolved or unresolved; missing ${missing.join(', ')}.`);
  }

  // Every resolved value must be one this version of Stage 3 can apply.
  const check = validateTreeEmergentBoundaryPolicy(toTreeEmergentBoundaryAdoptedPolicy(payload), {
    expectedStatus: EMERGENT_BOUNDARY_POLICY_STATUSES.adopted,
  });
  if (!check.valid) {
    fail(`the policy is not one Stage 3 can apply (${check.problems.join(', ')}).`);
  }

  return payload;
};

let cachedBuiltinEmergentBoundaryPolicyRegistry = null;

// Loads from one Tree registry root, Builtin or Custom (#41 registry lifecycle, spec §9.3). The adopted
// policy loader is its only runtime caller (Tree spec S3.13.6).
export const loadEmergentBoundaryPolicyRegistryFromRegistryRoot = (registryRoot) =>
  assertValidEmergentBoundaryPolicyRegistry(
    JSON.parse(fs.readFileSync(path.join(registryRoot, EMERGENT_BOUNDARY_POLICY_REGISTRY_FILENAME), 'utf8')),
  );

export const getBuiltinEmergentBoundaryPolicyRegistry = () => {
  if (!cachedBuiltinEmergentBoundaryPolicyRegistry) {
    cachedBuiltinEmergentBoundaryPolicyRegistry = loadEmergentBoundaryPolicyRegistryFromRegistryRoot(TREE_BUILTIN_REGISTRY_ROOT);
  }

  return cachedBuiltinEmergentBoundaryPolicyRegistry;
};
