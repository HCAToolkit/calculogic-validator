// Naming registry migration transforms (lifecycle spec §8.3).
// Each transform is a pure function from a payload at its step's `from` version to one at its `to`
// version, named by a step of the Naming registry inventory. It reads no file and never sees Builtin.

// Version "1" → "2" (calculogic-validator#54): drops `allowDotFiles`, which no runtime path read
// after dot-file discovery was restored, and keeps the walk policy the runtime does read, including a
// consumer's edits to it.
const migrateWalkExclusionsV1ToV2 = (payload) => ({
  version: '2',
  excludedDirectories: [...payload.excludedDirectories],
  skipDotDirectories: payload.skipDotDirectories,
});

export const NAMING_REGISTRY_MIGRATION_TRANSFORMS = Object.freeze({
  'walk-exclusions-v1-to-v2': migrateWalkExclusionsV1ToV2,
});
