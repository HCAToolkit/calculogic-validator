// Tree registry entry-shape assertion (#41 registry lifecycle).
// One bounded check for Tree's list-of-records registries: the list exists and is non-empty, each
// entry is an object, required fields are non-empty strings, enumerated fields use their declared
// vocabulary, and the key field is unique. Registry modules declare the shape; this only checks it.

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const assertTreeRegistryEntries = (
  entries,
  { registryLabel, listLabel, keyField, requiredStringFields = [], enumFields = {} },
) => {
  const fail = (message) => {
    throw new Error(`Invalid Tree ${registryLabel} registry: ${message}`);
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
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        fail(`${label}.${field} must be a non-empty string.`);
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
