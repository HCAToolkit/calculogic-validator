# cfg-linguisticFoundation

> [!IMPORTANT]
> This file is **supporting implementation guidance** (NL/config context) for the Linguistic Foundation runtime. It is **not** the canonical contract source. The normative contract is `doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md`.
>
> Paths are relative to the standalone Validator repository root. This note is repository-owned development guidance; it is not part of the distributed `@calculogic/validator` package.

## 0.0 Version

Status: **implemented by calculogic-validator#148**: the foundation runtime (5.2.1–5.2.7), its vocabularies and inventory (6.1, 6.2) and the `english` profile, version `1` (6.3). Nothing in a validation run reads it yet: no Naming bridge production and no Tree consumption (contract §8, §9.2).

Sections are numbered so that implementation comments can reference them (`[5.2.5] cfg-linguisticFoundation · Primitive · "…"`).

## 1.0 Purpose and Scope

### 1.1 Purpose

Resolve a supplied token to the lexical identities a declared language profile gives it, with features, ambiguity and provenance, and compare two resolutions. This is reusable lexical evidence. Consumers interpret it under their own contracts.

### 1.2 In scope

- The foundation vocabularies and the resolution, comparison and selection logic (contract §4–§7).
- Language profile registries: a builtin location, a direct builtin loader with a from-root variant, the canonical digest, and a converter into a runtime lookup.
- Explicit active-profile selection (contract §5.3, D2).
- The `english` profile, version `1`, limited to the vocabulary measured for E10 and E11.

### 1.3 Out of scope

- Naming producing resolutions; the bridge section (contract §8).
- Tree consuming lexical identity; the E10, E10.1 and E11 reclassification.
- Morphology rules (D1); relationships other than number (D6).
- Joining the suite's Builtin/Custom registry lifecycle, report metadata, the run-configuration source and packaging. These come with the first consumer (contract §15.4).

### 1.4 Concerns present

Logic and Knowledge, plus a Results concern for the prepared records. There is no Build, BuildStyle or ResultsStyle concern; this is a non-UI suite configuration.

## 2.0 Configuration Contracts

### 2.1 Inputs

- **Profile selection:** `null`, `undefined`, or `{ profileId, profileVersion? }`, supplied by the caller (contract §5.3).
- **Registry root:** the directory holding the language profile registries. The builtin root is the default.
- **Surface forms:** non-empty strings exactly as a producer supplies them.

### 2.2 Data and state

- One registry file per language profile, listed in the profile inventory (6.2).
- The builtin profiles are loaded once per process and cached; nothing else is module state.

### 2.3 Dependencies

- `src/core/registry-entry-shape.logic.mjs` for the shared shape assertions.
- `src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs` for the canonical digest.
- No dependency on Naming, Tree or Structural Addressing, and none of them depends on this configuration yet.

### 2.4 Invariants

- Generic logic and vocabularies contain no language-specific entry, form or rule. Language content lives only in profile registries and the profile inventory.
- Readings come from declared entries only. Nothing strips, stems, case-maps or trims a surface form.
- No profile is active without an explicit selection. Nothing is detected from the environment, locale or repository content.
- Every prepared record is deeply frozen, and the same inputs give the same record.

## 3.0 Build Concern (Structure)

Not present.

## 4.0 BuildStyle Concern (Visual Styling of Structure)

Not present.

## 5.0 Logic Concern (Workflow)

### 5.1 Container `Linguistic Foundation runtime` (`linguistic-foundation/src/`)

#### 5.2.1 Workflow: `loadLanguageProfileRegistryFromRegistryRoot`, `getBuiltinLanguageProfileRegistries`

Loader. It reads one profile registry from a registry root and validates it under contract §4.2 and §5.1:
- the root fields `version`, `profileId`, `profileVersion`, `featureSupport` and `entries`;
- a readable `version`;
- a kebab-case `profileId` equal to the inventory's;
- complete feature support over the foundation's spaces and values;
- non-empty entries with prefixed, unique lexeme identifiers;
- non-empty forms whose feature values are strings of their own foundation space, checked before support (a non-string would otherwise coerce to a property key), and supported by the profile;
- no duplicate form;
- no padded string.

An invalid payload throws, naming the problem. The builtin variant loads every inventoried profile once.

#### 5.2.2 Derived value: `digestLanguageProfileRegistry`

The canonical digest: `digestRegistryPayload` with a descriptor that makes `entries` set-like by `lexemeId` and each entry's `forms` set-like by `surface`. Entry and form order therefore never change the digest. Any change to an entry, a feature, the support or a version does change it.

#### 5.2.3 Derived value: `toLanguageProfileRuntime`

Converter. It turns a validated payload and its digest into a frozen runtime profile: `profileId`, `profileVersion`, `lexiconDigest`, `readingsOf(surface)` and `surfaces()`.
- The surface-to-readings lookup stays private to the converter. Callers reach it only through these accessors, which return frozen readings (contract R4) and a frozen, sorted surface list.
- So no caller can change a resolution without changing the profile version and digest.

#### 5.2.4 Workflow: `selectActiveLanguageProfile`

Selection (contract §5.3, D2). The result is a frozen record `{ status, requested, problems, profile }`:

| Selection | Status | Problems |
|---|---|---|
| none (`null` or `undefined`) | `none` | none |
| a registered profile, with no version pin or a matching one | `active` | none |
| not a plain object, an empty or non-string `profileId`, a non-string `profileVersion`, or an unknown field | `invalid` | `selection-malformed` |
| an unregistered `profileId` | `invalid` | `profile-not-registered` |
| a registered profile with a different pinned version | `invalid` | `profile-version-mismatch` |

`none` and `invalid` leave no profile active. Nothing falls back to another profile.

#### 5.2.5 Derived value: `resolveSurfaceForm`

Resolution (contract §4.3, §6.1, §7). The result is `{ surface, status, readings }`, plus `provenance` when a profile is active. A non-string or empty surface throws: it is a caller error, not a resolution.

#### 5.2.6 Derived value: `compareLexicalResolutions`

The lexeme-comparison relation (contract §6.2).

#### 5.2.7 Workflow: `prepareLinguisticFoundation`

Composition. It loads the registered profiles from the registry root, selects the active one, and returns the frozen record `{ selection, profile }`. Consumers pass `profile` to 5.2.5; `null` gives `profile-unavailable`.

## 6.0 Knowledge Concern (Reference Data)

### 6.1 Foundation vocabularies (`linguistic-foundation.knowledge.mjs`)

These are language-agnostic:
- feature spaces (`number`: `singular`, `plural`);
- support statuses, resolution statuses, comparison relations and reading bases;
- selection statuses and selection problems;
- the readable profile registry versions.

### 6.2 Language profile inventory (`registries/linguistic-foundation-language-profile-inventory.knowledge.mjs`)

Each registered profile: its `profileId` and registry filename. Adding a language profile is one inventory entry plus one registry file; no foundation logic changes.

### 6.3 `english` profile registry (`registries/_builtin/english-language-profile.registry.json`)

`profileVersion` `1`: `english.rule` (`rule`, `rules`) and `english.registry` (`registry`, `registries`), the vocabulary measured for E10 and E11 (contract §10). Adding entries is a profile version change in its own slice, with measured evidence.

## 7.0 Results Concern (Outputs)

### 7.1 Prepared records

- **Selection:** `{ status, requested, problems, profile }`, where `profile` is the runtime profile or `null`.
- **Prepared foundation:** `{ selection, profile }`.
- **Resolution:** `{ surface, status, readings: [{ lexemeId, features, basis }], provenance?: { profileId, profileVersion, lexiconDigest } }`.

No report, finding or CLI output reads them.

## 8.0 ResultsStyle Concern (Output Styling)

Not present.

## 9.0 Assembly Pattern

### 9.1 File structure

```
linguistic-foundation/
  src/
    linguistic-foundation.knowledge.mjs                       6.1
    linguistic-foundation-runtime-converters.logic.mjs        5.2.3
    linguistic-foundation-profile-selection.logic.mjs         5.2.4
    linguistic-foundation-resolution.logic.mjs                5.2.5, 5.2.6
    linguistic-foundation.wiring.mjs                          5.2.7
    registries/
      linguistic-foundation-language-profile-inventory.knowledge.mjs   6.2
      linguistic-foundation-language-profile-registry.logic.mjs        5.2.1, 5.2.2
      _builtin/english-language-profile.registry.json                  6.3
  test/
```

### 9.2 Assembly logic

Loader (5.2.1, 5.2.2), then converter (5.2.3), then selection (5.2.4), composed by 5.2.7; resolution and comparison (5.2.5, 5.2.6) are pure functions over the result.

### 9.3 Integration

None yet. The first consumer slice:
- wires the run-configuration source (contract §15.4);
- joins the profile registries to the Builtin/Custom lifecycle;
- reports provenance;
- adds `linguistic-foundation/src/**` to the package files.

## 10.0 Implementation Passes

### 10.1 Pass mapping

- calculogic-validator#148: 5.2.1–5.2.7, 6.1–6.3, 7.1.

### 10.2 Export checklist

- `prepareLinguisticFoundation`, `resolveSurfaceForm`, `compareLexicalResolutions` and `selectActiveLanguageProfile`, from their modules. There is no package export yet.
