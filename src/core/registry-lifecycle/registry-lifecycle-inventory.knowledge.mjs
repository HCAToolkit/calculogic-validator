/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§6.2)
 * Responsibility: The slice inventories the lifecycle knows, in deterministic slice order.
 * Invariants: adds no registry entries of its own; slice order is naming, tree, suite.
 */
import {
  NAMING_BUILTIN_REGISTRY_ROOT,
  NAMING_REGISTRY_INVENTORY,
  NAMING_REGISTRY_SLICE_ID,
  NAMING_RETIRED_REGISTRY_INVENTORY,
} from '../../../naming/src/registries/naming-registry-inventory.knowledge.mjs';
import {
  TREE_BUILTIN_REGISTRY_ROOT,
  TREE_REGISTRY_INVENTORY,
  TREE_REGISTRY_SLICE_ID,
  TREE_RETIRED_REGISTRY_INVENTORY,
} from '../../../tree/src/registries/tree-registry-inventory.knowledge.mjs';
import {
  SUITE_BUILTIN_REGISTRY_ROOT,
  SUITE_REGISTRY_INVENTORY,
  SUITE_REGISTRY_SLICE_ID,
  SUITE_RETIRED_REGISTRY_INVENTORY,
} from '../../registries/suite-registry-inventory.knowledge.mjs';

// [6.2] cfg-registryLifecycle · Container · "Suite inventory aggregate"
export const REGISTRY_LIFECYCLE_SLICES = Object.freeze([
  Object.freeze({
    sliceId: NAMING_REGISTRY_SLICE_ID,
    builtinRoot: NAMING_BUILTIN_REGISTRY_ROOT,
    inventory: NAMING_REGISTRY_INVENTORY,
    retiredInventory: NAMING_RETIRED_REGISTRY_INVENTORY,
  }),
  Object.freeze({
    sliceId: TREE_REGISTRY_SLICE_ID,
    builtinRoot: TREE_BUILTIN_REGISTRY_ROOT,
    inventory: TREE_REGISTRY_INVENTORY,
    retiredInventory: TREE_RETIRED_REGISTRY_INVENTORY,
  }),
  Object.freeze({
    sliceId: SUITE_REGISTRY_SLICE_ID,
    builtinRoot: SUITE_BUILTIN_REGISTRY_ROOT,
    inventory: SUITE_REGISTRY_INVENTORY,
    retiredInventory: SUITE_RETIRED_REGISTRY_INVENTORY,
  }),
]);
