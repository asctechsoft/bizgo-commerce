# ADR-0002 — Authentication, sessions, OTP, MFA, RBAC

**Status:** Proposed · **Sources:** Spec §03/§06/§11, Arch §03/§10, matrix auth rows · **Blocked by:** D15 (OTP channel), D20 (MFA method)

## Decision

**Identities & passwords**

- `users` (internal id UUID) ← `identities` (type `EMAIL|PHONE`, value normalised, `verified_at`). A user may hold both. Registration requires at least one verified identity before the account can place orders.
- Passwords hashed with **Argon2id** (`memoryCost≥19 MiB, timeCost≥2, parallelism=1`, tuned by benchmark; params stored with hash). Min length 10, max 128, no composition rules; reject top-common list. Constant-time compare.

**Sessions (web + mobile share one model)**

- Opaque random tokens (256-bit), **only SHA-256 hashes stored** in `refresh_sessions` (`family_id`, `rotated_from`, `expires_at`, `revoked_at`, `ip`, `ua_hash`, `realm`).
- _Access token_: opaque, 15 min, stored in HttpOnly `Secure SameSite=Lax` cookie (`bg_sid`) for web; `Authorization: Bearer` for mobile. _Refresh token_: opaque, 30 days (privileged realms: 8 h idle, 24 h absolute), **rotated on every use with reuse detection** (reuse ⇒ revoke whole family + audit).
- CSRF: cookie auth endpoints require `X-CSRF-Token` (double-submit, HMAC bound to session) on all non-GET; bearer requests exempt. CORS allow-list from env; HSTS at proxy.
- Realms: `CUSTOMER`, `ADMIN`, `FACTORY` — a token minted for one realm is rejected by the others (separate cookie names/prefix).
- Logout and password change revoke the session family / all sessions respectively.

**OTP (`otp_challenges`)**

- 6 digits from CSPRNG; stored as `HMAC-SHA256(secret, challenge_id || code)`; TTL 5 min; **max 5 verify attempts** then lock challenge; resend cooldown 60 s, max 5 sends/h per identifier; per-IP + per-identifier rate limits in Redis.
- Purposes: `REGISTER_VERIFY`, `GUEST_TRACK`, `IDENTITY_CHANGE`. (Password reset uses a link token, not an OTP; OTP is never a login factor for privileged roles.)
- Delivery through port `OtpTransport`. Implementations: `DevConsoleTransport` (enabled only if `NODE_ENV!=production && DEV_OTP_CONSOLE=true`; code printed to server log, never returned in API), real providers added after D15. Absent provider in production ⇒ `503 OTP_DELIVERY_NOT_CONFIGURED`. **No fixed OTP anywhere, including tests** (tests read the dev transport's in-memory outbox).
- Password reset uses a single-use 256-bit token (hash stored, TTL 30 min); response is non-enumerating (always 202).

**MFA for privileged roles**

- OWNER, ACCOUNTANT: TOTP (RFC 6238, 30 s, ±1 step), mandatory; 10 single-use recovery codes (hashed). Step-up re-prompt for refunds, price/cost writes, role changes, settlement approval (5 min fresh MFA window). Method final confirmation: D20.
- First OWNER is created only via `pnpm --filter api owner:bootstrap` reading credentials from env/interactive prompt — **no seeded default password**.

**RBAC + resource scoping**

- Roles → permission codes (matrix in `docs/architecture/PERMISSION_MATRIX.md`). Every request passes: `AuthGuard` (session/realm) → `PermissionsGuard` (code) → **resource scope check in the service/repository** (own / organization / factory assignment / warehouse) → state-transition guard. Scope is enforced in the **query predicate** (`WHERE owner_id = :actor`), so cross-tenant ids return 404, not data.
- 403 for lack of permission on a known resource class; 404 when the resource is out of scope (no existence leak). All denials logged with `requestId` (no PII).
- Staff accounts are created by OWNER only; factory users bound to exactly one `factory_id`; warehouse users bound to warehouse ids.

## Consequences

- Revocable, rotation-safe, mobile-compatible. − DB lookup per request (indexed hash; optional 30 s Redis cache for access tokens, never for permission decisions on money endpoints).
