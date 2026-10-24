# Registry reference edges audit

**Authority:** audit snapshot.

**Classification:** Informative. It records the reference edges the slices enforce today, the validation that enforces each one, and how each maps to the reference edge contract. The normative contract is `doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md` §12.11. The declarations live in the slice inventories, which are the authority, and the slice resolvers interpret them:
- `naming/src/registries/naming-registry-inventory.knowledge.mjs`;
- `tree/src/registries/tree-registry-inventory.knowledge.mjs`;
- resolvers: `naming/src/registries/naming-registry-references.logic.mjs` and `tree/src/registries/tree-registry-references.logic.mjs`.

Line references are to `main` at `16dd6f4`. Since then the informative lists of §2 have been replaced by the declarations (#60 slice 12), and `test/registry-lifecycle-references.test.mjs` checks every edge: the Builtin set resolves completely, and each edge's unresolved fixture is rejected by its slice's validation.

## 1. Purpose and scope

The contract (§12.11) makes same-slice references declared and reportable without moving their meaning into suite core. It is designed against the relationships that exist, not hypothetical ones. This audit fixes that scope:
- **which edges exist:** the five relationships the slices' registry-set validation entry points (spec §9.3) enforce;
- **how each maps to the contract:** source entry, target collection and `{ groups, key }` identity;
- **what an absent target means today:** for every edge, the slice's validation rejects the set. No edge has an alternative target, so the contract has no fallback state;
- **what stays outside:** Naming's runtime compatibility paths, which validation rejects.

Suite core declares no edges. Suite-core registries (`scope-profiles`, `exit-policy`) name no entries of each other.

## 2. Current informative declarations

Before the declarations, the edges were informative lists that nothing read (removed in #60 slice 12):
- `NAMING_REGISTRY_REFERENCE_EDGES` (`naming-registry-inventory.knowledge.mjs:139`): four `{ from, to, via }` items;
- `TREE_REGISTRY_REFERENCE_EDGES` (`tree-registry-inventory.knowledge.mjs:117`): one.

`via` is prose. The declaration slice replaces both lists with `references` declarations and resolvers in the same change (§12.11 "Supersession").

| Informative item | Edge id | Change |
|---|---|---|
| `category-role-perspective` → `categories`, via "rolesByCategory keys" | `naming/perspective-category` | none |
| `category-role-perspective` → `roles`, via "role status" | `naming/perspective-role-definition` | renamed: the edge is the role's definition. Status lookup is a consumer of that definition, not the relationship |
| `category-role-perspective` → `agnostic-core-meanings`, via "agnosticCoreMeanings, baseMeanings and overlayMeanings values" | `naming/perspective-meaning` | none |
| `category-role-perspective` → itself, via "inheritsFrom" | `naming/perspective-inherits-from` | none |
| `surface-structural-home-perspective` → `structural-homes`, via "structuralHomesBySurface[].structuralHome" | `tree/perspective-structural-home` | none |

## 3. Edges

All source addresses are produced by the source registry's comparison declaration (spec §8.4), for example `rolesByCategory["concern-core"]` (a group-presence entry) and `rolesByCategory["concern-core"][role="build"]` (a record). Every target is a `keyed` collection.

| Edge | Source entry | Target collection · key field | Identity | Absent target rejected by | Builtin references |
|---|---|---|---|---|---|
| `naming/perspective-category` | group `rolesByCategory["c"]` (every key, including keys with no roles) | `categories` · `categories` · `category` | `{ groups: [], key: c }` | `registry-state.logic.mjs:547` "rolesByCategory keys not declared in categories" | 10 |
| `naming/perspective-role-definition` | record `rolesByCategory["c"][role="r"]` | `roles` · `roles` · `role` | `{ groups: [], key: r }` | `registry-state.logic.mjs:521` "no roles entry for category-role-perspective roles" | 41 |
| `naming/perspective-meaning` | record, one reference per distinct value across `agnosticCoreMeanings`, `baseMeanings` and `overlayMeanings` | `agnostic-core-meanings` · `meanings` · `meaning` | `{ groups: [], key: meaning }` | `registry-state.logic.mjs:582` "must be a non-empty array of agnostic core meanings" | 63 |
| `naming/perspective-inherits-from` | record with `inheritsFrom: { category, role }` | `category-role-perspective` · `rolesByCategory.*` · `role` | `{ groups: [category], key: role }` | `registry-state.logic.mjs:604` "inheritsFrom must name a { category, role } present in rolesByCategory" | 2 |
| `tree/perspective-structural-home` | record `structuralHomesBySurface["s"][structuralHome="h"]` | `structural-homes` · `structuralHomes` · `structuralHome` | `{ groups: [], key: h }` | `tree-surface-structural-home-perspective-registry.logic.mjs:49` "structural homes not declared in structural-homes" | 16 |

Over the Builtin set, all 132 references resolve, and Builtin passes both slices' validation.

Notes:
- **Composite identity.** `inheritsFrom` is the only edge whose target sits inside a group. Its `{ category, role }` value becomes `{ groups: [category], key: role }`. That conversion is the Naming resolver's; suite core only checks that there is one group string for the one `*`.
- **Self-reference.** `naming/perspective-inherits-from` targets its own registry. Its potential impact is still one step: the perspective records that inherit from a record.
- **Duplicates across fields.** A meaning listed in two of a record's three lists is one reference. The relationship is "this record names this meaning"; which list names it is Naming's interpretation.
- **Uniqueness.** Naming's validation also refuses a role listed under two categories (`registry-state.logic.mjs:561`). That is a constraint on the perspective, not an edge. It needs no reference state, because the comparison addresses carry the category.

## 4. Runtime tolerance outside the model

Naming's role loader (`loadRolesPayload`, `registry-state.logic.mjs:298`, read by the runtime payload at `:425`) keeps three compatibility paths:
1. a perspective entry's own `status` (`:335`);
2. a `roles` file in the older grouped `rolesByCategory` shape, used when `roles` has no `roles` array (`:320`);
3. `roles` as the membership source when the perspective file is missing (`:304`).

The lifecycle rejects all three:
1. Perspective entries allow only `role`, `notes`, the three meaning lists and `inheritsFrom` (`:41`).
2. `roles` must have a `roles` array (`:477`).
3. Every perspective role needs a `roles` entry (`:521`), and completeness requires the perspective registry (spec §7.1 item 2).

That validation runs on the active root before every run. So no validated set reaches these paths, and they are not reference alternatives. They stay unchanged, and they are not a sixth edge.

## 5. Observed inconsistency (not changed here)

Spec §14 lists `naming/category-role-perspective` among the "registries without a runtime consumer". Yet the runtime payload's role membership comes from it (`loadRolesPayload`, read at `registry-state.logic.mjs:425`). That entry should be reviewed on its own. It does not affect the reference contract, which takes validation, not runtime use, as the authority.

*Resolved (#60 closure):* spec §14 now lists `naming/category-role-perspective` as read at run time and separates validation, reference resolution and runtime use.
