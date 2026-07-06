# Authentication Architecture & Migration Plan

Status: **P1–P4 IMPLEMENTED ✅** (real cookie/JWT auth live; `x-actor-id` spoofing closed) · P5–P7 remaining
Stack: NestJS + Prisma + PostgreSQL (API) · Next.js 14 App Router (web) · existing custom RBAC

> **Implemented (2026-06-27):** argon2id password hashing + `RefreshToken`/`AuthToken` tables (P1); `AuthModule`
> (`/auth/login|refresh|logout|logout-all|me|password/change`, JWT access + rotating DB refresh with reuse
> detection, httpOnly cookies) + cookie-parser + global deny-by-default `AuthGuard` + `@Public()`; the
> `CurrentActorMiddleware` now derives the actor from the **verified access-token cookie** (dev `x-actor-id`
> fallback behind `AUTH_DEV_TRUST_HEADER`, default off) — RBAC untouched (P2/P3); web uses a same-origin
> Next `rewrites` proxy + `credentials:'include'` + silent refresh, real `/auth/me` auth-context, `middleware.ts`
> route gate, invite-only signup (P4). Verified: spoofed header → 401, login→cookie→app works, employee 403 on
> admin routes. **Remaining:** P5 admin-invite/password-reset endpoints + email, P6 throttler/lockout-tuning/CSRF
> (`csrf-csrf`), P7 prod HTTPS + secret rotation + reverse proxy.

---

## 1. Current state — what exists and what's broken

| Layer | Today | Problem |
|---|---|---|
| Web "login" (`apps/web/lib/auth-context.tsx`) | Pure client-side. Super-admin **hardcoded** (`yash@squarkip.com` / `sqip@1234`). New accounts saved to `localStorage` with **plaintext passwords**. `isAuthed = !!email`. | No server ever validates anything. Credentials in code + browser storage. |
| API identity (`common/middleware/current-actor.middleware.ts`) | Reads **`x-actor-id` header** and trusts it. Sets it into an `AsyncLocalStorage` request context. | **Anyone can `curl` with any `x-actor-id` and become any user — including Super Admin.** This is the critical hole. |
| Credentials in DB | `User` model has **no `passwordHash`**. | The server *cannot* verify a password even if asked to. |
| Permissions (`modules/permissions/permission.service.ts`) | Solid. Resolves effective permissions (override → direct → group → role → deny; Super Admin short-circuits). Guard/decorator read `getActorId()`. | **Not broken** — it just trusts whatever `actorId` it's given. |

**Threat in one line:** identity is a self-asserted header; the entire RBAC system is correct but is fed an unauthenticated id.

---

## 2. The one good thing that makes this clean

Every authorization decision in the API depends on a **single value** — `requestContext.actorId` — set in a **single place**: `CurrentActorMiddleware`. The code even calls itself the "single change point."

> **Migration thesis:** Replace *only* "read trusted header" with "verify a signed token from an httpOnly cookie → set `actorId`." The guard, the `@Actor()` decorator, `PermissionService`, the event spine, and every controller stay **untouched**.

---

## 3. Recommended architecture (the decision)

**Use JWT access tokens + server-tracked refresh tokens, delivered as httpOnly Secure cookies, with auth enforced at the NestJS API.**

- **Access token (JWT, ~15 min):** stateless, signed (HS256 dev / RS256 prod). Carries `sub` (userId), `org`, `sav` (security-version). Sent automatically via an httpOnly cookie.
- **Refresh token (~7–30 days):** opaque random string; only its **hash** is stored in a `Session` table. Enables rotation, reuse-detection, and real **logout / revoke-all-devices**.
- **Cookies, not localStorage:** httpOnly cookies are immune to XSS token theft; the browser attaches them automatically, which lets us **delete the entire `x-actor-id` / `setActorId` plumbing**.
- **API is the security boundary:** auth is verified on every API call, not just in Next.js.

### Why this over the alternatives

| Option | Verdict |
|---|---|
| **Server sessions (DB/Redis, cookie session-id)** | Also valid and simplest to reason about. Choose this only if you'd rather not deal with JWT verification. We get equivalent revocation from the `Session` table anyway, so JWT's statelessness (fast, no DB hit per request for the access token) wins for an API with many calls. |
| **localStorage + `Authorization: Bearer`** | Rejected — XSS can steal the token; also keeps the manual header plumbing. |
| **Auth.js / NextAuth** | Rejected for this repo. It's Next-centric and would only protect Next routes — **your security boundary is the separate NestJS API**. Putting Auth.js in front doesn't authenticate API calls. NestJS-native JWT integrates directly with your existing RBAC. |

---

## 4. Identity & roles

### Super Admin
- A `User` whose role is **"Super Admin"** (already how `PermissionService` short-circuits). Auth changes nothing here except the user now has a real `passwordHash`.
- **No hardcoded password.** Bootstrap from env: seed creates the super admin with `passwordHash = hash(env.SEED_ADMIN_PASSWORD)` and `mustResetPassword=true` in non-dev. First login forces a password change.

### Normal users (single-org internal tool → **admin-invite**, not open signup)
- Admin creates a `User` (no password) → system issues a one-time **invite token** (emailed link, or copyable link in dev) → user opens `/invite/accept?token=…` and sets their password → account activated.
- **Disable the open `/signup`** page (today it lets anyone self-create an account = privilege risk). Keep it only if gated behind admin approval (you already have an approval pattern).

### Token lifecycle / flows
- **Login:** `POST /auth/login {email,password}` → verify hash → issue access+refresh cookies → return `/auth/me` payload.
- **Authed request:** browser sends access cookie automatically → middleware verifies → `actorId` set → RBAC runs.
- **Refresh (silent):** on a 401, web calls `POST /auth/refresh` (refresh cookie) → server rotates the refresh token (old one marked replaced; **reuse of an old token revokes the whole session chain**) → new cookies → retry the original request once.
- **Logout:** `POST /auth/logout` → revoke the session row + clear cookies. "Log out all devices" → revoke all sessions for the user / bump `securityVersion`.

---

## 5. Data model changes (Prisma)

```prisma
model User {
  // … existing …
  passwordHash      String?
  mustResetPassword Boolean   @default(false)
  lastLoginAt       DateTime?
  failedLogins      Int       @default(0)
  lockedUntil       DateTime?
  securityVersion   Int       @default(1)   // bump to invalidate all access tokens
  sessions          Session[]
}

model Session {            // one row per refresh token (device/login)
  id           String    @id @default(cuid())
  userId       String
  tokenHash    String    @unique            // sha-256 of the opaque refresh token
  userAgent    String?
  ip           String?
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?                       // rotation chain → reuse detection
  createdAt    DateTime  @default(now())
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model AuthToken {          // invites + password resets (one-time, hashed)
  id        String   @id @default(cuid())
  userId    String
  type      String                            // INVITE | PASSWORD_RESET
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 6. Backend design (NestJS)

**New `AuthModule`** (`apps/api/src/modules/auth/`):
- `AuthService`: `validate(email,pw)` (argon2 verify + lockout), `issueTokens(user, req)` (sign access JWT, create `Session`, set cookies), `rotate(refreshToken)`, `logout`, `hash/verify`, invite/reset helpers.
- `AuthController`: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/invite/accept`, `POST /auth/password/change`, `POST /auth/password/forgot`+`/reset`.

**Identity swap (the single change point):**
- Replace `CurrentActorMiddleware` with `JwtActorMiddleware`: read the access-token cookie → verify with `@nestjs/jwt` → on success set `requestContext.actorId = payload.sub` (+ check `securityVersion`); on failure leave `actorId = null`.
- Add a **global `JwtAuthGuard`** (deny-by-default for everything) + a `@Public()` decorator for `/auth/login`, `/auth/refresh`, `/health`. This is the "Phase 7 flip" — now an unauthenticated request to a protected route is 401, not silently allowed.
- **`PermissionGuard`, `@Actor()`, `PermissionService`, all controllers: unchanged.**

**Dev ergonomics:** keep a `DEV_TRUST_ACTOR_HEADER=true` escape hatch (env-gated, default OFF) so `x-actor-id` still works for local curl/tests — but it is **never** enabled in production.

---

## 7. Frontend design (Next.js)

- `lib/api.ts`: add `credentials: 'include'` to every `fetch`; **delete `setActorId` and the `x-actor-id` header**. On `401`, call `/auth/refresh` once and retry; if that fails, redirect to `/login`.
- `lib/auth-context.tsx`: `login()` → `POST /auth/login`; `isAuthed`/`currentUser` derived from `GET /auth/me` (React Query). Remove the localStorage accounts + hardcoded admin + email-matching fallback in `org-context.tsx`.
- **`middleware.ts`** (web root): redirect to `/login` when the session cookie is absent (fast UX gate). The API remains the authority. Optionally verify the JWT in middleware with `jose` (edge-safe).
- Replace `/signup` with `/invite/accept` (set-password from invite token). Add `/forgot-password` + `/reset-password`.

---

## 8. Security hardening

- **Password hashing:** **argon2id** (`argon2`, params ~ memory 19 MiB, time 2, parallelism 1). Fallback `bcryptjs` (pure-JS) if the native build is awkward on WSL.
- **Login throttling + lockout:** `@nestjs/throttler` on `/auth/login`; lock after N failures (`failedLogins`/`lockedUntil`).
- **Refresh rotation + reuse detection:** every refresh issues a new token and marks the old `replacedById`; presenting an already-rotated token ⇒ revoke the entire chain (stolen-token containment).
- **CSRF:** httpOnly cookies + `SameSite=Lax` blocks the common CSRF vectors for top-level navigations; for extra safety on state-changing routes use a double-submit CSRF token or require a custom header (`X-Requested-With`) that simple cross-site forms can't set.
- **Secrets:** JWT signing key(s) from env / secret manager; support key rotation (RS256 with `kid`). Never commit secrets.

---

## 9. Deployment / production

**Recommended topology: single origin.** Put web + API behind one domain so cookies are first-party and CORS disappears:
- Next.js `rewrites` (or nginx/Caddy) proxy `https://app.squarkip.com/api/*` → NestJS. Cookies are same-site `Strict/Lax`, `Secure`, `HttpOnly`.
- Alternative (separate `app.` + `api.` subdomains): cookie `Domain=.squarkip.com`, `SameSite=None; Secure`, strict CORS allowlist + `credentials:true`.

| Concern | Dev (localhost) | Production |
|---|---|---|
| Origins | web :3001, API :4000 (same *site* `localhost` → cookies work; CORS `origin:true,credentials:true`) | one origin via proxy (preferred) |
| Cookie flags | `HttpOnly; SameSite=Lax` (no Secure on http) | `HttpOnly; Secure; SameSite=Lax/Strict` |
| Transport | http | **HTTPS everywhere** (Secure cookies require it) |
| Access token TTL | 15 min | 15 min |
| Refresh TTL | 30 days | 7–30 days |
| Secrets | `.env` | secret manager, rotated |

---

## 10. Step-by-step procedure (phased, each phase ships independently)

**Phase 0 — Decisions & deps.** Pick provisioning (invite) + topology (proxy). Install: `@nestjs/jwt @nestjs/passport passport passport-jwt argon2 cookie-parser @nestjs/throttler` (+ `jose` in web if verifying in middleware).

**Phase 1 — Schema.** Add `User.passwordHash`+flags, `Session`, `AuthToken`; `db push` + generate; seed Super Admin password from `SEED_ADMIN_PASSWORD` env.

**Phase 2 — AuthModule (backend).** Implement login/refresh/logout/me + argon2 + JWT + cookie set/clear + `Session` rows. Verify with curl (login → cookie → /auth/me).

**Phase 3 — Swap identity source.** Add `JwtActorMiddleware` (sets `actorId` from verified cookie) + global `JwtAuthGuard` + `@Public()`. Keep `x-actor-id` only behind `DEV_TRUST_ACTOR_HEADER`. RBAC stays as-is. Verify spoofing now fails (curl without cookie → 401).

**Phase 4 — Frontend wiring.** `credentials:'include'`, remove `x-actor-id`, real `login()`, `/auth/me`, `middleware.ts` gate, 401→refresh→retry. Verify login → app works end-to-end; tampering blocked.

**Phase 5 — Provisioning.** Admin-invite flow (`/auth/invite` + `/invite/accept`), disable open signup, force-reset for seeded users, forgot/reset password.

**Phase 6 — Hardening.** Throttler + lockout, refresh rotation/reuse detection, CSRF, secret management.

**Phase 7 — Deployment.** Same-origin proxy, Secure cookie flags, HTTPS, env secrets + key rotation, prod token lifetimes.

Each phase is independently verifiable; Phases 1–4 already give you *real* authentication. 5–7 make it production-hard.

---

## 11. Recommended picks (my opinion for *your* system)
- **Model:** JWT access + DB-tracked refresh, httpOnly cookies. ✅
- **Hashing:** argon2id (bcryptjs fallback on WSL). ✅
- **Provisioning:** admin-invite; disable open signup. ✅
- **Topology:** single origin via reverse proxy in prod; two ports in dev. ✅
- **Effort:** ~Phases 1–4 are the core (a focused implementation); 5–7 incremental.
