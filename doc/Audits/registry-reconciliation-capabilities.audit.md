# Registry reconciliation capabilities audit

**Authority:** audit snapshot.

**Classification:** Informative. It records, for every comparison collection of every current registry, whether the entry choices merge-fields and add-alongside are meaningful, and why. The normative contract is `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md` §12.7. The declarations themselves live in the slice inventories, which are the authority:
- `naming/src/registries/naming-registry-inventory.knowledge.mjs`;
- `tree/src/registries/tree-registry-inventory.knowledge.mjs`;
- `src/registries/suite-registry-inventory.knowledge.mjs`.

## 1. Purpose and scope

#60 names four entry choices (spec §8.2): keep Custom, take Builtin, merge selected fields, add the Builtin form alongside. #65 applies the first two, which mean the same for every entry. The other two do not, and suite core must not decide where they apply (spec §9.2). This audit takes each comparison collection (spec §8.4) of the Builtin registries at `1ab8d00` and records the slice-owned answer:
- **merge-fields:** may a record (or object value) be assembled from Builtin and Custom field by field? If so, which fields must move together (its **field groups**)?
- **add-alongside:** may the Builtin record coexist with the Custom one under a new key?

## 2. Rules applied

These follow from the contract (spec §12.7) and are not repeated per registry:
- **Never applicable, by shape:** `members` entries (a member has no fields and no second form), order entries (one sequence), group-presence entries, `value` entries for add-alongside (a path holds one value), and add-alongside on an ordered collection (the new record would have no decided position).
- **merge-fields needs at least two groups.** With one group, a merge is either `keep-custom` or `take-builtin`.
- **Field groups.** Fields that only make sense together form one group: a matcher and what it matches; the conditions of one rule; a severity with its classification and code. Descriptive fields (`definition`, `notes`, `rationale`, `message`) and lifecycle flags (`status`) are independent of the rest and of each other.
- **add-alongside needs a key that can be minted freely.** It is not declared where the key is a vocabulary term that other registries, loaders or filenames refer to, where another field must be unique (a second record would duplicate it), or where the collection is ordered.

## 3. Naming

| Registry · collection | Shape | merge-fields | add-alongside |
|---|---|---|---|
| `agnostic-core-meanings` · `meanings` (key `meaning`) | keyed: `status`, `definition` | **declared**: `[status]`, `[definition]` | no: `meaning` is vocabulary referenced by the category-role perspective |
| `case-rules` · `semanticName` | value object: `style` | no: one field | no: value |
| `categories` · `categories` (key `category`) | keyed: `status`, `definition` | **declared**: `[status]`, `[definition]` | no: `category` is vocabulary (`rolesByCategory` keys, role categories) |
| `category-role-perspective` · `rolesByCategory.*` (key `role`) | grouped keyed: `agnosticCoreMeanings`, `baseMeanings?`, `overlayMeanings?`, `inheritsFrom?`; plus group presence | no: the meaning lists and `inheritsFrom` together describe one role's semantics; no descriptive field to separate | no: a role belongs to exactly one category and must have a `roles` entry |
| `finding-policy` · `outcomes.*` | value objects: `code`, `severity`, `classification`, `message`, `ruleRef`, `suggestedFix?` | **declared**: `[classification, code, severity]`, `[message]`, `[ruleRef]`, `[suggestedFix]`. The first group is the outcome's behavior (exit policy and summaries read severity and classification); the others are display text and a reference | no: value |
| `folder-composition-patterns` · `folderCompositionPatterns` (key `patternId`) | keyed: `status`, `definition`, and the pattern (`compositionKind`, `confidence`, `folderName`, `qualification`, `semanticQualifier`, `structuralRoleToken`, `tokenOrder`) | **declared**: `[status]`, `[definition]`, `[compositionKind, confidence, folderName, qualification, semanticQualifier, structuralRoleToken, tokenOrder]` | no: active patterns are indexed by their unique `folderName`; a second record would duplicate it |
| `folder-composition-patterns` · `folderSemanticContextPatterns` (key `patternId`) | keyed: `status`, `definition`, and the pattern (`confidence`, `folderName`, `qualification`, `semanticContext`) | **declared**: `[status]`, `[definition]`, `[confidence, folderName, qualification, semanticContext]` | no: unique `folderName`, as above |
| `missing-role-patterns` · `missingRolePatterns` (key `patternId`, ordered) | keyed, ordered: matcher fields only (`dotSegments`, `extensionSegmentIndexes`, `semanticSegmentIndex`, `compoundExtension?`, `literalSegmentConstraints?`); plus order entry | no: every field is part of one matcher | no: ordered (first match) |
| `reportable-extensions` · `reportableExtensions` | members | no | no |
| `reportable-root-files` · `reportableRootFiles` | members | no | no |
| `roles` · `roles` (key `role`) | keyed: `status`, `definition`, `notes?` | **declared**: `[status]`, `[definition]`, `[notes]` | no: `role` is filename vocabulary and is referenced by the perspective |
| `special-cases` · `specialCases` | value: ordered list without a stable key | no: a list, not an object | no: value |
| `summary-buckets` · `classificationBuckets`, `secondaryBucketFamilies` | value: ordered lists | no | no: value |
| `walk-exclusions` · `excludedDirectories`, `allowDotFiles` | members | no | no |
| `walk-exclusions` · `skipDotDirectories` | value: boolean | no | no: value |

*Status (#54):* the `walk-exclusions` rows describe version `"1"`, as audited. Version `"2"` retired `allowDotFiles`, so the registry's current comparison collections are `excludedDirectories` (members) and `skipDotDirectories` (value); neither declares merge-fields or add-alongside. The findings above are unchanged.

## 4. Tree

| Registry · collection | Shape | merge-fields | add-alongside |
|---|---|---|---|
| `folder-kinds` · `folderKinds` (key `folderKind`) | keyed: `status`, `definition` | **declared**: `[status]`, `[definition]` | no: `folderKind` is vocabulary |
| `repo-shape-policy` · `allowedTopLevelDirectories` | members | no | no |
| `semantic-home-policy` · `semanticHomePolicy` (key `policyId`) | keyed: `status`, `definition`, and the policy (`derivationMeaning`, `guardrails`, `inputLane`) | **declared**: `[status]`, `[definition]`, `[derivationMeaning, guardrails, inputLane]` | no: no runtime consumer reads the registry yet, so a second policy record has no defined meaning; revisit with its consumer |
| `semantic-home-policy` · `semanticHomeParameters` (key `parameterId`; version `"2"`) | keyed: `value`, `rationale`, `catalogueCases` | **none**: a parameter record is one unit of justification (Tree spec Stage 2 S2.10 RR3), so a merge could pair a consumer's value with a rationale written for another value; updates are `keep-custom` or `take-builtin` per parameter | no: the four `parameterId` values are a closed set, so a second record under a new key is invalid |
| `semantic-naming-folder-type-relationships` · `semanticNamingFolderTypeRelationships` (key `relationshipPerspective`) | keyed: `status`, `definition`, and the rule (`namingPerspective`, `repoShapeCondition`, `structuralHomeCondition`, `treeFolderType`) | **declared**: `[status]`, `[definition]`, `[namingPerspective, repoShapeCondition, structuralHomeCondition, treeFolderType]` | no: at most one rule may match per perspective, which is the key |
| `shim-detection-signals` · six vocabularies | members | no | no |
| `structural-context-assessment-policies` · `policies` (key `policyId`) | keyed: `match`, `assessment` | no: one group (a match and its assessment) | no: a second matching policy is an ambiguity error |
| `structural-home-signal-policy` · `structuralHomeSignalPolicy` (key `token`) | keyed: `status`, `definition`, `notes`, and the signal (`evidenceMeaning`, `signalCategory`) | **declared**: `[status]`, `[definition]`, `[notes]`, `[evidenceMeaning, signalCategory]` | no: `token` is evidence vocabulary |
| `structural-homes` · `structuralHomes` (key `structuralHome`) | keyed: `status`, `definition` | **declared**: `[status]`, `[definition]` | no: `structuralHome` is vocabulary referenced by the surface perspective |
| `structural-role-tokens` · `structuralRoleTokens` (key `token`) | keyed: `status`, `definition`, and the mapping (`relationshipPerspective`, `structuralRole`) | **declared**: `[status]`, `[definition]`, `[relationshipPerspective, structuralRole]` | no: `token` is vocabulary |
| `surface-structural-home-perspective` · `structuralHomesBySurface.*` (key `structuralHome`) | grouped keyed: `rationale`, and the relationship (`relationshipStatus`, `signalStrength`); plus group presence | **declared**: `[rationale]`, `[relationshipStatus, signalStrength]` | no: `structuralHome` is vocabulary from `structural-homes` |
| `validator-owned-signals` · `validatorOwnedBasenameSignals` (key `pattern`) | keyed: `matchType`, `signalClass` | no: `matchType` decides what the key matches, so the record is one matcher | no: the key is the pattern itself; another key is another signal, not a second form |

## 5. Suite core

| Registry · collection | Shape | merge-fields | add-alongside |
|---|---|---|---|
| `exit-policy` · `policies` (key `id`, ordered) | keyed, ordered: `exitCode`, `predicate`; plus order entry | no: an exit code belongs to its predicate | no: ordered (first match) |
| `scope-profiles` · `profiles.*` | value objects: `includeRoots`, `includeRootFiles` | **declared**: `[includeRoots]`, `[includeRootFiles]`: the two inclusion lists are independent dimensions of one scope | no: value |

## 6. Outcome

- **merge-fields** is declared on 14 collections: 12 keyed collections whose records separate descriptive fields or lifecycle flags from their matching or identity fields, and 2 value maps of objects (`naming/finding-policy` outcomes, `suite/scope-profiles` profiles).
- **add-alongside** is declared on no current collection. The contract (spec §12.7) and the decisions document still define it, so the check refuses it deterministically as `unsupported-decision`, and a slice can declare it when a registry gains a collection whose keys can be minted freely.
- **Sequencing:** the next slice applies merge-fields in the pure candidate engine (spec §12.6) and reuses the slice-level validation and transaction (§12.5). Applying add-alongside waits until a collection declares it.
