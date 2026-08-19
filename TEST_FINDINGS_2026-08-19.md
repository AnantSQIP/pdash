# Test findings — 19 August 2026

About 180 checks against a running API on a scratch database, signed in as six different people:
every read route for every role, deliberate attempts to reach other people's data, injection,
concurrency, and the integrity of the database itself.

This file records what was fixed, what was deliberately left alone, and — importantly — **two
places where the report I gave first was wrong**, corrected here rather than quietly dropped.

---

## Fixed

### 1. Four races that were one bug (HIGH)

`common/db/serialize.ts`

Four guards read the world and then wrote to it, with nothing stopping a second request slipping
between the two steps. Each is correct one request at a time and wrong when two arrive together.
All four were reproduced with concurrent requests:

| Guard | Before | After |
|---|---|---|
| 16-hour daily timesheet cap | **24 h logged** against one day | 5 h — cap held |
| "you already have leave that day" | **4 requests** for one Wednesday | 1 |
| The same for work-from-home | **4 requests** | 1 |
| "a department called X already exists" | **4–6 departments** differing only in capitals | 1 |

The timesheet one mattered most: billable hours feed capacity, performance scoring and the client
ledger, so an inflated number does not stay in the timesheet. It needed no malice — a double-click
on Save, a retry over a flaky connection, or two open tabs would do it.

Fixed with a transaction-scoped Postgres advisory lock, keyed as narrowly as the rule it protects
(one person's one day, not the whole table). A unique index would have been the better tool if any
of these rules were "this exact row may exist once" — but a sum across rows, a date-range overlap
and a case-insensitive name are none of them.

Verified after the fix: 30 h attempted concurrently yields 5 h, and legitimate sequential logging
of 8 h + 6 h still works with the next 4 h correctly refused.

### 2. The preview environment pointed at the live database (HIGH)

`~/pdash-preview/.env` carried `API_PORT=4000` and a `DATABASE_URL` for the live `pdash` database —
the same port and data as the copy serving the demo link. Starting the test copy without overriding
both made it try to seize the live API's socket. It failed only because the live process already
held it; had the live one been restarting, the test copy would have taken its place and connected
to real data, silently.

Repointed to `pdash_p2preview` on port 4011, with a comment at the top of the file saying why.
Verified: the test copy now starts safely with no environment overrides at all.

This is machine setup, not repository code, so it is recorded here rather than committed.

### 3. Signing out now ends that session immediately (finding 7)

Logout revoked the refresh token but the access token kept working until it expired — up to fifteen
minutes of a signed-out session that was not signed out.

The blunt fix already in the code is `securityVersion`, which **logout-all** bumps to kill every
token at once. Using it for ordinary logout would sign you out on your phone when you signed out of
a shared desktop, so instead the access token now carries `sid`, the refresh-token family id: one
per sign-in, stable across rotation. Logout revokes that family; the middleware refuses a token
whose session is gone.

Verified: two sessions for one person, logging out of one kills it at once and leaves the other
signed in; **sign out everywhere** still clears both.

Tokens minted before this change carry no `sid` and stay valid until they expire, so deploying it
does not sign the firm out.

### 4. Won deals awaiting a client record are now visible (finding 5)

Marking a deal **Won** may link or mint a client, and minting needs the confidential-client
permission that BD does not hold — correctly, and the refusal even says "win the deal and ask a
Super Admin to add it." Nothing tracked that request. A won deal with no client sat looking
finished while the handover to delivery was remembered or it was not.

The pipeline board now shows an **Awaiting client record** badge on any such deal and a count on the
Won column. No notification, by choice — the marker sits where BD already looks.

### 5. Two smaller ones

- **Creating a team task list** returned the whole team space instead of the list just created, so
  a caller had to search for its own result. It now returns the list. The screen refetches
  separately, so nothing depended on the old shape.
- **Appraisal routes refuse before validating.** Probing a colleague's appraisal with a malformed
  body used to answer "property selfComment should not exist" — a refusal that confirmed the
  appraisal existed and described the request that would reach it. A guard now turns an outsider
  away first. Deliberately narrow: not a reordering of all 363 routes, which would be a large
  change to hide field names the browser bundle already contains. Appraisals are the exception
  worth it, because they carry somebody's rating and their manager's written remarks.

---

## Corrections to the first report

### The shared `hr@squarkip.com` account does not exist in production

I reported it as a live problem: a shared login that approves leave and reads personal details with
no attribution, showing on the org chart with no reporting line.

**It is not in the production database at all.** It exists only in the seeded scratch database I was
testing against, has never been logged into there, and has approved nothing. Shaveta Sharma has her
own named HR account with the same role, which is the arrangement the earlier finding asked for.

Nothing to do. Recorded because the original finding was wrong and stating that is worth more than
letting it quietly disappear.

### The local demo database is twelve days behind

Checking the above turned up something real that no test would have found.

The stack serving the demo tunnel from `~/pdash` runs an API **built on 7 August**, from a repository
at its initial commit. It predates the whole of Phase 2. Its database matches: no reporting lines at
all, no `deal` table, no `optional_holiday`, no appraisal parameters, no `headUserId`, no policies,
and a `Business Development` role that exists with **zero permissions**.

It is not broken — old API and old database agree with each other, and the routes that do not exist
are never called by the old front end. But **nothing built in Phase 2 is visible there**: no client
ledger, no team spaces, no BD pipeline, no appraisal parameters, no departments screen, no org chart.

Anyone shown that link is being shown the product as it was on 7 August. The Contabo server is the
one that has been kept current. If the tunnel is meant to demonstrate current work, that copy needs
pulling, rebuilding and migrating.

### While checking, the demo tunnel was down

`cloudflared` had been running since 04:41 with a dead tunnel — process alive, URL unreachable,
which is the failure mode a process check misses. Restarted; the link is live again. There is no
supervisor and no cron entry, so nothing would have restarted it.

---

## Left alone, on purpose

**Twelve unbounded database queries.** Real, but every one is naturally bounded — pinned messages
only, one project's tasks. Response times across sixteen endpoints were all under 15 ms. Worth
revisiting when the data is an order of magnitude larger; not worth changing now.

**Case-insensitive department names at the database level.** The transaction closes the race, so the
index is no longer needed. Adding one would mean a functional index the schema tool cannot express,
which would report a phantom difference on every future migration.

---

## One thing to watch, not yet a problem

The rate limit is **200 requests per minute per IP**, and `trust proxy` is set, so each person is
counted separately through Caddy — that part is right, and I checked it.

But it counts by IP, and everyone in one office shares one address. Twenty-seven people behind a
single gateway share one budget of 200 a minute, which is about seven requests each. A dashboard
that refreshes while somebody reads it can spend that.

Nobody has reported being locked out, so this is an observation rather than a finding — I could not
test it without knowing the office network. If people ever report a sudden "too many requests" that
clears itself after a minute, this is the first place to look, and the fix is to count per signed-in
user rather than per address.

Capacity itself is fine: sixteen simultaneous sign-ins completed in 105 ms with no errors.

---

## What passed

Worth recording, because a list of only the failures gives a false picture.

| Area | Checks | Result |
|---|---|---|
| Every read route, six roles plus a stranger | 576 requests | No server errors; nothing reachable unauthenticated except the health check |
| Reaching another person's data | ~25 | All refused — leave, expenses, appraisals, timesheets, profiles, projects, deals |
| Appraisal lifecycle end to end | 17 | Correct throughout, including the decimal weighted rating and the calendar event |
| Timesheet backdating windows | 19 | Exactly as documented: free to 31 days, approval to 92, blocked beyond, Super Admin exempt |
| Patent confidentiality and passcode | 11 | Handles leak no numbers; permission checked before passcode |
| Injection, oversized, malformed input | 19 | Nothing landed; no HTML injection sink exists anywhere |
| Database integrity | 17 | Zero on every count — no orphans, no self-managers, no duplicate handles |
| Personal-data boundary | 12 | Held exactly: colleagues and managers see none, HR and admins see it |
| Sign-in hardening | 13 | Lockout works, no user enumeration, forged and `alg=none` tokens rejected |
