// Registry entry-shape assertion (#41 registry lifecycle), shared by slice registry loaders.
// One bounded check for list-of-records registries: the list exists and is non-empty, each entry is
// an object, required fields are non-empty strings, string-list fields are non-empty arrays of
// non-empty strings, optional string fields are non-empty strings when present, enumerated fields
// use their declared vocabulary, the key field is unique after trimming, and each entry carries only
// declared fields. Shapes are closed because a loader ignores an undeclared field, so a misspelled
// or unsupported field would pass validation and never reach runtime. Slices declare each
// registry's shape and own its meaning; this module only checks a declared shape.

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Loaders trim registry strings, so whitespace-only is empty and keys compare trimmed.
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

// A value the runtime compares with one path segment (a basename or a directory name): no separator,
// and not `.` or `..`. A value with a separator could never match.
export const isPathSegmentName = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('/') &&
  !value.includes('\\') &&
  value !== '.' &&
  value !== '..';

// A value the runtime compares with `path.extname`, which yields only the last extension.
export const isSingleFileExtension = (value) => typeof value === 'string' && /^\.[^./\\]+$/u.test(value);

// Rejects fields outside `allowedFields` on one object of a registry payload.
export const assertAllowedFields = (value, allowedFields, { registryLabel, label }) => {
  const unsupportedFields = Object.keys(value)
    .filter((field) => !allowedFields.includes(field))
    .sort();
  if (unsupportedFields.length > 0) {
    throw new Error(`Invalid ${registryLabel} registry: ${label} has unsupported field(s) ${unsupportedFields.join(', ')}.`);
  }
};

// Loaders trim registry strings, so a padded string would mean the same as its trimmed form while
// comparing as different. No string in a payload, object keys included, may carry surrounding
// whitespace; the first offending location is reported.
export const assertNoPaddedStrings = (payload, { registryLabel }) => {
  const visit = (value, location) => {
    if (typeof value === 'string') {
      if (value !== value.trim()) {
        throw new Error(`Invalid ${registryLabel} registry: ${location} has leading or trailing whitespace.`);
      }

      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }

    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key !== key.trim()) {
          throw new Error(`Invalid ${registryLabel} registry: key ${JSON.stringify(key)} in ${location} has leading or trailing whitespace.`);
        }

        visit(child, `${location}.${key}`);
      }
    }
  };
  visit(payload, 'the payload');
};

// Every registry file is an object holding `version` and the registry's declared root fields.
export const assertRegistryRootFields = (payload, rootFields, { registryLabel }) => {
  if (!isPlainObject(payload)) {
    throw new Error(`Invalid ${registryLabel} registry: expected an object payload.`);
  }

  assertAllowedFields(payload, ['version', ...rootFields], { registryLabel, label: 'the payload' });
};

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
    // Declared fields of other types, checked by the caller.
    otherFields = [],
  },
) => {
  const allowedFields = [
    keyField,
    ...requiredStringFields,
    ...stringArrayFields,
    ...optionalStringFields,
    ...Object.keys(enumFields),
    ...otherFields,
  ];
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

    assertAllowedFields(entry, allowedFields, { registryLabel, label });

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

    const key = entry[keyField].trim();
    if (seenKeys.has(key)) {
      fail(`${label}.${keyField} "${key}" is duplicated.`);
    }

    seenKeys.add(key);
  });

  return entries;
};
