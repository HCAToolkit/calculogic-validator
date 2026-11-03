// The Stage 3 experimental policy the catalogue is evaluated under (Tree spec S3.8;
// calculogic-validator#136): `emergent-boundary-experimental`, version `1`. A test fixture only:
// production code holds no default policy, and a real run never supplies one. It is not adopted
// policy and not Tree registry data; its values are bound to the S3.8 table by the catalogue tests.

export const EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY = Object.freeze({
  policyId: 'emergent-boundary-experimental',
  policyVersion: '1',
  policyStatus: 'experimental',
  decisions: Object.freeze({
    'minimum-primary-units': Object.freeze({ status: 'resolved', value: 3 }),
    'one-word-prefix': Object.freeze({ status: 'resolved', value: 'no-allowance' }),
    // The S3.5 provisional mapping; `documentation` is primary only in an all-documentation grouping.
    'responsibility-class-mapping': Object.freeze({
      status: 'resolved',
      value: Object.freeze({
        primary: Object.freeze(['concern-core', 'architecture-support', 'surface-system', 'data-model', 'indexing-registry']),
        supporting: Object.freeze(['quality-support']),
        documentation: 'primary-in-documentation-grouping',
      }),
    }),
    'separation-value-limit': Object.freeze({ status: 'resolved', value: 'whole-directory-only' }),
    'coverage-share': Object.freeze({ status: 'unresolved' }),
    'partial-evidence-aggregation': Object.freeze({ status: 'unresolved' }),
    'opportunity-selection': Object.freeze({ status: 'unresolved' }),
  }),
});

// The `coverage-share` values the catalogue exercises (Tree spec S3.9; calculogic-validator#162). Test-only:
// they name the variants a policy-incomplete case's `outcomesAtTestedValues` must record, and are neither
// values S3.8 permits nor values it adopts. The one authority for those variants: the catalogue tests check
// coverage against this list, never against another copy.
export const COVERAGE_SHARE_TEST_VALUES = Object.freeze([0.1, 0.25, 0.5]);
// Per unresolved decision, the tested values a case's `outcomesAtTestedValues` must cover.
export const EXPERIMENTAL_TEST_VALUES = Object.freeze({ 'coverage-share': COVERAGE_SHARE_TEST_VALUES });
