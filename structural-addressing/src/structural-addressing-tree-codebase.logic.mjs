import {
  TREE_CODEBASE_ADDRESSING_PROFILE,
  STRUCTURAL_ADDRESSING_OCCURRENCE_TYPES,
} from './structural-addressing-profile.knowledge.mjs';
import { buildStructuralAddressingMarker } from './structural-addressing-marker-strategies.logic.mjs';
import { prepareStructuralAddressingProfileCompatibility } from './structural-addressing-profile-compatibility.logic.mjs';

const assertValidInput = (input) => {
  if (input === undefined) {
    throw new Error('Tree-codebase addressed snapshot input is required.');
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tree-codebase addressed snapshot input must be an object.');
  }

  if (!Object.hasOwn(input, 'scopeRoots')) {
    throw new Error('Tree-codebase addressed snapshot input must include scopeRoots.');
  }

  if (!Array.isArray(input.scopeRoots)) {
    throw new Error('Tree-codebase addressed snapshot scopeRoots must be an array.');
  }
};

const assertValidOccurrenceNode = (node) => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('Tree-codebase occurrence node must be an object.');
  }

  if (typeof node.name !== 'string' || node.name.length === 0) {
    throw new Error('Tree-codebase occurrence node name is required.');
  }

  if (typeof node.path !== 'string' || node.path.length === 0) {
    throw new Error('Tree-codebase occurrence node path is required.');
  }

  if (
    node.occurrenceType !== STRUCTURAL_ADDRESSING_OCCURRENCE_TYPES.FOLDER &&
    node.occurrenceType !== STRUCTURAL_ADDRESSING_OCCURRENCE_TYPES.FILE
  ) {
    throw new Error(`Tree-codebase occurrence type is unsupported: ${node.occurrenceType ?? '(missing)'}.`);
  }

  if (
    Object.hasOwn(node, 'children') &&
    node.children !== undefined &&
    !Array.isArray(node.children)
  ) {
    throw new Error('Tree-codebase occurrence node children must be an array when provided.');
  }
};


// Shared contract §6.1: strings compare by UTF-16 code units, without collation or normalization.
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;

// Shared contract §8: this producer implements C1 revision 1, not a configurable policy selector.
// Metadata alone cannot activate another policy; reject skew before producing any occurrences.
const prepareC1Compatibility = () => {
  const profile = TREE_CODEBASE_ADDRESSING_PROFILE;
  if (profile.profileId !== 'tree-codebase' || profile.compatibilityPolicy?.status !== 'versioned' ||
      profile.compatibilityPolicy?.revision !== '1' || profile.legacyAddressProfileId !== undefined) {
    throw new Error('C1 producer requires tree-codebase versioned revision 1 without a legacy alias.');
  }
  return prepareStructuralAddressingProfileCompatibility(profile);
};

const sortTreeCodebaseSiblings = (nodes) => {
  for (const node of nodes) {
    assertValidOccurrenceNode(node);
  }

  return [...nodes].sort(
    (left, right) =>
      compareCodeUnits(left.name, right.name) ||
      compareCodeUnits(left.occurrenceType, right.occurrenceType) ||
      compareCodeUnits(left.path, right.path),
  );
};

const resolveMarkerStrategy = (occurrenceType) => {
  const rule = TREE_CODEBASE_ADDRESSING_PROFILE.levelRules.find((entry) => entry.occurrenceType === occurrenceType);
  if (!rule) {
    throw new Error(`Tree-codebase marker strategy is missing for occurrence type: ${occurrenceType}.`);
  }

  return rule.markerStrategy;
};

const traverseOccurrences = ({ nodes, parentAddressPath, depth, records, nextOrderIndex }) => {
  let folderCounter = 0;
  let fileCounter = 0;
  let orderIndex = nextOrderIndex;

  const sortedNodes = sortTreeCodebaseSiblings(nodes);

  for (const node of sortedNodes) {

    const isFolder = node.occurrenceType === STRUCTURAL_ADDRESSING_OCCURRENCE_TYPES.FOLDER;
    const markerIndex = isFolder ? (folderCounter += 1) : (fileCounter += 1);
    const displayMarker = buildStructuralAddressingMarker({
      markerStrategy: resolveMarkerStrategy(node.occurrenceType),
      index: markerIndex,
    });

    const addressPath = parentAddressPath
      ? `${parentAddressPath}${TREE_CODEBASE_ADDRESSING_PROFILE.lineageSeparator}${displayMarker}`
      : displayMarker;

    records.push({
      address: addressPath,
      addressPath,
      displayMarker,
      occurrenceType: node.occurrenceType,
      name: node.name,
      path: node.path,
      parentAddressPath,
      depth,
      orderIndex,
    });

    orderIndex += 1;

    if (isFolder) {
      const childNodes = node.children ?? [];
      const result = traverseOccurrences({
        nodes: childNodes,
        parentAddressPath: addressPath,
        depth: depth + 1,
        records,
        nextOrderIndex: orderIndex,
      });
      orderIndex = result.nextOrderIndex;
    }
  }

  return { nextOrderIndex: orderIndex };
};

export const prepareTreeCodebaseAddressedSnapshot = (input) => {
  assertValidInput(input);
  const compatibility = prepareC1Compatibility();

  const occurrenceRecords = [];
  traverseOccurrences({
    nodes: input.scopeRoots,
    parentAddressPath: null,
    depth: 0,
    records: occurrenceRecords,
    nextOrderIndex: 0,
  });

  return {
    snapshotOutputId: TREE_CODEBASE_ADDRESSING_PROFILE.snapshotOutputId,
    profileId: TREE_CODEBASE_ADDRESSING_PROFILE.profileId,
    ...compatibility,
    domainPrefix: TREE_CODEBASE_ADDRESSING_PROFILE.domainPrefix,
    sourceNamespace: input.sourceNamespace ?? null,
    scope: input.scope ?? null,
    target: input.target ?? null,
    scopeRoots: input.scopeRoots,
    occurrenceRecords,
  };
};
