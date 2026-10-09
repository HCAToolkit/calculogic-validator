// Registry entry-shape assertion (#41 registry lifecycle), shared by slice registry loaders.
// One bounded check for list-of-records registries: the list exists and is non-empty, each entry is
// an object, required fields are non-empty strings, string-list fields are non-empty arrays of
// non-empty strings, optional string fields are non-empty strings when present, enumerated fields
// use their declared vocabulary, and the key field is unique. Slices declare each registry's shape
// and own its meaning; this module only checks a declared shape.

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

export const assertRegistryEntries = (
  entries,
  {
    registryLabel,
    listLabel,
    keyField,
    requiredStringFields = [],
    stringArrayFields = [],
    optionalStringFields = [],
    enumFields = {},
  },
) => {
  const fail = (message) => {
    throw new Error(`Invalid ${registryLabel} registry: ${message}`);
  };

  if (!Array.isArray(entries) || entries.length === 0) {
    fail(`${listLabel} must be a non-empty array.`);
  }

  const seenKeys = new Set();
  entries.forEach((entry, index) => {
    const label = `${listLabel}[${index}]`;
    if (!isPlainObject(entry)) {
      fail(`${label} must be an object.`);
    }

    for (const field of [keyField, ...requiredStringFields]) {
      if (!isNonEmptyString(entry[field])) {
        fail(`${label}.${field} must be a non-empty string.`);
      }
    }

    for (const field of stringArrayFields) {
      if (!Array.isArray(entry[field]) || entry[field].length === 0 || !entry[field].every(isNonEmptyString)) {
        fail(`${label}.${field} must be a non-empty array of non-empty strings.`);
      }
    }

    for (const field of optionalStringFields) {
      if (entry[field] !== undefined && !isNonEmptyString(entry[field])) {
        fail(`${label}.${field} must be a non-empty string when provided.`);
      }
    }

    for (const [field, allowedValues] of Object.entries(enumFields)) {
      if (!allowedValues.includes(entry[field])) {
        fail(`${label}.${field} must be one of ${allowedValues.join(', ')}.`);
      }
    }

    if (seenKeys.has(entry[keyField])) {
      fail(`${label}.${keyField} "${entry[keyField]}" is duplicated.`);
    }

    seenKeys.add(entry[keyField]);
  });

  return entries;
};
