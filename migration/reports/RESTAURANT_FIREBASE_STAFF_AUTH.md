# Restaurant staff authentication — Firebase identity model

Date: **2026-09-14**. Evidence: `migration/reports/restaurant-staff-inventory.json`,
reproducible via `node migration/firestore/tools/restaurant-staff-inventory.mjs`.
Read-only; `writeAttemptRejected: true` (SQLSTATE 25006); `writesCaused: 0`.

**Gate `RESTAURANT_STAFF_AUTH_MODEL_GO`: NO_GO** — model designed, not yet implemented or
approved.

## The problem, precisely

Two Postgres functions hold restaurant staff security, and neither survives removal of the
Supabase database:

| Function | What it does | Why it cannot be reimplemented |
| --- | --- | --- |
| `authenticate_staff(email, password)` | `SECURITY DEFINER`; reads `restaurant_staff.password` and verifies with `crypt()`, bypassing RLS | Verifying bcrypt client-side means shipping the hashes to an attacker-controlled Electron renderer. Firestore Rules cannot hash or compare passwords. |
| `authorize_staff_action(pin_code, required_role)` | Derives the business from the logged-in user, then authorises a privileged action against a staff PIN | Same: a client-checkable PIN is not a control. A 4–6 digit PIN is trivially brute-forced offline if its hash ever reaches the client. |

Cloud Functions are forbidden by the Spark constraint, so there is no trusted place to run
either check. **This is a genuine redesign, not a port.**

## Live inventory — far smaller than the surface suggests

| Field | Value |
| --- | --- |
| Staff records | **1** |
| `is_active` | true |
| Legacy `role` | `Manager` |
| `restaurant_role` | `waiter` |
| Has email | **No** |
| `password` | **ABSENT** |
| `pin_hash` | **ABSENT** |
| `pin_code` | **PLAINTEXT_OR_UNRECOGNISED** |
| Matches an existing `auth.users` identity | **0** |

Classification: `NEEDS_FIREBASE_ACCOUNT` × 1. `MATCHES_EXISTING_FIREBASE_USER` 0 ·
`DISABLED` 0 · `LEGACY` 0 · `MANUAL_REVIEW` 0 · **`UNKNOWN` 0**.

Two consequences follow directly from the data:

1. **`authenticate_staff` is already unusable for this record** — there is no email and no
   password. The live flow must be `authorize_staff_action` (PIN) only.
2. **There is nothing to migrate credential-wise.** `bcryptImportCandidates: 0`. Firebase Auth
   can import BCRYPT hashes, but none exist here. So transparent migration is not merely
   unproven — it is not applicable. Disposition: **`OWNER_REPROVISION_REQUIRED`** × 1.

### Additional finding — plaintext PIN at rest

`MEDIUM · PLAINTEXT_PIN_AT_REST` — the single staff record stores an **unhashed `pin_code`**.
Anyone with database read access, a backup, or a successful RLS bypass reads it directly. It is
one record, but it should be invalidated rather than carried forward, which reinforces
reprovisioning over migration.

## Target model

**Staff become first-class Firebase Auth identities. Authorisation lives in Firestore
membership documents enforced by Rules.** No password, no hash, and no PIN in Firestore.

```
Firebase user (uid)
  └── restaurantMemberships/{businessId}__{uid}
        businessId, uid, role, status, createdAt, approvedBy, approvedAt, schemaVersion
```

Roles are taken from the product, not invented. `restaurant_role` already defines:
**`super_admin`, `branch_manager`, `kitchen_staff`, `waiter`.** The legacy `role` column
(`Manager`, `Waiter`) is a second, older vocabulary; the migration must map it onto the
`restaurant_role` set and then retire it rather than preserve both.

`status` ∈ `pending`, `active`, `suspended`. A membership grants nothing while `pending`.

### Provisioning flow

Two options were required to be evaluated against real product UX:

| Option | Assessment |
| --- | --- |
| **1. Operator/admin provisioning tool outside the shipped app** | Safe — Admin SDK stays out of the bundle. Poor UX at scale, but with **1 staff record** it is effectively free today. |
| **2. Staff self-register, owner approves a pending membership** | Scales, needs no privileged credential in the app, and matches how a restaurant actually onboards staff. Requires careful Rules so a self-registrant cannot self-promote. |

**Recommendation: option 2 as the product mechanism, option 1 for the one existing record.**
Provisioning one account through operator tooling avoids building the approval UI before it is
needed, while the self-registration model is the right long-term design.

Either way, **no Admin SDK credential ships in the Electron bundle.**

### Rules invariants (to be authored and tested)

A self-registrant may create only `{ businessId, uid: request.auth.uid, status: 'pending' }`
with no role. Specifically they must not be able to:

- set `status` to anything but `pending` on create, or change it on update
- set or change `role`
- write a membership whose `uid` is not their own
- change `businessId` on an existing membership
- approve their own membership (`approvedBy` must differ from `request.auth.uid`)
- unsuspend themselves

An approver must hold an `active` membership with role `super_admin` or `branch_manager` **in
the same business**, proven by a Rules `get()` on the approver's own membership document.

### Required test matrix

| Case | Expected |
| --- | --- |
| staff reads own restaurant data | allow |
| staff reads another restaurant | **deny** |
| cashier/waiter elevates own role | **deny** |
| staff self-approves pending membership | **deny** |
| staff self-unsuspends | **deny** |
| owner performs intended staff administration | allow |
| staff edits another tenant's membership | **deny** |
| disabled/suspended staff retains access | **deny** |
| anonymous access | **deny** |

All must be exercised through the **Firebase client SDK**, as raw malicious writes, not through
application services.

## Restaurant RPC burn-down

| RPC | Classification |
| --- | --- |
| `authenticate_staff` | **AUTH_REPLACED** — Firebase Auth |
| `authorize_staff_action` | **AUTH_REPLACED** — membership role in Rules |
| `create_kitchen_ticket` | FIRESTORE_TRANSACTION |
| `apply_discount_secure` | FIRESTORE_TRANSACTION — authoritative totals recomputed in the transaction, validated by Rules |
| `void_order_item_secure` | FIRESTORE_TRANSACTION — immutable void event |
| `close_business_day_secure` | FIRESTORE_TRANSACTION |
| `delete_menu_item_secure` | FIRESTORE_TRANSACTION — soft delete plus audit |
| `delete_staff_secure` | FIRESTORE_TRANSACTION — membership status change plus audit |
| `log_business_activity_v2` *(shared)* | FIRESTORE_TRANSACTION — append-only audit |

Unknown: **0**. Blocked: **0**.

## What remains before this gate can pass

1. **Owner decision** — approve reprovisioning the single staff account, and confirm
   `restaurant_role` is the surviving vocabulary.
2. Author the membership Rules and the malicious-client suite above.
3. Implement the operator provisioning tool (Admin SDK, outside the app).
4. Invalidate the existing plaintext PIN as part of reprovisioning.
5. Prove the whole matrix in the emulator, then in the real-project synthetic smoke.

Gate status: `restaurantStaffInventory` PASS · `restaurantStaffIdentityModel` NOT_RUN ·
`restaurantStaffRules` NOT_RUN · `authenticateStaffReplaced` NOT_RUN.

**Production staff records modified by this work: 0.**
