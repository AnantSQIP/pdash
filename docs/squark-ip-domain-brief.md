# Squark IP — domain brief (for QA test design)

Squark IP (squarkip.com) is an Indian **patent-monetization / patent-intelligence KPO** in hi-tech
domains. Law firms (IAM 1000) and Fortune-500 corporates send it patent matters; its engineer-
analysts produce the technical analysis behind licensing and litigation (US/EU). Offices: **Gurugram
+ Jaipur**, ~30 people. Multi-tier QC + ML-augmented search.

## The 6 service domains (= the dashboard's project types)
All six manipulate the same primitives — **patent → claim → claim-elements** mapped to a target
(product feature / prior-art reference / standard clause) with **evidence** + a **rating**, governed
by the **All-Elements Rule**.

1. **Patent Monetization** (umbrella) — licensing program: HML ranking → target list → EoU charts → campaign.
2. **Prior-Art / Invalidation / Novelty** — search report + search-string log + X/Y/A references + invalidity charts.
3. **Claim Charts / EoU** — the core artifact: claim split into limitations, each row → product evidence + pinpoint cite; mandatory second-reviewer QA.
4. **FTO** — clearance opinion (High/Med/Low risk) + design-arounds, against LIVE patents only.
5. **Reverse Engineering** — court-ready evidence (chip teardown/SEM, firmware, protocol captures) feeding chart right-columns; chain-of-custody.
6. **Risk & Strategy / Portfolio** — IP risk register (likelihood × impact heatmap), whitespace map, de-risk roadmap.

**HML** (flagship): 1st-level pass buckets patents High/Med/Low vs a client feature set (~15–30 min/patent),
2nd-level narrows, strong hits get per-defendant analysis. Detectability decides which "H" patents are worth asserting.

## Competitors
India KPOs: **GreyB, Sagacious IP** (→ Elevate 2025), **Copperpod IP, iRunway** (→ UnitedLex), Lumenci, Ingenious e-Brain, MaxVal, Evalueserve.
Platforms/data/enterprise: **PatSnap, Questel, Clarivate/Derwent, Anaqua, Innography, UnitedLex, TechInsights** (chip RE).

## Roles + delivery flow (mirrors the dashboard RBAC)
Ladder: Super Admin · Admin · Manager · Senior Consultant · Consultant · Senior Research Associate (SRA) · HR · Employee (≈ Research Associate). Real Squark titles seen: VP – Patent Monetization, SRA, Consultant. Hiring: B.E./B.Tech ECE/CSE, 1–4 yrs IP.

Matter flow: client sends matter → Manager/Consultant **scopes + opens a project** (pick type → auto task
list + PID `SQ_26_27_nnn`) → RAs/SRAs do search/analysis → **mandatory 2nd-reviewer QA** → Consultant/Manager
finalises deliverable → delivered. Analysts **log time per matter/task** (effort varies by task type: light HML
~15–30 min/patent vs. rigorous charting 4–8 h/patent). Working norms: standard corporate India (punch-in/out,
approved leave, WFH work-mode, India holidays).

## Realistic QA scenarios by persona
1. **Intern/RA (Employee)** — logs 6h on an "Exhaustive Multi-Database Search" task; punch-in; half-day leave. → timesheets, task update, attendance, no PII/billable access.
2. **SRA** — HML 1st-level pass on 200 patents → shortlist; assigns subtask to junior; exports report. → task.assign/report.export scope.
3. **Consultant/Sr. Consultant** — 2nd-reviewer QA on a claim chart, rework, finalise; Discuss comment. → review gate, state transitions.
4. **Manager** — creates a "Claim Chart — New" project (auto tasks + PID), assigns team, sets internal vs client deadline, checks Capacity. → project+templates, PID, assignment, dual-deadline redaction, capacity.
5. **Super Admin** — /patents portal: registers a client's real numbers behind the passcode (`Pat_MLK_001`), links to a matter; reviews Performance. → Super-Admin-only portal, passcode, no-leak, performance.
6. **HR** — approves WFH + regularization; views an employee's PII (redacted for others); runs appraisal cycle. → HR-only PII, approvals, people-ops scope.
7. **Admin** — reviews a new project's billable flag; reassigns coverage on emergency leave. → admin billable review, notifications, coverage.

_Flags: team size (~30) and RA stipend figures are aggregator listings; leadership names unverified; Indian working-hour norms are general-practice inferences. The two repo research briefs (docs/research/, branch docs-patent-hml-research) are research, not spec._
