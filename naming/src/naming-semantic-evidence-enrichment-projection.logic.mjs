// Naming-owned source projection for the `namingSemanticEvidenceEnrichment` bridge section
// (naming bridge occurrence identity contract §4.5, §6.2). It carries Naming's own token list and
// role facts from canonical findings, copied as Naming derived them. It never re-tokenizes, and it
// is separate from the path-keyed semantic-family bridge projection, which stays unchanged.

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

const toSemanticTokens = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString) ? [...value] : null;

// The role facts are one group: all three values or none.
const toRoleFacts = (details) =>
  isNonEmptyString(details.role) && isNonEmptyString(details.roleCategory) && isNonEmptyString(details.roleStatus)
    ? { role: details.role, roleCategory: details.roleCategory, roleStatus: details.roleStatus }
    : null;

// Same selection as the canonical file observations of the semantic-family bridge projection, so
// every record can correspond to a v1 file observation.
const isCanonicalSemanticFamilyFinding = (finding) =>
  Boolean(finding) &&
  typeof finding === 'object' &&
  !Array.isArray(finding) &&
  finding.classification === 'canonical' &&
  isNonEmptyString(finding.path) &&
  Boolean(finding.details) &&
  typeof finding.details === 'object' &&
  !Array.isArray(finding.details) &&
  isNonEmptyString(finding.details.semanticName) &&
  isNonEmptyString(finding.details.familyRoot) &&
  isNonEmptyString(finding.details.semanticFamily);

const toEnrichmentSourceRecord = (finding) => {
  if (!isCanonicalSemanticFamilyFinding(finding)) {
    return null;
  }

  const semanticTokens = toSemanticTokens(finding.details.semanticTokens);
  const roleFacts = toRoleFacts(finding.details);
  if (!semanticTokens && !roleFacts) {
    return null;
  }

  return {
    path: finding.path,
    ...(semanticTokens ? { semanticTokens } : {}),
    ...(roleFacts ?? {}),
  };
};

export const projectNamingSemanticEvidenceEnrichment = (namingRuntimeOrReportOutput = {}) => {
  const findings = Array.isArray(namingRuntimeOrReportOutput.findings)
    ? namingRuntimeOrReportOutput.findings
    : [];

  return {
    records: findings
      .map(toEnrichmentSourceRecord)
      .filter(Boolean)
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
};
