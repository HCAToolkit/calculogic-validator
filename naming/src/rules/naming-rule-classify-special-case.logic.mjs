import path from 'node:path';
import { getBuiltinSpecialCaseRules } from '../registries/naming-special-case-rules-registry.logic.mjs';

// `specialCaseRules` is the prepared runtime from the resolved Naming registry root; it defaults to
// Builtin for direct callers.
export const getSpecialCaseType = (normalizedPath, specialCaseRules = getBuiltinSpecialCaseRules()) => {
  const basename = path.posix.basename(normalizedPath);

  for (const rule of specialCaseRules) {
    if (rule.matches({ normalizedPath, basename })) {
      return rule.type;
    }
  }

  return null;
};

export const isAllowedSpecialCase = (normalizedPath, specialCaseRules) =>
  getSpecialCaseType(normalizedPath, specialCaseRules) !== null;
