# My Tasks, the clock, and the timesheet gate — specification and test catalogue

*8 September 2026. Written before any code changes, so the decisions are visible and reviewable.*

The ask, restated:

1. **Close → Finish.** One click completes the task. No hours dialog, no "How long did your part
   take?", no expected-hours panel.
2. **Several tasks can run at once.**
3. **Start · pause · resume · stop**, with every minute recorded, and the whole time a task took
   accumulated automatically.
4. **Finish fills today's timesheet automatically** with the time tracked *that day*. A task that
   spans days is paused; the earlier days are filled by hand with **Log time**; on the day it is
   finished only that day's time is auto-filled, while the task's total stays recorded.
5. **You cannot punch out until your timesheet for the day is filled** (6–8h).
6. **A forgotten punch-out produces a catch-up prompt the next morning**: what you finished, what
   you left running, what you still owe the timesheet.

---

## 1. The model

### 1.1 What the clock records

A **session** is one continuous sitting: `task_work_session(taskId, userId, startedAt, endedAt,
minutes)`. That table already exists and already stores exactly this. Nothing about a session
changes except that a person may now hold several open at once.

Three totals are derived, never stored twice:

| Total | Meaning | Where it is used |
|---|---|---|
| **This sitting** | the running session's elapsed time | the running-timer bar |
| **Today, this task** | sum of that person's sessions on the task whose *work* falls on today | what Finish files, what the punch-out gate counts as owed |
| **All time, this task** | sum of every session on the task, every person, every day | "this task took 14h", the learned standard |

A session that crosses midnight is **split at midnight** for the "today" total, so a sitting from
22:00 to 01:00 gives 2h to one day and 1h to the next. Without this rule, a day's tracked hours
could never be reconciled against the day it was worked.

### 1.2 The states, and what each button does

| Button | Clock | Task | Timesheet |
|---|---|---|---|
| **Start** | opens a session | sets `startedAt` on first ever start | — |
| **Pause** | closes the open session | stays as it is | offers to log the day's tracked time |
| **Resume** | opens a new session | — | — |
| **Finish** | closes every open session on this task | marks it complete | files today's tracked time |
| **Reopen** | — | reopens | — |

"Stop" and "Pause" are the same action on the clock; only the word differs. **Decision 3** below
asks whether they should be one button or two.

### 1.3 What Finish no longer asks

The whole `CompleteTaskDialog` goes: the hours field, "Your timer recorded 0m. Correct it if that
is not right", the expected-hours panel, "Nothing like this has been timed yet…". Finish becomes
one click with a confirmation toast.

**The consequence to be aware of:** the learned standard (`task_standard` — "this kind of task
usually takes 6h") is currently fed by the figure a person typed into that dialog. With the dialog
gone it must learn from **tracked minutes** instead. A task finished with the clock never started
contributes *nothing* — it neither adds a sample nor withdraws an old one. That is more honest
than recording a zero, which today wipes the previous sample.

---

## 2. Base cases — the paths that must simply work

| # | Case | Expected |
|---|---|---|
| B1 | Start a task, work 2h, Finish, all on one day | Task complete. 2h filed against today for that task. Toast says so. |
| B2 | Start, pause after 1h, resume, work 1h more, Finish | Task complete, 2h filed for today, one entry. |
| B3 | Start three tasks at once, work an hour, pause all three | Three sessions closed, each with its own minutes. See **Decision 1** for what that hour is worth. |
| B4 | Start a task on Monday, pause; log Monday by hand; resume Tuesday, Finish | Tuesday's tracked time is auto-filed. Monday's stands as logged. The task's total is Monday + Tuesday. |
| B5 | Finish a task the clock was never started on | Task completes. Nothing is filed. Toast says no time was tracked, with a Log time link. |
| B6 | Log 8h across the day, then punch out | Punch-out succeeds. |
| B7 | Punch out with 3h logged of 8h | Refused, with what is missing and a one-click way to file tracked-but-unlogged time. |
| B8 | Forget to punch out; open the app next morning | Catch-up prompt: yesterday closed at 11:59pm, what was finished, what was left running, hours still owed. |

---

## 3. Edge cases

Legend: **⚑ = needs your decision** (gathered into section 4). Everything else carries my proposed
answer, which is what I will build unless you say otherwise.

### 3.1 The clock (T)

| # | Case | Proposed behaviour |
|---|---|---|
| T1 | Start a task that is already running for me | No-op, no second session. (Today's behaviour, kept.) |
| T2 | Start a second task while one runs | Both run. ⚑ **Decision 1** governs what the overlap is worth. |
| T3 | Same person, two roles on one task (analyst + reviewer) | One clock. Sessions are per person per task, not per seat. |
| T4 | Two people run the clock on the same task at once | Both allowed. Each person's own time is theirs; the task's total is the sum. |
| T5 | Pause a task that is not running | No-op, no error toast. |
| T6 | Timer left running overnight | Capped at 12h by the existing sweep. **New:** punching out closes every running session, and the 23:59 auto-punch-out closes them too, so a forgotten timer can no longer invent 12h. |
| T7 | Timer running when the task is finished by someone else, or moved to a closed status elsewhere | The session is closed at that moment and counted. |
| T8 | Timer running when the project is completed/closed | Start is refused on a closed matter (existing rule). A session already running is closed at the moment the project closes, and its time is kept. |
| T9 | Clock started, browser closed, machine sleeps | The session keeps running server-side; the sweep caps it at 12h. Real elapsed time is what is recorded — the app is not a presence detector. |
| T10 | Session crossing midnight | Split at midnight for per-day totals; the session row itself is left intact. |
| T11 | Session crossing a punch-out | Closed by the punch-out (T6). |
| T12 | Clock on a task assigned to someone else | Refused — you may only time a task assigned to you (existing rule). |
| T13 | Clock on a task in a team space (no project) | Allowed. Filed as non-billable internal time. |
| T14 | Start, then the task is reassigned away from me | Running session is closed and kept; the hours I worked stay mine. |
| T15 | Start, then the task is deleted | Sessions cascade away with the task. Time already filed to the timesheet stays (it is a ledger of a person's day, not of the task). |
| T16 | Two devices, same person, same task | One session. Starting on the second device returns the running one. |
| T17 | Two devices, Start pressed at the same instant | One session wins; the loser returns the winner. Enforced by a lock, not by hope. |
| T18 | Clock running while on approved leave | Allowed but flagged in the catch-up prompt — somebody worked on a day they were marked off, and the day's attendance needs correcting. |
| T19 | System clock skew / a session with `endedAt` before `startedAt` | Clamped to zero minutes, never negative. |
| T20 | A session of under a minute | Recorded as 0 minutes, filed as nothing, but the sitting is not lost — it still appears in "all time". |

### 3.2 Finish (F)

| # | Case | Proposed behaviour |
|---|---|---|
| F1 | Finish with the clock running | The clock stops first; that sitting counts. |
| F2 | Finish an already-finished task | Refused with "already complete", not a duplicate close. |
| F3 | Finish a task with open subtasks | Subtasks close with it (existing rule). |
| F4 | Finish, then Reopen, then Finish again | The second Finish files only time tracked *since* the reopen. The standard is corrected by the difference, never double-counted. |
| F5 | Finish on a completed/closed project | Refused (existing rule) — reopen the matter first. |
| F6 | Finish from the completion checkbox or the status dropdown instead of the button | ⚑ **Decision 5.** Today these bypass the clock and the ledger entirely, which is the single biggest inconsistency in the module. |
| F7 | Finish from a phone | Must work. The phone card has no timer and no close button today; it gets Start/Pause/Finish/Log time. |
| F8 | Finish a task nobody is assigned to, as a manager | Allowed for `task.update` holders, but nothing is filed to anyone's timesheet — you cannot log hours for another person. |
| F9 | Finish while another of my tasks is still running | The other task keeps running. Only this task's sessions close. |
| F10 | Two people both Finish the same task at once | One completes it; the other is told it is already complete. Each person's own tracked time is still filed. |
| F11 | Finish a task whose time was already fully logged by hand today | Nothing extra is filed. The toast says the timesheet already holds it. |
| F12 | Finish with 6h tracked when only 2h of the day's 16h cap is left | 2h filed, 4h reported as still needing a home, with a link. The Finish itself always succeeds. |

### 3.3 What gets filed (L)

| # | Case | Proposed behaviour |
|---|---|---|
| L1 | 3h tracked today, nothing logged | 3h filed. |
| L2 | 3h tracked today, 1h already logged by hand for this task today | 2h filed (top up the shortfall). Never 3h on top of 1h. |
| L3 | 3h tracked today, 4h already logged by hand | Nothing filed. Your figure stands; the clock does not overwrite a person's own entry. |
| L4 | Tracked time is 7 minutes | Rounded **up** to the quarter hour: 0.25h. Rounding down to zero loses real work. |
| L5 | Filing would exceed the 16h day cap | File what fits, warn about the rest (F12). |
| L6 | The day is outside the backfill window (task finished today, time tracked 40 days ago) | Today's portion files; older days are the user's to claim through the backfill request. Never file into a locked period silently. |
| L7 | The ledger refuses for any reason (cap, closed matter, backdating) | **The Finish still succeeds.** The refusal comes back as a warning, never as a failed close. (Existing rule, kept.) |
| L8 | Billable or not | Client matter → billable by default; team-space work → never billable (existing rule). |
| L9 | What the entry says | "Tracked on My Tasks" plus the task title, so the row is identifiable in the Timesheets module. |
| L10 | Time tracked today on a task finished *yesterday* | Filed by Log time as normal; Finish is not involved. |
| L11 | Auto-filed entry then edited or deleted by the user | Allowed. It is their ledger. `Task.actualHours` follows the ledger, as it already does. |
| L12 | Two tasks finished in the same minute | Two entries, one per task, each with its own hours. The day cap is checked under the existing per-person-per-day lock, so they cannot both slip past it. |

### 3.4 The punch-out gate (P)

| # | Case | Proposed behaviour |
|---|---|---|
| P1 | Punch out with the day's target met | Allowed. |
| P2 | Punch out short of the target | ⚑ **Decision 2** — threshold and whether an override exists. |
| P3 | Half-day leave approved | Target is 4h, not 8h (the timesheet module already computes this). |
| P4 | Holiday, weekend, full-day leave | Target is 0 — the gate never applies. |
| P5 | Approved comp-off on a Saturday | It is a required working day: target 8h (or 4h for a half). The gate applies. |
| P6 | Punched in at 09:00, must leave at 11:00 (sick, emergency) | Cannot be trapped at the door. Whatever **Decision 2** is, there is always a way out that leaves a record. |
| P7 | Worked 10h, logged 8h | Allowed — the target is a floor, not a ceiling. |
| P8 | Tracked 6h on the clock but logged none, tries to punch out | Blocked, but the refusal is *useful*: it lists today's tracked-but-unlogged time per task with a **File all of it** button. One click, then punch out. |
| P9 | Punch out with a timer still running | The timer stops first, and its time joins the tracked-but-unlogged list before the check runs. |
| P10 | Someone with no tasks at all (HR, BD, admin) | The gate still applies — they log "Other" time, which the module already supports. |
| P11 | The auto punch-out at 23:59 | Never blocked. A gate that stops the machine from closing a forgotten day would leave the day open for ever. It closes the day and feeds the morning catch-up instead. |
| P12 | Admin marks attendance for somebody by hand | Not a punch. Unaffected by the gate. |
| P13 | An approved regularisation that sets a check-out | Not a punch. Unaffected. |
| P14 | Overnight shift: punched in yesterday, punching out today | The gate reads *yesterday's* target and yesterday's logged hours, since that is the day being closed. |
| P15 | Punch out on a day with a pending (undecided) leave request | Pending leave does not lower the target. The hours are still owed until the leave is approved (this is already how the timesheet calendar treats it). |

### 3.5 The morning catch-up (C)

| # | Case | Proposed behaviour |
|---|---|---|
| C1 | Forgot to punch out yesterday | Shown: the day was closed at 11:59pm at N hours; correct it with a regularisation if you worked later. |
| C2 | Punched out cleanly, timesheet complete | Nothing appears. The prompt only exists when there is something to resolve. |
| C3 | Last working day was Friday, today is Monday | The prompt looks back at the last **working** days, not literally yesterday, and covers every unresolved day in the window. |
| C4 | Was on leave yesterday | Nothing owed, nothing shown. |
| C5 | Timer left running from yesterday | Listed: "still running since 14:20 yesterday" with Stop-and-file / discard. |
| C6 | Tasks finished yesterday whose time was never filed | Listed with the hours tracked, one click to file them to the right day. |
| C7 | Several days unresolved | All of them, oldest first, each with its shortfall. |
| C8 | A day now outside the self-serve backfill window | Shown, but the action is "request backfill approval", not a silent write. |
| C9 | Someone opens the app at 2am | "Yesterday" is the IST calendar day. The prompt is about the day that closed, not the last 24 hours. |
| C10 | Dismissing it | ⚑ **Decision 4** — blocking, dismissible, or a banner. Note you asked in the last round to **remove** the first-login pop-up, so I will not re-introduce a modal without you saying so. |
| C11 | New joiner, first day, nothing behind them | Nothing shown. |
| C12 | A day the person was not expected to work (weekend, holiday) | Never listed as owed. |

### 3.6 Attendance interactions (A)

| # | Case | Proposed behaviour |
|---|---|---|
| A1 | Never punched in, but logs time | Allowed. The timesheet is a record of work, not of presence. The day shows as unmarked in attendance, which regularisation exists to fix. |
| A2 | Never punched in, tries to punch out | There is nothing to punch out of; the first punch of the day is a punch **in** (existing behaviour). |
| A3 | Punched in twice | Refused after a completed day (existing rule). |
| A4 | Punched in, punched out, wants to work again | The day is complete and locked (existing rule). Extra time goes in as a timesheet entry; the attendance day needs a regularisation. |
| A5 | Half-day leave in the morning, works the afternoon | Target 4h. Punch and gate both work off that. |
| A6 | Works past midnight | The day closes at 23:59; the hours after midnight are claimed by regularisation (existing route). The clock's session splits at midnight so the next day's hours are attributable. |
| A7 | Punch-out gate versus the 16h cap | The floor (8h) and the ceiling (16h) never conflict; if they somehow did, the ceiling wins and the gate reports it rather than trapping the person. |

### 3.7 Data integrity and concurrency (D)

| # | Case | Proposed behaviour |
|---|---|---|
| D1 | Finish pressed twice quickly | One close, one ledger entry. Serialised on the person's day, as every ledger write already is. |
| D2 | Finish and a manual Log time at the same instant | The day cap and the duplicate rule are evaluated inside the same lock; one of them yields. |
| D3 | A session ends while Finish is reading it | The finish closes sessions and reads them inside one transaction. |
| D4 | `Task.actualHours` after any of this | Still exactly the sum of the task's non-deleted timesheet rows. The clock never writes it. |
| D5 | The learned standard after reopen/refinish/reassign | Corrected by deltas, never double-posted (the existing withdraw/apply mechanism, now fed by tracked minutes). |
| D6 | An auto-filed entry deleted, then the task reopened and refinished | Files afresh from tracked time; the previous entry's absence is not "remembered". |
| D7 | Server restarted with sessions open | Sessions survive; they are rows, not memory. |

### 3.8 Permissions and roles (R)

| # | Case | Proposed behaviour |
|---|---|---|
| R1 | Employee without `task.update` | Can still start/pause/finish their **own** assigned task — that is `task.view` plus assignment, as the timer already is. |
| R2 | Manager finishing someone else's task | Allowed with `task.update`; no hours filed for the other person (F8). |
| R3 | Can one person file time for another? | No. Never. Not through Finish, not through the catch-up prompt. |
| R4 | Who sees the punch-out gate | Everybody who punches. Admins are not exempt. |

---

## 4. Decisions taken

| # | Question | Decision |
|---|---|---|
| 1 | Three timers for an hour: three hours, or one shared out? | **Count each in full.** It behaves like three stopwatches, which is what was pressed. The consequence is surfaced rather than hidden: My Tasks warns while more than one clock runs, and the punch-out check compares tracked hours against the hours actually attended. |
| 2 | The punch-out threshold | **The day's own target, with an escape.** 8h normally, 4h on an approved half day, 0 on leave or a holiday. Below it the punch-out is refused, and the refusal carries the tracked time with one button that files it. "I have to leave now" always works and writes the reason onto the day. |
| 3 | Pause and stop | **One button** — Start, then Pause, then Resume — beside Finish. |
| 4 | The morning catch-up | **A banner**, on Home and My Tasks, never a pop-up. It stays until the days behind it are actually settled. |
| 5 | The completion checkbox and the status dropdown | **Every door behaves the same.** The settle happens inside the status change itself, so a task ticked complete in a project list, moved on the board, or closed from the detail panel stops the clock and files the time exactly as Finish does. |

## 5. What was built, and what the tests say

Twenty-two cases run against a fresh database and the built API (`time_test.py`, session scratch
directory). All pass. Two defects were found by them and fixed:

- **A second Finish closed the task twice.** It moved `completedAt` and wrote another event, so a
  task finished last week could be made to look finished today. It now settles the person's clock —
  which matters when somebody else closed the task while their timer ran — without closing it again.
- **Finishing without the clock wiped a real measurement.** The zero was posted to the learned
  estimate as though it were a result, withdrawing an earlier genuine sample. Nothing on the clock
  now changes the estimate in either direction.

A third came out of the browser: **the catch-up could not see the case it exists for.** A clock left
running overnight is closed by the twelve-hour stale sweep on the next timer call of any kind, so by
morning it is no longer "running" and never appeared. It is now recognised by the cap itself, and
the banner says the figure is a guess worth checking.

| Verified | |
|---|---|
| T1, T2 | Two tasks run at once; Start on a running task opens no second session |
| T5, B2 | Pausing what is not running is a no-op; resume keeps the first sitting |
| T10 | A sitting from 22:00 to 01:00 gives today 60 of its 180 minutes |
| L2, L3, L4 | Top-up not addition; a bigger hand-entered figure stands; seven minutes files 0.25h |
| F1, F2, F6 | Finish stops the clock; a second Finish files nothing twice; closing by status change files the same |
| B5 | Finishing with no clock files nothing and leaves the estimate alone |
| P2, P4, P6, P8, P9 | The gate refuses on both the check and the punch; a day owing nothing has no gate; leaving early records why; filing opens the door; a refused punch-out still stops the clocks |
| C2, C5, C5b | Nothing unresolved shows nothing; a clock from yesterday is listed, capped or not |
| D4 | `Task.actualHours` still equals the ledger |

In the browser: Finish is one click with no dialog anywhere, the running bar lists both clocks and
warns, the day line reads "6.5h filed of 8h", the gate opens with the task listed and the
over-tracked warning ("the clock recorded 9.05h but you have been here 3h"), filing 9.25h lets the
punch through, the escape hatch refuses an empty reason, the banner lists the short days, and the
phone card now carries Start, Finish and Log time — it previously had none of them.

---

## 6. What I recommend beyond the ask

Three things that fall out of this design and that I think are worth building at the same time.

**The punch-out check should file, not just refuse.** A gate that says "you owe 5 hours" and
leaves you to go and find them is a gate people will resent. The refusal should carry today's
tracked-but-unlogged time, per task, with one button that files all of it. For most people, on
most days, the gate then costs one extra click and the timesheet is genuinely accurate.

**The clock should stop when you punch out.** It closes the loop: nobody's timer runs overnight,
tracked time and attended time agree, and the 12-hour safety cap becomes what it should be — a
safety net nobody meets.

**"Today, tracked but not filed" belongs on the My Tasks page.** A small line at the top: *4.5h
tracked today, 1.5h filed* with a **File the rest** button. Then the punch-out gate is almost never
the first time somebody learns they are behind.
