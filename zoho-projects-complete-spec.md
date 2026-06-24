# Zoho Projects — Complete Feature & Build Specification

This is a research-backed build dossier compiled to enable building a project-management system comparable to Zoho Projects. It documents the product's features, data model, automation, integrations, pricing, and developer platform in enough detail to inform a clone-grade implementation. Compiled 2026-06-23.

## Table of Contents

0. Methodology, Coverage & What Could Not Be Fetched
1. Overview & Positioning
2. Core Data Model & Entity Hierarchy
3. Projects, Phases, Milestones, Dependencies & Scheduling
4. Tasks & Task Management
5. Issue / Bug Tracker
6. Views & Visualization
7. Time Tracking, Timesheets & Billing
8. Automation: Blueprint, Business Rules, SLA, Webhooks, Custom Functions
9. Reporting, Dashboards & Analytics
10. Collaboration, Feeds, Documents & Pages
11. Resource & Workload Management
12. Roles, Permissions, Portals & User Types
13. Templates & Configuration
14. Mobile Apps
15. Integrations (Zoho + Third-Party)
16. API & Developer Platform
17. Pricing & Feature-Gating Matrix
18. Community Sentiment & Real-World Usage
19. Competitor Comparison (Jira / Asana / Monday / ClickUp)
20. Strengths, Weaknesses & Target Users
21. Build Blueprint: Cloning Zoho Projects
22. prompt.md Coverage Audit & Gap Fills

## Methodology

This dossier was produced through multi-agent deep research spanning 20 distinct research angles, followed by a dedicated gap-fill round to chase down missing facts and a 3-vote adversarial verification pass over the build-critical claims (each such claim was independently challenged and required majority agreement to stand).

Plainly stated: most of the feature facts in this dossier come from Zoho's own documentation (help.zoho.com KB articles, REST API docs, and zoho.com marketing/pricing pages). These are authoritative for *what features exist and how they behave*, but they are vendor-authored and therefore not neutral — promotional framing, aspirational language, and selective omission are expected. Where possible, claims were corroborated against third-party sources (review aggregators, analyst write-ups). Pricing in particular could not be confirmed from Zoho's primary pricing page because the dollar amounts are rendered client-side via JavaScript; those figures were sourced from third-party reviews and are flagged accordingly throughout.

## Verification Notes

The following claims were checked during adversarial verification. Each is marked `[confirmed]` or `[refuted]`, followed by the corrected/clarified statement.

- **[confirmed]** Zoho Projects was launched/released in 2006, one of Zoho's early products. → Zoho Projects launched its first version in August 2006, making it one of Zoho's early SaaS products.
- **[confirmed]** Zoho Projects is part of the broader Zoho ecosystem of 45+ integrated business apps and is bundled in Zoho One (launched 2017). → Zoho Projects is part of the broader Zoho ecosystem and is bundled in Zoho One (launched July 2017), which today includes 45+ integrated business apps (Zoho markets it as 45+ to 50+ depending on the source); at its 2017 launch Zoho One bundled roughly 35–40 apps.
- **[confirmed]** The product offers four self-serve editions: Free, Premium, Enterprise, and Ultimate. → Zoho Projects offers four self-serve editions: Free (up to 5 users, free forever), Premium, Enterprise, and Ultimate; the paid plans are available via a no-credit-card free trial without requiring sales contact.
- **[confirmed]** Annual (billed yearly) per-user pricing: Premium ~$4/user/mo, Enterprise ~$9/user/mo, Ultimate ~$14/user/mo; monthly is higher (Premium $5, Enterprise $10). → Zoho Projects per-user pricing (USD): Premium $4/user/mo, Enterprise $9/user/mo, and Ultimate $14/user/mo when billed annually; monthly billing is higher (Premium $5, Enterprise $10, Ultimate ~$15). Annual billing reflects Zoho's advertised "save over 15%" discount. Figures corroborated by third-party sources (tech.co, Capterra summaries); the official Zoho pricing page renders prices via JavaScript and could not be scraped directly for primary confirmation.
- **[confirmed]** The Free plan supports up to 5 users, 3 projects, and 5GB storage (Zoho's current pricing page states 'Free for 5 users' / '3 Projects'). Older sources cite 3 users / 2 projects, indicating the limits changed over time. → Per Zoho's current official pricing pages, the Zoho Projects Free plan supports up to 5 users, 3 projects, and 5 GB of total (shared) storage. Older sources cite 3 users / 2 projects, indicating the free-tier limits were expanded over time.
- **[confirmed]** Storage limits per plan: Free 5GB, Premium 100GB, Enterprise 120GB, Ultimate 15GB/user or 150GB/org (whichever is higher). → Zoho Projects storage limits per plan (per official pricing-comparison page): Free 5GB, Premium 100GB, Enterprise 120GB, Ultimate 15GB per user OR 150GB per organisation, whichever is higher.
- **[confirmed]** Zoho Projects Plus is a separate bundled platform launched March 11, 2025 that natively integrates Projects + Sprints + Analytics + WorkDrive; priced ~$16–$20/user/mo (US ~$16, ~27% cheaper than buying the four a la carte). → Zoho Projects Plus is a unified/bundled project-management platform that Zoho launched on March 11, 2025, natively integrating four apps—Zoho Projects, Sprints, Analytics, and WorkDrive (the launch lineup; current pricing pages also add Notebook/Learn). Per Zoho's launch announcement it is priced at $16/user/month in the US, which Zoho states is 27% lower than buying those four apps a la carte (some current third-party listings cite up to ~$20/user/month depending on billing terms).
- **[refuted]** Zoho Projects is distinct from Zoho Sprints: Projects is general/classical/hybrid PM with Gantt, dependencies, time tracking and billing; Sprints is agile/scrum-focused with backlogs and velocity, lacking Gantt and native time tracking/billing. → Zoho Projects and Zoho Sprints are distinct products. Zoho Projects is general/classical/hybrid PM with Gantt charts, task dependencies/critical path, time tracking and billing/invoicing. Zoho Sprints is agile/scrum-focused with backlogs, Scrum boards, and velocity/burndown reporting, and it lacks Gantt charts and dependency-driven scheduling. However, contrary to a common misconception, Zoho Sprints DOES include a native inbuilt Timesheet module with time logging, a global timer, and billable/non-billable hour tracking; the differentiator is Projects' deeper billing/invoicing integrations and Gantt-based planning, not a total lack of time tracking in Sprints.
- **[confirmed]** All AI in Zoho Projects is administered from the AI Hub at Setup > Portal Configuration > AI Hub, which has an 'AI Powered Capabilities' area (feature toggles) and an 'AI Bridge' area (engine + API-key configuration). → Zoho Projects' AI is centrally administered from the AI Hub at Setup > Portal Configuration > AI Hub, which contains an "AI Powered Capabilities" area (feature toggles such as Zia Search, AI Insights, Translate, Summary, Content, Task) and an "AI Bridge" area for enabling AI engines and entering their API keys (e.g., ChatGPT, Gemini, Anthropic, Cohere).
- **[confirmed]** Zia Search provides natural-language search across projects, tasks, timesheets, and documents from the top navigation search bar (toggle Zia on, type a plain-language query). → Zia Search in Zoho Projects provides natural-language (conversational) search across projects, tasks, timesheets, and documents from the top navigation search bar — click the search icon, toggle Zia on, and type a plain-language query. (It must first be enabled by an admin via Setup > Portal Configuration > AI Hub > AI Powered Capabilities; it is unavailable in the SA and CN data centers and is not available to client or read-only users.)
- **[confirmed]** AI Insights is surfaced on the Reports page (insights for every chart/report) and on Phase / Task List detail pages via an 'Insights' dropdown. → In Zoho Projects, AI Insights (powered by Zia) are surfaced on the Reports page — providing insights for every chart and report — and on Phase and Task List detail pages, where an "Insights" dropdown on the top right lets you select/enable an AI engine to view insights.
- **[confirmed]** Per Zoho's own help docs, AI Insights produces descriptive summaries of module data — priority tasks, task count, status, completion percentage — and does NOT document anomaly detection, deadline-risk percentages, or predictive forecasting. → Per Zoho's own Zoho Projects help page ("AI Hub," help.zoho.com/.../zia-projects), the AI Insights feature is described as producing descriptive summaries of module data — e.g., priority tasks, task count, status, completion percentage, "and more." That page does not use the words anomaly, risk, forecast, prediction, bottleneck, or deadline, and does not document anomaly detection, deadline-risk percentages, or predictive forecasting for Zoho Projects. (Such predictive/forecasting capabilities are documented by Zoho only for other products — Zoho CRM, Desk, and Analytics — and the predictive "risk/bottleneck/forecast" claims about Zoho Projects come from third-party blogs, not Zoho's docs.)
- **[confirmed]** Claims of predictive risk scoring (e.g. '73% probability of missing the deadline'), resource-overallocation alerts (>8h/day), and budget-variance flags come from a third-party analyst guide, not Zoho's official Projects documentation; a cloner should treat these as aspirational, not confirmed Zoho Projects behavior. → The specific, quantified behaviors — predictive risk scoring expressed as a deadline-miss probability (e.g. "73% probability of missing the deadline"), resource-overallocation alerts triggered at more than 8 hours/day, and quantified budget-variance flags (e.g. "18% over budget with 40% remaining") — are sourced from a third-party affiliate guide (aiproductivity.ai), not Zoho's official Projects documentation. Zoho's official Zia/Projects pages list only Zia Search, AI Insights, Voice Transcription, AI Translate, AI Summary, and AI Powered Content/Task/Module, and although some Zoho marketing pages mention budget-overrun, risk-forecasting, and overallocation concepts in vague generic terms, they never document the specific thresholds or probability figures in the claim. A cloner should treat the exact thresholds/percentages as aspirational, not confirmed Zoho Projects behavior.
- **[confirmed]** A named 'Ask Zia' conversational chatbot is a Zoho Analytics / Zia-platform feature, not a documented Zoho Projects feature; Zoho Projects' equivalent natural-language entry point is 'Zia Search'. → A named 'Ask Zia' conversational chatbot is documented as a Zoho Analytics feature (a conversational AI assistant within Zoho Analytics) and, more broadly, as Zoho's cross-product Zia-platform conversational interface — it is not a documented Zoho Projects feature. Zoho Projects' equivalent natural-language entry point is named 'Zia Search'.
- **[confirmed]** AI features support multiple pluggable engines via AI Bridge: Zia (Zoho's own), ChatGPT/OpenAI, Gemini, Anthropic, and Cohere, each enabled with an API key; DeepSeek and SiliconFlow are available only in the China data center. → AI features in Zoho Projects support multiple pluggable engines via the AI Bridge feature: Zia (Zoho's own), ChatGPT/OpenAI, Gemini, Anthropic, and Cohere, each enabled by toggling the engine and entering its API key (BYOK). DeepSeek and SiliconFlow are available only in the China (CN) data center, while the other five are available across other data centers (Zia itself is not offered in the SA or CN regions).
- **[confirmed]** Client users and read-only users cannot view or use any AI functionality in Zoho Projects. → Per Zoho's official AI Hub documentation, Client users and Read-only users do not have access to view or use any AI (Zia) functionalities within Zoho Projects.
- **[confirmed]** AI Powered Task generation is capped at 50 tasks/subtasks per generation and requires the 'Add task' permission. → Per the official Zoho Projects AI Hub documentation, AI-powered task creation lets a user generate a maximum of 50 tasks and subtasks combined in a single (at-once) generation, and the user must have the "Add task" permission to use the feature.
- **[confirmed]** Zoho's marketing AI page states AI is 'Included' in the Premium and Ultimate plans with 'no additional charges'. → Zoho's Projects AI marketing page (zoho.com/projects/ai.html) labels Zoho's AI as "Included" (versus competitors' add-ons) and states "No additional charges across all plans." Its FAQ specifies AI capabilities are available in the Premium, Enterprise, and Ultimate plans — not just Premium and Ultimate.
- **[confirmed]** The pricing page lists 'Smart AI Capabilities with Zia Summary, Zia Translate, Zia Task/Subtask Creation, Zia Insights' under the Premium plan, carried up through Enterprise and Ultimate (each inherits lower-tier features). → The Zoho Projects pricing page (zoho.com/projects/pricing.html) introduces a "Smart AI Capabilities with Zia" feature line under the Premium plan, listing Zia Summary, Zia Translate, Zia Task/Subtask Creation, and Zia Insights. Enterprise and Ultimate plans inherit these features via cumulative tier language ("Premium Features +" / "Enterprise Features +") rather than re-listing them.
- **[confirmed]** Canonical hierarchy is Portal > Project Group > Project > Phase/Milestone (optional) > Task List > Task > Sub-task; Issues/Bugs are a sibling object under Project. → Canonical hierarchy is Portal > Project Group (optional) > Project > Phase (the current term; "Milestone" is the legacy name) (optional) > Task List > Task > Sub-task. Every project needs at least one Task List (default "General"), while Project Group and Phase are optional organizing layers. Issues/Bugs are a separate, project-scoped module (sibling to the task tree, not a child of Tasks) and can be linked to Tasks.
- **[confirmed]** Every project has at least one task list; the default task list is named 'General'. Phases/milestones are optional, not mandatory. → In Zoho Projects, every project must contain at least one task list (a project cannot have zero task lists); the default/fallback task list is named "General." Phases (which Zoho also calls Milestones — they are the same construct) are optional goal-based targets, not mandatory. Note: the "General" default name is documented by a third-party Zoho-partner blog rather than an explicit official Zoho KB statement.
- **[confirmed]** 'Milestone' was renamed to 'Phase' in the UI, but the REST API endpoints and fields still use milestone / milestone_id. They are the same entity. → In Zoho Projects, "Milestone" was renamed to "Phase" in the UI, but the REST API still uses milestone terminology — the v1 endpoints are under .../milestones/ with the path identifier [MILESTONEID] and a JSON "id" field inside a "milestones" array (the word "phase" does not appear in the milestones API docs). Phase and milestone are the same underlying entity; the rename is UI-only.
- **[confirmed]** Sub-tasks can be nested up to 6 levels deep (a parent task can have up to 6 levels of subtasks). → Per the official Zoho Projects help documentation, a parent task can have subtasks nested up to 6 levels deep (each subtask may have its own subtask, continuing up to a limit of 6 levels).
- **[confirmed]** Tasks have a status object with type open|closed, support custom statuses (Enterprise), priority None/Low/Medium/High, and percent_complete in multiples of 10. → Per the Zoho Projects Tasks API, a task's status is an object containing a "type" field with values open or closed (V3 also exposes is_closed_type). Tasks accept a priority of None, Low, Medium, or High, and percent_complete must be an integer in multiples of 10 (10–100). Custom task statuses are supported via the custom_status parameter (a status ID); custom statuses are available from the Premium plan upward (it is the custom FIELDS feature, not custom statuses, that is Enterprise-only).
- **[confirmed]** Tasks model subtask trees via parent_task_id, root_task_id, depth, and isparent fields. → The Zoho Projects Tasks API task objects expose parent_task_id (immediate parent), root_task_id (top of the subtask tree), depth (nesting level), and isparent (whether the task has subtasks), which together model the subtask hierarchy.
- **[refuted]** Issues/Bugs have severity = {Show Stopper, Critical, Major, Minor}, classification = {Security, Crash/Hang, Data Loss, Performance, UI/Usability, Feature(New), Enhancement}, and reproducible = {Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable}. → Per the Zoho Projects Bugs REST API docs, default Bug/Issue fields are: severity = {Show stopper, Critical, Major, Minor}; reproducible = {Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable}; and classification = {Security, Not a bug, Crash/Hang, DataLoss, Performance, UI/Usabililty, OtherBug, Feature(New), Enhancement, Support Request}. Note the classification set has 10 default values (the claim listed only 7, omitting "Not a bug", "OtherBug", and "Support Request"), and exact doc spellings are "DataLoss" (not "Data Loss") and "UI/Usabililty" (a typo in the official doc). All values are user-customizable per project.
- **[confirmed]** Project budget_type values: 0=None, 1=Project, 3=Milestone, 5=Task, 7=User; billing_method 1=project hrs, 2=staff hrs, 3=fixed cost, 4=task/issue hrs. → Per the Zoho Projects REST API docs (projects-api.html), project budget_type accepted values: 0=None, 1=Based on Project, 3=Based on Milestone, 5=Based on Task, 7=Based on User. billing_method accepted values: 1=Based on project hours, 2=Based on staff hours, 3=Fixed cost for project, 4=Based on task/issue hours.
- **[confirmed]** Timelogs carry bill_status (Billable|Non Billable) and approval_status (Approved|Pending|Rejected), and can attach to a task, a bug, or stand alone as a general log; can be invoiced. → Zoho Projects timelogs carry a `bill_status` field (Billable | Non Billable) and an `approval_status` field (Approved | Pending | Rejected), and can be added to a task (/tasks/[ID]/logs), a bug (/bugs/[ID]/logs), or stand alone as a general log (/projects/[ID]/logs). Timelogs can be associated with an invoice (via an `invoice_id`) only for portals integrated with Zoho Invoice/Finance.

## Could Not Fetch (Honest Gaps)

The following sources were attempted but could not be retrieved (connection refused, bot-blocked, login-gated, JavaScript-rendered, or moved/404). Where a fact depended on one of these, it was sourced from an alternative or flagged as low-confidence.

- thedigitalprojectmanager.com/tools/zoho-projects-pricing — ECONNREFUSED (could not fetch exact tier prices from this source).
- tech.co/project-management-software/zoho-projects-pricing-review — ECONNREFUSED.
- www.zoho.com/projects/zohoprojects-pricing.html — page rendered without dollar amounts (prices loaded dynamically/JS); exact prices sourced from Capterra and alternatives.co instead.
- www.zoho.com/projects/pricing-comparison.html — exact dollar amounts not present in fetched markdown (JS-rendered), though the full feature/limit matrix WAS retrieved.
- www.g2.com/products/zoho-projects/reviews — HTTP 403 Forbidden (bot-blocked); relied on search-result snippets for aggregate stats.
- www.g2.com/products/zoho-projects/pricing — HTTP 403 Forbidden; pricing corroborated via Capterra/tech.co instead.
- www.g2.com/products/zoho-bugtracker/reviews — HTTP 403 Forbidden (bot protection).
- www.capterra.com/p/169455/Zoho-Projects/reviews/ — not directly fetched; used search-summary content. Capterra/G2 individual verified review text is aggregated from summaries only (per-review pages are partly auth/anti-bot gated).
- Gartner Peer Insights product page (gartner.com/reviews/product/zoho-projects) — ECONNREFUSED. TrustRadius Zoho Projects page not directly fetched (search surfaced only Gartner-Peer-Insights and Zoho One TrustRadius pages).
- projects.zoho.com/api-docs (V3 interactive API console) — JS-rendered SPA; full SPA also exceeded the 10MB fetch size limit. Relied on V1 REST help pages (which mirror the same fields) plus search snippets and partner summaries for the V3 base URL, scopes, and pagination.
- www.zoho.com/projects/compare-plans.html — HTTP 404 (plan-by-plan AI comparison matrix could not be retrieved; per-feature tier gating could not be confirmed from the official comparison table).
- www.zoho.com/projects/all-features.html — HTTP 404.
- www.zoho.com/projects/module-gallery.html — fetched but does not enumerate individual prebuilt module names/templates (gated behind signup).
- Reddit (r/zoho, r/projectmanagement, etc.) — Anthropic user agent blocked from reddit.com; site-scoped searches returned no usable/indexed links. Community angle relies on Capterra/G2/review-site aggregations.
- X/Twitter and LinkedIn posts/threads — login-gated, not fetched.
- YouTube tutorials (e.g. Vb--y0etl8c, 0AOtRONPnHI) — video content not transcribable via fetch; not used for factual claims.
- Hacker News / TrustRadius / PeerSpot — peerspot.com/products/zoho-projects-pros-and-cons returned ECONNREFUSED; no authoritative automation-specific or API-developer-sentiment results surfaced.
- help.zoho.com recurring tasks article (.../tasks/task-operations7-0/articles/recurring-tasks) — HTTP 404 (moved/unavailable); recurrence details sourced from API docs, blog, and community instead.
- help.zoho.com Gantt chart articles (.../reports/gantt-charts/articles/gantt-charts and .../global-milestone-gantt) — HTTP 404 (paths changed/moved). Exact Gantt zoom/scale levels (hour/day/week/month) not explicitly enumerated in fetched official sources.
- help.zoho.com task roll-up article (.../tasks/task-roll-up-7-0) — HTTP 404.
- help.zoho.com milestones FAQ (.../projects/faqs/milestones) — returned only a phase-linking snippet; no milestone completion/status-formula content.
- help.zoho.com issue list view article (.../issue-tracker/list-view-7-0) — HTTP 404 (moved/removed); issue list predefined views inferred from issue-tracking marketing + custom-view docs. The task list view 7.0 article (update-tasks-old) returned no extractable predefined-view list.
- help.zoho.com timesheet log-hours page (zoho.com/projects/help/timesheet/log-hours.html) — HTTP 404 (moved/renamed).
- help.zoho.com forums article (.../collaboration/forums-1) — HTTP 404 (used the manage-forums KB article and Forums API instead).
- help.zoho.com sandbox data-deployment article (.../sandbox/articles/data-deployment-from-sandbox) — JavaScript-rendered; WebFetch returned the component matrix and bidirectional confirmation but NOT the procedural step-by-step deploy-to-production workflow, and the full per-component deployment-direction Y/N matrix could not be captured cell-by-cell.
- help.zoho.com community topic pages (subtask depth, internal vs external tasks, working with client users, custom field limits, tag limits, custom-modules-now-available) — most rendered only the asker's question with no answer body, or were Zoho CRM-context threads (not Projects), or presented limits as an image. Subtask depth confirmed via official KB instead.
- www.zoho.com.cn/projects/help/severity-classification.html — returned only Chinese resource-center navigation, no severity/classification default-value detail; severity default-value mechanics marked low/medium confidence.
- www.enterprisetimes.co.uk/2024/05/03/how-to-add-or-edit-a-status-option-for-a-task-in-zoho-projects/ — HTTP 403 Forbidden.
- toplineresults.com/2025/08/zoho-projects-using-dependencies-to-manage-tasks/ — ECONNREFUSED (details recovered from search snippet).
- acutedata.com/zoho-projects-reports/ — ECONNREFUSED.
- invensislearning.com/blog/zoho-projects-review — ECONNREFUSED (used search snippet instead).
- aaxonix.com/resources/zoho-projects-github-integration/ — ECONNREFUSED.
- cloudwards.net comparison pages (zoho-projects-vs-clickup, zoho-projects-vs-monday-com) — ECONNREFUSED / fetch errored.
- selecthub.com/project-management-software/jira-vs-zoho-projects/ — ECONNREFUSED (data via search snippet).
- thedigitalprojectmanager.com Zoho review / vs-jira / tools review pages — HTTP 403 Forbidden or ECONNREFUSED (relied on search snippets).
- thebusinessdive.com Zoho Projects honest review — ECONNREFUSED.
- play.google.com/store/apps/details?id=com.zoho.projects — returned only the Play Store nav header; rating/version/changelog not extractable (used search snippets and third-party listings).
- slack.com/marketplace and projects.zoho.com/slack — not directly fetched (details corroborated via the help.zoho.com Slack article).
- Notifications KB pages — the Feed Notifications page did not expose granular per-category toggle details (only project-level toggle confirmed); the personal-preferences notifications page initially errored but a retry succeeded. The exact enumerated values for "Set email frequency"/summary-digest controls and the Weekly Digest send time/day are not stated verbatim in the public KB excerpts, and the full per-event catalog of which events fire mobile push vs feed vs email is not enumerated (push is described only as a mirror of all web-app notifications).
- Unverified factual limits not stated in any reachable source: exact attachment file-size limits, max tasks per project, exact default working hours / default working-day set, the exhaustive tag color palette and any official numeric per-portal/per-record tag limit, the exact per-edition custom MODULE COUNT limits (the dossier's 5/10/20 for Premium/Enterprise/Ultimate is unconfirmed — the only located limits post is Zoho CRM-specific), per-record/per-module record-count/storage limits by tier for custom modules, an authoritative exhaustive enumeration of custom-module field types, and the Enterprise plan's exact included client/read-only user counts and client-user add-on pack pricing/limits (FAQ suggested ~10 read-only client users in Enterprise but this is unverified on the official page).
## 1. Overview & Positioning

### 1.1 What Zoho Projects is

Zoho Projects is a cloud-based project management and team-collaboration application from Zoho Corporation. It launched its first version in **August 2006**, making it one of Zoho's early SaaS products (source: https://www.zoho.com/projects/15-years.html; source: https://en.wikipedia.org/wiki/Zoho_Corporation). It is positioned as an affordable, customizable PM tool for teams of all sizes spanning waterfall and hybrid methodologies, and is a core component of the broader Zoho ecosystem. It is bundled in **Zoho One** (launched July 2017), which today Zoho markets as 45+ to 50+ integrated business apps depending on the source; at its 2017 launch Zoho One bundled roughly 35–40 apps (source: https://www.zoho.com/projects/features.html; source: https://en.wikipedia.org/wiki/Zoho_Corporation).

Zoho markets a claim of **4.5M+ projects** managed on the platform (confidence: medium — vendor self-reported) (source: https://www.zoho.com/projects/). It also advertises **ISO 27001** security certification (confidence: medium) (source: https://www.zoho.com/projects/).

### 1.2 Positioning vs. Zoho Sprints (important distinction)

Zoho Projects and Zoho Sprints are **distinct products** and should not be conflated when cloning:

- **Zoho Projects** — general/classical/hybrid PM with Gantt charts, task dependencies and critical path, time tracking, and billing/invoicing. Recommended by practitioners for long, complex, resource-heavy projects (construction, engineering, consulting).
- **Zoho Sprints** — agile/scrum-focused, with backlogs, Scrum boards, and velocity/burndown reporting. It **lacks Gantt charts and dependency-driven scheduling**.

> **Correction to a common misconception:** Zoho Sprints **does** include a native, inbuilt Timesheet module with time logging, a global timer, and billable/non-billable hour tracking. The differentiator is **not** that Sprints lacks time tracking — it is Projects' deeper billing/invoicing integrations and Gantt-based planning.

(source: https://zenatta.com/zoho-projects-or-zoho-sprints-which-one-is-right-for-you/; source: https://www.zoho.com/projects/integrations/zoho-sprints.html)

The Projects + Sprints integration is the recommended path for hybrid Agile + Waterfall workflows (source: https://zenatta.com/zoho-projects-or-zoho-sprints-which-one-is-right-for-you/).

### 1.3 Target users and industries

| Dimension | Detail |
|---|---|
| Ideal customer profile | SMBs ~5–100 employees; project-based orgs (agencies, consultancies, professional services, contractors) running multiple concurrent client projects; existing Zoho-ecosystem users (CRM, Books, Analytics) |
| Less suitable for | Solo freelancers; large enterprises wanting deep customization / modern UX |
| Targeted industries | Construction, manufacturing, IT/software, professional services, hospitality |

(source: https://www.cloudwards.net/zoho-projects-review/; source: https://thebusinessdive.com/zoho-projects-review; source: https://www.zoho.com/projects/customers/; source: https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/zoho-projects-overview)

### 1.4 Editions and pricing

Zoho Projects offers **four self-serve editions**: Free (up to 5 users, free forever), Premium, Enterprise, and Ultimate. Paid plans are available via a **no-credit-card free trial** without requiring sales contact. A self-serve **15-day free trial** is advertised (some older sources mention a historical 10-day Enterprise trial; confidence: medium) (source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.zoho.com/projects/; source: https://alternatives.co/software/zoho-projects/pricing/).

| Edition | Annual price (USD/user/mo) | Monthly price (USD/user/mo) | Storage | Projects |
|---|---|---|---|---|
| Free | $0 (free forever) | $0 | 5 GB (shared/total) | 3 |
| Premium | $4 | $5 | 100 GB | Unlimited |
| Enterprise | $9 | $10 | 120 GB | Unlimited |
| Ultimate | $14 | ~$15 | 15 GB/user **or** 150 GB/org, whichever is higher | Unlimited |

Annual billing reflects Zoho's advertised "save over 15%" discount.

> **Sourcing caveat (do not treat prices as primary-confirmed):** The official Zoho pricing page renders prices via JavaScript and **could not be scraped directly** for primary confirmation. The figures above are corroborated by third-party sources (tech.co, Capterra summaries, alternatives.co, cloudwards). (source: https://www.capterra.com/p/169455/Zoho-Projects/pricing/; source: https://www.cloudwards.net/zoho-projects-review/; source: https://www.zoho.com/projects/zohoprojects-pricing.html)

**Free plan limits:** up to 5 users, 3 projects, 5 GB total (shared) storage, no Zia AI, and **read-only Gantt**. Older review sources cite 3-user / 2-project (and even 10 MB) limits, indicating the free-tier limits were expanded over time (confidence: medium) (source: https://www.zoho.com/projects/zohoprojects-pricing.html; source: https://www.cloudwards.net/zoho-projects-review/).

**Read-only user allowances:** Enterprise 10, Ultimate 100 (source: https://www.zoho.com/projects/pricing-comparison.html).

### 1.5 Zoho Projects Plus (separate bundle)

**Zoho Projects Plus** is a separate, unified/bundled project-management platform that Zoho launched on **March 11, 2025**. It natively integrates **Zoho Projects, Sprints, Analytics, and WorkDrive** (the launch lineup; current pricing pages also add Notebook/Learn). Per Zoho's launch announcement it is priced at **$16/user/month** in the US, which Zoho states is **27% lower** than buying those four apps a la carte; some current third-party listings cite up to ~$20/user/month depending on billing terms (source: https://www.businesswire.com/news/home/20250311762238/en/; source: https://www.zoho.com/projectsplus/pricing.html).

### 1.6 Product structure (work-breakdown hierarchy)

The canonical hierarchy is:

```
Portal
  └─ Project Group (optional)
       └─ Project
            └─ Phase (optional; "Milestone" is the legacy name — same construct)
                 └─ Task List (at least one required; default "General")
                      └─ Task
                           └─ Sub-task (nestable up to 6 levels deep)
```

Key structural rules:

- **Project Group** and **Phase** are optional organizing layers.
- Every project must contain **at least one Task List**; the default/fallback task list is named **"General"** (the "General" default name is documented by a third-party Zoho-partner blog rather than an explicit official Zoho KB statement).
- **Issues/Bugs** are a **separate, project-scoped module** (a sibling to the task tree, **not** a child of Tasks); they can be linked to Tasks.
- **Phase = Milestone:** the UI renamed "Milestone" to "Phase," but the REST API still uses **milestone** terminology — v1 endpoints are under `.../milestones/` with path identifier `[MILESTONEID]` and a JSON `id` field inside a `milestones` array (the word "phase" does not appear in the milestones API docs). They are the same underlying entity; the rename is UI-only.
- **Sub-tasks** can be nested **up to 6 levels deep**.

(source: https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/zoho-projects-overview; source: https://www.zoho.com/projects/help/rest-api/milestones-api.html; source: https://help.zoho.com/portal/en/kb/projects/tasks/subtasks-7-0/articles/subtasks-projects-old)

Beyond this hierarchy plus the Issues/Bug tracker, the product adds modules for: time tracking/timesheets, automation (Blueprint, Workflow Rules, Business Rules, SLAs, Webhooks, custom functions), collaboration (Feeds, Chat/Discuss, Forums, Wiki/Pages, Documents), reporting/dashboards (including Earned Value Management, critical path, and baselines), resource management/workload, billing (invoices, expenses, budgeting), and deep customization (custom fields, layouts, custom views, custom status, custom modules, tags, web tabs). It has web and iOS/Android apps and a **V3 REST API**. (source: https://www.zoho.com/projects/features.html)

### 1.7 Core feature inventory (at a glance)

| Feature area | Summary | Tier notes |
|---|---|---|
| Task management (WBS) | Phases/Milestones → Task Lists → Tasks → Sub-tasks; dependencies, recurrence, reminders, critical tasks, baselines, roll-up | Basic task mgmt + subtasks + reminders on Free; recurring tasks and roll-up require Premium+ |
| Task views | Classic, Plain, Kanban board, plus Gantt chart | — |
| Gantt & dependencies | Visual scheduling, dependencies, critical path, baselines (Enterprise: 15 baselines/project) | Gantt viewer (read-only) in Free; critical path & baselines Enterprise+ |
| Issue / Bug tracker | Log, assign, track, close bugs; searchable by name, prefix ID, comments | Premium+ |
| Time tracking & timesheets | Manual/auto timers; billable/non-billable; approve/reject; invoicing integration | Time tracking Premium+; multi-user timesheets Ultimate |
| Automation | Blueprint, Workflow Rules, Business Rules, SLAs, Webhooks, custom functions | See limits in §1.4-related dossier sections |
| Reports & dashboards | Task/issue/timesheet reports, portfolio dashboard, budget forecasting, planned vs. actual, EVM | Custom reports Premium+ (caps escalate by tier) |
| Resource management | Allocation, workload charts, planned vs. actual hours | — |
| Collaboration | Feeds, Mentions, Chat (Discuss), Forums, Wiki/Pages, Documents, email-in/alias | — |
| Customization | Layouts, custom fields, views, status, functions, templates, custom domain, tags, web tabs, custom modules (≤20 Ultimate) | Custom **fields** Enterprise+; custom modules Premium+ (5/10/20) |
| Billing | Project budgeting, expense tracking, invoice generation from logged time | Premium+ |
| User administration | Profiles, roles, client users, read-only users | Custom profiles/roles Enterprise+ |
| Integrations | Native Zoho (Sprints, Analytics, CRM, Desk, Books, Invoice, Cliq, Mail, Meeting, People, Flow, WorkDrive); third-party (Google Workspace, MS 365/Teams/Outlook/OneDrive, Slack, GitHub/GitLab/Bitbucket/Gitea, Dropbox, Box, Zapier, Zendesk, iCal, Chrome ext.); imports from MS Project, JIRA, Basecamp | — |
| Apps & API | Web app, iOS/Android apps, V3 REST API | — |

(source: https://www.zoho.com/projects/features.html; source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.zoho.com/projects/custom-modules.html)

### 1.8 AI capabilities (Zia) — overview

> **Cloner caveat (critical):** Zoho Projects' AI is **descriptive/generative**, not predictive, per its own documentation. Several widely-cited "predictive" behaviors are **not** in Zoho's official docs — see §1.8.3.

#### 1.8.1 AI Hub and administration

All AI in Zoho Projects is centrally administered from the **AI Hub** at **Setup > Portal Configuration > AI Hub**, which contains two areas:

- **AI Powered Capabilities** — feature toggles (Zia Search, AI Insights, Translate, Summary, Content, Task, Module, Voice Transcription).
- **AI Bridge** — engine selection and API-key (BYOK) configuration.

(source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/zia-projects)

**Access restriction:** Per Zoho's official AI Hub documentation, **Client users and Read-only users do not have access** to view or use any AI (Zia) functionality (source: same as above).

#### 1.8.2 Documented Zia/AI features

| Feature | What it does | Notable limits/details |
|---|---|---|
| **Zia Search** | Natural-language (conversational) search across projects, tasks, timesheets, documents from the top nav search bar (click search icon, toggle Zia on, type plain-language query) | Admin must enable it; **unavailable in SA and CN data centers**; not available to client/read-only users |
| **AI Insights** | Plain-language descriptive summaries surfaced on the Reports page (per chart/report) and on Phase / Task List detail pages via an "Insights" dropdown (pick AI engine) | Scoped to **descriptive** metrics: priority tasks, task count, status, completion %, "and more." See §1.8.3 |
| **AI Translate** | Auto-detects input language and translates task/issue comments and descriptions across **70+ languages** | Triggered via a Translate button/icon |
| **AI Summary** | Condenses long descriptions/comment threads into a short summary | "Show Summary" button; user picks engine |
| **AI Powered Content** | Generates descriptions, summaries, action items; paraphrase, synonyms, tone/length adjustment | "Generate content with AI" button in text fields |
| **AI Powered Task** | Generates tasks/subtasks from a written description | **Max 50 tasks+subtasks combined per single generation**; requires "Add task" permission |
| **AI Powered Module** | Creates a custom module/tab via AI | Setup > Customization > Modules and Tabs |
| **Zia Voice Transcription ("Dictate")** | Multi-language speech-to-text for comments on modules, Feed, Status, Events | "Dictate" button in comment sections |

(source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/zia-projects; source: https://www.zoho.com/blog/projects/transforming-project-management-with-zia.html; source: https://www.zoho.com/projects/ai.html)

**AI Bridge engines (pluggable):** Zia (Zoho's own — not offered in SA or CN regions), ChatGPT/OpenAI, Gemini, Anthropic, Cohere (each enabled by toggling the engine and entering its API key). **DeepSeek and SiliconFlow are available only in the China (CN) data center.** Per request, the user/admin selects which engine runs it (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/zia-projects).

**Zoho MCP Server** — connects external AI models to Projects via natural language; listed as available on the **Free** plan (confidence: medium) (source: https://www.zoho.com/projects/pricing.html).

#### 1.8.3 What Zia is NOT (refuted/unverifiable claims)

- **No documented predictive forecasting.** Per Zoho's own AI Hub help page, AI Insights produces descriptive summaries only. That page does **not** use the words *anomaly, risk, forecast, prediction, bottleneck,* or *deadline* (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/zia-projects).
- **Specific quantified behaviors are third-party, not Zoho.** Claims of predictive risk scoring (e.g. "73% probability of missing the deadline"), resource-overallocation alerts triggered at >8 hours/day, and quantified budget-variance flags (e.g. "18% over budget with 40% remaining") come from a **third-party affiliate guide (aiproductivity.ai)**, not Zoho's official Projects docs. Treat the exact thresholds/percentages as **aspirational, not confirmed** (source: https://aiproductivity.ai/guides/zoho-projects-zia-ai-guide/).
- **"Ask Zia" is not a Projects feature.** A named "Ask Zia" conversational chatbot is documented as a **Zoho Analytics** feature (and Zoho's cross-product Zia-platform interface), not a Zoho Projects feature. Projects' equivalent natural-language entry point is **Zia Search** (source: https://www.zoho.com/analytics/zia/; source: https://www.zoho.com/zia/ask.html).
- **"Smart Suggestions"** (linking related issues to tasks) is marketed as **"Coming Soon,"** not shipped (source: https://www.zoho.com/projects/ai.html).

#### 1.8.4 AI plan gating

Zoho's Projects AI marketing page labels AI as **"Included"** (versus competitors' add-ons) and states **"No additional charges across all plans."** Its FAQ specifies AI capabilities are available in the **Premium, Enterprise, and Ultimate** plans (source: https://www.zoho.com/projects/ai.html).

The pricing page introduces a **"Smart AI Capabilities with Zia"** feature line under the **Premium** plan, listing **Zia Summary, Zia Translate, Zia Task/Subtask Creation, and Zia Insights**. Enterprise and Ultimate inherit these via cumulative tier language ("Premium Features +" / "Enterprise Features +") rather than re-listing them (source: https://www.zoho.com/projects/pricing.html).

> **Confidence note:** Exact per-feature tier splits **diverge across sources** (one analyst guide lists Search/Insights/GenAI/Translate as Premium+Enterprise and a separate "Zia Agent Studio" as Enterprise-only). Treat anything more precise than "**Premium and up**" as **medium confidence** (source: https://aiproductivity.ai/guides/zoho-projects-zia-ai-guide/).

### 1.9 Market reception (reviews)

| Source | Rating | Themes |
|---|---|---|
| G2 | ~4.3/5 (300+ reviews) | + Value (enterprise features at SMB price); + task hierarchies/dependencies; + Zoho-ecosystem fit. − UI less intuitive than Trello/Asana; ~2–3 week onboarding |
| Capterra | ~4.5/5 (400+ reviews) | + Affordability, depth. − Dated/clunky UI (esp. assigning subtasks, large projects); − odd font sizes/spacing; − per-client report customization rarely yields desired output |
| Gartner Peer Insights | 4.3/5 (200+ reviews) | — |

**Recurring praise:** value-to-feature ratio, built-in time tracking/billing, automation, granular roles/permissions, tight Zoho integration.

**Recurring criticism:** dated/clunky UI with extra clicks; steep learning curve (~2–3 weeks onboarding; complexity grows past ~10 projects); limited reporting/dashboard customization; weaker mobile experience (mobile app lacks complex automation, detailed reporting, advanced customization, detailed Gantt editing); **no native desktop app** (web-app/Chrome-extension only); occasional sluggishness on large projects (Gantt drag-and-drop lag); weaker non-Zoho integrations; minimal/no offline access.

(source: https://www.g2.com/products/zoho-projects/reviews; source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/; source: https://www.gartner.com/reviews/product/zoho-projects; source: https://thedigitalprojectmanager.com/tools/zoho-projects-review/; source: https://thebusinessdive.com/zoho-projects-review)

### 1.10 Known limitations relevant to a cloner

- **Heavy tier gating:** Custom **fields** are Enterprise/Ultimate only (not Free/Premium). Critical Path and cross-project (inter-project) dependencies are Enterprise/Ultimate only; Free/Premium support only within-project dependencies (4 dependency types). Free Gantt is read-only.
- **Automation gotcha:** Blueprint transitions must be **triggered manually per task** — there is **no automatic field-update-driven transition**. Use **Workflow Rules** for automatic status changes. (Limits: Workflow Rules 2/2/20/40 per layout across Free/Premium/Enterprise/Ultimate; Blueprints 2/25/50 per layout for Premium/Enterprise/Ultimate; max 5 webhooks per blueprint transition.)
- **Quota scaling:** Custom Modules 5/10/20 (Premium/Enterprise/Ultimate); Custom Reports 20/50/250 per module; project dashboards 1/5/10/unlimited.
- **API rate limit:** ~**200 calls per 2-minute window per endpoint** (historically 100), with a **10-minute block** on breach. Bulk reads max **200 records/request**; create/update/delete max **100 records/request**.
- **Scalability ceiling:** rated fine for small-to-large teams but reviewers say it "needs improvement for very large projects."

(source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.zoho.com/projects/blueprint.html; source: https://help.zoho.com/portal/en/community/topic/zoho-blueprint-and-workflow; source: https://www.zoho.com/developer/help/api/api-limits.html; source: https://help.zoho.com/portal/en/community/topic/zoho-projects-api-100-requests-2-min-limit; source: https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/)

### 1.11 Research gaps / data not fully verified

The following could **not** be confirmed from primary sources during research and should be treated cautiously:

- **Exact dollar prices** — the official Zoho pricing page renders prices via JavaScript and could not be scraped; figures come from third-party aggregators (Capterra, alternatives.co, tech.co).
- **Official per-feature AI tier matrix** — `zoho.com/projects/compare-plans.html` returned **HTTP 404**, so the plan-by-plan AI comparison matrix could not be retrieved; per-feature AI gating beyond "Premium and up" is **medium confidence**.
- **Free-plan exact historical limits** — sources disagree (current: 5 users / 3 projects / 5 GB; older: 3 users / 2 projects), indicating change over time.
- **"4.5M+ projects" and ISO 27001** — vendor self-reported (medium confidence).
- **15-day vs. 10-day trial** — sources diverge (medium confidence).
## 2. Core Data Model & Entity Hierarchy

This section documents the object model a clone must replicate. All claims are drawn from Zoho's official REST API help pages and KB articles; URLs are cited inline so each fact is traceable. Where the official documentation is silent or contradictory, that is stated explicitly rather than guessed.

### 2.1 The Canonical Hierarchy

The top-down containment hierarchy is:

```
Portal / Organization
  └─ Project Group           (optional)
       └─ Project
            └─ Phase / Milestone   (optional)
                 └─ Task List       (≥1 mandatory; default "General")
                      └─ Task
                           └─ Sub-task   (nestable up to 6 levels)
```

Two objects sit **beside** the task tree rather than inside it:

- **Issues / Bugs** — a separate, project-scoped module (a sibling to the task tree, not a child of Tasks). Bugs can be *linked* to Tasks but are not contained by them (source: https://www.acutedata.com/whats-the-difference-between-a-project-and-a-task-list-in-zoho-projects/, https://www.zoho.com/projects/help/rest-api/projects-api.html).
- **Timelogs** — attach to a Task, a Bug, or stand alone as a project-level "general" log (source: https://www.zoho.com/projects/help/rest-api/log-time.html).

Additional project-scoped objects: **Documents/Folders**, **Events** (native calendar), **Meetings** (integration-backed), and **Users** (portal-level, associated to projects by role/profile).

Build-critical rules about the hierarchy:

- **Every project must contain at least one Task List.** A project cannot have zero task lists; the default/fallback task list is named **"General"**. Caveat: the "General" default *name* is documented by a third-party Zoho-partner blog, not by an explicit official Zoho KB statement (source: https://www.acutedata.com/whats-the-difference-between-a-project-and-a-task-list-in-zoho-projects/).
- **Project Group and Phase are optional** organizing layers. A Task List can sit directly under a Project with no Phase (source: https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases).
- **"Milestone" was renamed to "Phase" in the UI only.** The REST API still uses milestone terminology: v1 endpoints are under `.../milestones/` with path identifier `[MILESTONEID]` and a JSON `id` inside a `milestones` array. The word "phase" does not appear in the milestones API docs. Phase and Milestone are the same underlying entity (source: https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases, https://www.zoho.com/projects/help/rest-api/milestones-api.html).

### 2.2 API Base Structure

- **V3** is current: base path `/api/v3/portal/{portal_id}/projects/{project_id}/...` (source: https://projects.zoho.com/api-docs).
- **Legacy V1 APIs were sunset on December 31, 2025** (source: https://goldstarit.com/zoho-projects-v3-apis-update/).
- The V3 interactive API console (projects.zoho.com/api-docs) is a JS-rendered SPA and could not be scraped as static markdown; the field-level documentation below is taken from the V1 REST help pages, which mirror the same fields. **Limitation:** exact V3 field renames/additions beyond those noted (e.g. `is_closed_type` on task status) are not fully verified here.

---

### 2.3 Entity: Portal / Organization

Top-level tenant container. Every user, project group, project, and user-management config lives under a portal. A user may belong to multiple portals; one is marked default (source: https://www.zoho.com/projects/help/rest-api/portals-api.html).

| Field | Type | Notes |
|---|---|---|
| id / id_string | integer / string | |
| name | string | |
| default | boolean | Is this the user's default portal |
| gmt_time_zone | string | |
| role | string | Logged-in user's portal role |
| plan | string | e.g. Free / Premium / Enterprise |
| trial_enabled, is_new_plan, new_user_plan | boolean | |
| is_crm_partner | boolean | |
| bug_singular / bug_plural | string | Configurable label for the Bug entity |
| project_count | object | |
| avail_user_count / max_user_count | integer | |
| available_projects | integer | |
| profile_id | integer | |
| is_display_taskprefix / is_display_projectprefix | boolean | |
| project_prefix | string | |
| settings | object | business_hours, working_days, timelog_period, default_dependency_type |
| extensions, link | object | |

**Relationships:** 1 Portal → many Project Groups, Projects, Users. Settings (business hours, working days, default dependency type) cascade down to projects/tasks.

### 2.4 Entity: Project Group

Optional container grouping projects by client/criteria. A project belongs to **at most one** group at a time (or is "Ungrouped"). Moving a project to a new group changes its prefix to the new group's prefix (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/project-groups, https://www.zoho.com/projects/help/rest-api/projects-api.html).

| Field | Type | Notes |
|---|---|---|
| group_id | long | |
| Group Name | string | |
| Group Prefix | string | Max 10 chars, alphanumeric + hyphens; auto-prepended to projects in the group |

**Relationships:** Portal 1→many Project Groups; Project Group 1→many Projects; a Project → exactly one group (or Ungrouped).

### 2.5 Entity: Project

Core work container holding phases, task lists, tasks, issues, timelogs, documents, and users. Carries status, budget/billing config, per-project prefix, and a bug-enable toggle (source: https://www.zoho.com/projects/help/rest-api/projects-api.html).

Selected fields (not exhaustive):

| Field | Type | Notes |
|---|---|---|
| id / id_string | long / string | |
| name | string[100] | |
| description | string | |
| status | string | active \| archived \| template |
| role | string | Requesting user's project role |
| owner_id / owner_name | long / string | |
| group_id | long | |
| is_public | yes \| no | |
| start_date / end_date (+ _long) | date | |
| created_date / updated_date (+ _long) | date | |
| task_count / milestone_count / bug_count | object | each {open, closed} |
| budget_type | int | 0=None, 1=Based on Project, 3=Based on Milestone, 5=Based on Task, 7=Based on User |
| budget_value | float | Cost budget or budgeted hours |
| budget_tracking_method | int | 1=Project hrs, 2=Staff hrs, 4=Task/Issue hrs |
| threshold | float | |
| currency | string | |
| project_rate / cost_per_hour / fixed_cost | float | |
| billing_method | int | 1=Based on project hours, 2=Based on staff hours, 3=Fixed cost for project, 4=Based on task/issue hours |
| bill_status | Billable \| Non billable | |
| revenue_budget | float | |
| is_strict / strict_project | int | 1=Not strict, 2=Strict |
| project_percent | string | Completion % |
| IS_BUG_ENABLED | boolean | Per-project bug-tracking toggle |
| taskbug_prefix / bug_prefix | string | |
| custom_status_id / custom_status | long | |
| enable_rollup | yes \| no | Task Roll-Up toggle |
| enable_sprints | yes \| no | |
| show_project_overview | boolean | |
| layout_details | object | task layout id/name, project layout id/name |
| cascade_setting | object | date, logHours, plan, percentage, workHours (booleans) |
| custom fields | by field_id | e.g. UDF_CHAR1, UDF_MULTI1, UDF_MULTIUSER1 |
| link | object | URLs for activity, document, forum, timesheet, task, bug, event, folder, user, status, milestone, tasklist |

The `budget_type` and `billing_method` enumerations above are confirmed verbatim against the official projects-api.html docs (source: https://www.zoho.com/projects/help/rest-api/projects-api.html).

**Relationships:** Belongs to one Portal and optionally one Project Group. Has many Phases, Task Lists, Tasks, Issues, Timelogs, Documents, and member Users. Must contain ≥1 task list (default "General").

### 2.6 Entity: Phase / Milestone

Goal-based checkpoint within a project; optional layer above task lists. UI-renamed from "Milestone"; API still uses `milestone` / `milestone_id` (source: https://www.zoho.com/projects/help/rest-api/milestones-api.html, https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases).

| Field | Type | Notes |
|---|---|---|
| id | long | |
| name | string[100] | |
| start_date / end_date (+ _long) | MM-DD-YYYY | |
| status | string | **notcompleted \| completed** — a manual binary flag |
| completed_date (+ _long) | date | |
| owner_id / owner_name | long / string | |
| flag | internal \| external | internal = portal users only; external = also visible to client users |
| budget | float | Cost budget; sum of associated task-list budgets |
| threshold | float | Cost budget threshold |
| revenue_budget | float | |
| link | object | self, status URLs |

**Critical limitation — milestone status is a manual binary, not auto-computed.** The API exposes milestone status only as `notcompleted`/`completed` with a `completed_date`. There is **no completion-percentage field on the milestone** in the API. A phase does **not** automatically flip to completed when its tasks reach 100% — completion is a deliberate manual action (the UI shows only Move/Delete, not an auto-complete). Phase completion *percentage* is a derived/display value computed via the weighted formula in §2.13, but phase *status* is a separate manual flag (source: https://www.zoho.com/projects/help/rest-api/milestones-api.html, https://help.zoho.com/portal/en/community/topic/milestones-how-to-complete).

**Relationships:** Belongs to one Project. Has many Task Lists (and indirectly Tasks). Issues may reference a `milestone_id` and an `affectedmile_id`. **Cross-project phase dependencies are NOT supported** (only task-to-task) (source: https://help.zoho.com/portal/en/kb/projects/faqs/milestones/articles/milestones-7-2-2024).

### 2.7 Entity: Task List

Grouping of tasks within a project; can optionally sit under a Phase. Every project has ≥1 (default "General") (source: https://www.zoho.com/projects/help/rest-api/tasklists-api.html).

| Field | Type | Notes |
|---|---|---|
| id | long | |
| name | string | |
| milestone | object | Nested associated phase: id, name, owner, dates, status, flag |
| completed | boolean | |
| rolled | boolean | Roll-up indicator |
| sequence | integer | Sort order |
| view_type | string | Internal visibility classification |
| flag | internal \| external | |
| created_time (+ _long) | date | |
| link | object | self + child-tasks URLs |

**Limitation:** The Tasklist API response has a boolean `completed` field but **no percentage field and no own status field**. The Update Task List endpoint accepts a `status` parameter of `active` or `completed` only (source: https://www.zoho.com/projects/help/rest-api/tasklists-api.html).

**Relationships:** Belongs to one Project; optionally to one Phase via the nested milestone object ("Related Phase" in the UI). Has many Tasks.

### 2.8 Entity: Task

The primary unit of work and the richest object in the model (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html).

Selected fields (not exhaustive):

| Field | Type / Values | Notes |
|---|---|---|
| id / id_string | long | |
| name | string (mandatory) | |
| key | string | e.g. "X9-T8" |
| description | string | |
| start_date / end_date (+ _long) | MM-DD-YYYY | |
| start_time / end_time | 12/24h | |
| duration | int | |
| duration_type | days \| hrs | |
| completed_on | date | |
| status | object | {id, name, type=**open\|closed**, color_code}; V3 also exposes is_closed_type |
| custom_status | long | Status ID; custom statuses available from **Premium** upward |
| priority | None \| Low \| Medium \| High | |
| percent_complete | int | Multiples of 10 only (10–100); user-set |
| completed | boolean | |
| person_responsible | long | Comma-separated for multiple owners |
| person_responsible_zpuid | long | |
| owner_work / details.owners | array | {user_id, working_hours} per owner |
| work | string | e.g. "208:00" (HHH:MM) |
| work_type | work_hrs_per_day \| work_in_percentage \| work_hours | |
| associated_teams | array | |
| rate_per_hour / cost_per_hour | float | |
| billingtype | none \| billable \| non billable | |
| planned_cost / actual_cost / forecasted_cost / budget_value / budget_threshold / revenue_budget | float | |
| tasklist | object | {id, name} |
| milestone_id | long | |
| project | object | {id, name} |
| parent_task_id | long | Immediate parent (subtask tree) |
| root_task_id | long | Top-most ancestor |
| isparent | boolean | Has subtasks |
| subtasks | boolean | |
| depth | int | Nesting level |
| order_sequence | int | |
| dependency | object | dependencyDetails, successor[]; DEPENDENCY_TYPE FS\|SS\|SF\|FF, GAPVALUE, GAPTYPE Days\|Hours |
| is_recurrence_set | boolean | |
| recurrence | object | recurring_frequency daily\|weekly\|monthly\|yearly, time_span, number_of_occurrences, is_recurring_comments |
| recurrence_type | after_current_task_completed \| specified_interval_creation | |
| reminder fields | — | is_reminder_set, reminder_date, reminder_time, remind_on (daily\|on same day\|before due date\|customdate), reminder_notify_users (owner\|follower\|creator\|projectowner) |
| created_by / created_person / created_time (+ _long) | — | |
| last_updated_time (+ _long) | — | |
| is_comment_added / is_docs_associated / is_forum_associated | boolean | |
| task_followers | object | FOLLOWERS[], FOLLOWERSIZE, FOLUSERS |
| log_hours | object | billable_hours, non_billable_hours |
| tagIds | array | |
| is_sprints_task | boolean | |
| custom_fields | object | Column names like UDF_CHAR1 |
| link | object | self, timesheet URLs |

Key behaviors:

- **Status types are immutable: open or closed.** Custom statuses map to one of these two types. Custom task statuses are available from the **Premium** plan upward — note it is custom **fields** (not statuses) that are Enterprise-only (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html).
- **Subtask tree** is modeled via `parent_task_id`, `root_task_id`, `depth`, `isparent` (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html).
- **Multiple owners**, each with their own `working_hours`; three work formats via `work_type`.

**Relationships:** Belongs to one Project and one Task List; optionally to a Phase via `milestone_id`. Has many Timelogs, Comments, Followers, Document associations, Dependencies.

### 2.9 Entity: Sub-task

A child of another Task, sharing the Task schema. Distinguished by `parent_task_id`, `root_task_id`, `depth`, `isparent` (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks).

| Field | Type | Notes |
|---|---|---|
| parent_task_id | long | |
| root_task_id | long | Top-most ancestor |
| depth | int | 1–6 |
| isparent | boolean | |
| (all other fields) | — | Identical to Task |

Behaviors and limits:

- **Max 6 nesting levels** — a parent task can have subtasks nested up to 6 levels deep (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks).
- **Closing a parent closes all subtasks**; reopening a subtask requires reopening the parent.
- **Subtasks cannot be created under a closed task.**
- Start/end dates, work hours, and logged hours roll up to parents/phases/project when Task Roll-Up is enabled (see §2.13).

### 2.10 Entity: Issue / Bug

A defect/issue object, sibling of Task under Project. Requires per-project bug tracking enabled (`IS_BUG_ENABLED`). Has its own enumerations and configurable workflow (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html).

| Field | Type / Values | Notes |
|---|---|---|
| id | long | |
| key | string | e.g. "DC-I40" / "541" |
| bug_prefix | string | |
| project_id | long | |
| title | string | |
| description | string | |
| status | object (+ status_id) | {id, type}; defaults below |
| closed | boolean | |
| resolution | string; resolved_time (+ _long) | |
| severity (+ severity_id) | object | Show stopper \| Critical \| Major \| Minor |
| classification (+ classification_id) | object | See full set below |
| reproducible (+ reproducible_id) | object | Always \| Sometimes \| Rarely \| Unable \| NeverTried \| NotApplicable |
| assignee_name / assignee_id / assignee_zpuid / assignee | array | Multiple assignees |
| reporter_id / reported_person | — | |
| bug_followers | long | |
| due_date (+ _long) | date | |
| created_time / updated_time (+ _long) | date | |
| module (+ module_id) | object | {id, name} |
| milestone (+ milestone_id) / affectedmile_id | object | |
| flag | Internal \| External | |
| rate_per_hour / cost_per_hour | float | |
| comment_count / attachment_count | string | |
| custom fields | CHAR1–CHAR12 (text/picklist), LONG1–LONG4 (numeric), DATE1–DATE4 (MM-DD-YYYY) | appear in customfields[] with label_name/value/column_name |
| link | object | self, timesheet URLs |

**Enumerations (verbatim from the official Bugs API docs — exact spellings preserved):**

| Field | Default values |
|---|---|
| severity | Show stopper, Critical, Major, Minor |
| reproducible | Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable |
| classification | Security, **Not a bug**, Crash/Hang, **DataLoss**, Performance, **UI/Usabililty** *(sic — typo in official doc)*, **OtherBug**, Feature(New), Enhancement, **Support Request** |
| flag | Internal, External |

Note the classification set has **10** default values. (A common abbreviated list omits "Not a bug", "OtherBug", and "Support Request" and uses "Data Loss"/"UI/Usability" — but the official doc spells them "DataLoss" and "UI/Usabililty".) All values are user-customizable per project (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html, https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html).

Default Zoho Projects issue statuses: **Open, In Progress, To Be Tested, Closed, Reopen** (the parallel BugTracker product has a larger default set). Each status is typed Open or Closed; at least one of each is required and defaults cannot be deleted (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html, https://help.zoho.com/portal/en/kb/projects/faqs/issue-tracker/articles/how-to-configure-issue-status-and-workflow-for-my-issue-tracker).

**Relationships:** Belongs to one Project; optionally linked to a Module and a Phase (`milestone_id` + `affectedmile_id`). Bidirectionally associated to Tasks. Statuses/workflow customizable via Blueprint (Premium/Enterprise).

### 2.11 Entity: Timelog / Timesheet Entry

A time entry logged against a Task, a Bug, or as a general (project-level) log (source: https://www.zoho.com/projects/help/rest-api/log-time.html).

| Field | Type / Values | Notes |
|---|---|---|
| id / id_string | long | |
| hours / minutes / total_minutes | int | |
| hours_display | string | e.g. "04:30" |
| date / log_date (+ _long, _format) | MM-DD-YYYY | |
| created_date / last_modified_date (+ _long, _format) | — | |
| bill_status | Billable \| Non Billable | |
| approval_status | Approved \| Pending \| Rejected | |
| approver_name | string | |
| owner_id / owner_name | long / string | |
| notes | string | |
| cost_per_hour / cost | float / string | |
| invoice_id | long | Set only for portals integrated with Zoho Invoice/Finance |
| task | object | {id, name, is_sub_task} |
| bug | object | {id, title} |
| task_list | object | {id, name} |
| project | object | |
| name | string | Activity name for general logs |
| custom_fields | object | |
| link | object | self URL |

**Relationships:** Belongs to one Project and one Owner. Associated to exactly one of: a Task (`/tasks/[ID]/logs`), a Bug (`/bugs/[ID]/logs`), or none (general log, `/projects/[ID]/logs`). Approval workflow has an approver. Invoicing requires Zoho Invoice/Finance integration.

### 2.12 Entity: Document / Folder

Files and folders in a project's document space (WorkDrive-style). Versioning is supported. **Confidence: medium** — field set verified from the documents API page but less corroborated than other entities (source: https://www.zoho.com/projects/help/rest-api/documents-api.html).

| Field | Type | Notes |
|---|---|---|
| res_id | string | Doc/folder id |
| res_name | string | Filename/folder name |
| is_folder | boolean | |
| author_id / author_name | string | |
| created_time / last_modified_time (+ _milliseconds) | — | |
| res_size | int | Bytes |
| res_extn | string | Extension |
| res_type | string | File category / "folder" |
| mime_type | string | |
| parent_id / parent_folder_id | string | Folder association/nesting |
| space_id | string | Project association |
| library_id | string | |
| download_url / preview_url | string | |
| children | array | For folders |

**Relationships:** Belongs to one Project space (`space_id`). Document → Folder (`parent_id`); Folders nest under `parent_folder_id`. Documents can associate to Tasks (`is_docs_associated` on Task).

### 2.13 Completion-Percentage & Roll-Up Semantics

These are build-critical because the math is non-obvious and the official docs are partly silent.

**Documented weighted-average formulas** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/project-completion-percentage):

- **Task List %** = `sum(Task Completion% × Task Weightage) / sum(Task Weightage)`
- **Milestone (Phase) %** and **Project %** = `(sum(Task Completion% × Task Weightage) + sum(100% × Closed Issue Weightage)) / (sum(Task Weightage) + sum(Issues Weightage))`

The **weight is a numeric "Weightage" field** (a custom numeric field, or equal weight = 1 in percentage mode). **Duration and work-hours are NOT used as weighting factors.**

**Three portal-level calculation modes:**

1. Based on open/closed task & issue **count**.
2. Based on each task's **completion percentage** + count of completed issues (all weightage = 1) — includes a **Root-Task-vs-Subtasks selector** (if Subtasks is chosen and a root has none, the root task is used as fallback).
3. Based on a **custom numeric Weightage** field added to task/issue layouts.

**Individual task `percent_complete`** is a user-set integer constrained to multiples of 10 (10–100). It is **not** auto-derived from subtask closure unless **Task Roll-Up** is enabled.

**Task Roll-Up** (Premium/Enterprise only; per-project; **irreversible once enabled**) rolls subtask → parent (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-roll-up, https://help.zoho.com/portal/en/kb/projects/tasks/task-roll-up/articles/roll-up-work-hours):

- Work hours = **sum** of subtask work hours.
- Log hours = **sum** of subtask log hours.
- Start date = **earliest** subtask start; End date = **latest** subtask finish.
- % completion aggregated up the chain subtask → task → milestone → project.

**UNSPECIFIED limitation:** the official docs **never state the exact math** for how subtask % produces the parent-task % (simple average vs. weighted). A cloner must make and document its own choice here. Roll-up restrictions: dependent tasks cannot become subtasks; no dependency between a subtask and its parent; parent tasks cannot have pre-existing work/log hours; bulk-imported tasks block enabling roll-up.

### 2.14 Entity: User

Portal-level person associated to projects via a role and profile (source: https://www.zoho.com/projects/help/rest-api/users-api.html, https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-and-roles-projects).

| Field | Type / Values | Notes |
|---|---|---|
| id | string | |
| zpuid | string | Zoho Projects unique id |
| name / first_name / last_name | string | |
| email | string | |
| active | boolean | |
| role | admin \| manager \| employee \| contractor \| client | |
| role_id / role_name | string | |
| profile_id / profile_name | string | |
| profile_type | int | 2=admin, 3=client, 6=manager, 7=employee |
| rate / cost_per_hour | float | Per-hour staff-based billing rate |
| invoice_rate / invoice | double / string | Client users |
| currency_code | string | ISO |
| user_budget / budget_threshold / revenue_budget | float | |
| associated_projects / work_projects | array / long | |
| created_time | ISO8601 | |

**Confidence: medium** on the profile_type code mapping. **Relationships:** Belongs to one or more Portals; associated to many Projects via role/profile. Acts as owner/assignee on Tasks, reporter/assignee on Bugs, owner on Timelogs, owner on Phases. **Profiles** define feature access; **Roles** define hierarchy.

### 2.15 Calendar Entities: Events vs. Meetings (two distinct objects)

A clone must model **two separate** calendar entities. The Calendar UI treats them as distinct activity tiles alongside Phases, Tasks, Issues, and Time-offs (source: https://help.zoho.com/portal/en/kb/projects/collaboration/calendar/articles/calendar).

#### 2.15.1 Event (native, full REST CRUD)

A first-class, project-scoped object with full CRUD at `/restapi/portal/[PORTALID]/projects/[PROJECTID]/events/` — GET (list), POST (create), POST to `/events/[EVENTID]/` (modify), DELETE (source: https://www.zoho.com/projects/help/rest-api/meetings-api.html, https://www.zoho.com/projects/project-events.html).

| Field | Type / Values | Notes |
|---|---|---|
| id | long | |
| title | string | |
| date | MM-DD-YYYY | |
| hour / minutes / ampm | string | Start time stored as **three separate fields**, not one timestamp |
| location | string | Venue |
| duration_hour / duration_mins | string | Duration stored as two fields; **no explicit end-datetime** — end derived from start + duration |
| participants | long (comma-separated Zoho user IDs) | **Internal project users only** |
| remind_before | enum | on time \| 15 mins \| 30 mins \| 1 hour \| 2 hours \| 6 hours \| 12 hours \| 1 day |
| repeat | enum | once \| every day \| every week \| every month |
| nooftimes_repeat | int | 2–10 (max 10 occurrences) |
| status | open \| closed | |
| scheduled_on (+ _long) | response-only | Resolved start timestamp |
| occurrence(s) / occurred | int, response-only | Total / completed occurrences |
| participant_id / participant_person | response-only | |
| is_open | boolean, response-only | |
| reminder | string, response-only | |

Key limitations of the native Event model:

- **No email-based or external-attendee model** — participants are internal Zoho user IDs only.
- **Coarse recurrence**: `repeat` is only once/day/week/month with `nooftimes_repeat` 2–10. There is **NO interval, BYDAY, or UNTIL** field — far simpler than Zoho Calendar's RFC-5545-style recurrence. (The marketing page mentions "yearly" recurrence, but the REST spec documents only once/day/week/month, so "yearly" may be UI-only or undocumented — **medium confidence.**)
- **No all-day flag and no online-meeting/join-link field.**
- Events support attached documents and comments.

(A parallel BugTracker Events API exists with an analogous model — **medium confidence** that the event entity is shared across Zoho's tracking products; source: https://www.zoho.com/projects/help/rest-api/bugtracker-events-api.html.)

#### 2.15.2 Meeting (Zoho Meeting integration)

A separate entity backed by the Zoho Meeting integration. Requires a **paid Zoho Meeting subscription + activation** in Projects integration settings (source: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/meeting-integration, https://help.zoho.com/portal/en/kb/projects/collaboration/calendar/articles/schedule-meetings).

| Field | Notes |
|---|---|
| project | Required selection |
| title | |
| agenda | Meeting description/purpose — **absent from native Events** |
| participants | Project/client users |
| external users | Optional checkbox to invite **non-project users by email** — **absent from native Events** |
| schedule date / start time / duration | |
| join link | Auto-generated shareable link |
| RSVP/invite | Sent to participants |
| recording | Viewable from the Feed and meeting details page |

Behaviors and constraints:

- Scheduled from the Calendar (Discuss > Meetings tab) or instantly via **"Meet Now"** on a Task.
- **Viewer and Follower roles cannot initiate meetings**; a user can belong to only one Zoho Meeting Organization.
- **No documented native recurrence, location field, or fixed reminder enum** in the Projects help docs — these differ from the native Event model; any recurrence/reminders are governed by Zoho Meeting, not the Projects Events API (**medium confidence**).

**Event vs. Meeting — the build-critical distinctions:**

| Aspect | Event (native) | Meeting (integration) |
|---|---|---|
| Backing | Native object, full REST CRUD | Zoho Meeting integration (paid) |
| Participants | Internal users by ID | Project users + external email invites |
| External attendees | No | Yes |
| Agenda field | No | Yes |
| Online join link | No | Yes (auto-generated) |
| Location field | Yes | Not documented |
| Reminder enum | Fixed enum | Not documented |
| Recurrence | Coarse (once/day/week/month, max 10) | Not documented |
| Recording / RSVP | No | Yes |

### 2.16 Cross-Cutting Notes & Limitations

- **Custom field API column names are the stable identifiers.** Tasks/projects use `UDF_CHAR1` etc.; bugs use `CHAR1–CHAR12`, `LONG1–LONG4`, `DATE1–DATE4`. Project/task custom fields are **Enterprise-only**; custom statuses/Blueprint workflows are **Premium/Enterprise** (source: https://www.zoho.com/projects/help/issues-customfields.html, https://help.zoho.com/portal/en/community/topic/api-name-for-all-fields-in-zoho-project-standard-or-custom).
- **Custom fields do NOT support multi-select** — a noted data-model limitation reported by reviewers (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/).
- **Community ratings:** G2 ~4.3/5 (300+ reviews), Capterra ~4.5/5 (400+ reviews). Praise centers on detailed task hierarchies and dependencies; complaints include setup getting complicated past ~10 projects.
- **Could not fully verify:** the V3 interactive API console (JS SPA, not scrapable); exact V3 field deltas vs. V1; the precise parent-task % roll-up math (officially unspecified); the "General" default task-list name (third-party source only); and the "yearly" Event recurrence value (marketing page only). These are flagged at their respective points above rather than asserted as fact.
## 3. Projects, Phases, Milestones, Dependencies & Scheduling

This section documents how Zoho Projects structures work hierarchically and how it schedules that work: phases (the renamed milestone object), task lists, tasks/subtasks, dependencies, the Gantt chart, critical path, baselines, working-time calendars, and the (often surprising) rules around completion-percentage and status computation. Per-tier availability is called out where known. Where the official documentation is silent or ambiguous, this is stated explicitly rather than guessed.

### 3.1 Entity hierarchy

The canonical object hierarchy, top-down, is:

```
Portal / Org
  └─ Project Group (optional)
       └─ Project
            └─ Phase  (UI name; API still calls it "Milestone")  — optional
                 └─ Task List   (mandatory; default named "General")
                      └─ Task
                           └─ Sub-task  (nestable up to 6 levels)
```

Key structural rules:

- A project **always** contains at least one task list; the default/fallback task list is named **"General"** (source: <https://www.acutedata.com/whats-the-difference-between-a-project-and-a-task-list-in-zoho-projects/>). Note: the "General" default name is documented by a third-party Zoho-partner blog rather than an explicit official Zoho KB statement.
- **Phases are optional**, not mandatory. A task list may sit directly under a project with no phase (source: <https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases>).
- **Project Groups are optional**; a project belongs to at most one group at a time.
- **Issues/Bugs are a sibling module** under the project — they are not children of tasks, though they can be linked to a phase (`milestone_id` / `affectedmile_id`) and a module. Issues are out of scope for this section except where they affect completion-percentage math (see 3.7).
- Sub-tasks are the same entity type as tasks, distinguished by `parent_task_id`, `root_task_id`, `depth`, and `isparent` (source: <https://www.zoho.com/projects/help/rest-api/tasks-api.html>).

> Naming caveat: "**Milestone**" was renamed to "**Phase**" in the UI, but the REST API endpoints and fields still use `milestone` / `milestone_id`; the word "phase" does not appear in the milestones API docs. They are the same underlying entity — the rename is UI-only (sources: <https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases>, <https://www.zoho.com/projects/help/rest-api/milestones-api.html>). Throughout this section "phase" and "milestone" are interchangeable.

---

### 3.2 Phases (formerly Milestones)

A phase is a **goal-based target / checkpoint** that groups task lists within a project. It is an optional organizing layer above task lists.

**Phase fields** (source: <https://www.zoho.com/projects/help/rest-api/milestones-api.html>):

| Field | Type / Values | Notes |
|---|---|---|
| `id` (a.k.a. `milestone_id`) | long | |
| `name` | string (max 100) | |
| `start_date` / `start_date_long` | MM-DD-YYYY / ms | |
| `end_date` / `end_date_long` | MM-DD-YYYY / ms | Due date |
| `status` | `notcompleted` \| `completed` | **Binary, manual** — see 3.8 |
| `completed_date` / `completed_date_long` | date / ms | Set when marked completed |
| `owner_id` / `owner_name` | long / string | |
| `flag` | `internal` \| `external` | Visibility (see below) |
| `budget` | float | Cost budget; **sum of associated task-list budgets** (rolled up) |
| `threshold` | float | Cost budget threshold |
| `revenue_budget` | float | |
| `link` | object | self, status URLs |

**Owner / Type / dates in the UI:** Phase attributes include Owner, Type, Start date, Due date, Status, and the Flag (sources: <https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases>, <https://help.zoho.com/portal/en/kb/projects/faqs/milestones/articles/milestones-7-2-2024>).

**Flag (visibility):**
- **Internal** = visible to portal (project) users only.
- **External** = visible to portal users **and** client users.

Community discussion confirms external task lists are visible to clients and project users while internal task lists are visible only to project users, clarifying the flag's meaning at the task-list level too (source: <https://help.zoho.com/portal/en/community/topic/internal-task-list-on-external-milestone>).

**What a phase contains / rolls up:** task lists, issues, budget (rolled up from task lists), time logs, invoices, and release notes (source: <https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases>).

**Predefined phase views:** All Phases, Active Phases, Completed Phases, Overdue & Open, Due this week, Due this month (source: <https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases>). Note: the UI surfaces statuses as Active / Completed / Overdue / Open, whereas the API only persists the binary `notcompleted` / `completed` — "Active" and "Overdue/Open" are derived display states based on dates, not stored status values.

**Phase operations:** edit attributes, delete, **move phase to another project**, follow phase (source: <https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases>).

**Limitation — no cross-project phase dependencies.** Only task-to-task dependencies can cross projects; phases cannot depend on phases (in-project or cross-project) (sources: <https://help.zoho.com/portal/en/kb/projects/faqs/milestones/articles/milestones-7-2-2024>, <https://help.zoho.com/portal/en/kb/projects/tasks/task-dependencies/articles/dependency-chronology-gantt>).

**Tier:** All paid editions.

---

### 3.3 Task Lists

A task list groups related tasks and optionally sits under a phase.

- Associated to a phase via the **"Related Phase"** dropdown (source: <https://help.zoho.com/portal/en/kb/projects/faqs/milestones/articles/milestones-7-2-2024>).
- Can be edited, deleted, reordered, collapsed. Views support **Group By Task List** and **Group By Phase** (source: <https://help.zoho.com/portal/en/kb/projects/tasks/task-list/task-list-operations/articles/manage-tasklists>).
- **Limitation:** task lists **cannot be reordered directly within a phase**; reordering is done in the Tasks module via Group By (source: <https://help.zoho.com/portal/en/kb/projects/faqs/milestones/articles/milestones-7-2-2024>).

**Task List API fields** (source: <https://www.zoho.com/projects/help/rest-api/tasklists-api.html>):

| Field | Type / Values | Notes |
|---|---|---|
| `id` | long | |
| `name` | string | |
| `milestone` | nested object | The associated phase: id, name, owner, dates, status, flag |
| `completed` | boolean | |
| `flag` | `internal` \| `external` | |
| `rolled` | boolean | Roll-up indicator |
| `sequence` | integer | Sort order |
| `view_type` | string | Internal visibility classification |
| `created_time` / `created_time_long` | | |
| `link` | object | self + child-task URLs |

> **Limitation / build-critical:** the Task List response has **no percentage field** and **no own status field**. The Update Task List endpoint accepts a `status` parameter of `active` or `completed`, but the GET response only exposes the boolean `completed`. Task-list completion % is therefore a **derived/display value** computed per the formula in 3.7, not a stored attribute (source: <https://www.zoho.com/projects/help/rest-api/tasklists-api.html>).

**Tier:** All editions.

---

### 3.4 Tasks & Sub-tasks (schedulable units)

The task is the primary schedulable unit on the Gantt. Selected scheduling-relevant fields (full field list in the data-model section; source: <https://www.zoho.com/projects/help/rest-api/tasks-api.html>):

| Field | Type / Values | Notes |
|---|---|---|
| `start_date` / `end_date` | MM-DD-YYYY | |
| `start_time` / `end_time` | 12/24h | |
| `duration` | int | |
| `duration_type` | `days` \| `hrs` | |
| `percent_complete` | int, **multiples of 10 (10–100)** | **User-set**, not auto-derived (see 3.8) |
| `status` | object: `type` = `open` \| `closed` | V3 also exposes `is_closed_type` |
| `priority` | None \| Low \| Medium \| High | |
| `completed` | boolean | |
| `milestone_id` | long | Phase association |
| `tasklist` | object {id, name} | |
| `parent_task_id` / `root_task_id` / `depth` / `isparent` | | Subtask tree |
| `dependency` | object | DEPENDENCY_TYPE, GAPVALUE, GAPTYPE, successor[] (see 3.5) |
| `work` | string e.g. "208:00" | |
| `work_type` | work_hrs_per_day \| work_in_percentage \| work_hours | |

**Sub-task tree:** nestable up to **6 levels** (source: <https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks>). Behavioral rules: closing a parent task closes all its subtasks; reopening a subtask requires reopening the parent; subtasks cannot be created under a closed task (same source).

**Custom statuses** are supported via the `custom_status` parameter (a status ID) and are available from the **Premium** plan upward. (It is the custom **fields** feature — not custom statuses — that is Enterprise-only.) Source: <https://www.zoho.com/projects/help/rest-api/tasks-api.html>.

---

### 3.5 Dependencies

#### 3.5.1 The four dependency types

| Type | API value | Meaning |
|---|---|---|
| Finish-to-Start | `FS` | Predecessor must finish before successor starts (most common) |
| Start-to-Start | `SS` | Successor can't start until predecessor starts |
| Finish-to-Finish | `FF` | Both finish together / in close succession |
| Start-to-Finish | `SF` | Least common |

Sources: <https://ones.com/blog/mastering-dependency-types-zoho-projects/>, <https://www.zoho.com/projects/help/rest-api/tasks-api.html>. In Gantt view, a dependency renders as a connector line drawn between the ends of two task/subtask bars (source: <https://help.zoho.com/portal/en/kb/projects/tasks/task-dependencies/articles/dependency-chronology-gantt>).

**Tier:** All paid editions.

#### 3.5.2 Lag and lead time

Set in the **Lag column** (click up/down arrows or type the value). **Positive = lag** (gap/delay); **negative = lead** (overlap/pull forward). API fields: `GAPVALUE` (numeric amount) and `GAPTYPE` (`Days` or `Hours`). Sources: <https://www.toplineresults.com/2025/08/zoho-projects-using-dependencies-to-manage-tasks/>, <https://www.zoho.com/projects/help/rest-api/tasks-api.html>. (The toplineresults source could not be fetched directly — ECONNREFUSED — and was recovered from a search snippet.)

#### 3.5.3 Hard Link vs Soft Link vs Automatic

| Mode | Behavior |
|---|---|
| **Hard Link** | Successor dates auto-adjust when predecessor changes (e.g., Design moves to Mar 13 → Development shifts to Mar 14). |
| **Soft Link** | Successor stays unchanged when predecessor changes. |
| **Automatic** | Assigns the dependency type based on parent/child task dates; useful when you don't want to shift child task dates. |

Configured at **Portal Configuration > Task & Timesheet > Task Settings > Org Level Task Dependency**, where the default link type and default dependency type are selectable. Link type can be **overridden per-dependency** from the Gantt view (source: <https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/task-dependency-settings>).

**Successor auto-reschedule options:** move up dates if predecessor moves up; extend due dates if predecessor extended; reschedule based on predecessor completion (same source). The portal-level default dependency type is also exposed in the Portals API settings object (`default_dependency_type`).

**Tier:** configurable in paid editions.

#### 3.5.4 Creating dependencies — three methods

1. **List View:** edit Predecessor/Successor fields → click **+Add** → search by task name or ID. **Max 5 dependencies settable from List view.**
2. **Gantt View:** draw connections between bars, OR click a bar and use Predecessor/Successor columns. **Cross-project search supported.**
3. **Task Details page:** scroll to the Dependency section → click **Add Predecessor** / **Add Successor**.

Source: <https://help.zoho.com/portal/en/kb/projects/tasks/task-dependencies/articles/dependency-chronology-gantt>.

**Rules / limitations:**
- **Closed, deleted, and archived-project tasks cannot be set as dependent tasks.**
- **Cross-project task-to-task dependencies ARE supported** (but cross-project *phase* dependencies are not — see 3.2).

---

### 3.6 Gantt chart, critical path & baselines

#### 3.6.1 Gantt chart

Located at **Tasks > Gantt view**. Supports **drag-and-drop rescheduling** and drawing dependencies, with automatic rescheduling of dependent tasks when dependencies change. Color-coded bars for milestones, tasks, dependencies, and progress %; overdue items shown in red; holidays/weekends distinctly marked. Two chart types are referenced (milestone-based and project-timeline views). A "smart bar" provides toggles for Critical Path, Slack, Baseline, and Slippage. Sources: <https://www.zoho.com/projects/gantt-charts.html>, <https://help.zoho.com/portal/en/kb/projects/tasks/critical-path/articles/view-critical-path-on-gantt-chart>.

> **Gap:** Specific Gantt zoom/scale levels (hour/day/week/month) are referenced only as "chart scaling" and are **not explicitly enumerated** in the fetched official sources (confidence: low; source: <https://www.zoho.com/projects/gantt-charts.html>). The canonical Gantt KB article path returned HTTP 404 (`.../reports/gantt-charts/articles/gantt-charts`), so some Gantt details are drawn from the marketing page and the critical-path article rather than a dedicated Gantt KB page.

**Tier:** paid editions (advanced toggles vary by tier — see below).

#### 3.6.2 Critical path & slack

- **Critical path** = the longest stretch of dependent activities.
- **Critical tasks shown in RED**; **non-critical tasks in BLUE**; **slack shown as dotted lines**.
- If no dependency is set, the **last-finishing task is critical**; for multiple dependencies, the **predecessor with the longest duration is critical**.
- **Slack** = acceptable delay without delaying the project; slack display varies by dependency type (SS/SF/FS/FF). When a task stretches beyond its slack it **dynamically becomes critical** (recalculation).
- Enabled via Gantt smart bar → Toggle Critical Path and Slack.

Sources: <https://help.zoho.com/portal/en/kb/projects/tasks/critical-path/articles/view-critical-path-on-gantt-chart>, <https://www.zoho.com/projects/critical-path-and-baseline.html>.

**Tier:** **Enterprise plan only.**

#### 3.6.3 Baselines

A baseline is a **named snapshot of the project's open-task schedule** for variance tracking.

- Set via Gantt smart bar → **Set Baseline** → enter name.
- **Maximum 15 baselines per project.** Captures the set of open tasks. Rename by hovering and clicking edit.
- **Compare two baselines at once**, or a baseline vs. current progress.
- Color legend in comparison: **gray bars = baseline, green bars = current tasks, blue bars = subtasks.**
- **Slippage** = baseline start date − current start date (for tasks not yet started).
- **End Variance** = baseline/initial estimated end date − current end date (completion delay).
- Requires the **"Create Baseline for Project" / "Delete Baseline"** profile permissions.

Sources: <https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/projects-baseline>, <https://www.zoho.com/projects/critical-path-and-baseline.html>.

**Tier:** **Enterprise plan only.**

> Baseline entity fields (source: same): `name`, captured open-tasks set, created date (implied). The 15-baseline limit is the result of an explicit community feature request that Zoho since shipped (source: <https://help.zoho.com/portal/en/community/topic/business-hours-skip-weekends-and-holidays>).

---

### 3.7 Completion-percentage computation (weighted average)

Zoho Projects computes completion % with **explicit, documented weighted-average formulas**. Critically, the **weight is a numeric "Weightage" value (a custom numeric field, or equal weight = 1)** — **NOT duration and NOT work-hours**. Duration and work-hours are never used as weighting factors for completion percentage (source for all of 3.7: <https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/project-completion-percentage>).

**Task List %:**

```
Task List % = Σ(Task Completion% × Task Weightage) / Σ(Task Weightage)
```

With the default/percentage mode all weightages = 1, making it a simple average of member-task completion percentages.

**Milestone (Phase) % and Project %** (same formula, adding closed-issue weightage):

```
% = [ Σ(Task Completion% × Task Weightage) + Σ(100% × Closed Issue Weightage) ]
    / [ Σ(Task Weightage) + Σ(Issues Weightage) ]
```

Project % uses the identical formula aggregating all tasks and issues across the project.

#### 3.7.1 Three portal-level calculation modes

| Mode | Basis |
|---|---|
| 1 | Open/closed **task & issue count** |
| 2 | Each task's **completion percentage** + count of completed issues (equal weightage = 1) |
| 3 | Custom **numeric Weightage field** added to task/issue layouts |

#### 3.7.2 Root Task vs Subtasks selector

In percentage mode (mode 2), completion is computed from **either only Root Tasks or only Subtasks**. If **Subtasks** is selected but a root task has none, the **root task is used as fallback**.

---

### 3.8 Status vs. percentage: the manual-flag traps

Two important behaviors that a builder/cloner must model distinctly:

**(a) An individual task's `percent_complete` is user-set**, constrained to multiples of 10 (10–100). It is **NOT auto-derived from subtask closure** unless **Task Roll-Up** is enabled (source: <https://www.zoho.com/projects/help/rest-api/tasks-api.html>). Users have explicitly requested auto-update of a parent's % from completed subtasks (e.g., show 50% when 1 of 2 subtasks close); the thread has **no Zoho staff confirmation** of the calculation method, reinforcing that the parent-task rollup math is not officially documented (source: <https://help.zoho.com/portal/en/community/topic/task-completion-percent-based-on-completed-subtasks>).

**(b) Milestone/phase status is a binary MANUAL flag**, not auto-computed:
- The API exposes milestone status as only `notcompleted` / `completed` with a `completed_date`.
- **There is NO milestone completion-percentage field in the API.**
- The phase does **not** automatically flip to completed when its tasks reach 100%; completion is a deliberate manual action. A community thread shows a user asking how to complete a milestone, noting only Move/Delete options appear — confirming completion is manual (sources: <https://www.zoho.com/projects/help/rest-api/milestones-api.html>, <https://help.zoho.com/portal/en/community/topic/milestones-how-to-complete>).

**Net effect:** phase completion **%** is a derived/display value (per 3.7), while phase **status** is a separate manual binary that does not track that %. The same split applies to task lists (boolean `completed` field, no percentage, no own status field — see 3.3).

---

### 3.9 Task Roll-Up

When enabled, parent values are **auto-computed from subtasks**:

| Parent attribute | Roll-up rule |
|---|---|
| Work hours | **Sum** of subtask work hours |
| Log hours | **Sum** of subtask log hours |
| Start date | **Earliest** subtask start date |
| End date | **Latest** subtask finish date |
| % completion | Aggregated up the chain: subtask → task → milestone → project |

Sources: <https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-roll-up>, <https://help.zoho.com/portal/en/kb/projects/tasks/task-roll-up/articles/roll-up-work-hours>. Enabled per project via `enable_rollup` (Projects API).

> **UNSPECIFIED:** the official docs roll % "up the chain" but **never state the precise math** for how subtask % produces the parent-task % (simple average vs. weighted). This remains undocumented (confidence: high that it's unspecified).

**Restrictions:**
- Dependent tasks cannot become subtasks; no dependency between a subtask and its parent.
- Parent tasks cannot have pre-existing work or log hours.
- Bulk-imported tasks block enabling roll-up.

**Tier / scope:** **Premium and Enterprise only**, **per-project**, and **irreversible once enabled** (to avoid faulty reports).

---

### 3.10 Working-time: Business Hours / Business Calendar, Skip Weekends & holidays

**Configuration path:** Settings > Business Calendar > Business Hours tab > New Business Hours (source for this subsection: <https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/business-hours/articles/business-hour-settings>).

- **Working Hours** are set by **dragging the ends on a timeline** (custom start/end times per day).
- **Break times** per day.
- Assign or create a **Holiday List**.
- **Time-based duration** includes partial hours from adjacent days when start/end fall outside business hours.

**Critical scheduling rule:**
- **Manually selected** start/due dates are **always treated as a working day**, even on a weekend/holiday.
- When the **due date is derived from start + duration**, the calculation **skips weekends and holidays** per Business Hour settings.

**Skip Weekends** excludes weekend days from schedule calculations; combined with holiday lists it captures exact working days. Reminders can auto-shift to the previous business day if they fall on a weekend (sources: <https://www.zoho.com/projects/blog/organize-your-work-better.html>, <https://help.zoho.com/portal/en/community/topic/business-hours-skip-weekends-and-holidays>).

**Tier availability:**
- **Business Hours:** Premium and Enterprise.
- **Skip Weekends:** **Enterprise only.**

> **Gap:** the exact **default working hours** and the **default working-day set** are **not stated** in the fetched Business Hours article. A builder must treat the defaults as unknown / configurable.

The Business Hours / Business Calendar entity fields are: Working Hours (Start/End via timeline drag), break times (per day), Holiday List, Skip Weekends (Enterprise), working days. Applied at portal level and reflected in project/task templates; affects due-date-from-duration calculations.

---

### 3.11 Per-tier availability summary

| Feature | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Phases, Task Lists, basic Tasks/Subtasks | ✓ (limited) | ✓ | ✓ | ✓ |
| Dependencies (FS/SS/SF/FF), lag/lead | Paid editions | ✓ | ✓ | ✓ |
| Hard/Soft/Automatic link config | Paid editions | ✓ | ✓ | ✓ |
| Gantt chart (basic) | Paid editions | ✓ | ✓ | ✓ |
| **Critical path & slack** | — | — | **✓** | ✓ (inherits) |
| **Baselines (max 15)** | — | — | **✓** | ✓ (inherits) |
| Custom task **statuses** | — | **✓** | ✓ | ✓ |
| Custom **fields** (project/task) | — | — | **✓** | ✓ (inherits) |
| **Task Roll-Up** | — | **✓** | ✓ | ✓ |
| **Business Hours** | — | **✓** | ✓ | ✓ |
| **Skip Weekends** | — | — | **✓** | ✓ (inherits) |
| Completion-% calc modes (portal setting) | ✓ | ✓ | ✓ | ✓ |

Notes: "Paid editions" means available across Premium/Enterprise/Ultimate but not Free, per the research data. Ultimate inherits Enterprise features via cumulative tier language. The completion-percentage calculation modes are a portal-level configuration available on all plans.

---

### 3.12 Limitations & community sentiment (unvarnished)

- **Gantt UI is dated/clunky.** Capterra (~4.5/5, 400+ reviews) reviewers commonly cite a dated UI that feels clunky for assigning subtasks and navigating larger projects, with "lots of clicking/editing to change things" (source: <https://www.capterra.com/p/169455/Zoho-Projects/reviews/>).
- **Weaker portfolio / resource utilization.** G2 (~4.3/5, 300+ reviews): Gantt and critical-path/baseline are praised, but portfolio management and resource-utilization charts are seen as weaker than the core features (source: <https://www.g2.com/products/zoho-projects/reviews>).
- **No cross-project phase dependencies** (only task-to-task) — see 3.2.
- **Task-list reordering within a phase is not direct** — see 3.3.
- **Max 5 dependencies settable from List view** (other methods are unconstrained) — see 3.5.4.
- **Milestone completion does not auto-flip** from task progress; it is a manual binary — see 3.8.
- **Parent-task % rollup math is officially undocumented** — see 3.9.
- **Task Roll-Up is irreversible** once enabled — see 3.9.
- **Default working hours / working-day set are undocumented** in the fetched source — see 3.10.
- **Gantt zoom/scale levels not enumerated** in official fetched sources — see 3.6.1.
- A 2026 YouTube walkthrough ("How to Set Dependencies and Gantt in Zoho Projects") demonstrates drawing the four dependency types and editing lag on the Gantt, corroborating the documented behavior (source: <https://www.youtube.com/watch?v=opC2Xg5Cu4s>).

#### Sources that could not be fully verified
- `https://help.zoho.com/portal/en/kb/projects/reports/gantt-charts/articles/gantt-charts` — HTTP 404 (article path changed/moved).
- `https://www.toplineresults.com/2025/08/zoho-projects-using-dependencies-to-manage-tasks/` — ECONNREFUSED on direct fetch; details recovered from search snippet.
- Exact Gantt zoom/scale levels (hour/day/week/month) — not explicitly enumerated in fetched official sources.
- Exact default working hours / default working-day set — not stated in the fetched Business Hours article.
- G2 / Capterra full review bodies — aggregated via search snippets only.
## 4. Tasks & Task Management

The task is the core work item in Zoho Projects. A task belongs to a **Task List** (and, optionally, a **Phase/Milestone**) within a Project. Tasks support multiple owners, associated teams, subtasks (up to 6 levels deep), four dependency types, custom fields, tags, comments, attachments, followers, reminders, and recurrence. This section documents the verified task model, its fields, behaviors, options, per-tier availability, and known limitations.

> Confidence note: Most facts below are drawn from Zoho's official help KB and REST API docs and are high-confidence. Items explicitly marked as medium-confidence or sourced from third parties are flagged inline. A few limits (attachment file-size caps, max tasks per project) could **not** be verified from the available sources — see [§4.13 Limitations & Gaps](#413-limitations--gaps).

---

### 4.1 Default task fields (the 9 non-removable fields)

Every task carries 9 default fields. All except **Work Hours** are non-editable and non-removable; all except **Status** can only be reordered, not modified. Work Hours is the **only** default field that is both editable and removable. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields)

| # | Field | Editable? | Removable? | Notes |
|---|-------|-----------|-----------|-------|
| 1 | Owner | No | No | Can be reordered only |
| 2 | Status | Yes (it's the one modifiable default) | No | Customizable; maps to Open/Closed type — see §4.4 |
| 3 | Start Date | No | No | Reorder only |
| 4 | Due Date | No | No | Reorder only |
| 5 | Duration | No | No | Reorder only |
| 6 | Priority | No | No | Enum: None / Low / Medium / High (see §4.2) |
| 7 | Completion Percentage | No | No | Multiples of 10 only (see §4.2) |
| 8 | Work Hours | **Yes** | **Yes** | Only default field that is editable AND removable |
| 9 | Completion Date | No | No | Reorder only |

**Availability:** All plans. All plans can edit the Standard layout and reorder default fields. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields)

---

### 4.2 Build-critical field constraints

These are the constraints a cloner must replicate exactly:

| Field | Constraint | Confidence |
|-------|-----------|-----------|
| `priority` | Enum string: **None, Low, Medium, High** | High |
| `percent_complete` | Integer 0–100, **restricted to multiples of 10** (i.e., 10, 20, … 100) | High |
| `duration_type` | `days` or `hrs` | High |
| `work_type` | `work_hrs_per_day`, `work_in_percentage`, or `work_hours` | High |
| `work` | Stored as **HHH:MM** string (e.g., `208:00`) | High |
| `billingtype` | `none`, `billable`, `non billable` | High |
| `key` | Auto-generated unique ID with customizable per-project prefix (e.g., `X9-T8`); deleted IDs are **never reused** | High |

(sources: https://www.zoho.com/projects/help/rest-api/tasks-api.html , https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/manage-tasks)

---

### 4.3 Custom fields (18 types, max 300)

Up to **300 custom fields per portal** across **18 field types**. Field duplication is **not permitted**, and a field associated with **1,000 or more tasks cannot be deleted**. Many types support PII encryption. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields)

| # | Field type | Notes / limits |
|---|-----------|----------------|
| 1 | Single Line Text | |
| 2 | Multi-Line Text | |
| 3 | Pick List | |
| 4 | Multi-Select Pick List | |
| 5 | User Pick List | |
| 6 | Multi User Pick List | |
| 7 | Date | |
| 8 | Number | Max 19 digits |
| 9 | Decimal | Max 14 digits before the decimal point |
| 10 | Formula Field | |
| 11 | Phone | |
| 12 | Email | |
| 13 | URL | |
| 14 | Percentage | |
| 15 | Currency | |
| 16 | Checkbox | |
| 17 | Date & Time | |
| 18 | Billing Type | |
| (—) | Long URL | Up to 1,000 chars (listed in the docs alongside the 18; treated as a URL variant) |

A custom field object exposes `column_name`, `label_name`, `value`, type, `mandatory`, `default_value`, and `access`. (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html)

**Availability (important caveat):** Custom field **creation/editing is Enterprise-only**. Lower tiers can use the Standard layout but cannot create/edit custom fields. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields)

> Note: Do **not** conflate custom fields with custom statuses. Custom **fields** are Enterprise-only; custom **statuses** are available from the Premium plan upward (see §4.4).

---

### 4.4 Statuses — custom statuses mapped to immutable Open/Closed types

Statuses are fully customizable (name, color, action), but **every status must map to one of two immutable default types: Open or Closed**. The Open and Closed types cannot be deleted. In the API, the status is an object `{name, id, type, color_code}` where `type` is `open` or `closed` (V3 also exposes `is_closed_type`). The `custom_status` parameter takes a status ID. (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields , https://www.zoho.com/projects/help/rest-api/tasks-api.html)

**How to customize:** Right-click the Status column header → Customize Status → +Add Status; or Customization → Layouts and Fields → Tasks → Status field → Customize. (source: https://help.zoho.com/portal/en/community/topic/tip-21-customize-task-status)

**Availability:** Editing the standard Status set is available on all plans; **custom statuses are available from the Premium plan upward** (it is the custom *fields* feature, not custom statuses, that is Enterprise-only).

**Known pain point:** Users have requested a way to force task status transitions across multiple assignees, indicating that status-workflow behavior with multiple assignees is awkward today. (source: https://help.zoho.com/portal/en/community/topic/a-way-to-force-the-task-status-transition-to-multiple-assignees)

---

### 4.5 Assignment — multiple assignees & team assignment

A task can be assigned to **multiple users** and to **one or more associated teams**:

- `person_responsible` — Long; **comma-separated** when there are multiple assignees.
- `details.owners` — array of owner objects.
- `associated_teams` — array (the "Associated Team" field).
- `owner_work` — array of `{user_id, working_hours}` objects, allowing **per-user work-hour allocation** on a single task.

(sources: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/team-assignment-to-tasks , https://www.zoho.com/projects/help/rest-api/tasks-api.html)

**Availability:** Tasks/assignment on all plans; **team assignment requires a paid plan**.

---

### 4.6 Work hours (standard & flexible)

Three work formats are supported, selected via `work_type`:

| `work_type` | Meaning |
|-------------|---------|
| `work_hrs_per_day` | Fixed hours per day |
| `work_in_percentage` | Percentage of the day |
| `work_hours` | Total hours across the task |

**Flexible work hours** allow variable allocation across the days a task spans. The work value is stored as an **HHH:MM** string (e.g., `208:00`). Logged/actual hours are tracked and compared against planned. (sources: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/manage-tasks , https://www.zoho.com/projects/help/rest-api/tasks-api.html , https://www.zoho.com/projects/task-details.html)

**Availability:** All plans.

---

### 4.7 Subtasks (nested up to 6 levels)

A parent task can have subtasks **nested up to 6 levels deep** (each subtask may have its own subtask). Each subtask supports its own priority, duration, % completed, assignee, start date, and end date; values **roll up** to the parent/project. (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks)

**Hierarchy modeling (API):** `parent_task_id` (immediate parent), `root_task_id` (top of the subtask tree), `depth` (nesting level), and `isparent` (whether the task has subtasks). (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html)

**Behavior constraints:**
- **Closing a parent closes all of its subtasks.**
- A subtask **cannot be reopened without first reopening its parent.**
- Created via "Add Subtask", right-click, or drag-and-drop of one task onto another.

(source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks)

**Availability:** All plans.

---

### 4.8 Dependencies (four types) & Gantt rescheduling

Four dependency types are supported, with configurable **lag** (delay successor by N days) and **hard vs. soft linking**:

| Type | Code | Definition |
|------|------|-----------|
| Finish-to-Start | FS | Successor can't begin until predecessor finishes |
| Start-to-Start | SS | Successor can't begin until predecessor starts |
| Finish-to-Finish | FF | One can't finish until the other finishes |
| Start-to-Finish | SF | Successor can complete when predecessor is about to begin |

- **Hard links** auto-shift successor dates when the predecessor changes; **soft links** do not.
- Dependencies drive **Gantt rescheduling**.
- **Cross-project dependencies require Enterprise.**

API dependency object fields: `type` (`FS`/`SS`/`SF`/`FF`), `predecessor`, `successor`, `lag` (days), `link_type` (`hard`/`soft`). (sources: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-dependencies/articles/task-dependency , https://www.zoho.com/projects/task-dependency.html , https://www.zoho.com/projects/help/rest-api/tasks-api.html , https://www.zoho.com/blog/projects/zoho-projects-6-brings-all-four-types-of-task-dependencies-and-more.html)

**Availability:** Dependencies on paid plans; cross-project dependencies on Enterprise.

---

### 4.9 Recurring tasks

Accessed via **"Reminder & Recurrence"** in the task action menu. (sources: https://www.zoho.com/blog/projects/new-recurring-tasks-and-reminders-in-zoho-projects.html , https://www.enterprisetimes.co.uk/2025/11/21/how-to-create-a-recurring-task-in-zoho-projects/)

| Setting | Values |
|---------|--------|
| `recurring_frequency` | daily / weekly / monthly / yearly (or custom) |
| `time_span` (interval) | Selectable **up to 15** (e.g., every 7th day) |
| `number_of_occurrences` | Capped at **30**, OR set to **never-ends** (API documents the range as 2–30) |
| `recurrence_type` | `after_current_task_completed` or `specified_interval_creation` |
| `is_comments_recurred` | Boolean — option to recur comments |
| `set_previous_business_day` | Boolean — shift to previous business day |

**Limitation (confirmed by community demand):** the **30-occurrence cap is a real constraint**. Users have explicitly asked for recurrence beyond 30 occurrences and for an explicit **end-date** option instead of a fixed occurrence count; this is not currently available. (source: https://help.zoho.com/portal/en/community/topic/recurring-tasks-number-of-occurrences-limited-to-30-any-option-of-an-end-date)

> The `recurrence_type` / `is_comments_recurred` / `set_previous_business_day` details and the 2–30 API range are **medium-confidence** (sourced from API docs + blog + community, because the official recurring-tasks help article returned HTTP 404 at research time).

**Availability:** Recurring tasks require a paid plan (Premium/Enterprise) — **medium-confidence**.

---

### 4.10 Reminders

Email reminders notify task owners on or before the due date. Set via the **"Reminder & Recurrence"** menu. (sources: https://www.zoho.com/projects/task-details.html , https://www.zoho.com/projects/help/rest-api/tasks-api.html)

| Field | Values / format |
|-------|-----------------|
| `is_reminder_set` | Boolean |
| `remind_on` | `daily` or `customdate` |
| `reminder_date` / `reminder_date_long` | Date / ms |
| `reminder_time` | e.g., `8 : 00 am` |
| `reminder_notify_users` | Array of `{reminder_user, type}` (per-user reminder type) |

**Availability:** Paid plans.

---

### 4.11 Task layouts

Layouts define the task form. You create a layout by **cloning an existing one**, naming it, then adding/arranging fields with per-field access control, default values, and mandatory flags. A layout holds field order, custom fields, statuses, and up to 20 workflow rules. (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields , https://www.zoho.com/projects/tutorials/layouts-custom-fields.html)

**Switching layouts:** Moving a project from Layout A to Layout B **hides A's fields but preserves their stored data**; statuses can be mapped during the switch.

**Availability:** Standard layout — all plans (editable, fields reorderable). **Custom layout creation — Premium & Enterprise only.**

---

### 4.12 Workflow rules for tasks (automation)

Workflow rules automate task behavior via **trigger → conditions → actions**.

- **Triggers:** user-action-based, or time-based (on start / due / created dates).
- **Conditions:** multiple criteria.
- **Actions:** update task fields, send email alert, execute a custom function, trigger a webhook.

**Critical execution semantics & limits:**
- **Max 20 workflow rules per task layout.**
- A rule executes on the **FIRST matching condition only**; subsequent conditions are skipped unless **"Execute Next Rule"** is set.
- **Create-trigger rules do not fire** for tasks in projects built from existing templates.

API/config fields: `execute_on` (`user_action`/`time_based`), `conditions`, `actions`, `execute_next_rule` (Boolean). (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/workflow-rules-for-tasks)

**Availability:** Paid plans (automation).

---

### 4.13 Views (custom views & view types)

| View type | Notes |
|-----------|-------|
| List | |
| Kanban / Classic | |
| Plain | |
| Gantt | Drives dependency-based rescheduling |
| Predefined system views | Built-in |

**Custom views** support up to **20 filter criteria** with **AND/OR logic**, filtering on custom fields, milestones, or task lists, with column customization and sharing (all users or specific members; all projects or specific). **Global task views** exist separate from per-project views. (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-custom-view)

**Availability:** All plans (criteria/sharing capabilities vary by tier).

---

### 4.14 Collaboration: comments, attachments, followers, tags

Tasks support:
- **Comments** (`is_comment_added` flag).
- **Attachments** / document association (file-size limits **could not be verified** — see §4.16).
- **Followers** — `task_followers` with `FOLUSERS`, `FOLLOWERSIZE`, `FOLLOWERS`.
- **Tags** — `tags` array of `{name, id, color_class}` (colored tags).
- Tasks can also associate **bugs, forums, and docs**.

(sources: https://www.zoho.com/projects/task-details.html , https://www.zoho.com/projects/help/rest-api/tasks-api.html)

**Availability:** All plans.

---

### 4.15 Task IDs, deletion, and permissions

- Each task gets an **auto-generated unique ID** with a **customizable per-project prefix** (e.g., `X9-T8`).
- **Deleted task IDs are never reused.**
- Only **Portal Owner, Admin, Manager, and Task Owners** can delete tasks.

(sources: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/manage-tasks , https://help.zoho.com/portal/en/kb/projects/faqs/task-and-task-lists/articles/tasks-and-task-lists)

---

### 4.16 API task object (reference field list)

The Tasks API exposes a rich, well-documented task object. Selected fields a cloner should mirror (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html):

| Field | Type / notes |
|-------|--------------|
| `id` / `id_string` | Long / String |
| `name` | String, **mandatory** |
| `key` | String, e.g. `X9-T8` |
| `description` | String |
| `start_date` / `start_date_long` | MM-DD-YYYY / ms |
| `end_date` / `end_date_long` | MM-DD-YYYY / ms |
| `duration` | int |
| `duration_type` | `days` / `hrs` |
| `priority` | `None` / `Low` / `Medium` / `High` |
| `percent_complete` | int, multiples of 10 |
| `completed` / `completed_on` | Boolean / date |
| `status` | Object `{name, id, type, color_code}` |
| `custom_status` | Long (status ID) |
| `work` / `work_type` | `HHH:MM` / format enum |
| `person_responsible` | Long, comma-separated for multiple |
| `details.owners` | Array |
| `owner_work` | Array `{user_id, working_hours}` |
| `associated_teams` | Array |
| `tasklist` / `tasklist_id` | Object / id |
| `parent_task_id` / `root_task_id` / `depth` | Subtask hierarchy (depth up to 6) |
| `milestone_id` | Phase/Milestone link (API still uses milestone terminology) |
| `dependency` | Object `{dependencyDetails, successor}` |
| `subtasks` / `isparent` | Boolean |
| `custom_fields` | Array `{column_name, label_name, value}` |
| `tags` | Array `{name, id, color_class}` |
| `is_reminder_set` / `remind_on` / `reminder_date` / `reminder_time` / `reminder_notify_users` | Reminder fields |
| `is_recurrence_set` | Boolean |
| `task_followers` | `FOLUSERS`, `FOLLOWERSIZE`, `FOLLOWERS` |
| `is_comment_added` | Boolean |
| `created_time` / `created_by` / `created_person` / `last_updated_time` | Audit |
| `order_sequence` | int |
| `billingtype` | `none` / `billable` / `non billable` |
| `rate_per_hour` / `cost_per_hour` / `actual_cost` / `planned_cost` / `forecasted_cost` / `budget_value` / `budget_threshold` | Cost/billing fields |

---

### 4.17 Community sentiment

Generally positive on dependencies and Gantt, but with real UI/performance complaints. These are user-review/aggregator observations, **not** official Zoho statements:

- **Praise:** Gantt charts and task dependencies are highly visual and easy to set up ("saved our lives"). (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/)
- **Complaints:** Dated/clunky UI (especially assigning subtasks or working in larger projects); occasional performance lag; **sluggish Gantt drag-and-drop on large projects**; steeper learning curve than simpler tools; mobile app notifications don't always sync in real time; setup gets complicated past ~10 projects. (source: https://thedigitalprojectmanager.com/tools/zoho-projects-review/)
- **Recurrence cap:** Users want recurrence beyond 30 occurrences / an explicit end date. (source: https://help.zoho.com/portal/en/community/topic/recurring-tasks-number-of-occurrences-limited-to-30-any-option-of-an-end-date)
- **Status transitions:** Users want to force status transitions across multiple assignees. (source: https://help.zoho.com/portal/en/community/topic/a-way-to-force-the-task-status-transition-to-multiple-assignees)

---

### 4.18 Limitations & gaps (be explicit)

Honest accounting of what is constrained or unverified:

- **Recurrence is hard-capped at 30 occurrences** with no explicit end-date option (only fixed-count or never-ends). Confirmed real constraint.
- **Custom field deletion is blocked** once a field is on 1,000+ tasks; **field duplication is not permitted**.
- **`percent_complete` is multiples of 10 only** — no granular completion percentages.
- **Subtask depth is capped at 6 levels.**
- **Closing a parent force-closes subtasks**, and subtasks can't be reopened independently of their parent — rigid lifecycle coupling.
- **Workflow rules cap at 20 per layout**, fire on the first matching condition only, and **don't fire on create for template-derived projects** — easy to miss.
- **Tier gating:** custom field creation/editing is Enterprise-only; custom layout creation is Premium/Enterprise; automation/teams/dependencies/reminders/recurrence require paid plans.
- **Could not verify** from available sources: exact **attachment file-size limits**, and **max tasks per project**. These were not stated in the FAQ or pages fetched and should be confirmed before building hard limits. (noted in research as un-fetchable)
- The **official recurring-tasks help article returned HTTP 404** at research time; recurrence details were reconstructed from API docs, a Zoho blog, and community posts (medium-confidence as flagged in §4.9).
- **Milestone vs. Phase:** the UI says "Phase," but the REST API still uses **milestone / `milestone_id`** — they are the same entity. A cloner targeting the API must use milestone terminology.
## 5. Issue / Bug Tracker

Zoho Projects' Issue Tracker is a configurable bug-tracking module built around a single **Bug/Issue** entity. The same engine is sold standalone as **Zoho BugTracker** (which offers a free tier for small teams). It combines a set of fixed system fields with user-defined custom fields, customizable statuses with a per-status workflow, a three-layer automation stack (Business Rules, SLAs, web-to-issue forms), bidirectional task linking, typed issue-to-issue links, and List/Kanban views with sharable saved filters.

This section documents the verified behavior. Where the underlying data is thin or unconfirmed, that is flagged explicitly rather than padded.

### 5.1 The Bug / Issue entity

The Bug/Issue is the core trackable item. It belongs to a Project; references a Module and a Milestone/Affected Milestone; is assigned to a User and reported by a User; has many Comments, Attachments, Followers, and Activities; can be associated with multiple Tasks (bidirectionally); and can be linked to up to 10 other Issues via a single link type. (sources: https://www.zoho.com/projects/help/rest-api/bugs-api.html, https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html)

**Built-in (system) fields:**

| Field | Notes |
|---|---|
| Title | Text |
| Description | Text |
| Status | Object `{id, type}`; type is Open or Closed (see 5.3) |
| Severity | Picklist; default values: Show stopper, Critical, Major, Minor |
| Classification | Picklist; 10 default values (see below) |
| Module | Picklist `{id, name}` |
| Is it Reproducible | Picklist: Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable |
| Milestone | Object reference |
| Affected Milestone | Object reference |
| Assignee | `assignee_name` / `assignee_id` / `assignee_zpuid` |
| Reporter / Reported Person | `reporter_id` / `reported_person` |
| Flag | Internal or External |
| Due Date | `due_date` / `due_date_long` |
| Resolution | Text |
| Closed | Boolean |
| Created / Updated time | `created_time(_long)`, `updated_time(_long)` |
| rate_per_hour | Float (billing) |
| cost_per_hour | Float (billing) |
| key / bug_prefix | Issue key, e.g. `DC-I40`, with a configurable prefix |

(sources: https://www.zoho.com/projects/help/rest-api/bugs-api.html, https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html)

**Severity** — default values are **Show stopper, Critical, Major, Minor**. (source: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html)

**Classification** — 10 default values (note official-doc spellings, including the typo "UI/Usabililty"): **Security, Not a bug, Crash/Hang, DataLoss, Performance, UI/Usabililty, OtherBug, Feature(New), Enhancement, Support Request**. (source: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html)

**Is it Reproducible** — values: **Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable**. (sources: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html, https://www.zoho.com/projects/help/rest-api/bugs-api.html)

**Flag** — two values only: **Internal** and **External**. (source: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html)

Severity, Classification, Module, and "Is it Reproducible" are picklist fields whose values can be reordered, edited, and given a default value that is applied when a bug is filed. (confidence: medium — source: https://www.zoho.com/projects/customized-issue-tracking.html)

> **Limitation / low confidence:** the precise mechanics of how the **Severity default value** is set could not be confirmed — the relevant Chinese help page (https://www.zoho.com.cn/projects/help/severity-classification.html) returned only resource-center navigation with no default-value detail. Treat severity default-value behavior as low/medium confidence.

### 5.2 Custom fields

Issues support user-defined custom fields of three types: text/picklist, numeric, and date. The REST API exposes them as fixed slots, which implies per-type caps:

| Type | API slots | Implied limit |
|---|---|---|
| Text / picklist | CHAR1–CHAR12 | 12 |
| Numeric | LONG1–LONG4 | 4 |
| Date | DATE1–DATE4 | 4 |

(confidence: medium — the limits are *inferred* from the API slot naming, not stated as explicit caps. sources: https://www.zoho.com/projects/customized-issue-tracking.html, https://www.zoho.com/projects/help/rest-api/bugs-api.html)

### 5.3 Custom statuses & workflow

Statuses are fully customizable, configured under **Customization > Layouts and Fields > Issues > Status & Workflow**.

- **Default statuses (Zoho Projects):** Open, In Progress, To Be Tested, Closed, Reopen. (source: https://help.zoho.com/portal/en/kb/projects/faqs/issue-tracker/articles/how-to-configure-issue-status-and-workflow-for-my-issue-tracker)
- Each status is **typed Open or Closed**. At least one Open and one Closed status are required, and **default statuses cannot be deleted**. (source: same)
- Statuses get **colors** and support **drag-and-drop reordering**.
- A **per-status workflow** defines which next statuses an issue can transition to from the current status. (sources: same; https://www.zoho.com/projects/customized-issue-tracking.html)

**Status entity fields:** name, type (Open|Closed), color, next_statuses (workflow transitions), is_default (defaults cannot be deleted).

> **Note (BugTracker variant, medium confidence):** the standalone BugTracker product ships a different default status set — Open, Assigned, To test, To be fixed, InProgress, Reopen, Closed, To be analyzed, Not an issue, Failed Issues, known limitation — where "known limitation" is a Closed-type status by default. (sources: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html, https://www.zoho.com/projects/help/rest-api/bugs-api.html)

### 5.4 Automation

Automation comprises three layers: Business Rules, SLAs, and web-to-issue forms.

#### 5.4.1 Business Rules

Criteria-driven automation that fires on an issue trigger event.

- **Criteria:** standard fields, custom fields, **Affected Milestone**, and **Release Milestone**, combined with **AND/OR** logic.
- **Actions:** update field, notify, webhook, custom function, and update a linked **Zoho Desk** ticket.
- **Execution:** rules run **in list order**; each rule offers an **"Execute the next business rule"** chaining option. Rules can be added, edited, deleted, deactivated, and reordered.

(sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/business-rules, https://www.zoho.com/projects/issue-tracking.html)

**Business Rule entity fields:** name, execute_on (trigger event), criteria, actions, list_order, execute_next_rule (Boolean), active (Boolean).

#### 5.4.2 SLAs & escalations

An SLA defines a resolution/close target and an escalation chain for matching issues.

| Aspect | Detail |
|---|---|
| Target action | **Resolve Before** or **Close Before** |
| Target measure | **Calendar** hours or **Business** hours; optionally measured against custom date fields |
| Matching | An issue is tracked against the **first SLA it matches** in the list (first-match-wins) |
| Escalation levels | Up to **4** |
| Escalation actions | Up to **10** per SLA |
| Escalate to | Assignee, Project Owner, selected users, or a User PickList |
| Action types | Templated emails, feed alerts, reassignment |
| Visibility | Escalation levels are shown **color-coded** in List and detail views |

(sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/sla, https://www.zoho.com/projects/sla.html, https://help.zoho.com/portal/en/kb/projects/faqs/issue-tracker/articles/can-i-create-service-level-agreements-slas-for-my-issues)

**SLA entity fields:** name, target_action (Resolve Before|Close Before), target_time, hours_type (Calendar|Business), criteria (e.g. Modified Date, Last Closed Date, Milestone, Severity), escalation_levels (≤4), escalate_to, escalation_actions (≤10), list_order (first-match wins).

#### 5.4.3 Web-to-issue forms

Embeddable forms that let issues be filed directly from external websites. (Documentation is thin — only that the capability exists and is for external filing.) (sources: https://www.zoho.com/projects/customized-issue-tracking.html, https://www.zoho.com/projects/issue-tracking.html)

### 5.5 Linking: tasks and other issues

#### 5.5.1 Issue ↔ Task association

- Managed from the **Issue Details page** (Tasks section).
- **Bidirectional:** navigate from issue to task and vice versa.
- **Associate Tasks** lets you link existing tasks or create new ones; **Dissociate** removes a link.
- A single issue can associate **multiple** tasks.

(source: https://help.zoho.com/portal/en/kb/projects/issue-tracker/associate-tasks-and-issues/articles/associate-task-issue)

#### 5.5.2 Issue ↔ Issue links

- **Typed links:** Blocks, Depends on, Is related to, Is duplicate of, Is clone of — plus the ability to define custom link types.
- **Blocks / Depends on** enforce closure restrictions.
- **Hard limits:** a single issue can be linked to a **maximum of 10 issues**, and **only one link type** can be used per issue.

(sources: https://help.zoho.com/portal/en/kb/projects/issue-tracker/associate-tasks-and-issues/articles/associate-task-issue, https://www.zoho.com/projects/customized-issue-tracking.html)

**Issue Link entity fields:** link_type (Blocks | Depends on | Is related to | Is duplicate of | Is clone of | custom), source_issue, target_issue.

### 5.6 Views

#### 5.6.1 Kanban

- Board **columns can represent:** status, severity, classification, module, or reproducibility.
- Drag-and-drop cards between and within columns.
- Create issues directly in a column; open a card to comment, attach, start a timer, or link issues.

(sources: https://www.zoho.com/projects/kanban-issue-tracking.html, https://help.zoho.com/portal/en/kb/projects/issue-tracker/issue-tracker-intro/articles/issues-kanban-view)

#### 5.6.2 List view & custom views

Custom views (for both List and Kanban) are created via the View dropdown and support:

- **Nested criteria groups**
- **Column selection**
- **Favorites**
- **Export** to **XLSX / CSV**
- **Sharing:** personal / selected users / all
- Option to surface views **globally and across projects**

(source: https://help.zoho.com/portal/en/kb/projects/issue-tracker/issue-tracker-operations/articles/create-custom-view)

**Custom View entity fields:** name, description, criteria (nested groups), columns, sharing (personal|selected users|all), favorite (Boolean), global/cross-project visibility.

### 5.7 Time / work-hour logging on issues

Issues support logging work hours and running a **per-issue timer**. The `rate_per_hour` and `cost_per_hour` fields support billing. (sources: https://www.zoho.com/projects/issue-tracking.html, https://www.zoho.com/projects/help/rest-api/bugs-api.html)

> **Known limitation (community-reported):** time logged on a bug does **not** auto-sync to a linked Zoho Desk ticket's time registers. (source: https://slashdot.org/software/p/Zoho-Bugtracker/)

### 5.8 Integrations

- **GitHub** and **Bitbucket** — view committed changes against issues.
- **Zoho Desk** — ticket sync via business rules (update linked Desk ticket).
- **Zoho Analytics** — reporting.
- **JIRA import**.

(sources: https://www.zoho.com/projects/issue-tracking.html, https://www.zoho.com/projects/bug-tracking-software.html)

### 5.9 API

REST, available in **two flavors**: the **Zoho Projects Bugs API** and the **Zoho BugTracker Bugs API**.

- **Max 100 records per page** (confidence: medium).
- **Max attachment size 128 MB** (confidence: medium).

(source: https://www.zoho.com/projects/help/rest-api/bugs-api.html, https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html)

### 5.10 Tier availability

- The Issue Tracker is available in **paid Zoho Projects plans**.
- It is also available **standalone as Zoho BugTracker**, which has a **free tier** for small teams.

(source: https://www.zoho.com/projects/customized-issue-tracking.html)

> **Note:** more granular per-edition (Premium/Enterprise/Ultimate) feature gating for individual issue-tracker capabilities was not established in the research data and is not asserted here.

### 5.11 Community sentiment & limitations

**Ratings & praise:**
- Zoho BugTracker rated **4.7/5 across 172 reviews** on Capterra. Praised for a friendly/easy UI, cost-effectiveness, a free tier for small teams, customizable statuses/workflows, and Kanban visualization. (source: https://www.capterra.com/p/180954/Zoho-Bugtracker/reviews/)
- G2/web-aggregator sentiment: "one of the simplest yet powerful issue trackers," easy to customize, reasonable pricing, responsive support. (source: https://slashdot.org/software/p/Zoho-Bugtracker/)

**Limitations / complaints (do not sugar-coat):**
- **Limited external-user configuration** / limited flexibility for external users.
- **Limited depth of severity-level and field customization** — reviewers note "Configuration is quite limited" and want deeper severity/field customization.
- **No or limited mobile app**, and limited storage on the free plan.
- Some **Kanban customization options are missing**.
- The **issue detail page scrolls poorly** when many comments/screenshots accumulate.
- **Zoho Desk time-sync gap** (see 5.7).

(sources: https://www.capterra.com/p/180954/Zoho-Bugtracker/reviews/, https://slashdot.org/software/p/Zoho-Bugtracker/)

### 5.12 Research gaps (explicit)

- **Severity default-value mechanics** — unconfirmed; the Chinese help page failed to load (https://www.zoho.com.cn/projects/help/severity-classification.html).
- **Custom-field per-type limits** (12/4/4) — inferred from API slot naming, not stated as explicit caps.
- **API page-size and attachment-size limits** — medium confidence.
- **Per-edition feature gating** for individual issue-tracker capabilities — not established.
- **G2 reviews** could not be fetched directly (HTTP 403 bot protection); G2 sentiment above is from aggregators.
## 6. Views & Visualization

This section documents how Zoho Projects renders work items across distinct view layers (Tasks, Issues, Projects), the calendar, dashboards, feeds, custom views, and the related Tags and Search subsystems. All claims trace to the cited sources. Where Zoho does not publish a detail, that gap is called out explicitly rather than guessed.

Zoho Projects organizes visualization into three module-specific view families plus several cross-cutting surfaces:

- **Tasks** — Classic list, Plain list, Kanban, Gantt (task-level), Calendar, predefined "My views", and Custom Views.
- **Issues (Bugs)** — List, Kanban, "My Issues", and Custom Views.
- **Projects** — project list with predefined views, portfolio Gantt, Project Dashboard, Portfolio Dashboard, project Custom Views, and the Feed / Activity Stream.
- **Cross-cutting** — org/project Calendar, Reports, Tags, and Search.

---

### 6.1 Task views

| View | What it is | Tier |
|------|-----------|------|
| Classic (a.k.a. "Task List (Classic)") | Detailed list with all important task info; inline-editable columns (e.g., Work Hours Planned); drag-to-reorder tasks **when grouped by Milestone or Task List** | All plans |
| Plain | Simple flat list without the detailed grouping/columns of Classic | All plans |
| Kanban | Cards in columns (see 6.1.1) | All plans |
| Gantt (task-level) | Planning, progress, dependencies, critical path, rescheduling, Baseline | Gantt all plans; **Baseline Enterprise-only** |
| Calendar | See 6.5 (calendar is org/project-wide, not task-only) | All plans |
| Predefined / "My views" | "My Tasks" (tasks related to you); also "Unscheduled Tasks" referenced | All plans |
| Custom Views | Saved filtered views (see 6.6) | All plans |

Sources: Task layouts and naming (source: https://www.zoho.com/projects/features.html); Classic inline-edit and drag-reorder behavior (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/manage-tasks); predefined/My views (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/manage-tasks); Gantt + Baseline (source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/project-gantt-view).

> Limitation: The official task **list-view 7.0** predefined-views page returned HTTP 404 during research, and the older `update-tasks-old` article yielded no extractable predefined-view list. The predefined views named here ("My Tasks", "Unscheduled Tasks") are the only ones confirmed; the full enumerated set could not be verified.

#### 6.1.1 Task Kanban

Cards are grouped into columns by one selectable attribute. Dragging a card between columns changes that attribute.

| Group-by option | Default? |
|-----------------|----------|
| Status | Yes (default) |
| Task List | No |
| Priority | No |
| Percentage (completion level) | No |

Drag behaviors:
- Drag a **card** between columns → changes the grouped attribute.
- Drag a whole **column** → reorders task lists.
- Drag a **subtask** → changes its parent or reorders it.

Card face shows: task ID, title, assignees, end date, priority, timer, comments.

Access: Tasks > Kanban via the view drop-down (global or project level).

Sources: grouping options, drag semantics, and card fields (source: https://help.zoho.com/portal/en/kb/projects/tasks/task-operations/articles/kanban-view). Note: a second documented path exists at the `task-operations/task-operations/articles/kanban-view` URL variant.

> Medium-confidence detail: task duration cannot exceed 10 years, and trashed tasks remain in the Recycle Bin for 30 days (source: https://help.zoho.com/portal/en/kb/projects/tasks/task-operations/articles/kanban-view).

#### 6.1.2 List Group By + Sort

- **Group By** drop-down on list views: Milestone, Task Lists, None.
- **Sort**: via a field's column header (hover/click) or the **Sort** button at top-right (next to Automation).

Sources: (source: https://help.zoho.com/portal/en/community/topic/sorting-tasks-in-my-tasks-view), (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/manage-tasks).

> Limitation (community): Users report sort/group flexibility is limited and not obvious — e.g., grouping "My Tasks" classic list by project is not straightforward (source: https://help.zoho.com/portal/en/community/topic/sorting-tasks-in-my-tasks-view).

---

### 6.2 Issue (Bug) views

| View | What it is | Tier |
|------|-----------|------|
| List | Default tabular list of issues, custom-view capable | All plans |
| Kanban | Cards in columns (see 6.2.1) | All plans |
| My Issues | Consolidated list of issues reported by or assigned to the current user | All plans |
| Custom Views | Saved filtered views, sharable; created from List or Kanban via "+ Create Custom View" | All plans |

Sources: list/custom-view (source: https://www.zoho.com/projects/issue-tracking.html), (source: https://help.zoho.com/portal/en/kb/projects/issue-tracker/issue-tracker-operations/articles/create-custom-view).

#### 6.2.1 Issue Kanban

| Group-by option | Default? |
|-----------------|----------|
| Status (default + custom statuses) | Yes |
| Severity | No |
| Module | No |
| Classification | No |
| Reproducible | No |

Behaviors:
- Dragging a card updates the grouped attribute.
- **Workflow constraint:** a status change via drag is applied **only if the destination status is permitted by the workflow** — otherwise it is not honored.
- Card face: Issue Key, project name (**Global view only**), image preview, and a bottom tray (date/time, assignee, comments, attachments). The tray is toggled via **Show options**.

Sources: (source: https://help.zoho.com/portal/en/kb/projects/issue-tracker/issue-tracker-intro/articles/issues-kanban-view), (source: https://www.zoho.com/projects/kanban-issue-tracking.html).

> Note on issue field values (from the Bugs REST API, for builders): severity = {Show stopper, Critical, Major, Minor}; reproducible = {Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable}; classification has **10** default values = {Security, Not a bug, Crash/Hang, DataLoss, Performance, UI/Usabililty, OtherBug, Feature(New), Enhancement, Support Request} (note Zoho's literal doc spellings "DataLoss" and the typo "UI/Usabililty"). All are user-customizable per project.

> Limitation: The issue **list-view 7.0** predefined-views KB page returned HTTP 404; the issue-list predefined views were inferred from issue-tracking marketing + custom-view docs and are not exhaustively confirmed.

---

### 6.3 Project (portfolio) Gantt

- Projects on the left, schedule bars on the right.
- Shows timelines, overdue task schedules, % completion; sortable by create/start/end date.
- **Only projects that have BOTH a start date and an end date appear** in the portfolio Gantt.
- Options: Show Options (Dates, Owner, Title, Overdue tasks), Full Screen, set **Baseline (Enterprise-only)**, Legends, Export to PDF, Print.

Source: (source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/project-gantt-view).

> Limitation (community/review): Reviewers report Gantt drag-and-drop is **sluggish on large projects**, and detailed Gantt manipulation works better on desktop than mobile (source: https://www.g2.com/products/zoho-projects/reviews; source: https://www.cloudwards.net/zoho-projects-review/).

---

### 6.4 Dashboards

#### 6.4.1 Project Dashboard

Per-project dashboard with a **drag-and-drop widget gallery**.

Gallery widgets:

| Widget | Notes |
|--------|-------|
| Task Status | |
| Issue Status | |
| Phase Status | |
| Team Status | |
| Top 5 Go-getters | |
| Top 5 Issue fixers | |
| Task Progress Chart | |
| Weekly Digest | |
| Budget Status | Planned vs Actual |
| Timesheet Summary | |
| Today's Work Items | |
| Overdue Work Items | |
| Upcoming Events | |

Custom widget types: **Chart**, **Numbers (KPI)**, **Embed URL**.

Sharing/export: share as **Full Access / Editor / Viewer**; export to PDF; integrates Zoho Analytics.

Tier: Dashboard available on all plans; advanced custom dashboards/analytics on higher tiers.

Source: (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/dashboard-projects).

#### 6.4.2 Portfolio Dashboard

Overall cross-project view of projects, tasks, and issues with reports on status, ownership, and budget health. Tier: higher tiers (Premium/Enterprise) (source: https://www.zoho.com/projects/features.html).

---

### 6.5 Calendar

Org- or project-level calendar aggregating multiple item types.

| Item type | Source / condition |
|-----------|--------------------|
| Tasks | Tasks module |
| Phases (milestones) | Milestones module |
| Issues | Issue Tracker |
| Meetings | |
| Events | |
| Time-Offs | Requires **Zoho People** integration |

Behaviors:
- View modes: **Week** and **Day** (these two are what the docs confirm).
- **Drag-and-drop to reschedule.**
- Create any item via **"Add Activity"** or by clicking a date.
- Recurring events: daily / weekly / monthly / yearly.
- **Color-by**: Module (default), Projects, or Assignee.
- Export to PDF; import third-party calendars; per-user holiday icon.

Sources: (source: https://help.zoho.com/portal/en/kb/projects/collaboration/calendar/articles/calendar), (source: https://www.zoho.com/projects/projects-calendar.html).

> Correction (audit, §22.B3): Day, Week, and **Month** views are all supported — Month is the default Calendar view per the current official KB. The earlier "Month not confirmed" caveat is superseded (source: https://help.zoho.com/portal/en/kb/projects/collaboration/calendar/articles/calendar).

---

### 6.6 Custom Views (Tasks, Issues, Projects)

A single Custom View concept spans all three modules, accessed from the **View drop-down → Custom Views**.

| Attribute | Detail |
|-----------|--------|
| name | View name |
| description | Optional |
| criteria | **Maximum 20 criteria** |
| criteria operator | **AND** (all must match) or **OR** (either-or) |
| display columns | Choose by moving fields from an **Available** section to a **Selected** section |
| accessibility / sharing | All users / specific users / personal ("My Custom Views") |
| show in Overview > Tasks | Task views |
| show in other projects | All Projects / Specific Projects |
| favorite flag | Project custom views can be marked favorite |

Sources: task custom view incl. 20-criteria cap, AND/OR, sharing, column selection (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-custom-view); issue custom view (source: https://help.zoho.com/portal/en/kb/projects/issue-tracker/issue-tracker-operations/articles/create-custom-view); project custom view (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/project-custom-view).

Custom Views / saved Filters are also Zoho Projects' **de-facto saved-search mechanism** — there is no saved-search object in the Search API, so users filter list views (e.g., by tag) and save those views for reuse. A Dashboard widget can list all project tags (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/tags-projects; source: https://help.zoho.com/portal/en/community/topic/save-filters-for-future-use). Confidence on this "saved Filters = saved search" framing: medium.

---

### 6.7 Feed and Activity Stream

Two collaboration surfaces, toggleable:

- **Feed** — automated social-style stream of project happenings (status posts, announcements, forums, documents, activity). Users can post a status, add a task, upload an image, or file an issue, and discuss via comments. Tracks activity on task lists, milestones, forums, projects, and the tasks/issues you're connected to (source: https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/feeds; source: https://www.zoho.com/projects/project-coordinator.html).
- **Activity Stream** — chronological timeline (newest first) of team activity across tasks, bugs, milestones, forums, and documents. Can be set as the default **instead of** Feed (source: https://www.zoho.com.cn/projects/help/latest-activities.html; source: https://help.zoho.com/portal/en/community/topic/4-0-default-feed-to-activity-stream-instead-of-feed).

---

### 6.8 Reports

- **Task Reports** — by status / completion % / owner / priority.
- **Issue Reports** — bug status insights.
- **Timesheet Reports** — hours split.
- **Custom report/dashboard builder** — choose chart type, criteria, plot options.

Tier: basic reports on lower tiers; advanced analytics on higher tiers.

Sources: (source: https://www.zoho.com/projects/features.html), (source: https://www.zoho.com/projects/zoho-reporting-tools.html).

---

### 6.9 Notable gap: no Kanban swimlanes

Zoho Projects' Kanban has **no true swimlanes (horizontal rows)**. Task lists are used as *columns*, which users describe as logically awkward. This is a frequently requested, confirmed-absent feature: there are multiple unanswered community requests to add swimlane rows and to group the My Tasks Kanban by project.

- (source: https://help.zoho.com/portal/en/community/topic/where-are-kanban-swimlanes)
- (source: https://help.zoho.com/portal/en/community/topic/group-my-tasks-kanban-view-by-projects)

Swimlanes (by assignee, epic, priority, etc.) exist only in the **sibling product Zoho Sprints**, not in Zoho Projects (source: https://help.zoho.com/portal/en/kb/zoho-sprints/board/articles/view-board-through-swimlane). A cloner intending to offer swimlanes would be building beyond Zoho Projects parity.

> Other review-sourced limitations: view/field customization is reportedly less flexible than Monday.com/ClickUp, and the UI feels dated/clunky for subtasks (G2 4.3/5, Capterra 4.5/5) (source: https://www.g2.com/products/zoho-projects/reviews). The mobile app lacks full desktop view functionality (Gantt manipulation, comprehensive reporting) (source: https://www.cloudwards.net/zoho-projects-review/).

---

### 6.10 Tags (portal-level, used for filtering views)

Tags are first-class **portal-scoped** objects (created once, reused everywhere) that drive tag-based filtering of list views. They are intentionally minimal.

#### 6.10.1 Tag object (exactly four core fields)

| Field | Type | Notes |
|-------|------|-------|
| id | Long | Unique |
| name | String | Display text |
| color_class | String | **Named class from a fixed palette — NOT a free-form hex value** |
| created_by | object | id, zpuid, name, email, is_client_user, zuidString |

There is **no description, no parent/child hierarchy, and no free-form color field** (source: https://www.zoho.com/projects/help/rest-api/tags.html; source: https://www.zoho.com/projects/help/rest-api/bugtracker-tags-api.html).

#### 6.10.2 Color palette

Color is picked from a UI color picker and stored as a named `color_class`. The exhaustive palette is **NOT published** — only examples:

- Projects v3 examples: `bg-tag1`, `bg-tag3`, `bg-tag14`, `bg-tag16`, `bg-tag19`.
- BugTracker examples (hex-suffixed style): `bg7f78e0`, `bgac57f2`, `bg0995ba`, `bgff5acd`, `bg0dd3d3`.

> Limitation: A cloner must infer the full palette empirically or choose its own fixed set (source: https://www.zoho.com/projects/help/rest-api/tags.html; source: https://www.zoho.com/projects/help/rest-api/bugtracker-tags-api.html).

#### 6.10.3 Tags CRUD API (v3)

Base: `/api/v3/portal/[PORTALID]/tags`

| Operation | Method + path |
|-----------|---------------|
| List (index/range pagination) | `GET /api/v3/portal/[PORTALID]/tags` |
| Create | `POST /api/v3/portal/[PORTALID]/tags` |
| Update (name/color) | `PATCH /api/v3/portal/[PORTALID]/tags/[TAGID]` |
| Delete | `DELETE /api/v3/portal/[PORTALID]/tags/[TAGID]` |

Returns 200 with content, or 204 no-content for delete (source: https://www.zoho.com/projects/help/rest-api/tags.html).

#### 6.10.4 Associate / dissociate

`POST .../projects/[PROJECTID]/tags/associate` and `.../tags/dissociate` with body `{tag_id, entity_id, entityType}`. Generic across all taggable entity types via the numeric `entityType` code:

| entityType code | Entity |
|-----------------|--------|
| 2 | PROJECT |
| 3 | MILESTONE |
| 4 | TASKLIST |
| 5 | TASK |
| 6 | BUG / issue |
| 7 | FORUM |
| 8 | STATUS (feed) |

Dissociating removes only that one association; deleting the tag removes it from **all** entities portal-wide — two distinct operations. (BugTracker docs omit TASKLIST=4 and TASK=5 from their sample but use the same scheme.) Notably, the Projects help article does **not** list documents as taggable, contradicting some third-party blogs (source: https://www.zoho.com/projects/help/rest-api/tags.html; source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/tags-projects).

#### 6.10.5 Tag-based discovery

`GET /api/v3/portal/[PORTALID]/globaltags/search` with params `tag_id`, `index`, `range`, and a filter JSON `{project, projstatus, module}`. Returns `total_count`. Requires the `ZohoSearch.securesearch.READ` scope (source: https://www.zoho.com/projects/help/rest-api/tags.html).

#### 6.10.6 Enable / settings

Tags are **enabled by default**; toggled at Portal Configuration > Project and Budget tab > Project Settings > **Enable Tags**. When on, tags can be added inline during module create/edit by typing a name and pressing Enter. This is a portal-level admin setting (not documented as tier-gated) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/tags-projects).

> Limitation (medium confidence): Zoho does **not publish** any numeric maximum tags per portal, per project, or per record for Zoho Projects. Community threads asking this are empty/placeholder pages with no Zoho answer; the circulating "50-tag" figure is a Zoho CRM-context number, not confirmed for Projects (source: https://help.zoho.com/portal/en/community/topic/what-is-maximum-number-of-tags-in-projects; source: https://help.zoho.com/portal/en/community/topic/is-the-50-tag-limit-per-record-per-module-or-system-wide).

---

### 6.11 Search (separate subsystem)

Global/cross-module search is a separate subsystem from Tags.

Two scopes:

| Scope | Endpoint |
|-------|----------|
| Portal-wide | `GET /restapi/portal/[PORTALID]/search` |
| Project-scoped | `GET /restapi/portal/[PORTALID]/projects/[PROJECTID]/search` |

Parameters (only four):

| Param | Type | Meaning |
|-------|------|---------|
| search_term | String | Keyword / substring |
| module | String | One module or `All` |
| index | int | Start offset |
| range | int | Page size |

`module` accepts: `projects`, `milestones`, `tasks`, `tasklists`, `forums`, `forumcomments`, `taskcomments`, `bugs`, `users`, `documents`, `events`, and `All` (11 module types + All).

Behavior: keyword/substring matching over names, descriptions, prefix IDs, comments, and custom field values (depending on module). **There is NO documented boolean/operator/advanced-query DSL and no saved-search object** in the Search API. Output is module-keyed JSON arrays (`projects[]`, `tasks[]`, `bugs[]`, etc.) carrying entity metadata.

Restrictions / scopes:
- **Document search is project-scope only**, not portal-wide.
- Base search scope: `ZohoProjects.search.READ`.
- Document search additionally requires `ZohoPC.files.READ` and `ZohoSearch.securesearch.READ`.

Sources: (source: https://www.zoho.com/projects/help/rest-api/search-api.html).

**Global search UI** (medium confidence): a search bar surfaces results across projects, tasks, bugs, comments and more, provides a **Filter icon** to narrow by a specific project, and retains recent searches. Documented for the Android app (v3.3.1+) and present in the web UI (source: https://help.zoho.com/portal/en/community/topic/global-search-functionality-is-now-made-available-in-zoho-projects-android-mobile-app).

OAuth scope summary:

| Feature | Scope(s) |
|---------|----------|
| Search (base) | `ZohoProjects.search.READ` |
| Document search (extra) | `ZohoPC.files.READ`, `ZohoSearch.securesearch.READ` |
| Tags | `ZohoProjects.tags.READ` / `.CREATE` / `.ALL` |
| Tag / secure search | `ZohoSearch.securesearch.READ` |

---

### 6.12 Builder notes and explicit gaps

- **No Kanban swimlanes** in Zoho Projects (see 6.9) — exists only in Zoho Sprints. Decide deliberately whether to match parity or exceed it.
- **No published tag-count limits** (per portal/project/record) — pick your own.
- **No exhaustive tag color palette** published — only example class names; infer empirically or define your own fixed set.
- **No boolean/operator query DSL or saved-search object** in the Search API; saved searches are emulated via Custom Views / saved Filters.
- **Calendar modes**: only Week and Day confirmed in sources; Month not confirmed.
- **Predefined view enumerations** for both Task and Issue list views are incomplete — the relevant 7.0 KB pages returned HTTP 404 during research; only "My Tasks"/"Unscheduled Tasks" (tasks) and "My Issues" (issues) are confirmed.
- **Gantt Baseline is Enterprise-only**; portfolio Gantt hides any project missing a start or end date.
- Several review-based limitations (sluggish Gantt drag on large projects, customization weaker than Monday/ClickUp, dated subtask UI, weaker mobile) come from G2/Capterra/Cloudwards summaries that were not individually fetched — treat as directional, not authoritative.
## 7. Time Tracking, Timesheets & Billing

Zoho Projects provides an end-to-end "time-to-billing" pipeline: capture time → roll it into timesheets → approve → budget/forecast against it → invoice the approved billable portion through Zoho Finance (Books/Invoice). This section documents the entities, fields, behaviors, options, and limitations a builder must replicate. Time tracking is **not** in the Free plan; it begins at **Premium** (source: https://aiproductivity.ai/guides/zoho-projects-time-tracking-guide/) — note this specific tier claim is corroborated mainly by a third-party guide, so treat the exact plan-start as medium confidence.

### 7.1 Scope: where time attaches

A time log (the core unit, `TimeLog`) attaches to one of **three scopes**, each with distinct REST API endpoints and full add/update/get/approval/delete operations (source: https://www.zoho.com/projects/help/rest-api/log-time.html):

| Scope | Endpoint pattern | Notes |
|---|---|---|
| Task | `/tasks/[TASKID]/logs/` | Log against a specific task |
| Issue / Bug | `/bugs/[BUGID]/logs/` | Log against a specific bug/issue |
| General / Project-level | `/projects/[PROJECTID]/logs/` | Standalone log; **requires a `name` field** |

A timelog can be associated with an invoice (via an `invoice_id`) only for portals integrated with Zoho Invoice/Finance.

### 7.2 Capture mechanisms

**(1) Timers (task & issue).** Start/pause/stop timers for tasks and issues (source: https://help.zoho.com/portal/en/kb/projects/timesheetsandtimelogs/manage-timelogs/articles/task-issue-timers):

- A **global timer widget** is accessible from any page via the top band.
- An alternative **floating timer** stays on-screen and is **draggable**.
- **Multiple concurrent timers** can be enabled (portal setting). When enabled, the floating timer **displays the sum of all running timers**.
- **Notes can be added at every pause** and are viewable when the timer is stopped.
- On **stop**, the time log is **created/updated automatically**.

**(2) Manual entry.** Log time manually against a task, issue/bug, or as a general/project-level activity (source: https://www.zoho.com/projects/help/rest-api/log-time.html). General logs require a `name`.

A portal-level **Time Log Configuration mode** governs which capture methods are allowed: **All / Manual / Timer** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/task-and-timesheet).

### 7.3 TimeLog fields

**API request parameters** (source: https://www.zoho.com/projects/help/rest-api/log-time.html):

| Parameter | Format / values | Required |
|---|---|---|
| `date` | MM-DD-YYYY | Yes |
| `hours` | hh:mm | Yes |
| `bill_status` | Billable \| Non Billable | Yes |
| `name` | string | Required for general logs only |
| `owner` | user ID | Optional |
| `notes` | string | Optional |
| `cost_per_hour` | float | Optional |
| `custom_fields` | JSON (e.g. `UDF_CHAR1`) | Optional |
| `action` (approval) | approve \| pending \| reject | For approval ops |
| `reason` (rejection) | string, **max 250 chars** | On reject |

**API response fields** (source: https://www.zoho.com/projects/help/rest-api/log-time.html):

`id`, `log_date`, `hours` (integer hour component), `minutes`, `total_minutes`, `hours_display` (HH:MM string), `bill_status`, `approval_status`, `approver_name`, `owner_id`, `owner_name`, `notes`, `cost_per_hour`, `created_date`, `last_modified_date`.

Enum values: **bill_status** = Billable / Non Billable / All (filter); **approval_status** = Approved / Pending / Rejected / All (filter).

### 7.4 Timesheet views

Timesheets aggregate logs into **daily** and **weekly** grids (sources: https://www.zoho.com/projects/timesheet-software.html, https://help.zoho.com/portal/en/kb/projects/timesheetsandtimelogs):

- Default view = **Weekly**, showing the current week.
- **Rows** = project/task; **columns** = days.
- **Weekly total** appears at the top, **split into Billable and Non-Billable subtotals**.
- Supports **draft** and **submit** states.

### 7.5 Billable vs non-billable classification

Each entry is **Billable** or **Non Billable**. A **default billing status** can be set in settings so new entries inherit it. Only **approved billable** timesheets are billed when generating an invoice (source: https://www.zoho.com/projects/timesheet-software.html).

**Limitation (confirmed via community thread):** the approval workflow applies **only to billable hours** — non-billable hours **cannot** be sent for approval. Users have requested approval for non-billable/internal time; no official Zoho fix is noted in the thread (source: https://help.zoho.com/portal/en/community/topic/approval-for-non-billable-project-hours).

### 7.6 Approval workflow

Portal-configurable mode: **Submit with Approval** vs **Submit without Approval** (sources: https://www.zoho.com/projects/timesheet-software.html, https://www.zoho.com/projects/help/rest-api/log-time.html).

- With approval: entries must be **approved before billing**.
- Without approval: entries are **auto-billable**.
- Actions: approve / pending (keep) / reject; rejection accepts a **reason (max 250 chars)**.
- **Approvers are limited to Portal Owner, Portal Admin, and Managers** — no other role can approve/reject timesheets (source: https://help.zoho.com/portal/en/kb/projects/faqs/timesheet-and-invoice/articles/who-can-approve-the-timesheet-entered-by-the-users-in-a-project).

### 7.7 Time-log restriction settings (admin)

Admin controls under Portal Configuration → Task & Timesheet (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/task-and-timesheet):

| Setting | Options / behavior |
|---|---|
| Time Log User Restriction | Task & Issue Owners / Anyone in Project / Associated Team Members |
| Log Hours for Closed Tasks | Allow / disallow logging on closed tasks |
| Multiple Timers | On / Off (enables concurrent timers) |
| Work Hours Restriction | Cap logged time to task's allocated hours |
| Date-Based Restriction | Limit logging to task start/end dates |
| Holiday / Weekend / Leave restrictions | Block logging on those days |
| Overlap settings | Allow / Warn / Restrict overlapping entries |
| Time Log Configuration mode | All / Manual / Timer |
| Past/future logging window | Restrict how far back/forward time can be logged |

### 7.8 Project budgeting

Four **budget types**; each tracks both **Cost Budget** and **Budgeted Hours**, with **Revenue Budget** available (sources: https://help.zoho.com/portal/en/kb/projects/budget/articles/project-budget, https://www.zoho.com/projects/project-budget.html):

| Budget type | API value | Scope |
|---|---|---|
| Based on Project | 1 | Single fixed cost + hours for the whole project; enables Revenue Budget |
| Based on Phase (Milestone) | 3 | Cost/revenue/hours per phase; totals roll up |
| Based on Task | 5 | Cost/revenue/hours per task |
| Based on User | 7 | Cost/revenue/hours per user; set when adding/editing project users |
| (None) | 0 | No budget |

API values per the REST docs (source: https://www.zoho.com/projects/help/rest-api/projects-api.html). Budgeting is available on Premium and Enterprise (also CRM Plus, Zoho One).

**Budget health & forecasting** (source: https://help.zoho.com/portal/en/kb/projects/budget/articles/project-budget):

| Tag | Condition |
|---|---|
| At Risk | (Actual < Budget) AND (Forecasted > Budget) |
| Overrun | Actual > Budget |
| Surplus | Forecasted <= Budget |

- **Forecasted cost** = `(((100 - %completion) * planned cost) / 100) + Actual cost`; forecasted hours computed analogously.
- Auto-recalculated **roughly every 6 hours**; manual refresh available via the dashboard widget.
- A **Planned vs Actual** hours/cost report is available at global and project level.

### 7.9 Earned Value Management (EVM)

EVM layers on the project budget (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/earned-value-management):

- **Prerequisites:** Project Budget must be enabled, with budget type **Based on Project / Milestone Amount**; calculated on the **portal's working hours**.
- **Availability:** user-based **Enterprise** and **Ultimate** plans.
- Shown on the **Project Dashboard** (three report types) and the **Portfolio Dashboard** (quadrant performance chart).

**Formulas:**

| Metric | Formula |
|---|---|
| PV (Planned Value) | Total Planned Cost × Planned %Completion / 100 |
| EV (Earned Value) | Total Planned Cost × %Completion / 100 |
| AC (Actual Cost) | Actual cost incurred |
| CV (Cost Variance) | EV − AC |
| SV (Schedule Variance) | EV − PV |
| SPI | EV / PV |
| CPI | EV / AC |
| Forecasted Cost (Typical) | AC × 100 / %Completion |
| Forecasted Cost (Atypical) | [((100 − %Completion) × Planned Cost) / 100] + AC |

### 7.10 Billing methods

Four billing methods (sources: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/invoice-integration, https://www.zoho.com/us/books/kb/time-tracking/billing-method-description.html):

| Method | API value | Behavior |
|---|---|---|
| Based on Staff Hours | 2 | Per-user rates, set when adding/editing portal users |
| Based on Project Hours | 1 | Single project rate × total logged hours |
| Based on Task/Issue Hours | 4 | Rate Per Hour set on each task/issue; Default Rate Per Hour set at project creation |
| Fixed Price / Fixed cost for Project | 3 | Flat fee; requires Invoice/Books integration |

API values per REST docs (source: https://www.zoho.com/projects/help/rest-api/projects-api.html). **Key limitation:** the Default Rate Per Hour set at project creation is **editable for tasks but NOT for issues**.

**Daily-rate billing (Books/Invoice integration)** — when **Daily** is the billing method, three rate types apply: Rate per Project, Rate per Task, Rate per User (sources: https://www.zoho.com/us/books/help/integrations/projects-integration.html, https://www.zoho.com/us/billing/help/time-tracking/projects/basic-functions.html). Hard constraints:

- Daily-rate projects allow **only one time entry per user per day**, logged as a **full day** (= configured hours/day) or **half day**.
- **Daily-rate and hourly-rate projects cannot be invoiced together.**
- A project's **rate type cannot be switched after creation.**

### 7.11 Invoicing via Zoho Invoice / Books / Finance

Two-way sync of customers, projects, tasks, issues, users, and **approved billable timesheets** (sources: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/invoice-integration, https://www.zoho.com/us/books/help/integrations/projects-integration.html):

- Create **Invoice** / **New Transaction** from a project's **Details** page.
- **Quotes** (formerly Estimates) can be marked **Accepted / Declined**.
- Expenses tracked in the **Finance** tab; invoices filtered by status: **draft / sent / paid / void**.
- **Only approved billable timesheets convert to invoices.**
- **Requirements:** Projects **Premium/Enterprise** + at least Zoho Books **Professional** edition (medium confidence — source: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/invoice-integration).

### 7.12 Reports, export & mobile

Timesheet reports are filterable by **users, billing status, and time period**, with **one-click export to XLS, CSV, and PDF**. Mobile time tracking is available via **iOS and Android** apps (source: https://www.zoho.com/projects/timesheet-software.html).

### 7.13 Community-reported insights & limitations

- **Non-billable approval gap:** approval only covers billable hours; internal/non-billable time cannot be sent for review/approval; no official fix noted (source: https://help.zoho.com/portal/en/community/topic/approval-for-non-billable-project-hours).
- **Ratings/UX:** Zoho Projects rates ~4.3/5 (G2) and ~4.5/5 (Capterra); reviewers call timesheet entry intuitive and praise rate adjustment by user/role/task/project, but cite **initial complexity with a 2–3 week onboarding ramp** as the most common drawback (source: https://www.g2.com/products/zoho-projects/reviews).
- **Daily vs hourly constraints** repeatedly surfaced in Zoho Books docs/community (see 7.10) (source: https://www.zoho.com/us/billing/help/time-tracking/projects/basic-functions.html).

### 7.14 Data gaps / could not verify

- `https://www.zoho.com/projects/help/timesheet/log-hours.html` returned **HTTP 404** (page moved/renamed) — UI step-by-step for logging hours not directly captured here.
- The **Premium plan start** for time tracking and the **~$4/user/mo** figure are medium-confidence (third-party guide), not scraped from Zoho's JS-rendered pricing page.
- Reddit, X/Twitter, and LinkedIn discussions were not retrieved (not surfaced in search / login-gated), so no additional practitioner caveats beyond the above.
## 8. Automation: Blueprint, Business Rules, SLA, Webhooks, Custom Functions

Zoho Projects exposes a layered automation stack that is largely gated behind the **Premium** and **Enterprise** tiers. The capabilities split across two functional domains — the **task/project** side (Blueprint, Workflow Rules, task webhooks) and the **issue tracker** side (Business Rules, SLAs, issue webhooks) — plus a **Developer Space** layer (Custom Functions, Schedules). The pieces interlock: Business Rules are the only trigger for issue webhooks; Workflow Rules and Business Rules invoke Custom Functions; Blueprint transitions can fire webhooks and email alerts.

> **Tier reality (limitation):** The most powerful automation — Workflow Rules, Custom Functions, and webhooks — requires the **latest user-based Enterprise plan**. Community reviewers flag a notable price jump from Premium to Enterprise that gates exactly these features, plus a steep learning curve where "advanced automation and layout tweaks require a bit of trial and error" (source: https://www.g2.com/products/zoho-projects/reviews). Onboarding is commonly cited at 2-3 weeks, and complex editing works better on desktop than mobile (source: https://www.invensislearning.com/blog/zoho-projects-review/).

---

### 8.1 Blueprint (Process Designer)

**Tier:** Premium and Enterprise only (confidence: high) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects)

Blueprint is a drag-and-drop workflow editor built from **Statuses** and **Transitions**. Statuses are pulled from the task layout or created new; each is assigned a **Status Type** (Open or Closed) and a color. Transitions connect statuses (or are "common" across statuses) and can be color-coded. A published Blueprint is attached to a task layout, optionally filtered by execution criteria/module (source: https://www.zoho.com/projects/blueprint.html).

#### Blueprint entity fields

| Entity | Fields |
|---|---|
| **Blueprint** | Name, Description, Layout, Execution criteria (optional), Status set, Transition set, Published/Draft state, Enabled/Disabled, Color theme |
| **Status** | Name (unique), Status Type (Open/Closed), Color |
| **Transition** | Name (unique), From status, To status, Color, Before config (owners + criteria), During config (fields, messages, validations), After config (field updates, email alerts, webhooks max 5), Parallel set membership |

#### The three transition phases

Each transition has three phases (confidence: high) (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects, https://www.zoho.com/projects/tutorials/blueprint.html):

| Phase | Purpose | Details |
|---|---|---|
| **Before** | Controls who can perform the transition and when the button appears | Selected users / teams / profiles (who can act irrespective of their normal task permissions) + entry criteria. The transition appears as a button on the task detail page **only when criteria are met** (e.g. "Large Claim (>2000)", "Attachment is Available") |
| **During** | Collects input from the user at execution time | Mandatory/optional fields, messages/prompts, validations (e.g. require an attachment, require comments). Fields can be reordered to control display sequence |
| **After** | Automated actions on completion | Field Updates (incl. setting % completion, or "Assigned To = Current User"), Email Alerts to users/teams (owners/creators/followers), and **Webhooks (max 5 per transition)**. The task auto-moves to the next status |

#### Parallel and common transitions

- **Parallel transitions:** up to **4** allowed, with a maximum of **2 parallel transition sets** from a single status; **all must complete** before the status updates (confidence: high) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects).
- **Common transitions:** reusable across multiple statuses rather than tied to a single status pair.
- Parallel-transition support is a relatively recent capability documented via an early-access community thread — worth verifying on the target plan (source: https://help.zoho.com/portal/en/community/topic/early-access-blueprint-enhancements-parallel-and-multiple-transitions-and-more).

#### Lifecycle management and publish validation

Blueprints can be **Cloned**, **Exported (JSON or PNG)**, Dissociated from projects/milestones, Reordered, and Enabled/Disabled without deletion while tasks are active (confidence: high) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects).

**Publish validation rules** (all must hold):
- Start status must be **Open**
- End status must be **Closed**
- All statuses connected
- Status names unique
- Each status needs **at least one incoming and one outgoing transition** (except the Closed end status)

---

### 8.2 Business Rules (Issue Tracker)

**Tier:** Issue tracker feature; the webhook and custom-function actions require Enterprise (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/business-rules)

Business Rules automatically perform actions on bugs/issues when criteria match. They run on bugs **in rule-list order** and are reorderable (source: https://help.zoho.com/portal/en/kb/projects/faqs/issue-tracker/articles/what-is-a-business-rule-how-can-i-define-business-rule-for-my-project).

| Aspect | Detail |
|---|---|
| **Criteria** | AND/OR logical operators with an editable criteria pattern; over standard fields, custom fields, **affected milestone**, and **release milestone** |
| **Actions** | Field updates; **Webhooks**; **Custom Functions**; updating **Zoho Desk tickets** (requires the Desk integration) |
| **Ordering** | Applied in rule-list order; reorderable |
| **Other fields** | Name, Execute-next flag, Active/Inactive |

**Critical integration point:** Issue webhooks are fired **only via a Business Rule** — there is no direct issue-event trigger for webhooks (confidence: high) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/issue-webhooks). See §8.6.

---

### 8.3 SLA (Issue Tracker)

**Tier:** Issue tracker (Premium/Enterprise) (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/sla, https://www.zoho.com/projects/sla.html)

SLAs define service targets and multi-level escalations on issues. **An issue matches only the FIRST qualifying SLA** in the ordered list; SLAs are reorderable (confidence: high).

| Aspect | Detail |
|---|---|
| **Criteria filters** | Modified Date, Last Closed Date, Milestone, Severity, custom fields |
| **Target types** | **Close Before** and **Resolve Before** (support custom date fields) |
| **Time basis** | Computed on **Calendar hours** or **Business hours** |
| **Escalation levels** | Maximum **4** per SLA; color-coded in list/detail views |
| **Actions** | Up to **10** configurable actions per SLA |
| **Action types** | Email notifications via custom templates; reassignment of unresolved issues |
| **Recipients** | Assignee, Project Owner, selected project users, or users from a **PickList** |

**SLA Escalation** entity fields: Level (1-4), Trigger time/offset, Recipients, Action (email via template, reassign/notify).

---

### 8.4 Workflow Rules (Projects & Tasks)

**Tier:** Latest user-based **Enterprise** plan only (confidence: high) (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/project-automation/articles/workflow-rules-for-projects, https://www.zoho.com/projects/taskautomation.html)

Workflow Rules automate projects and tasks per layout.

| Aspect | Detail |
|---|---|
| **User-action triggers** | Create / Edit / Create-or-Edit |
| **Date & Time triggers** | On / Before / After the **start date**, **created date**, or **due date**; frequency **once / daily / weekly** with repetition limits |
| **Conditions** | Multiple conditions supported. The rule **exits after the first matching condition** unless **"Execute the next workflow rule"** is selected |
| **Actions** | Field updates, email alerts, webhooks, custom functions, **associate a project to groups** |
| **Limit** | **Max 20 rules per layout**; reorderable |

---

### 8.5 Custom Functions (Deluge)

**Tier:** Latest **Enterprise** plan (Developer Space) (confidence: high) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/custom-functions-for-projects)

Custom Functions are **Deluge scripts associated to workflow rules** (and invokable from Business Rules / Schedules), executed when the rule's criteria match.

| Field / Limit | Value |
|---|---|
| Configurable fields | Name, Description, Layout, Arguments/parameters, Deluge code |
| **Max functions per layout** | **25** |
| **Max parameters per function** | **25** |
| **Auto-disable** | After **20 failures/day** |
| Operations | Edit / Clone / Delete |
| REST exposure | Can be **exposed as REST API endpoints** |

**Custom Function Gallery:** prebuilt, ready-to-use Deluge templates including **CRM integration, Slack/Cliq messaging, document creation, and Analytics syncing** (Enterprise) (source: same as above).

---

### 8.6 Webhooks

Webhooks behave differently per module. **The two are not interchangeable.**

| Attribute | **Issue Webhooks** | **Task Webhooks** |
|---|---|---|
| Tier | Latest user-based Enterprise | Enterprise |
| Method | POST (default) or GET | POST (default) or GET |
| URL limit | 1000 chars | 1000 chars |
| Module/standard parameters | Up to **10** issue params (standard, or XML/JSON user-defined — only **one** user-defined param) | Task params (standard/XML/JSON), 3000-char |
| Custom parameters | Up to **5** key/value (auth: username/password/API ID) | Custom params, 3000-char |
| Request headers | — | **Supported** (key/value, 3000-char) |
| Name length | — | Max **100 chars** |
| Daily limit | **1000 calls/day** | **2000 triggers/day** |
| Auto-disable threshold | After **10 consecutive** failures | After **20+ failures/day** |
| Retry on failure | **No retry** | (not documented) |
| Trigger source | **ONLY via a Business Rule** | Blueprint and workflow automation |

Sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/issue-webhooks ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/webhooks-for-tasks

**Builder caution:** The "no retry" behavior on issue webhooks and the consecutive-failure deactivation mean an unreachable endpoint silently kills the integration after 10 failures with no automatic recovery.

---

### 8.7 Schedules (Deluge)

**Tier:** Enterprise / Developer Space (confidence: medium for the feature itself; see limitation) (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/custom-functions-for-projects, https://www.zoho.com/developer/help/extensions/schedules.html)

Schedules run user-defined **Deluge custom functions** at a specific time or on a recurring basis (daily / weekly / monthly / yearly with execution time and frequency). Failed schedules are logged under a **Failure tab**.

**Entity fields:** Name, Description, Associated custom function, Execution at (time), Frequency, Recurrence settings, Failure log.

> **Limitation (thin data):** The Zoho platform norm is a limit of **~10 active schedules per organization**, but this figure comes from Zoho **CRM** documentation (source: https://help.zoho.com/portal/en/kb/crm/automate-business-processes/schedules/articles/custom-schedules). The **Projects-specific** active-schedule count was **not separately confirmed** from a Projects help page (confidence: low). Treat the ~10 figure as indicative, not authoritative for Projects.

---

### 8.8 Cross-Cutting Limitations & Community Sentiment

- **Tier gating is the dominant constraint.** Blueprint needs Premium+; Workflow Rules, Custom Functions, and both webhook types need Enterprise. There is a notable price jump from Premium to Enterprise (source: https://www.g2.com/products/zoho-projects/reviews).
- **Learning curve:** G2 ~4.3/5 across thousands of reviews praises value for money but cites that advanced automation/layout tweaks "require a bit of trial and error" (source: https://www.g2.com/products/zoho-projects/reviews). A third-party review cites a steep initial learning curve with onboarding often 2-3 weeks, and that the breadth of automation can overwhelm new teams; complex editing is better on desktop than mobile (source: https://www.invensislearning.com/blog/zoho-projects-review/).
- **Failure handling is unforgiving:** issue webhooks have no retry and disable after 10 consecutive failures; task webhooks disable after 20/day; custom functions auto-disable after 20 failures/day.
- **Parallel transitions are recent** and surfaced via early-access community material — verify availability on the target plan/build (source: https://help.zoho.com/portal/en/community/topic/early-access-blueprint-enhancements-parallel-and-multiple-transitions-and-more).

#### Sources that could not be independently fetched (transparency)
- Invensis blog: direct WebFetch failed (ECONNREFUSED); a search snippet was used instead.
- Reddit, X/Twitter, LinkedIn, YouTube, Hacker News, Capterra, TrustRadius: no authoritative automation-specific results surfaced; not fetchable without login/JS.
## 9. Reporting, Dashboards & Analytics

Zoho Projects ships reporting in **two distinct layers** that a builder must treat separately:

1. **Native built-in reporting** — the in-product *Reports* module (Portal-level and Project-level scopes), Custom Reports, Planned vs Actual, Workload Report, and Gantt/Critical Path/Baseline, plus **Custom Dashboards** built from widgets.
2. **Zoho Analytics "Advanced Analytics" add-on** — a separate connector/product that replicates Projects data into a Zoho Analytics workspace and auto-generates 50+ prebuilt reports and dashboards, with a drag-drop builder, SQL, data blending, and AI.

The most build-critical fact: **burndown/burnup charts are NOT native to Zoho Projects core reporting.** They are native to *Zoho Sprints* (a sibling product) and reach Zoho Projects only through the Zoho Analytics add-on. Do not assume they exist in the base Projects UI. See [9.6](#96-burndownburnup-charts-do-not-assume-native) below.

A recurring, honestly-acknowledged limitation across reviews: native report customization is shallow, and deeper analytics force you onto the Zoho Analytics add-on; mobile reporting is weaker than desktop (source: https://www.invensislearning.com/blog/zoho-projects-review/; source: https://www.g2.com/products/zoho-projects/reviews).

---

### 9.1 Reports module: Portal Level vs Project Level

The Reports module is split into two scopes plus a Custom Reports area:

| Scope | Meaning | Notes |
|---|---|---|
| **Portal Level** | Cross-project / global / organization-wide view of tasks and issues across the whole portal | Generally gated to paid plans; cross-project rollups historically gated to higher tiers |
| **Project Level** | Scoped to a single project | Basic task reports available in all plans |
| **Custom Reports** | User-defined report maker (compare any two criteria) | Paid plans |

Categories within the module: **Task Reports, Issue Reports, Planned vs Actual, Workload Report, and Gantt charts.**

Sources: https://help.zoho.com/portal/en/kb/projects/reports ; https://help.zoho.com/portal/en/kb/projects/reports/portal-level-reports/articles/portal-level-task-reports ; https://help.zoho.com/portal/en/kb/projects/reports/project-level-reports/articles/project-level-task-reports

---

### 9.2 Task Reports (Basic & Advanced)

Native task reporting comes in two tiers:

**Basic task reports** — available in **all plans**. Group task counts by one of **6** criteria:

| # | Group-by criterion |
|---|---|
| 1 | Status |
| 2 | Milestone / Project |
| 3 | Priority |
| 4 | Tags |
| 5 | Owner |
| 6 | Completion Percentage |

**Advanced task reports** — **paid plans only**. Give owner-wise task counts (by Status / Priority / Completion) and project-wise breakdowns.

Additional report: **Created vs Completed** — compares tasks created vs tasks completed over a chosen time frame.

Behaviors: click a chart column to drill into the matching task list; export to PDF.

Sources: https://help.zoho.com/portal/en/kb/projects/reports/project-level-reports/articles/project-level-task-reports ; https://help.zoho.com/portal/en/kb/projects/reports/portal-level-reports/articles/portal-level-task-reports

---

### 9.3 Issue / Bug Reports (Basic & Advanced)

**Availability: Premium and Enterprise plans only.** (Confidence: high.)

- **Basic** issue reports show issue status by a chosen parameter; click bars to view the underlying issues (tabular drill-down).
- **Advanced** issue reports include:
  - **Issue Owner Status Report** — issues per user by stage
  - **Issue Owner Escalation Report** — escalations by user
  - **Created vs Closed** — issues created vs closed in a time frame

Configurable: chart type, X-axis field, Y-axis field, grouping, filters; aggregate functions (count / sum / average / min / max). Export to PDF.

Source: https://help.zoho.com/portal/en/kb/projects/reports/issue-reports/articles/issue-reports

---

### 9.4 Custom Reports (the report maker)

**Availability: paid plans.** Build a custom task or issue report by comparing any two criteria:

| Configurable element | Options |
|---|---|
| Chart type | Vertical bar, horizontal bar, pie, donut (chart types referenced in docs) |
| X-axis field | Any preferred field |
| Y-axis field | Any preferred field |
| Grouping | Yes |
| Filters | Yes |
| Aggregate function | count, sum, average, minimum, maximum |

Sources: https://help.zoho.com/portal/en/kb/projects/reports ; https://www.zoho.com/projects/charts-and-reports.html ; https://www.zoho.com/projects/project-reports.html

---

### 9.5 Planned vs Actual report (hours & cost)

Compares **planned work hours vs actual logged hours**, and **planned cost vs actual cost**.

| Field / behavior | Detail |
|---|---|
| Hours variance prefix | `+` = planned more than actual; `-` = planned less than actual |
| Cost variance | Planned cost vs actual cost |
| Filters | Project group/name, user, task status, week/month view |
| Drill-down | Per-task, per-user logged hours |
| Export | Current view to **XLS** |

**Tier gating:**

| Variant | Plan |
|---|---|
| Global (cross-project) Planned vs Actual | **Enterprise only** |
| Project-scope Planned vs Actual | **Premium and Enterprise** |

The Zoho Community has long-running threads requesting global/cross-project Planned vs Actual, indicating this rollup is a recurring user need historically gated to higher tiers (source: https://help.zoho.com/portal/en/community/topic/tip-41-global-planned-vs-actual-reports-in-zoho-projects).

Sources: https://help.zoho.com/portal/en/kb/projects/reports/planned-vs-actual/articles/planned-vs-actual-hours-for-tasks ; https://www.zoho.com/projects/project-reports.html

---

### 9.6 Workload Report (resource utilization)

Shows work allocated per user with color-coded allocation status.

| Aspect | Options / values |
|---|---|
| Allocation status (color-coded) | unallocated, under-allocated, optimally allocated, over-allocated |
| Visualizations | **Bar View, Heatmap, Timeline** |
| Time period | Days / Weeks / Months |
| Group by | Task Owner, Associated Teams, Profiles, Roles |
| Data labels | Allocated Hours, Allocated %, Available Hours, Available % |
| Capacity basis | Work hours & holidays computed from configured business hours |
| Export | PDF (optional encryption) |

**Interactive editing (with constraints):**
- Drag-drop task **reassignment** — **only when grouped by Task Owner**.
- Schedule adjustment — **only in Days view**.
- Inline create/assign tasks; edit work hours.

**Tier gating:**

| Variant | Plan |
|---|---|
| Global Workload Report | **Enterprise** |
| Project Workload Report | **Premium and Enterprise** |

Sources: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report ; https://www.zoho.com/projects/workload-management.html

---

### 9.7 Gantt charts, Critical Path & Baseline

**Project Gantt view** shows tasks/milestones as timeline bars with: actual schedule, overdue schedule, **baseline overlay**, and completion percentage. Sort by creation/start/end date; full-screen; export to PDF; print.

| Feature | Detail | Plan |
|---|---|---|
| Project / Milestone Gantt | Tasks & milestones on a timeline | All paid plans |
| Global Milestone Gantt | Cross-project milestone view | Paid (note: a help article for this returned HTTP 404 — article moved) |
| **Critical Path** | Identifies critical path of dependent tasks; accessed via the **Milestone Gantt chart** (open project → Milestone Gantt Chart) | **Enterprise only** |
| **Baseline** | Capture a schedule baseline to compare planned vs actual over time; baseline data is also synced to Zoho Analytics (Baseline, Tasks on Baseline, Milestones on Baseline) | **Enterprise only** |

Sources: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/project-gantt-view ; https://help.zoho.com/portal/en/kb/projects/reports/gantt-charts ; https://help.zoho.com/portal/en/kb/projects/tasks/critical-path/articles/view-critical-path-on-gantt-chart ; https://help.zoho.com/portal/en/kb/projects/faqs/critical-path/articles/how-can-i-view-critical-path-on-the-gantt-chart ; https://help.zoho.com/portal/en/kb/projects/reports/baseline/articles/set-baseline

---

### 9.8 Burndown / Burnup charts — DO NOT assume native

**This is the single most important caveat in this section.**

- Burndown maps remaining work vs timeline against an ideal line; burnup maps completed work. Both can be plotted for a sprint, epic, or release.
- These are **native to Zoho Sprints** (a *separate* Zoho product), **not** to Zoho Projects' core reporting. Zoho Sprints can compare up to 5 sprints in burndown.
- In **Zoho Projects**, burndown reports are obtained **only via the Zoho Analytics Advanced Analytics add-on** (which auto-creates a burndown among its 50+ prebuilt reports). The add-on's Reports tab requires **Premium or Enterprise** on the Projects side.

A builder cloning Projects functionality must not surface burndown/burnup as a base-product feature. If burndown is required, it implies either Sprints or the Analytics add-on.

Sources: https://www.zoho.com/sprints/agile-reports.html ; https://help.zoho.com/portal/en/kb/zoho-sprints/dashboards-and-reports/reports/sprint-reports/articles/sprint-burndown-chart ; https://www.zoho.com/analytics/zoho-projects-advanced-analytics.html ; https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/analytics-for-projects

---

### 9.9 Custom Dashboards (widgets / KPIs)

Build **personal, project, and team** dashboards by grouping widgets.

**Three widget types:**

| Widget type | Purpose |
|---|---|
| **Charts** | Visual chart widgets |
| **Numbers (KPI)** | Single-metric KPI tiles |
| **Embed URL** | Embed an external URL |

**Dashboard behaviors:** widgets can be edited, cloned, deleted, resized; background themes; share with **Full Access / Editor / Viewer**; export dashboard to PDF.

**Dashboard entity fields:** title, level (personal/project/team), background theme, access level, widgets[].
**Widget entity fields:** widget type (Chart / Number-KPI / Embed URL), title, data source/metric, size, position (resizable), prebuilt widget name.

**Plan availability:** documented as available in Zoho Projects with **no specific plan restriction stated** in the source (i.e., the docs do not pin custom dashboards to a tier — treat tier as unconfirmed rather than "free in all plans").

Sources: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/dashboard-projects ; https://www.zoho.com/projects/charts-and-reports.html

---

### 9.10 Prebuilt dashboard widgets

Out-of-box widgets available for dashboards:

| Widget | What it shows |
|---|---|
| Task Status | Open vs closed tasks |
| Issue Status | Issue status breakdown |
| Phase Status | Phase/milestone status |
| Team Status | Overdue / open per member |
| Top 5 Go-getters | Members by closed tasks |
| Top 5 Issue Fixers | Members by issues fixed |
| Task Progress Chart | Task progress |
| Weekly Digest | Weekly summary |
| Timesheet Summary | Billable / non-billable hours |
| Budget Status | Planned vs actual budget |
| Today's Work Items | Items due today |
| Overdue Work Items | Overdue items |
| Upcoming Events | Upcoming events |

Source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/dashboard-projects

---

### 9.11 Timesheet reports

Time-log entries can be visualized/analyzed and billable amounts calculated. In the native product this is surfaced primarily through the **Timesheet Summary** dashboard widget (billable/non-billable hours); richer timesheet reporting lives in the Zoho Analytics add-on.

Sources: https://www.zoho.com/projects/project-reports.html ; https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/dashboard-projects

---

### 9.12 Zoho Analytics — Advanced Analytics add-on

A connector that auto-syncs Zoho Projects data into a Zoho Analytics workspace and auto-builds reports.

**Capabilities:**
- Auto-creates **50+ prebuilt reports & dashboards**: target vs completed tasks, delayed tasks/milestones by owner, **burndown**, project ROI, revenue projection, top/bottom 5 project members, billing.
- Drag-drop report builder, **SQL querying**, look-up columns (relational), **data blending** with external sources (Excel, CRM, Google Ads), **Zia AI** assistant, report scheduling/email, embedding.
- Setup: **Marketplace > Zoho Apps > Zoho Analytics**.
- **Only one reporting workspace per portal.**
- Gauge-style KPI widgets (Dial chart, Full Dial, Speedometer) are available in Analytics dashboards built from Projects data (confidence: medium — source: https://www.zoho.com/analytics/help/dashboard/kpi-widgets.html).

**Tier gating:**
- The **Reports tab** (Analytics integration) is enabled only in Zoho Projects **Premium & Enterprise**.
- The connector works on **all paid Zoho Analytics plans**.

**Synced entity tables** (~14–18 tables; custom fields and custom task statuses included):

| Synced tables |
|---|
| Projects · Milestones · Tasks · Task Work Hours Planned · Task Bug Mapping · Issues/Bugs · Timesheet · Users · Project Users · Teams · Tags · Invoices · Project Groups · Client Company · Client Projects · Baseline · Tasks on Baseline · Milestones on Baseline |

**Sync frequency (confidence: medium — sources disagree on exact tiers):**
- The Projects help page states every **3, 6, 12, and 24 hrs**.
- The Analytics connector help lists **1 Hour** (Enterprise), **3/6/12 Hours** (Standard+), **Daily** (Basic+), plus up to **5 manual syncs** between intervals.
- Exact tiers vary by the Zoho Analytics plan. Treat specific intervals as plan-dependent, not fixed.

Sources: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/analytics-for-projects ; https://www.zoho.com/analytics/zoho-projects-advanced-analytics.html ; https://www.zoho.com/analytics/help/connectors/zoho-projects.html ; https://www.zoho.com/projects/reports-integration.html

---

### 9.13 Export & output formats

| Report | Export |
|---|---|
| Native task/issue reports | PDF |
| Planned vs Actual (current view) | XLS |
| Workload Report | PDF (optional encryption) |
| Custom Dashboards | PDF |

Sources: https://help.zoho.com/portal/en/kb/projects/reports/project-level-reports/articles/project-level-task-reports ; https://help.zoho.com/portal/en/kb/projects/reports/planned-vs-actual/articles/planned-vs-actual-hours-for-tasks ; https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report

---

### 9.14 Tier-availability summary (reporting features)

| Feature | Free | Premium | Enterprise |
|---|---|---|---|
| Basic Task Reports (6 group-by) | Yes | Yes | Yes |
| Advanced Task Reports | No (paid only) | Yes | Yes |
| Issue/Bug Reports (Basic & Advanced) | No | Yes | Yes |
| Custom Reports (report maker) | No (paid only) | Yes | Yes |
| Planned vs Actual — Project scope | No | Yes | Yes |
| Planned vs Actual — Global scope | No | No | Yes |
| Workload Report — Project scope | No | Yes | Yes |
| Workload Report — Global scope | No | No | Yes |
| Gantt chart | No (paid only) | Yes | Yes |
| Critical Path | No | No | Yes |
| Baseline | No | No | Yes |
| Custom Dashboards | Not pinned to a tier in docs (unconfirmed) | — | — |
| Zoho Analytics Reports tab | No | Yes | Yes |
| Burndown/Burnup (via Analytics add-on) | No | Yes | Yes |

> Ultimate plan inherits Enterprise reporting features (cumulative tier model); the research data did not break out Ultimate separately for reporting, so it is omitted above rather than guessed.

---

### 9.15 Limitations & honest caveats (for the builder)

- **No native burndown/burnup.** Core Projects has none; requires Sprints or the Analytics add-on (see 9.8).
- **Shallow native customization.** Reviewers consistently note native report customization "could be more flexible," and teams routinely bolt on Zoho Analytics to build advanced reports and consolidate scattered data; onboarding/learning curve cited at ~2–3 weeks (sources: https://www.invensislearning.com/blog/zoho-projects-review/ ; https://www.g2.com/products/zoho-projects/reviews).
- **No dedicated risk-management analytics module** in native reporting (source: https://www.invensislearning.com/blog/zoho-projects-review/).
- **Mobile reporting is weaker than desktop** (source: https://www.invensislearning.com/blog/zoho-projects-review/).
- **Cross-project (global) rollups are Enterprise-gated** (global Planned vs Actual, global Workload, global Milestone Gantt) and are a recurring user request.
- **One Analytics workspace per portal** — a hard structural limit for the add-on.
- **Analytics sync is not real-time** — minimum interval is 1 hour (Enterprise Analytics), with only up to 5 manual syncs between scheduled runs.

**Sources that could not be verified at research time** (gaps the builder should re-check): the G2 reviews page returned HTTP 403 (bot-blocked) and was summarized via search rather than read directly; acutedata.com refused connection; the global Milestone Gantt help article returned HTTP 404 (moved); Reddit returned no indexed results for Zoho Projects reporting limitations.
## 10. Collaboration, Feeds, Documents & Pages

Zoho Projects spreads collaboration across six surfaces: the **Feed** (a social-style aggregated stream), **Forums** (threaded topic discussions), **Pages** (a per-project wiki backed by Zoho Wiki), **Documents** (a WorkDrive-backed file store), real-time **Chat Rooms** plus a deeper **Zoho Cliq** integration, and **@mentions/comments** threaded across work items. Layered on top is a three-channel **notification** system (email, in-app feed, mobile push) plus an **automation** layer (email templates, email alerts, SLA escalations).

This section documents each surface concretely. Field-level detail is strongest for Forums and Documents (both have published REST API models). Several notification mechanics — exact frequency enum values, the full per-event catalog of what fires feed vs. push vs. email, and digest send-times — are **not documented publicly** and are flagged as low confidence; a cloner would need to reverse-engineer them from a live account.

---

### 10.1 Feed (Activity Stream)

The Feed is a social-media-style stream giving a bird's-eye view of a project, surfacing **Status posts, Announcements, Forums activity, Documents activity, and the Activity Stream**. It can be filtered **by month** and **by category** (announcements, status, forums, activity stream, documents). (source: https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/feeds) (source: https://www.zoho.com.cn/projects/help/latest-activities.html)

**Available on all plans, including Free.**

#### In-feed actions

From the feed a user can post a status, add a task, upload an image, file an issue, and comment/discuss inline. Work-item status can be changed directly in the feed: via the **down-arrow** on a task feed item you can **complete or reopen a task, set priority, and change progress percentage**. (source: https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/add-status-to-feed) (source: https://www.zoho.com.cn/projects/help/latest-activities.html)

The **Unfollow** option in the feed is shown **only for Documents and Forums updates**; unfollowing stops those post notifications in your timeline. (source: https://www.zoho.com.cn/projects/help/latest-activities.html)

#### Status updates

A free-text status message posted into the feed. (source: https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/add-status-to-feed)

| Aspect | Behavior |
|---|---|
| Mention users | Type `@` then a name to mention/notify users |
| Tag work items | Type `#` plus first characters of a task/issue name to tag it |
| Scope | Select a specific project, or "All Projects" |
| Submit | Click Submit to post |
| Visibility (specific project) | Visible only to that project's members |
| Visibility ("All Projects") | Visible to **everyone in the portal, including client users on other projects** |

Status Update (feed post) data model fields: `message/content`, `@mentions (users)`, `#tags (tasks/issues)`, `project scope (specific project | All Projects)`, `posted_by`.

#### Activity Stream

A chronological log of changes so you can see who is doing what. It logs updates to **tasks, bugs/issues, milestones, forums and documents**, plus **status changes and backlog additions**. Per other Zoho docs the Feed/Activity Stream is populated by activity across Tasks, Task Lists, Milestones, Forums, and Projects (and per secondary docs bugs/issues, documents, status, announcements). (source: https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/feeds) (source: https://www.zoho.com.cn/projects/help/latest-activities.html)

**Limitation:** the Activity Stream does **not capture task comments** — a long-standing community request confirms this gap. Some users also want the Activity Stream to be the default view instead of the Feed. (source: https://help.zoho.com/portal/en-gb/community/topic/projects-activity-stream-needs-to-include-task-comments)

---

### 10.2 Comments & @mentions

Comments can be posted on **tasks, issues, pages, forum posts and status updates**. You can **@mention users or teams** to notify them, reply to specific comments (threaded), and add **attachments in replies**. Comments support starting an inline discussion on a work item. **Available on all plans.** (source: https://www.zoho.com/projects/team-collaboration.html) (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/manage-forums)

**Limitations (community-reported):** there are long-standing user requests for proper @mentions in comments, indicating the @mention experience is uneven across surfaces. (source: https://help.zoho.com/portal/en/community/topic/zoho-projects-needs-mentions) Separately, @mention is reported **not to work reliably** when surfaced via the Cliq room integration. (source: https://help.zoho.com/portal/en/community/topic/mention-does-not-work-via-zoho-projects)

---

### 10.3 Forums

Topic-based discussion boards, one set per project, for longer posts. **Available on all plans, including Free.** (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/manage-forums) (source: https://www.zoho.com/projects/help/rest-api/forums-api.html)

Capabilities:

- Create a forum topic (title + content).
- Organize topics into **Categories** (Add Category; edit/delete by hovering).
- Posts are either **question** type (answers can be marked **Best Answer**) or **normal**.
- Posts can be flagged **sticky** (pinned) or **announcement**, and **internal** (org only) or **external** (client-visible).
- Users comment, reply, edit/delete their own comments, and **follow/unfollow** for notifications.

Best-answer marking is exposed via API at `/comments/[COMMENTID]/markbestanswer` (POST to mark, DELETE to unmark). Follow/unfollow is `/forums/[FORUMID]/follow` and `/unfollow`. Categories are `/categories/` (create/list/delete). (source: https://www.zoho.com/projects/help/rest-api/forums-api.html)

#### Forum (post/topic) data model

A discussion topic posted within a project's Forums module. Belongs to a Project and a Category; has many Forum Comments and many followers. (source: https://www.zoho.com/projects/help/rest-api/forums-api.html)

| Field | Notes |
|---|---|
| `id` | |
| `name` | title |
| `content` | |
| `category_id` | |
| `type` | question \| normal |
| `flag` | internal \| external |
| `posted_by`, `posted_person` | |
| `is_sticky_post` | pinned flag |
| `is_announcement_post` | announcement flag |
| `comment_count` | |
| `post_date`, `post_date_long` | |
| `last_modified_date` | |
| `last_activity_date` | |
| `followers[]` | |
| `attachments[]` | each: `file_url`, `file_name`, `is_image`, `file_id` |
| `link` | link object |

#### Forum Comment data model

A reply/comment on a forum topic; supports two nesting levels and best-answer marking. May reference a parent comment via `parent_id`/`root_id` for threading. (source: https://www.zoho.com/projects/help/rest-api/forums-api.html)

| Field | Notes |
|---|---|
| `id` | |
| `content` | |
| `posted_by`, `posted_person` | |
| `type` | answer \| question \| normal |
| `level` | 1 or 2 (max two nesting levels) |
| `parent_id`, `root_id` | threading references |
| `is_best_answer` | |
| `post_date`, `post_date_long` | |
| `attachments[]` | |

#### Forum Category data model

Grouping for forum topics to aid navigation. Has many Forums; belongs to a Project. Fields: `id`, `name`. (source: https://www.zoho.com/projects/help/rest-api/forums-api.html)

> Note: the dedicated Forums KB page (`.../collaboration/forums-1`) returned HTTP 404 during research; this subsection draws on the `manage-forums` KB article and the Forums REST API instead.

---

### 10.4 Pages (project wiki)

A collaborative knowledge repository per project, **backed by Zoho Wiki**. (source: https://help.zoho.com/portal/en/kb/projects/collaboration/pages/articles/pages) (source: https://www.zoho.com/projects/project-pages.html)

Capabilities:

- Create a page (name + page type + location: root level or under a parent page).
- Add sub-pages via **Page Options > Add Sub Page**.
- **Import** from desktop or from Google Docs.
- Hierarchical parent/child structure shown in a **Site Map** (expand/collapse) at bottom-right.
- Editor includes **widgets**.
- Pages support **comments and attachments** (including Google Docs).
- **Default permission: all portal users have permission for all operations in Pages** (a broad, permissive default a cloner should note).

**Version history:** Pages are backed by Zoho Wiki, which provides page version history and the ability to **revert to previous page states**. (confidence: medium — inferred from Zoho Wiki's documented capabilities rather than an explicit Projects KB statement) (source: https://research.com/software/reviews/zoho-wiki) (source: https://www.zoho.com/wiki/features.html)

**Tier availability:** Pages are described as a paid-plan feature (not listed in the Free plan), but this should be verified against a live account — the source data marks the Free-plan exclusion as unconfirmed.

#### Page (wiki) data model

Belongs to a Project; has a parent page and many sub-pages (hierarchy shown in Site Map). Fields: `name (title)`, `page type`, `location (root | parent page)`, `parent page`, `content (rich, widgets)`, `comments[]`, `attachments[]`, `version history (via Zoho Wiki)`. (source: https://help.zoho.com/portal/en/kb/projects/collaboration/pages/articles/pages) (source: https://www.zoho.com/wiki/features.html)

---

### 10.5 Documents

A per-project document store with **multilevel folders/subfolders**, powered by Zoho WorkDrive (see 10.6). Create a folder via **New > Folder**. (source: https://help.zoho.com/portal/en/kb/projects/collaboration/documents-1/articles/manage-folders) (source: https://www.zoho.com/projects/document-management.html)

**Available on all plans** (capabilities scale with the underlying WorkDrive plan).

| Setting | Options |
|---|---|
| Views | Thumbnail, List, Compact |
| Sort by | Name, Last Modified, Time Created |
| Filter by type | All, Folders, Documents, Spreadsheets, Presentations, PDF, Images, Audio, Videos |

#### Right-click / context actions

Open, Properties, Share with members, Share to Support, New embed code, New download link, Download as ZIP, Add to Favorites, Label As, Copy To, Move To, Rename, Move to Trash. (source: https://help.zoho.com/portal/en/kb/projects/collaboration/documents-1/articles/manage-folders)

Bulk actions: copy links, download, and a "more" menu. The **Manage panel** exposes: Team Folder Details, Members, Settings, Trash, Shared Items.

#### File versioning

An inbuilt version system tracks **every change** to a document with **notes, dates and author**; users always access the latest version and can **revert to a previous version**. Revision tracking is automated. (source: https://www.zoho.com/projects/document-management.html)

#### Tags & classification

Files and folders can be **tagged** to classify and segregate content; tags are configured at portal level. Subfolders are also used to classify by business requirement. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/tags-projects)

#### Sharing & access control

Grant **view, edit, delete, or share** permissions per file/folder. **Share with members** or **Share to Support**. Generate **embed codes** and **download links**. File **encryption and password protection** are available, and **every document visit is recorded for audit logs**. (source: https://www.zoho.com/projects/document-management.html) (source: https://www.zoho.com/workdrive/project-integration.html)

#### Document / Folder data model

A file or folder resource (WorkDrive-backed). Folder has many child folders/files (`parent_folder_id`); belongs to a Project; can be associated to multiple tasks/issues; has version history. Folders listed via `GET /restapi/portal/[PORTALID]/projects/[PROJECTID]/folders/`. (source: https://www.zoho.com/projects/help/rest-api/documents-api.html)

| Field | Notes |
|---|---|
| `res_id` | id |
| `res_name` | name |
| `parent_folder_id` | |
| `is_folder` | |
| `res_type` | |
| `scope` | |
| `author_id`, `author_name` | |
| `is_res_shared` | with subfolder/children/opened indicators |
| `subfolder` | |
| `children[]` | |
| `opened` / `is_opened` | |

#### Inline Attachment data model

A file attached inline to a module (comment, feed, task). Stored in WorkDrive. Added via `POST /restapi/portal/[PORTALID]/inline-attachments`, returning `content_type`, `name`, `id`, `url`, `scope`. (confidence: medium for the inline-attachment endpoint specifics) Document objects additionally expose `res_size` and `download_url`. (source: https://www.zoho.com/projects/help/rest-api/documents-api.html)

---

### 10.6 Zoho WorkDrive integration

The Documents module is **powered by Zoho WorkDrive**, which **replaced the older Zoho Docs backend**. (source: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/zoho-workdrive-integration) (source: https://www.zoho.com/blog/projects/launching-document-management-for-zoho-projects-powered-by-zoho-docs.html)

- **Enablement:** Portal Owner enables via **Setup > Marketplace > Zoho apps > Update** for WorkDrive. New portals are integrated automatically; existing portals must **migrate from Docs**.
- **Team folder per project:** enabling auto-creates a **team folder for every new project** (toggle).
- **Permission inheritance:** files attached to a task **inherit task permissions** ("Provide the permission to members who have access to the task"). WorkDrive supports task-level, issue-level and feed-level file sharing.
- **Roles:** WorkDrive inherits Projects roles; the Portal Owner **maps profiles to WorkDrive roles** — **Admin / Organizer / Editor / Viewer**.
- **Inline office suite:** brings inline **Zoho Writer, Sheet and Show**; upload files/folders, import from cloud, add code snippets, capture recordings.
- **No duplication:** the same file can be associated to multiple tasks/issues **without creating duplicate copies**.
- **Tier:** available on all plans (may require WorkDrive Free Essential or an upgrade).

(source: https://www.zoho.com/workdrive/project-integration.html) (source: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/zoho-workdrive-integration)

---

### 10.7 Chat Rooms & Zoho Cliq integration

#### Built-in Chat Rooms

Create **personal or group chat rooms** inside Projects for real-time conversation and decision-making. (confidence: medium) Tier availability is described as paid-plan but is marked "verify." (source: https://www.zoho.com/projects/team-collaboration.html)

#### Zoho Cliq integration (deeper)

Requires Zoho Cliq. (source: https://www.zoho.com/cliq/projects-integration.html) (source: https://www.zoho.com/blog/cliq/introducing-zoho-cliqs-new-integration-with-zoho-projects.html)

- **Sync a Cliq channel with a specific project**, and configure notifications so task/issue notifications flow into the channel (turning Cliq into a project activity feed).
- **Auto-create** a corresponding Cliq channel when a new project is created.
- **Convert Cliq messages into tasks/issues** (set assignee, due date, priority).
- **Manage tasks across projects** from a **Projects tab in Cliq** (List / Kanban / Gantt views).
- **Projects Bot** delivers custom deadline notifications; **weekly task/issue reports** are posted to the channel.

**Limitation:** @mention is reported not to work reliably when used via the Cliq room integration (see 10.2). (source: https://help.zoho.com/portal/en/community/topic/mention-does-not-work-via-zoho-projects)

---

### 10.8 Notifications

Zoho Projects exposes **three notification channels**: **email**, **in-app Feed/Notifications**, and **mobile push**. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/personal-preferences/articles/feed-notifications) (source: https://help.zoho.com/portal/en/kb/projects/zoho-projects-mobile-app/iphone/notifications/articles/notif) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/email-notifications-20-3-2023)

#### Email notifications — two-tier model

Email notifications are configured at **two layers**, implying a default + override preference model:

1. **Portal-level defaults** — Settings > Portal Configuration > Email Notifications. Two tabs (**Portal Users**, **Client Users**) set defaults, plus an **Email Exclusion** tab. Changes auto-save. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/email-notifications-20-3-2023)
2. **Per-user preferences** — Setup > Personal Preferences > Notifications. The user toggles the same categories for their own email; enabling a category means consenting to receive emails for it. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/personal-preferences/articles/notifications-projects)

Both layers share **three toggle categories** plus blanket controls:

| Category | Covers |
|---|---|
| Task Notifications | task events |
| Milestone Notifications | milestone events |
| Other Notifications | time logs, forum messages, document uploads |
| "Notify me for all my activities" | blanket option |
| "Set email frequency" | instant vs. summary/digest delivery |

> **Limitation / low confidence:** the exact **enumerated frequency values** for the "Set email frequency"/summary control, and the Weekly Digest send-time/day, are **not stated verbatim** in the public KB and would need verification against a live account.

**Email Exclusion list:** a tab under portal Email Notifications that lets an admin exclude **individual users/clients** from receiving email notifications, or use a **master toggle to exclude all users**. This overrides both portal defaults and user preferences to suppress email. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/email-notifications-20-3-2023)

#### Feed notifications (in-app)

Configured per-project under **Personal Preferences > Notifications > Feed Notifications**. Per-project **toggle switches** control which projects generate in-app feed notifications. **Disabling a project's notifications still allows manually viewing that project's feed** via the Feed tab. Examples of generators: issue/task assignment, team progress updates. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/personal-preferences/articles/feed-notifications)

> Note: the Feed Notifications KB page, when fetched, exposed only the **project-level** toggle — it did **not** expose granular per-category toggle details.

#### Mobile push notifications

**Mobile app only; Premium and Enterprise editions only.** Enabled in the mobile app under **Settings > Privacy & Security > Push Notifications**. (source: https://help.zoho.com/portal/en/kb/projects/zoho-projects-mobile-app/iphone/notifications/articles/notif)

- All notifications received in the **web app are also delivered to the mobile app**.
- Push notification preferences **cannot be customized from the mobile app** — only via the web.
- The mobile **Notifications tab** supports filters **Unread, Flagged, @mention**, a **"Mark all as read"** action, and an **unread badge count**.
- iOS delivery is via Apple servers.

> **Limitation / low confidence:** the **full per-event catalog** of which exact events fire push vs. feed vs. email is **not enumerated** in public docs; push is described only as a **mirror of all web-app notifications**.

---

### 10.9 Reminders

#### Activity Reminder (scheduled digest)

Setup > Personal Preferences > Notifications > **Activity Reminder**. Sends customizable **email** reminders for activities that are **Pending, Overdue, or Unassigned**, on a specified frequency. (source: https://help.zoho.com/portal/en/community/topic/tip-40-activity-reminder-in-zoho-projects) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/personal-preferences/articles/notifications-projects)

Some secondary sources describe **Daily/Weekly/Monthly** frequency with a customizable **trigger time**, but the official KB excerpt does **not enumerate exact options** (confidence: medium on the specific Daily/Weekly/Monthly + trigger-time enum).

Data model (`ActivityReminder`): `userId`, `reminderType (Pending | Overdue | Unassigned)`, `frequency`, `triggerTime (per secondary docs)`.

#### Task Reminders

Set **per task** via the Reminder field. (source: https://help.zoho.com/portal/en/kb/projects/tasks/task-operations/articles/task-reminders)

| Mode | Options |
|---|---|
| Due-date-based | daily until due date, on the due date, or N days before due date |
| Specific date | a chosen calendar date |

A **"Notify Users"** field selects **Users or Teams** to receive the reminder. Delivery is **email**.

Data model (`TaskReminder`): `taskId`, `mode (dueDateBased | specificDate)`, `dueDateOption (dailyUntilDue | onDueDate | nDaysBefore)`, `daysBefore`, `specificDate`, `notifyUsers (users/teams)`.

---

### 10.10 Automation: Email Templates, Email Alerts & SLA escalations

#### Email Templates

Automation > **Email Templates**. Create templates with **Layout Name, Name, Subject**. Supports **placeholders/merge fields** for task, milestone, and project data (e.g., Task Name, Task Status, Milestone Name, Project Name), **including custom fields**, in **both subject and body**. Editable and deletable. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/project-automation/articles/email-alerts-templates-for-projects)

#### Email Alerts (workflow action)

An automation email alert **selects a template** and **recipients** (user roles, project/client users, or explicit mail IDs; multiple recipients allowed). It **fires automatically when the conditions of an associated workflow rule are met**. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/project-automation/articles/email-alerts-templates-for-projects)

#### SLA escalations (Issue Tracker)

Issue Tracker SLA supports **up to four escalation levels** when a ticket exceeds target time. Target times use **Calendar or Business hours** with **Resolve Before / Close Before** parameters. Each level **selects an existing or new Email Template** and notifies **assignee, project owner, selected members, or User PickList users**. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/sla)

Escalations also appear in **Feeds and the Notifications tab** (in addition to email) and are **color-coded** in list and detail views.

Data model (`SLAEscalation`): `level (up to 4)`, `targetTimeBasis (Calendar | Business hours)`, `condition (Resolve Before | Close Before)`, `templateId`, `recipients (assignee | project owner | selected members | user picklist)`.

---

### 10.11 Notification data model (for cloners)

A minimal cloner needs the following entities (source: notification KB articles cited above):

| Entity | Key fields | Notes |
|---|---|---|
| `EmailNotificationDefault` (portal) | `audience (Portal Users \| Client Users)`, `taskNotifications`, `milestoneNotifications`, `otherNotifications`, `notifyAllActivities`, `emailFrequency` | Admin-set defaults per audience |
| `NotificationPreference` (user) | `userId`, `taskNotifications`, `milestoneNotifications`, `otherNotifications`, `notifyAllMyActivities`, `emailFrequency` | Overrides/inherits portal defaults |
| `EmailExclusion` | `excludedUserIds`, `excludeAll (toggle)` | Suppresses email; overrides both above |
| `FeedNotificationPreference` | `userId`, `projectId`, `enabled (toggle)` | Per User × Project; independent of email |
| `ActivityReminder` | `userId`, `reminderType`, `frequency`, `triggerTime` | Scheduled digest |
| `TaskReminder` | `taskId`, `mode`, `dueDateOption`, `daysBefore`, `specificDate`, `notifyUsers` | Per-task |
| `EmailTemplate` | `layoutName`, `name`, `subject`, `body` (both support merge fields) | Referenced by alerts/SLA |
| `EmailAlert` | `alertName`, `templateId`, `recipients` | Triggered by a workflow rule |
| `SLAEscalation` | `level`, `targetTimeBasis`, `condition`, `templateId`, `recipients` | Also posts to Feed + Notifications |

Beyond these, a cloner needs a **NotificationEvent catalog** and a **Channel dimension** (email/feed/push). The exact event-to-channel mapping is undocumented (see limitations above).

---

### 10.12 Tier availability summary

| Surface / feature | Free | Notes |
|---|---|---|
| Feed / Activity Stream | Yes | All plans |
| Status updates, Comments & @mentions | Yes | All plans |
| Forums | Yes | All plans incl. Free |
| Pages (wiki) | Likely No | Described as paid; Free exclusion "verify" |
| Documents module | Yes | Capabilities scale with WorkDrive plan |
| File versioning, Tags, Sharing | Yes | All plans |
| WorkDrive integration | Yes | May need WorkDrive Free Essential or upgrade |
| Chat Rooms (built-in) | "Verify" | Described as paid-plan |
| Zoho Cliq integration | — | Requires Zoho Cliq |
| Email / Feed notifications | Not specified | Sources do not state a tier floor |
| Mobile push notifications | No | **Premium and Enterprise editions only** |
| Email Templates / Alerts / SLA | — | Tier not stated in collaboration sources |

The Free plan is reported to include **project feeds, forum discussions, basic document sharing, built-in chat, and a built-in whiteboard** (confidence: medium). (source: https://thedigitalprojectmanager.com/tools/zoho-projects-review/) (source: https://www.zoho.com/projects/features.html)

---

### 10.13 Limitations & community-reported weaknesses

Do not over-sell this area. Verified weaknesses:

- **Permissions are complex and somewhat leaky.** Reviewers report that members may still **view other users' tasks, comments, client details and conversations** despite restricted edit permissions; permission settings are described as complex. (confidence: medium) (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/)
- **Some collaboration/document-collaboration features require other paid Zoho products** rather than being fully self-contained in Projects (e.g., forms, deeper document collaboration). (confidence: medium) (source: https://thedigitalprojectmanager.com/tools/zoho-projects-review/)
- **Activity Stream omits task comments** (long-standing, unresolved community request). (source: https://help.zoho.com/portal/en-gb/community/topic/projects-activity-stream-needs-to-include-task-comments)
- **@mentions are uneven** — long-standing requests for proper comment @mentions, and @mention reported broken via the Cliq integration. (source: https://help.zoho.com/portal/en/community/topic/zoho-projects-needs-mentions) (source: https://help.zoho.com/portal/en/community/topic/mention-does-not-work-via-zoho-projects)
- **Steep learning curve, limited customization in lower plans, occasional performance issues, and mobile notification sync lag** are recurring cons across aggregator reviews (~4.3/5 G2, ~4.5/5 Capterra). (confidence: medium) (source: https://www.g2.com/products/zoho-projects/reviews) (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/)
- **Notification overload / reminder granularity** is a recurring pain point — multiple community threads request scheduled reminder/digest emails (Daily User Activity Reminder, Overdue Task reminders, etc.). (source: https://help.zoho.com/portal/en/community/topic/daily-user-activity-reminder-email-report)

#### Research gaps (not documented publicly)

- The dedicated Forums KB page returned HTTP 404; Forums detail relies on the manage-forums article + REST API.
- The Feed Notifications KB page exposed only the **project-level** toggle, not per-category feed toggles.
- Exact **email "Set email frequency"/digest enum values** and **digest send-time/day** are not stated in public KB.
- The **full per-event catalog** of which events fire feed vs. push vs. email is not enumerated; push is described only as a mirror of all web notifications.
- Per-review verified text (Capterra/G2) is partly auth/anti-bot gated; only aggregated summaries were obtained.
## 11. Resource & Workload Management

Zoho Projects' resource and workload management is built around a single primary surface — the **Workload Report** (formerly the **Resource Utilization Chart**) — supported by capacity inputs from **Business Hours** profiles, **Holiday Lists**, and **user leave synced from Zoho People**. The model is deliberately per-project: it visualizes each user's allocated work against their available business-hour capacity and flags over- or under-allocation, but it does not natively aggregate capacity across a user's simultaneous projects. This section documents the exact features, fields, behaviors, plan gating, and known limitations a builder must replicate.

> Naming note: Zoho renamed "Resource Utilization Chart" to "Workload Report." This is confirmed by Zoho's own community announcement titled "Resource Utilisation is now Workload Report" (source: https://help.zoho.com/portal/en/community/topic/resource-utilisation-is-now-workload-report) and the current help doc (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report). Some older marketing URLs still use the `resource-utilization-chart` / `resource-utilization-software` slugs.

### 11.1 The Workload Report (core surface)

The Workload Report shows how much work is allocated to each user versus their available business hours, with color-coded allocation status, so managers can identify who is free, occupied, or overloaded without manually summing hours (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report; https://www.zoho.com/projects/resource-utilization-chart.html).

Capacity itself is **not configured inside the report**. It is derived from the user's Business Hours profile (working hours/day) and the assigned Holiday List, with leave dates pulled from Zoho People (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/business-hours/articles/business-hour-settings).

**Plan gating (Workload Report):**

| Scope | Availability |
|---|---|
| Per-project Workload Report | Premium and Enterprise |
| Global / cross-portal Workload Report | Enterprise only |

(source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report)

The Free plan does not include the Workload Report.

### 11.2 Allocation states

The report classifies each user (over a selected time grain) into one of four allocation states, shown via color-coded visuals:

| State | Meaning |
|---|---|
| Unallocated | No work assigned in the period |
| Under-allocated | Work assigned but below available business hours (spare capacity) |
| Optimally allocated | Work roughly matches available business hours |
| Over-allocated | Assigned work hours exceed available business hours |

**Limitation / confidence caveat:** Zoho's official help doc primarily frames this as "within business hours" (bar not full = spare time) versus "over-allocated" (work hours exceed available business hours). The discrete four-state vocabulary and specific colors (secondary sources report **Red = over-allocated, Green = optimally allocated, Grey = not allocated**) come from secondary/marketing sources, not the primary KB. Treat the exact color mapping as medium-confidence (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report; https://www.zoho.com/projects/resource-utilization-software.html).

### 11.3 Visualizations

Three visualization modes are available within the report (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report; https://www.zoho.com/projects/resource-utilization-software.html):

| View | Behavior |
|---|---|
| Bar view | Horizontal bars per user showing how fully their schedule is occupied vs. available business hours. A full bar over a date range = no spare time; a partial bar = available capacity. Bars can be slid across dates to reschedule and dragged between users to reassign. |
| Heatmap view | Visualizes disconnected/fragmented schedules using heat-colored intensity (instead of discrete bars) to show how occupied a person is relative to available business hours. |
| Timeline view | Shows all of a user's tasks as a timeline against their name; individual tasks can be expanded to view allocations. |

### 11.4 Time granularity

The allocation schedule can be viewed by **Days, Weeks, or Months** (via calendar selection) or by a **custom date range** (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report; https://www.zoho.com/projects/resource-utilization-chart.html).

> **Critical builder constraint:** Schedule modifications (rescheduling tasks, changing task dates) can **only** be made in the **Days view**. Weeks/Months/custom views are read-only with respect to dragging tasks across dates (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report).

### 11.5 Inline editing (drag-and-drop)

Directly from the chart, a manager can (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report; https://www.zoho.com/projects/resource-utilization-chart.html):

| Action | How | Constraint |
|---|---|---|
| Reassign a task to another user | Drag the task bar from one user's row to another's | Requires the report to be **grouped by Task Owner** |
| Reschedule a task | Slide the task bar across dates | **Days view only** |
| Change a task's end date | Drag the task bar's arrow handle | **Days view only** (date editing) |
| Edit work hours | Edit the work hours on the allocation | — |
| Create / assign a new task | Use the `+` icon | — |

### 11.6 Grouping & labeling options

**Grouping dimensions** (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report):

| Group by | Notes |
|---|---|
| Task Owner | Required for drag-and-drop reassignment |
| Associated Teams | — |
| Profiles | — |
| Roles | — |

**Label / legend options** — bars can display one of (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report):

- Allocated hours
- Allocation percentage
- Available hours
- Availability percentage
- No legend (hides numeric display)

The report can also be **exported to PDF, with optional encryption** (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report).

### 11.7 Capacity inputs

Capacity is computed from three configuration sources, none of which live inside the report itself.

#### 11.7.1 Business Hours profile

A named profile defining working time, used both to compute workload-report capacity and to schedule task dates. Configured under **Portal Configuration > Business Calendar > Business Hours tab > New Business Hours**. Also reusable in project and task templates (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/business-hours/articles/business-hour-settings; https://www.zoho.com/blog/projects/organize-your-work-better.html).

| Field | Description |
|---|---|
| Name | Profile name |
| Working days | Per-day enable/disable |
| Start time / End time per day | Set by dragging timeline endpoints |
| Break periods | Per day |
| Weekend days | Designated non-working days |
| Holiday List | Assigned holiday list (see 11.7.2) |
| Skip Weekends | **Enterprise only** |

**Plan gating:**

| Feature | Availability |
|---|---|
| Business Hours profiles | Premium and Enterprise |
| Skip Weekends | Enterprise only |

(source: https://www.zoho.com/blog/projects/organize-your-work-better.html)

**Date-calculation behavior:** When a task **duration** is set, due dates are auto-calculated *excluding* weekends and holidays per the Business Hours settings. However, **manually selected start/due dates are always treated as working days regardless of weekend/holiday status** — Zoho will not block you from manually placing a task on a weekend or holiday (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/business-hours/articles/business-hour-settings).

#### 11.7.2 Holiday List / Holiday

Portal-level (not per-user) holidays configured under **Portal Configuration > Date & Time Settings > Holidays tab** (Enter holiday details > Add Holiday) (source: https://help.zoho.com/portal/en/kb/projects/faqs/settings/articles/can-i-add-vacations-and-holidays-in-the-project-business-hours; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/date-time-settings).

| Field | Description |
|---|---|
| Holiday name / details | Label for the holiday |
| Date | Calendar date |
| Parent Holiday List | The list the holiday belongs to |

Holidays and weekends are excluded when computing duration-based task due dates, and they reduce available capacity in the workload report. Because holidays are **portal-level**, they apply uniformly and are not a mechanism for modeling individual time-off — that comes from Zoho People (11.7.3).

#### 11.7.3 User leave (via Zoho People integration)

Individual user time-off is **not** configured in Zoho Projects directly; sanctioned/approved leaves sync from **Zoho People** (source: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/people-integration; https://www.zoho.com/projects/workload-management.html).

Behavior:
- In the Workload Report, hovering over a date shows an **on-leave icon** for users who are off.
- Sanctioned leaves also appear **on the calendar when assigning a new task**, so a manager can distribute work around them.
- Leave units: **days-based** (full / half / quarter day) or **hours-based** (date + time).
- Leave requests/approvals flow through the **Calendar module, User Profile, Activity Stream, and the My Approvals widget**.

| Field | Description |
|---|---|
| User | The person on leave |
| Leave date(s) | Dates off |
| Leave unit | Days-based (full/half/quarter day) or hours-based (date + time) |
| Approval status | Approved / Rejected (only sanctioned leaves surface) |

**Plan gating:** Premium and Enterprise.

### 11.8 Data model summary

**Workload Report record** (computed per user, per date range) — logical aggregation, not a stored entity (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report):

| Field |
|---|
| User / Task Owner |
| Allocated hours |
| Allocation percentage |
| Available hours |
| Availability percentage |
| Allocation status (unallocated / under-allocated / optimally allocated / over-allocated) |
| Time grain (Days / Weeks / Months / custom range) |
| Grouping dimension (Task Owner / Associated Team / Profile / Role) |
| On-leave indicator (per date) |

It aggregates **Tasks** assigned to a user; capacity is derived from that user's **Business Hours profile** and **Holiday List**; leave dates come from **Zoho People**.

**Task (allocation unit)** — the work item that produces allocation hours; rendered as a draggable bar per owner (source: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report):

| Field |
|---|
| Task owner(s) |
| Start date |
| Due / End date |
| Duration |
| Work hours |
| Project |
| Milestone (Phase) / Task list |

A task's hours spread across its date span drive the owner's allocation. It is editable inline (reschedule, reassign, change end date, edit work hours).

### 11.9 Limitations & known gaps

These are concrete constraints a builder/cloner should not gloss over:

1. **No native cross-project / portfolio capacity view.** The workload view is fundamentally scoped per project. A view showing each member's *total* allocated hours across ALL active projects in one timeline is a documented, frequently-requested gap — users compare this unfavorably to Monday.com and Smartsheet, and note that per-project scoping can hide over-allocation across simultaneous projects. The Enterprise "Global Workload Report" is the closest official answer, but community feedback indicates it does not fully satisfy this portfolio-capacity need. (Medium confidence; source: https://help.zoho.com/portal/en/community/topic/cross-project-resource-capacity-planning-view-for-all-users)

2. **Leave does not auto-redistribute allocated hours.** Recording sick leave (or any leave) in Zoho People does **not** automatically recalculate or redistribute already-allocated task hours across remaining working days. Managers must **manually rebalance** after leave is recorded. (Medium confidence — based on a community report from a user "Sarah"; source: https://help.zoho.com/portal/en/community/topic/zoho-projects-resource-allocation-sick-leave)

3. **Schedule edits are Days-view-only.** As noted in 11.4, you cannot reschedule by dragging in Weeks/Months/custom views.

4. **Reassignment requires Task Owner grouping.** Drag-and-drop reassignment is unavailable under the other grouping dimensions (Teams/Profiles/Roles).

5. **Work-hour-to-day conversion edge cases.** A community report (user "Johan") describes full-time tasks (8h/day, 5 days/week) displaying correctly in task view but appearing as **24h/day in the resource allocation view**, producing false over-allocation. This suggests the engine can mis-spread duration across the chart in certain configurations — a risk area for any reimplementation of the hours-spreading logic. (Source: https://help.zoho.com/portal/en/community/topic/hours-in-resource-allocation)

6. **Holidays are portal-wide, not per-user.** Individual non-working days must be modeled through Zoho People leave, not the Holiday List.

7. **General reporting critique.** Aggregated reviews put Zoho Projects around 4.3/5 on G2 and ~4.5/5 on Capterra; recurring criticisms are limited reporting customization for advanced needs and a steep learning curve / feature overload. This is relevant context for workload reporting flexibility expectations. (Medium confidence; source: https://www.g2.com/products/zoho-projects/reviews; https://www.invensislearning.com/blog/zoho-projects-review/)

### 11.10 Plan-gating quick reference

| Capability | Free | Premium | Enterprise |
|---|---|---|---|
| Per-project Workload Report | — | Yes | Yes |
| Global (cross-portal) Workload Report | — | — | Yes |
| Business Hours profiles | — | Yes | Yes |
| Skip Weekends | — | — | Yes |
| Holiday List | — | Yes | Yes |
| User leave via Zoho People | — | Yes | Yes |

(Sources consolidated from: https://help.zoho.com/portal/en/kb/projects/reports/workload-report/articles/workload-report; https://www.zoho.com/blog/projects/organize-your-work-better.html)

> **Sourcing limitations:** Some allocation-color details and the four-state vocabulary rely on secondary/marketing pages rather than the primary KB. Two of the most consequential limitations (no auto-redistribution of leave; no true portfolio capacity view) are sourced from community forum threads, not official documentation, and are rated medium confidence. YouTube tutorials and gated G2 review threads could not be fetched and were not used for factual claims.
## 12. Roles, Permissions, Portals & User Types

This section documents how Zoho Projects governs access: the Portal container, the orthogonal Roles / Profiles / Permission Sets model, the two top-level user categories (Portal Users vs Client Users), the client-company and external-flag mechanics, and per-tier availability. Claims are cited inline so a builder can trace each one. Where the research is thin or unverified, that is called out explicitly rather than padded.

### 12.1 The access model at a glance

Zoho Projects governs access through **three orthogonal concepts**, all living inside a single **Portal** (the org/tenant):

| Concept | What it is | Scope | Notes |
|---|---|---|---|
| **Role** | The user's designation/position in the org (e.g. Manager) | Org level | Defaults: Administrator, Manager, Employee, Contractor. Mentionable in comments/statuses. |
| **Profile** | A named set of permissions controlling feature/module/field access | Org level, can vary per project | Defaults: Admin, Client, Employee, Contractor (+ system profiles). |
| **Permission Set** | The granular feature-, action-, and field-level controls inside a profile | Inside each profile | Split into Portal Level, Project Level, Module Level (+ Settings, Feature, Integration, Field). |

Key relational facts:

- A **Role** = the user's designation/position, set at org level; a **Profile** = the permission bundle controlling feature access, which can vary per project. Two users with the same role can hold different profiles. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-and-roles-projects) (source: https://www.zoho.com/blog/projects/roles-profiles-and-permissions-customize-and-control-user-privileges.html)
- A user is assigned **exactly one profile and one role at a time**, but a single profile or role can be assigned to many users. (high confidence) (source: https://www.zoho.com/blog/projects/roles-profiles-and-permissions-customize-and-control-user-privileges.html)
- **Project owners always retain full permissions** on their own projects regardless of profile; and users with Edit on Added/Owned/Both tasks can also edit unassigned tasks. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

### 12.2 The Portal (organization container)

The **Portal** is the top-level org/tenant container. All users, projects, profiles, roles, and settings live within a portal. Users are added at the portal level, then associated to specific projects (project-level membership). The API reflects this split: portal-scoped endpoints are `/portal/[PORTALID]/users/` and project-scoped are `/projects/[PROJECTID]/users/`. Available on all plans. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/manage-users-in-zoho-projects) (source: https://www.zoho.com/projects/help/rest-api/users-api.html)

A portal has **exactly one Portal Owner**, many Admins, many Users, and many Projects/Profiles/Roles.

### 12.3 Portal Owner vs Admin

There is a single **Portal Owner** sitting above admins, with exclusive rights. Admins share most operational permissions but cannot perform owner-only actions. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/portal-owner-and-admin-permissions-22-1-2024)

| Capability | Portal Owner | Admin |
|---|---|---|
| Manage Subscriptions (billing) | Yes (exclusive) | No |
| Change Portal Owner (transfer ownership) | Yes (exclusive) | No |
| Backup portal data | Yes (exclusive) | No |
| Delete Portal | Yes (exclusive) | No |
| Add admins | Yes (exclusive) | No |
| ZSC Key & API Access, Service Hooks | Yes (exclusive) | No |
| Slack Integration, Import from Basecamp | Yes (exclusive) | No |
| Audit Log | Yes (exclusive) | No |
| Global timer, tab management, deleting layouts/fields | Yes | Yes |
| Deleting others' comments, org settings, integrations | Yes | Yes |

All plans. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/portal-owner-and-admin-permissions-22-1-2024)

### 12.4 Two top-level user categories

Every account splits into two categories with different permission models: (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/manage-users-in-zoho-projects) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-users-projects)

- **Portal Users** — your internal team ("those who work for the projects in your team"). Can access modules flagged **both internal and external**.
- **Client Users** — external users your team works *for*. Can access **ONLY modules flagged external**: Tasks, Task Lists, Phases, Issues, Timesheets, Feed Status.

(source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-projects)

### 12.5 Roles

Four built-in **roles** (designations), all editable, set at org level: (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/roles-projects)

| Role | Editable | Notes |
|---|---|---|
| Administrator | Yes | Default |
| Manager | Yes | Default |
| Employee | Yes | Default |
| Contractor | Yes | Default |

- Roles can be **@mentioned** in statuses/comments.
- **Custom roles** are created via the Roles tab > Add Role and require the **Enterprise** plan. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-and-roles-projects)

Role entity fields (per API/docs): `role_id`, `role_name`, `editable` (boolean). One role per user; org-level (not project-specific). (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/roles-projects)

> API note: portal-scoped user roles include `admin`, `manager`, `employee`, `contractor`, `client`; project-scoped roles are limited to `manager`, `employee`, `contractor`. (source: https://www.zoho.com/projects/help/rest-api/users-api.html)

### 12.6 Profiles

Built-in and system profiles: (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-projects)

| Profile | Type | Editable | Cloneable | Deletable | Notes |
|---|---|---|---|---|---|
| Admin | Default | No | Yes | No | Full access |
| Client | Default | No | Yes | No | For external/client users |
| Employee | Default | Yes (renameable) | Yes | No | |
| Contractor | Default | Yes (renameable) | Yes | No | |
| Viewer | System | — | — | — | Read access to public projects |
| Read-Only User | System | — | — | — | Read access to all associated projects |
| Lite User | System | Configurable | — | — | **Ultimate plan**; configurable add/edit per module; can add Timelogs & Timesheets (medium confidence) |

- Default profiles cannot be deleted. Admin and Client cannot be edited but can be cloned; Employee and Contractor are editable and renameable. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-projects)
- **Custom profiles** are created via Settings > Manage Users > Profiles and Roles > Profiles > Add Profile and require the **Enterprise** plan. Standard profiles (except Admin and Client) are editable on all paid plans. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-and-roles-projects)

**What a profile configures:**
- **User (portal) profiles** configure: Modules, Portal settings, Settings, Integrations, and Field permissions.
- **Client profiles** configure only: Modules, Others/Feature, Integrations, and Field permissions — **no Portal/Settings access** except Developer Space Connections. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

Profile entity fields: `profile_id`, `profile_name`, `profile_type`, `is_default` (non-removable flag), user-type (User Profile vs Client Profile), and the contained permission sets. (source: https://www.zoho.com/projects/help/rest-api/users-api.html)

### 12.7 Permission Sets

Permission Sets are the granular structure inside a profile, divided into **three hierarchical sections — Portal Level, Project Level, Module Level** — plus Settings, Feature, Integration, and Field permissions. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

**Module permissions** use scope qualifiers (high confidence):

| Operation | Allowed scope values |
|---|---|
| View | All / Related / None |
| Add | All / Both / Added / Owned / None |
| Edit | All / Both / Added / Owned / None |
| Delete | All / Both / Added / Owned / None |

Modules covered: Tasks, Task Lists, Phases, Issues, Time Logs, Feed Status, Custom Modules. **Time Logs** add a **Subordinates / Direct Reports** scope and an **Approve** permission. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

**Settings permissions** (User Access Control and Customization):

| Setting | Options |
|---|---|
| Manage Users & Clients | Invite / Manage / None |
| Teams | All Teams / Team Managed as Lead / None |
| Profiles and Roles | Create / Edit / Delete |
| Customization | Custom modules, web tabs, tags |
| Automation / Layouts | (configurable) |

(source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

**Feature permissions** cover: Forums, Pages, Events & Meetings, Baseline, Link/Associate Issues, Comments, Import/Export, and Mobile Device controls. Availability varies by tier. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

### 12.8 Field-Level Permissions

Per-field control with **three access levels**: **Read Only**, **Read & Edit**, **Hidden**. Applies to Projects, Phases, Tasks, Issues, Time Logs, and Custom Module fields. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

Examples of governed fields:
- **Tasks:** Status, Start/End Date, Priority, Completion Percentage, Billing Type.
- **Issues:** Severity, Reproducible, Rate/Cost Per Hour.

Field-level permissions are realistically usable only via custom profiles, i.e. effectively an **Enterprise** capability. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)

### 12.9 Client Users, Customers (Client Companies) & the Client Portal

> The research here is explicitly flagged in the source data as "[Gap-fill]" — high confidence on mechanics, but several quantitative facts (pricing, max client-user counts) were **not** documented on fetched pages and need sales/pricing confirmation. Limitations are called out at the end of this subsection.

**Customer (Client Company) record.** Client users are grouped under a **Customer** record (the company the projects are done for, e.g. "Bowman Furniture"), created via Users > Client Users > dropdown > Add Customer. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-users-projects)

| Customer field | Notes |
|---|---|
| Customer Name | |
| Customer Type | Business or Individual |
| Associated Projects | One customer can span multiple projects |
| Contact email | |
| Web address | |
| Postal / address details | |

Cardinality: one Customer has many Client Users; a Customer spans multiple projects; each Client User belongs to one Customer and can be assigned across multiple projects within that customer relationship. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-user-list-view)

**Hard model constraint:** a client user's email **domain must differ** from the domain used to sign up for the portal. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-users-projects)

**Onboarding (invite-based).** From Users > Client Users, choose **Add Customer** or **Invite Client User**, then: enter email → select an invitation/email template → assign to a customer (or create one) → pick a client profile → optionally set hourly rate/cost → assign to a project → **Invite**. An invitation email with a portal access link is sent; if not accessed, the user can be **re-invited after 24 hours**. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-users-projects)

> Legacy/medium-confidence note: older community guidance describes newly added users receiving an email plus a system-generated random password. (source: https://help.zoho.com/portal/en/community/topic/how-do-i-add-project-users-clients-viewers-and-followers)

**Client User list view** tracks: email, rate/hr, cost/hr, customer, projects, client profile, and invitation/active/deactivated status. Actions: invite/re-invite, inline edit, activate/deactivate, delete, copy email, filter/search, and **CSV export**. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-user-list-view)

**Client User entity fields:** Email (domain ≠ portal domain), Associated Customer, Client Profile, Rate per hour, Cost per hour (both on time-based billing projects), Assigned Projects, Invitation status (Active / Deactivated / pending). API also exposes `client_company_id`, `client_company_name`, `associated_projects`, and an optional `crm_contact_id` linking to a Zoho CRM contact. (source: https://www.zoho.com/projects/help/rest-api/users-api.html)

### 12.10 The Internal/External Flag — the defining client-visibility mechanic

What clients see is **not a separate dataset** but a **filtered view of the same project**, gated by a per-item **Internal/External Flag**: (high confidence)

- Milestones (Phases) carry a **Flag**: **Internal = hidden** from client users; **External = visible** to client users. (source: https://help.zoho.com/portal/en/kb/projects/phases/articles/milestones)
- The External flag on a milestone **cascades** to its task lists and tasks. (source: https://www.zoho.com/blog/general/zoho-projects-how-to-using-the-client-user-role.html)
- Client users can **only be assigned to tasks** in external milestones/task lists; the flag is editable by editing the milestone or task list. (source: https://help.zoho.com/portal/en/kb/projects/faqs/task-and-task-lists/articles/tasks-and-task-lists)

The client surface therefore consists of: externally-flagged milestones/task-lists/tasks, project-level documents, and the project feed. Clients do **not** see internal milestones/tasks, custom dashboards/forms, or admin UI. **It is project tracking, not a general-purpose portal.** (high confidence) (source: https://www.zoho.com/blog/general/zoho-projects-how-to-using-the-client-user-role.html) (source: https://help.zoho.com/portal/en/community/topic/zoho-projects-client-portal-login)

> Recommended pattern (high confidence): create a parallel set of **macro-level External milestones** mirroring internal ones, so clients see high-level progress while internal dev tasks stay hidden. (source: https://www.zoho.com/blog/general/zoho-projects-how-to-using-the-client-user-role.html)

### 12.11 Client Profiles (restricted permission sets)

Client profiles are **distinct from and more restricted than** portal-user profiles: (high confidence)

- Portal-level permissions can be granted **only** to user (portal) profiles. Client profiles therefore **cannot** access portal settings, user/resource management, templates, developer space, or customization tools. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)
- Client profiles **can** be granted module-level View/Add/Edit/Delete (plus Reorder / Add followers depending on module) on: **Tasks, Task Lists, Phases, Issues, Time Logs, Feed/Status, Custom Modules, and Forums/Pages/Events & Meetings** (the last three **external only**). (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)
- Client profiles **default to the most restrictive** settings (e.g. Related/None for viewing, None for most add/edit/delete) unless explicitly granted. (medium confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects)
- Client user permissions can be **customized per user within a project, cloned** from one user to many others, or **reset to portal-level defaults**. (high confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-users-projects)
- Client users support a **multi-language interface**. (medium confidence) (source: https://www.zoho.com/blog/general/zoho-projects-how-to-using-the-client-user-role.html)

### 12.12 Per-tier availability summary

| Capability | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Portal, default roles & default profiles | Yes | Yes | Yes | Yes |
| Portal Users vs Client Users distinction | Yes | Yes | Yes | Yes |
| Module/scope permissions (granularity scales by tier) | Basic | Yes | Yes | Yes |
| Custom roles | No | No | **Yes** | Yes |
| Custom profiles | No | No | **Yes** | Yes |
| Field-level permissions (via custom profiles) | No | No | **Yes** | Yes |
| Read-Only Users (count) | — | — | **10** | **100** |
| Lite User profile | No | No | No | **Yes** |

(sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-and-roles-projects ; https://www.zoho.com/projects/zohoprojects-pricing.html)

Other plan limits (medium confidence): the **Free** plan supports up to **5 users / 3 projects / 5 GB**; the **Enterprise** plan supports **unlimited projects** and additional user licenses can be purchased. (source: https://help.zoho.com/portal/en/kb/projects/faqs/pricing/articles/does-the-enterprise-plan-month-have-any-limits-on-projects-or-users) (source: https://www.zoho.com/projects/zohoprojects-pricing.html)

### 12.13 Licensing of client / read-only users

- **Zoho One** bundles **5 client users** by default; more require add-on purchases. (medium confidence) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/client-users-projects)
- The public Projects pricing page surfaces **"Read-Only Users"** (Enterprise 10, Ultimate 100) which are **distinct from client users**. (medium confidence) (source: https://www.zoho.com/projects/zohoprojects-pricing.html)
- Community reports note **five purchasable user/add-on categories** (Additional Users, Client Users add-on, Support add-on, Read-only Users add-on, Resources add-on) and that Zoho's documentation "does not clearly describe the differences between these 5 types." (source: https://help.zoho.com/portal/en/community/topic/types-of-zoho-projects-users)

### 12.14 Entity / data-model reference

| Entity | Key fields | Relationships |
|---|---|---|
| **Portal (Organization)** | PORTALID, portal owner, admins[], subscription/plan, settings | One Portal Owner; many Admins/Users/Projects/Profiles/Roles |
| **User (Portal-scoped)** | id, zpuid, name, email, active, role, role_id, role_name, profile_id, profile_name, profile_type, invoice, currency_code | One Portal; one role; one profile; many projects |
| **User (Project-scoped)** | id, name, email, active, role, rate, cost_per_hour, user_budget, budget_threshold, revenue_budget | Belongs to a Project; references a Portal User |
| **Client User** | id, name, email, client_company_id, client_company_name, associated_projects, crm_contact_id | One Customer; many Projects; optional CRM contact |
| **Customer (Client Company)** | Customer Name, Customer Type (Business/Individual), Associated Projects, Contact email, Web address, Postal details | Many Client Users; spans multiple projects |
| **Profile** | profile_id, profile_name, profile_type, is_default, user-type, permission sets | Many users; contains Permission Sets; one per user |
| **Role** | role_id, role_name, editable | Many users; one per user; org-level |
| **Permission Set** | module perms (View All/Related/None; Add/Edit/Delete All/Both/Added/Owned/None), field perms (Read Only/Read & Edit/Hidden), portal/settings/feature/integration perms | Belongs to a Profile; references Modules and Fields |
| **Internal/External Flag** | Flag: Internal \| External (on Milestone); editable on milestone/task list | External milestone exposes its task lists/tasks to client users |

(sources: https://www.zoho.com/projects/help/rest-api/users-api.html ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects ; https://help.zoho.com/portal/en/kb/projects/phases/articles/milestones)

### 12.15 Limitations, known gaps & community-reported issues

These are not sugar-coated; a builder should treat them as real constraints:

- **Client users have un-restrictable visibility leaks.** Community reports state client users can see the marketplace in the setup menu, access Blueprint features, view the account's Zoho subscription plan, search across Zoho, see unrelated "recent updates", and contact Zoho support directly. Admins requested granular controls to hide these; **no official Zoho fix was noted** in the thread. (source: https://help.zoho.com/portal/en/community/topic/client-users-permissions-restrictions)
- **The External-flag prerequisite is easy to miss.** Correctly added clients commonly "see nothing" because all milestones are Internal by default; content appears only once milestones are explicitly marked External. Recurring threads report "client users cannot see milestones or tasks." (source: https://www.zoho.com/blog/general/zoho-projects-how-to-using-the-client-user-role.html) (source: https://help.zoho.com/portal/en/community/topic/client-user-cannot-see-milestones-or-tasks)
- **Onboarding friction.** It is unclear (per community threads) whether invited clients can use the invite link directly or must first create a Zoho account/password, and whether the welcome/invite text is customizable — relevant for non-technical external stakeholders. (source: https://help.zoho.com/portal/en/community/topic/how-to-work-with-client-users)
- **Permission surface is overwhelming.** Reviewers praise the granularity for security but note it can feel overwhelming for newcomers. (source: https://www.g2.com/products/zoho-projects/reviews)
- **Unverified / could-not-fetch facts (need primary confirmation):**
  - Exact **client-user add-on pack pricing**, per-user cost, and **max client-user limits** — not present on the fetched pricing page; needs the pricing-comparison page or sales.
  - **Enterprise plan exact included client/read-only user counts** — the FAQ page did not expose a specific included quantity (a search snippet suggested ~10 read-only client users in Enterprise, unverified on the official page).
  - The "General" default task-list name and the Lite User specifics are **medium confidence** (some from third-party/community sources, not always an explicit official KB statement).
  - G2 / Capterra review bodies were only summarized from snippets, not fully fetched.
## 13. Templates & Configuration

Zoho Projects' templating and configuration capability is not a single feature but a set of distinct, separately-scoped mechanisms. This section documents each one concretely: what it stores, how it is created, where it lives in the UI, its per-tier availability, and its hard limits. Configuration is split between **portal-global setup** (the Settings/Setup gear: customization, automation, portal configuration) and **per-project overrides** (layout association, private layouts, blueprint association).

The mechanisms are:

1. **Project Templates** — replicate an entire project's structure.
2. **Task (List) Templates** — reusable task-list bundles.
3. **Blueprints** — status/transition workflow automation.
4. **Layouts & Custom Fields** — field/section definitions for Projects, Tasks, Issues (and custom modules).
5. **Layout Rules** — conditional/dependent field behavior.
6. **Custom Modules** — user-defined record types (custom objects), launched Dec 2025.
7. **Sandbox** — isolated config-only test/promotion environment.
8. **Cross-cutting config** — Tags, Project Groups, custom Statuses.

> **Honest framing (community/review consensus):** Reviewers (G2 ~4.3/5) praise standardization via templates and automation but consistently note that field/view/workflow customization is **less flexible than Monday.com or ClickUp**, with a 2–3 week onboarding learning curve. The portal-level **hard caps on custom fields (300 task / 105 project)** are a recurring, real-world complaint from power users (source: https://www.g2.com/products/zoho-projects/reviews ; https://help.zoho.com/portal/en/community/topic/why-is-there-a-limit-on-the-number-of-custom-fields-i-can-add).

---

### 13.1 Project Templates

A Project Template is a reusable blueprint of an entire project's structure, used to spawn new projects. (source: https://help.zoho.com/portal/en/kb/projects/projects/articles/project-template)

**Where / how to create:** `Projects > Project Templates tab > New Project Template`. Choose a project layout (Standard by default), name it, select the **source project**, optionally enable **"Add closed tasks as open tasks"**, add an overview, then **Add Project Template**.

**What it captures:** milestones, task lists, tasks, subtasks, phases, tags, internal/external flags, dependencies, budgets/billing rates, and time estimates.

**Behaviors:**
- Supports clone, edit, delete; deleted templates restore from a **30-day Recycle Bin**.
- The **"Add closed tasks as open tasks"** toggle converts closed tasks in the source project into open tasks in the resulting template.
- When you create a project and select a template, the structure auto-populates; you then customize title, owner, dates, group, budget, task-layout mapping, billing method, and module visibility.

**Fields at creation:** Template Name · Project Layout (Standard default) · Source Project · Add closed tasks as open tasks (toggle) · Project Overview/Description.

| Aspect | Detail |
|---|---|
| Tier availability | **Premium: max 20 templates; Enterprise: max 30 templates** (source: https://help.zoho.com/portal/en/kb/projects/projects/articles/project-template) |
| Recycle Bin | 30 days |

> **Limitation / community gap:** Multiple forum threads request the ability to add task-list templates into project templates and to attach **dependencies** to task-list templates — i.e., richer composability is wanted but not fully present (source: https://help.zoho.com/portal/en/community/topic/how-to-add-task-list-templates-to-project-template). Practitioner guides recommend **cloning an existing project into a template** as the standard way to carry over budgets, billing rates, and time estimates (source: https://zenatta.com/zoho-projects-2025-a-complete-guide-to-setup-templates-dependencies-and-automation/).

---

### 13.2 Task (List) Templates

A Task List Template is a reusable set of tasks grouped under a task-list template — a bundle of task lists with tasks, subtasks, ordering, and durations. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/task-templates/articles/task-templates)

**Where / how to create:** `gear icon > Customization > Task Templates > Create a Task List Template`.

**Key behavior — relative timing:** Each task's start timing is defined **relative to project start**, and **durations are settable in hours, days, weeks, or months** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/task-templates/articles/task-templates). This is the defining difference from Project Templates: task templates are timing-relative task-list building blocks.

**Behaviors:** Tasks and whole task-list templates can be reordered, edited, deleted, and have subtasks added. They can be imported wholesale or selectively into a new project, and can be cloned into Project Templates.

**Fields:** Task List Template Name · Phase (optional) · Internal/External flag · Tags · Tasks (name, details) · Subtasks · Task start timing (relative to project start) · Task duration (hours/days/weeks/months) · Task order/sequence.

**Tier availability:** Available across plans (referenced under Customization settings; exact per-plan template counts were not enumerated in the research data — **treat counts as unconfirmed**) (source: https://help.zoho.com/portal/en/kb/projects/faqs/task-and-task-lists/articles/what-is-the-difference-between-project-template-and-task-template).

---

### 13.3 Blueprints (workflow automation)

A Blueprint is a status/transition workflow automation: a graph of statuses connected by transitions, applied to tasks. (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects ; https://www.zoho.com/projects/blueprint.html)

**Where / how to create:** `Automation > Blueprint > New Blueprint`. Provide a name, select a **layout**, description, optional **execution criteria** (by task name or all modules), then drag statuses onto the canvas and connect them with transitions in a drag-and-drop editor.

**Structural rules / validation (all confirmed):**
- Start status must be **Open**; end status must be **Closed**.
- Every status needs **≥1 incoming and ≥1 outgoing transition** (except Closed).
- All statuses connected start-to-end; status names unique.

**Per-transition configuration (three phases):**

| Phase | Configures |
|---|---|
| **Before** | Who/which roles can perform the transition + criteria. **Selected users bypass task permissions.** |
| **During** | Required fields + messages shown during the transition. |
| **After** | Email alerts, field updates, webhooks. |

**Hard limits (confirmed):** max **4 parallel transitions**; max **2 parallel transition sets per status**; max **5 webhooks per transition** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects).

**Association & lifecycle:** Associated to **projects, milestones, or task lists**; bound to a Task Layout; maps existing task statuses to blueprint statuses. Supports publish, save as draft, clone, **export (JSON/PNG)**, disable, reorder by execution priority, and dissociate.

**Tier availability:** **Premium and Enterprise only.**

---

### 13.4 Layouts & Custom Fields (Project / Task / Issue)

Separate layout systems exist for **Projects, Tasks, and Issues** under `Settings > Customization > Layouts and Fields`. Each module has a non-deletable **Standard Layout** with default sections/fields that can be cloned into new layouts. (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/project-layouts-and-fields ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/issue-layouts-custom-fields)

**General layout behaviors:**
- Custom fields are added by drag-and-drop into **custom (non-default) sections only** — sections cannot be empty, and the default sections do not accept custom fields (source: https://www.zoho.com/projects/tutorials/layouts-custom-fields.html).
- Fields can be marked mandatory, given default values, and have access/visibility set.
- **Custom fields cannot be duplicated**; renaming propagates to all associated layouts.
- Switching a layout retains common fields and **loses non-common field data**.
- Removing a field from a layout keeps its data; **permanently deleting from the portal loses data**.

**Tier availability:** All plans can **view/edit the Standard Layout**; **creating custom layouts and custom fields requires Enterprise.**

#### Portal-wide hard caps (confirmed, important)

| Limit | Value |
|---|---|
| Max custom fields (tasks) | **300 per portal** |
| Max custom fields (projects) | **105 per portal** |
| Max project layouts | **40 per portal** |
| Standard Layout | Cannot be deleted; can be edited |

(sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/project-layouts-and-fields)

#### Default fields by module

**Task Standard Layout** — one default section with five default fields: **Status, Due Date, Duration, Priority, Completion Percentage.** Default fields can be reordered but not deleted; **Status is editable, the others are not** (confidence: medium) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields).

**Project default fields** — two sections (cannot be edited or deleted, only reordered):

| Section | Fields |
|---|---|
| Project Information | Start Date, End Date, Project Overview, Status, Group Name, Completion Percentage |
| Budget | Currency, Billing Method, Project Budget, Default Billing Status |

(source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/project-layouts-and-fields)

**Issue layouts** — **14 non-deletable default fields**: Reporter, Assignee, Created, Last closed time, Modified, Due date, Status & Workflow, Severity, Release Milestone, Affected Milestone, Module, Classification, Is it Reproducible, Flag. Only **Module, Severity, Is it Reproducible, and Classification** can be renamed (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/issue-layouts-custom-fields).

#### Custom field types (Tasks / Issues)

| Type | Notes / constraint |
|---|---|
| Single-Line Text | PII/encryption-capable |
| Multi-Line Text | PII/encryption-capable |
| Pick List | — |
| Multi-Select Pick List | — |
| User Pick List | — |
| Multi-User Pick List | — |
| Date | — |
| Date & Time | — |
| Number | max 19 digits; PII/encryption-capable |
| Decimal | max 14 pre-decimal digits; PII/encryption-capable |
| Percentage | — |
| Currency | PII/encryption-capable |
| Formula Field | — |
| Checkbox | — |
| Billing Type | — |
| Phone | PII/encryption-capable |
| Email | PII/encryption-capable |
| URL | PII/encryption-capable |
| Long URL | up to 1000 chars; PII/encryption-capable |

(source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields)

**PII / encryption:** Single/Multi-Line Text, Number, Decimal, Phone, Email, URL, Currency, and Long URL support PII marking and encryption.

#### Private layouts (per-project)

Private layouts can be created **per-project** (visible only to project members). Enabling **"Make private layouts as a default for all new projects"** auto-creates private copies; converting back to public requires adding another project association (confidence: medium) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields).

---

### 13.5 Layout Rules

Layout Rules customize the **Add Task form** based on conditions. Created via `Customization > Layouts and Fields > Tasks > Layout Rules > New Layout Rule`. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-rules)

**Two rule types:**

| Type | Behavior |
|---|---|
| **Conditional** | Modify field properties when criteria are met (e.g., if Priority = High AND Quantity empty → make Due Date and Quantity mandatory). |
| **Dependent** | Filter a picklist's options based on another field's value (primary field → dependent field). |

**Actions:** Show fields · Show sections (the default section is excluded) · Set mandatory · Remove mandatory · Disable field (**cannot disable mandatory fields**).

**Hard limits (confirmed):** max **35 conditions per layout rule**; up to **200 conditions total per layout**; rules per layout are otherwise unlimited within those condition limits.

**Tier availability:** **Enterprise only.**

---

### 13.6 Cross-cutting configuration: Tags, Project Groups, Statuses

#### Tags

Free-form labels applied to **projects, milestones, task lists, tasks, issues, forums, and status updates**. Created on-the-fly by typing in the Tags field and pressing Enter (during creation/edit, or via the Tags column in list view). **Enabled by default across plans.** (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/tags-projects ; https://www.zoho.com/projects/help/rest-api/tags.html)

- Removing a tag from one module removes **only that association**, not the tag itself.
- Permanent deletion happens from the **tag search page**.
- A Dashboard **Tags widget** shows all project tags; tags appear in filters, reports, and custom views.

#### Project Groups

Organizational buckets to categorize/filter projects (by client, requirement, users, etc.). Created under `Projects tab > Project Groups > New Group`. (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/project-groups)

- **Project Group Prefix:** optional, **max 10 chars, alphanumeric + hyphens only**, auto-applied to assigned projects and editable later.
- Projects are assigned via the **Group Name** field at creation, or by drag-and-drop; dragging to **Ungrouped Projects** removes a project.
- **Deleting a group moves its projects to Active Projects** (it does not delete them).
- Supports edit, reorder, and case-sensitive search.
- **Tier availability:** across plans (per access privileges).

#### Custom Task & Project Status

Custom statuses are defined within the **Status field of the Standard Layout**. For tasks: `Customize Status > +Add Status`, type a name, pick a **color**, and set the **action as Open or Closed**. Project status is similarly customizable. Status Open/Closed semantics drive Blueprints and reporting. (sources: https://help.zoho.com/portal/en/community/topic/tip-21-customize-task-status ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/project-layouts-and-fields)

> **Tier nuance:** Custom **statuses** are available more broadly (from Premium upward per the Tasks API's `custom_status`), whereas custom **fields/layouts** are the Enterprise-only feature. The research data flags this as a point easily conflated — status customization ≠ field/layout customization.

**Status fields:** Status Name · Color · Action (Open / Closed).

---

### 13.7 Custom Modules (custom objects)

> **Recency note:** Custom Modules launched **December 2025** (Connect Module field Dec 2025; **Module Gallery January 2026**; Summary field and **mobile Android/iOS support April 2026**) (source: https://www.zoho.com/projects/whats-new.html). This is a new, still-evolving subsystem.

Custom Modules are user-defined record types that extend Projects beyond its default modules (tasks, issues, milestones). (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/modules-and-tabs/articles/custom-modules-zoho-projects)

**Definition at creation:** enter a singular **Module Name** plus a separate **Plural** display name, then choose a **scope**:

| Scope | Data storage | Tier |
|---|---|---|
| **Organization Module** | Data common across **all** projects (portal-wide) | Enterprise / Ultimate |
| **Project Module** | Data stored **per individual project** | Premium and up |

- **Client users and Lite users cannot access Organization Modules.**
- No record-prefix / auto-numbering setting is documented **at creation** (auto-number exists separately as a field type).

**Builder:** A drag-and-drop layout editor. Drag **+Add Section** from the left tray; sections have a configurable **name and number of columns**. Drag field types from the **New Fields tray**. Each field supports: **Label, Section assignment, optional Default Value, Mandatory toggle, and a tooltip.** Supports **multiple layouts** (a default layout plus additional via **Create Layout**).

**Field types (New Fields tray)** — confidence: **medium** (Projects help references the tray without exhaustively enumerating; the list below is corroborated by the Projects marketing page and a cross-product Zoho field-types reference):

single line · multi-line · number · decimal · percent · currency · date · date/time · picklist · multi-select picklist · checkbox · email · phone · URL · lookup · user lookup · formula · summary (rollup) · file/image upload · auto-number · subforms.
(sources: https://www.zoho.com/projects/custom-modules.html ; https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/types-of-fields)

#### Special fields

**Connect Module field** (relationships) — links a record to records in **projects, phases, tasks, issues, time logs, and custom modules**. (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/special-fields/articles/connect-module-field)
- **One module per Connect field**, but multiple records.
- A record **cannot link to itself**.
- Relationships are **bidirectional** via a related-list subtab on the target module's detail page.
- **Time Logs cannot be a target module**, but can host a Connect field.
- Per-field counts cited (confidence: medium): **5 Connect fields per default module** (Enterprise/Ultimate); **up to 10 for custom modules in Ultimate**.

**Summary (rollup) field** — aggregates child-module values into a parent record. Operators: **sum, average, minimum, maximum, count, record count, unique count.** (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/special-fields/articles/connect-module-field ; https://www.zoho.com/projects/whats-new.html)

**Formula custom field** — return types and limits:

| Return type | Limit |
|---|---|
| Single-line text | 255 chars |
| Multi-line text | 4000 chars |
| Integer | 18 digits |
| Decimal | 18 digits |
| Currency | — |
| Percent | — |
| Day | — |
| Date/time | — |

**Up to 45 formula custom fields per organization.** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/special-fields/articles/formula-custom-fields)

#### Custom Module views, automation, permissions, lifecycle

- **Custom Views:** built with **AND/OR filter operators** on field criteria.
- **Automation:** workflow rules (conditions + actions), email alerts/templates, webhooks, custom **Deluge** functions, plus a Sandbox.
- **Permissions:** field-level and module-level permissions can be configured.
- **Records:** created by selecting the module under **Custom Modules** in the left sidebar; create/edit/restore; trashed modules/records go to a **Recycle Bin**.
- **Module Gallery:** predefined modules added with one click (Jan 2026), covering project phases; imported modules integrate with Gantt, automations, and reports, and remain customizable (sources: https://www.zoho.com/projects/whats-new.html ; https://www.zoho.com/projects/module-gallery.html).

#### API entity shape (V3 REST)

Every module and field has a stable **API Name** distinct from its display name. The V3 **Modules API** returns module metadata (API names); the **Fields API** returns per-module field metadata (API name, data type, custom flag). Create/update payloads reference custom fields **by API name**. **Entity-properties** are a separate key-value CRUD store on task/issue/project. (sources: https://www.zoho.com/projects/help/rest-api/entity-properties-api.html ; https://projects.zoho.com/api-docs ; https://goldstarit.com/zoho-projects-v3-apis-update/)

#### Custom Module limitations / explicit unknowns

- **Per-tier MODULE COUNT limits are NOT publicly confirmed.** The dossier's assumed **5/10/20** (Premium/Enterprise/Ultimate) figures are **not published** on any public Zoho Projects pricing page or help article and **could not be verified**. Only edition *availability* (Project modules from Premium; Org modules Enterprise/Ultimate, confidence: medium) and some per-field-type limits were confirmable. A related community thread on "expanded limits" is **Zoho CRM-specific** (200 org/team modules) and does not apply to Projects (sources: https://www.zoho.com/projects/zohoprojects-pricing.html ; https://help.zoho.com/portal/en/community/topic/maximum-custom-modules-on-zoho-one-license). **Do not hard-code module counts.**
- The Projects help docs **do not document** a dedicated **Kanban view**, a per-module **status workflow**, or **record-prefix** configuration for custom modules — these are **not confirmed** for custom modules (confidence: medium).
- An authoritative exhaustive field-type enumeration *specifically* for Projects custom modules, and per-tier per-module **record-count/storage limits**, were not found on any public Zoho page.

---

### 13.8 Sandbox (isolated configuration test/promotion environment)

Sandbox is an **Enterprise-and-above** governance feature: a secure, isolated portal that **clones the production portal's settings/configuration (not user-generated project data)** so admins and dedicated "Sandbox developers" can test customizations before promoting them live. (sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/sandbox-intro ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/creat-17-12-2024)

**Tier availability (confirmed on both pricing-comparison and help pages):**

| Plan | Sandboxes |
|---|---|
| Free | None |
| Premium | None |
| Enterprise (incl. bundles) | **1** |
| Ultimate | **10** |

**Creation & defaults:** A modifiable access URL is generated; creation takes a few minutes. **Portal Owners and Admins are added by default.** If a user's production role/profile is unavailable in the sandbox, the default **Employee role and Employee profile** are assigned automatically.

**Data model — config only:** A new sandbox contains **only supported configuration data in Settings**; user-generated project/task data is **not cloned**. ~18 component types are cloneable and deploy **bidirectionally** (production→sandbox to seed/refresh; sandbox→production to promote).

#### Deployable / cloneable components (~18)

Roles · Profiles · Custom Fields (all modules) · Custom Modules · Layouts · Layout Rules · Web Tabs · Webhooks · Email Templates · Email Alerts · Workflow Rules (tasks & projects) · Macro Rules (task automation) · Blueprints · Module Visibility · Teams · Resources · Connections · Custom Functions · Scheduled/Schedule Functions.
(sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/sandbox-intro ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/data-deployment-from-sandbox)

Each component is shown as **Y/N per direction** in a deployment matrix. *(The full cell-by-cell direction matrix could not be captured from the JS-rendered help page — see limitations below.)*

#### Non-deployable items (confidence: medium)

Personal Preferences · Notifications · Portal Configuration · Project Configuration · **Task Templates** · Marketplace · Developer Space · Data Administration · Portal Users / Client Users · Issue Tracker · **Custom Status in Layouts**.
(source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/data-deployment-from-sandbox)

> Note for builders: **Task Templates and Custom Status in Layouts are explicitly NOT deployable** via sandbox — they must be configured directly in production.

#### Hard limits (confirmed, important)

| Limit | Value |
|---|---|
| Refresh / rebuild frequency | **Once per 24 hours** |
| Rebuild side-effect | **Wipes any non-deployed sandbox changes** (refreshes production settings only, not user content) |
| Max changes deployed at once → production | **50** |
| Developers per sandbox | **Up to 10** |
| Developer licensing | **No paid license required**; developers get **sandbox-only access** (not production) |

(sources: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/manage-sandbox ; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/creat-17-12-2024)

#### Operations

- **Deployment Logs:** audit trail of all deployments, filterable by **component, module, action, and date.**
- **Sync Users:** pulls newly added production users into the sandbox.
- **Deactivate:** temporarily disables a sandbox (reversible toggle).
- **Delete:** permanent, **no recovery.**

#### Sandbox limitations / explicit unknowns

- The **exact click-by-click deploy-to-production UI workflow steps could not be extracted** — the help page is JavaScript-rendered and WebFetch returned the component matrix, the 50-change limit, the bidirectional confirmation, and the logs, **but not the numbered procedural steps** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/sandbox/articles/data-deployment-from-sandbox).
- The **full per-component Y/N direction matrix** (sandbox→production vs production→sandbox, cell by cell) could not be captured from the same page.

---

### 13.9 Portal-level configuration split (summary for builders)

| Where configured | What lives there |
|---|---|
| **Portal-global (Settings/Setup gear)** | Customization (Layouts & Fields, Task Templates, Custom Modules, Special Fields), Automation (Blueprints, Workflow Rules, Webhooks, Functions), Portal Configuration (Tags, AI Hub, etc.), Sandbox |
| **Per-project overrides** | Layout association, private layouts, blueprint association, project group assignment, module visibility |

---

### 13.10 Consolidated limits & tier reference

| Item | Limit / availability | Confidence |
|---|---|---|
| Project Templates | 20 (Premium) / 30 (Enterprise) | High |
| Custom fields — tasks | 300 per portal | High |
| Custom fields — projects | 105 per portal | High |
| Project layouts | 40 per portal | High |
| Custom fields | cannot be duplicated | High |
| Formula custom fields | 45 per organization | High |
| Blueprint parallel transitions | 4 max | High |
| Blueprint parallel transition sets per status | 2 max | High |
| Blueprint webhooks per transition | 5 max | High |
| Layout rule conditions | 35 per rule / 200 per layout | High |
| Project Group prefix | ≤10 chars, alphanumeric + hyphens | High |
| Connect fields per default module | 5 (Enterprise/Ultimate) | Medium |
| Connect fields per custom module | up to 10 (Ultimate) | Medium |
| Sandboxes | 1 (Enterprise) / 10 (Ultimate); none on Free/Premium | High |
| Sandbox deploy batch | 50 changes at once | High |
| Sandbox rebuild | once / 24h, wipes undeployed changes | High |
| Sandbox developers | 10, no license needed | High |
| Custom layouts / custom fields | Enterprise only | High |
| Layout Rules | Enterprise only | High |
| Blueprints | Premium + Enterprise | High |
| Project (per-project) custom modules | Premium+ | Medium |
| Organization (global) custom modules | Enterprise/Ultimate | Medium |
| **Custom module COUNT per tier (dossier's 5/10/20)** | **NOT published / unverifiable — do not hard-code** | High (that it's unknown) |

---

### 13.11 Net assessment (no sugar-coating)

Zoho Projects' configuration model is **standardization-strong but rigidity-prone**. Its template + blueprint + layout stack is well-suited to repeatable, governed project types, and the Sandbox gives Enterprise/Ultimate buyers real change-management discipline (deployment logs, batched promotion, isolated developers). However:

- **Hard caps are real and inflexible** (300 task / 105 project custom fields; 40 project layouts; 45 formula fields) and are an actively-complained-about ceiling for power users.
- **Field/view customization is shallower than ClickUp/Monday**, per third-party review consensus.
- **Custom Modules are brand-new (Dec 2025+)** with several undocumented behaviors (no confirmed Kanban view, no documented per-module status workflow, no confirmed record-prefix) and **no publicly confirmed per-tier count limits** — a builder must verify module counts against their own portal/licensing rather than trusting the 5/10/20 assumption.
- **Sandbox deploy UI steps and the full direction matrix are not publicly documented** in extractable form, so the exact promotion click-path must be validated in a live Enterprise/Ultimate portal.
## 14. Mobile Apps

Zoho Projects ships native mobile apps for iPhone, iPad, and Android. The apps cover the core day-to-day work surface (Home, Tasks, Issues, Timesheets/timer, Feeds, Documents, and — recently — Custom Modules) but are explicitly **not** a full replacement for the web app. This section documents the feature set, platform parity gaps, offline behavior, OS-level integrations, and app-store metadata, with limitations called out rather than glossed over.

> Scope note: Apple Watch support for Zoho Projects is **unconfirmed** — Projects is not listed among Zoho's official Apple Watch apps, and the watchOS 11 Live Activities/timer capability cited in Zoho's 2024 Apple blog is attributed to Zoho **Books**, not Projects (sources: https://www.zoho.com/apple-watch.html, https://www.zoho.com/blog/general/zoho-apps-for-apple-updates-2024.html). Do not assume a Projects watch app exists.

### 14.1 Platforms and availability

- Native apps exist for **iPhone, iPad, and Android** (sources: https://www.zoho.com/projects/mobile-app.html, https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/mobile-apps).
- The iOS App Store listing additionally reports **Apple Vision** as a supported device (source: https://apps.apple.com/us/app/zoho-projects-work-management/id511887920).
- All core mobile features are available across **all Zoho Projects subscriptions** (the Home dashboard is documented as available on all subscriptions; sources: https://www.zoho.com/projects/mobile-app.html, https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/mobile-apps).
- A Zoho Projects subscription account is required to use the Android app (source: https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/mobile-apps).

### 14.2 Feature set

The table below lists documented mobile features, what they do, and platform notes. Where platform availability is asymmetric, it is flagged as a parity gap.

| Feature | What it does | Platform notes | Sources |
|---|---|---|---|
| **Home dashboard** | Landing screen showing tasks assigned to you, issues needing your attention, and active timers. | iOS, iPad, Android. Available on all subscriptions. | mobile-app.html; help.zoho mobile-apps KB |
| **Tasks — List + Kanban** | Create/assign tasks and subtasks; switch between List and Kanban; Kanban drag-and-drop moves tasks/bugs. Portrait and landscape supported. | Both platforms. | mobile-app.html; help.zoho community "all-new" thread |
| **Issues / Bug tracking** | File bug reports/issues from anywhere; issues surface on Home. Custom issue Kanban views added on mobile (Jan 2021). | Both platforms. | help.zoho community thread; whats-new.html |
| **Gantt chart** | Visual status tracking; dependencies and rescheduling via drag-and-drop. Reviewers note sluggish drag on large projects. | **iOS/iPad documented; Android marked "coming soon" on the official mobile page — parity gap (see 14.3).** | mobile-app.html; thedigitalprojectmanager.com |
| **Calendar module** | Month-by-month view; tap a day to create tasks, milestones, events, or bugs. | **iOS documented; Android "coming soon" — parity gap.** | mobile-app.html |
| **Timesheets + integrated timer** | Log hours via timesheet or built-in timer; daily/weekly/monthly views. | Both platforms. 2023 added custom fields, timeline view, custom-field filtering, pause-timer notes, time-log access controls. | mobile-app.html; whats-new.html |
| **Feeds / status / forums** | Activity feed of discussions, tasks, comment threads; post status; create tasks/milestones; join forum discussions. | Both platforms. | mobile-app.html; help.zoho community thread |
| **Documents / attachments** | Access, upload, and edit project documents; multi-file selection; media attachable to comments. | Both platforms. Android v3.9.35 (Jun 2025) added a unified **Project Attachments** view across tasks, bugs, and comments. | mobile-app.html; whats-new.html |
| **Custom Modules** | User-defined modules to capture specialized data. | Rolled out to **both** Android and iOS in **Apr 2026** (requires latest app version). | whats-new.html; App Store listing |
| **Notifications + filters** | Push notifications for assignments/updates; filters, bulk mark-as-read, and notification flags added Mar 2023. | Both platforms. **Notifications do not always sync in real time (recurring complaint).** | whats-new.html; thedigitalprojectmanager.com |
| **Themes / fonts / localization** | Selectable themes; font families/sizes (Aug 2022); RTL for Arabic/Hebrew (Jun 2025, both platforms). | iOS localized in English + 18 languages. | mobile-app.html; whats-new.html; App Store listing |

**iOS/iPad-specific features**

| Feature | What it does | Sources |
|---|---|---|
| **Control Center & Lock Screen widgets** | iOS Control Center and Lock Screen widgets for quick access. | zoho.com/blog Apple-updates-2024; whats-new.html |
| **Action Button** | iPhone Action Button mapped to app actions. | zoho.com/blog Apple-updates-2024 |
| **Siri integration** | Add a task / log hours via Siri. | zoho.com/blog Apple-updates-2024; whats-new.html |
| **Dashboard home-screen widget** | Home-screen widget added in iOS **v3.10.8** (Jul 2025). | whats-new.html |
| **Apple Pencil support** | Listed as iOS/iPad-specific on the official mobile page (confidence: medium — single source, no behavioral detail). | mobile-app.html |
| **In-app Document Scanner** | Listed as iOS/iPad-specific (confidence: medium — single source). | mobile-app.html |

**Android-specific features**

| Feature | What it does | Sources |
|---|---|---|
| **Voice notes** | Android **v3.9.37** (Aug 2025) added voice notes for Tasks and Bugs; saved as audio or transcribed to text. | whats-new.html |
| **Unified Project Attachments view** | Android **v3.9.35** (Jun 2025) — see Documents row above. | whats-new.html |

Short source URLs used in the tables above, in full:
- mobile-app.html → https://www.zoho.com/projects/mobile-app.html
- whats-new.html → https://www.zoho.com/projects/whats-new.html
- App Store listing → https://apps.apple.com/us/app/zoho-projects-work-management/id511887920
- help.zoho mobile-apps KB → https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/mobile-apps
- help.zoho community thread → https://help.zoho.com/portal/en/community/topic/all-new-zoho-projects-mobile-app
- thedigitalprojectmanager.com → https://thedigitalprojectmanager.com/tools/zoho-projects-review/
- zoho.com/blog Apple-updates-2024 → https://www.zoho.com/blog/general/zoho-apps-for-apple-updates-2024.html

### 14.3 Platform parity gap (iOS vs Android)

The official mobile page documents **Gantt charts** and the **Calendar module** as iOS/iPad-available while marking them **"coming soon" for Android** — a real, documented platform parity gap (confidence: medium; single primary source: https://www.zoho.com/projects/mobile-app.html). Beyond these two modules, several recent additions also landed platform-asymmetrically:

- iOS got system-level integrations (Control Center/Lock Screen widgets, Action Button, Siri, home-screen Dashboard widget) plus Apple Pencil and Doc Scanner.
- Android got voice notes (Tasks/Bugs) and the unified Project Attachments view.

**Build-critical takeaway:** ship Gantt + Calendar parity across both platforms from day one rather than replicating Zoho's iOS-first staggering.

### 14.4 Offline support (narrow)

Offline support is **limited and narrow**:

- **Only time-log entry works offline.** Entries added offline display a **"Yet to Sync"** status and auto-sync on reconnect. Added **Jan 2024** on both iOS and Android (sources: https://www.zoho.com/projects/whats-new.html, https://www.zoho.com/projects/mobile-app.html).
- **There is no full offline task/project access.** Viewing/editing tasks, projects, issues, etc. offline is not provided.
- Full offline access is a **long-standing unmet user request** — a community thread notes similar asks dating back to **~2009** (source: https://help.zoho.com/portal/en/community/topic/projects-offline-access-update).

**Build-critical takeaway:** offline time logging is table stakes; full offline mode (tasks/projects) is an open gap to beat Zoho on.

### 14.5 App-store metadata (build/parity benchmark)

**iOS — App Store** (Zoho Projects · Work Management, app id 511887920; source: https://apps.apple.com/us/app/zoho-projects-work-management/id511887920):

| Field | Value |
|---|---|
| App ID | 511887920 |
| Rating | 4.4 / 5 |
| Ratings count | ~733 |
| Size | 264.5 MB |
| Version | 3.11.8 |
| Minimum iOS | 16.0+ |
| Devices | iPhone, iPad, Apple Vision |
| Languages | English + 18 others |
| In-app purchases | Premium $19.99/mo → Enterprise $449.99/yr (IAP tiers map to web subscription plans) |

**Android — Google Play** (package `com.zoho.projects`; sources: https://play.google.com/store/apps/details?id=com.zoho.projects&hl=en_US, https://help.zoho.com/portal/en/kb/projects/zoho-projects-overview/articles/mobile-apps):

| Field | Value |
|---|---|
| Package | com.zoho.projects |
| Downloads | 100,000+ |
| Minimum Android | 6.0+ (older docs cite 4.1+) |
| Languages | Arabic, Chinese, Dutch, English, French, German, Hungarian, Indonesian, Japanese, Portuguese, Spanish, Thai, Vietnamese |
| Rating | Mixed (crashes / sync bugs reported); no exact numeric rating extractable — see data-quality note |

**Data-quality note:** the Google Play page could not be fetched directly — it returned only the Play Store nav header, so the Android rating/version/changelog are **not** extractable as primary data; Android figures rely on search snippets and third-party listings (confidence: medium). G2 and Capterra review pages were also not directly fetched (likely bot-gated); their content comes from search summaries.

### 14.6 Web parity and known limitations (do not sugar-coat)

The mobile apps are good for quick updates but **materially weaker than desktop** for detailed work (sources: https://thedigitalprojectmanager.com/tools/zoho-projects-review/, https://www.g2.com/products/zoho-projects/reviews, https://www.capterra.com/p/169455/Zoho-Projects/reviews/):

- **Complex task editing, detailed Gantt manipulation, and comprehensive reporting work materially better on desktop.**
- The mobile UI is described as **clunky / less intuitive and slower** than the web app.
- **Notifications do not always sync in real time** (recurring complaint).
- iOS reviewers report **task sync issues between web and mobile, inverted/incorrect task ordering, date display glitches**, and explicit requests for missing widgets and Apple Watch integration (source: https://apps.apple.com/us/app/zoho-projects-work-management/id511887920).
- Android reviewers report **crashes preventing app access** and **broken workflow execution when closing tasks**, plus notification sync lag (source: https://play.google.com/store/apps/details?id=com.zoho.projects&hl=en_US).
- On G2/Capterra a minority call the mobile app superior to competitors, but the majority report it lacks features and is less intuitive/slower than desktop — "good for quick updates, not detailed work" (source: https://www.g2.com/products/zoho-projects/reviews).

Note: the ~4.4/5 aggregate cited on review platforms is for **Zoho Projects overall**, not mobile-specific (confidence: medium; sources: https://www.g2.com/products/zoho-projects/reviews, https://www.getapp.com/project-management-planning-software/a/zoho-projects/reviews/).

### 14.7 Build-critical takeaways

1. Cover the full core surface: **Home, Tasks (List + Kanban), Issues, Timesheet + timer, Feeds, Documents, Custom Modules**.
2. Ship **Gantt + Calendar parity across both platforms** from day one (Zoho left Android behind).
3. Offer **offline time logging** plus **widgets** as baseline.
4. **Beat Zoho on full offline mode** (tasks/projects, not just time logs) and **real-time notification sync** — both are documented Zoho weaknesses.
5. Prioritize **web↔mobile sync reliability** (task ordering, status, dates) and **crash-free stability**, which are the dominant negatives in both app stores.

### 14.8 Coverage limitations of this section

- Android numeric rating, current version, and changelog are not primary-sourced (Play Store page not fetchable).
- Gantt/Calendar Android "coming soon" status rests on a single primary source (the official mobile page) and may change.
- Apple Pencil and Doc Scanner support are single-source (official mobile page) with no behavioral detail.
- No substantive Reddit / X / LinkedIn / Hacker News mobile-specific threads surfaced (X threads typically login-gated), so community signal is limited to App Store, Google Play, G2/Capterra, and the Zoho community forum.
## 15. Integrations (Zoho + Third-Party)

Zoho Projects ships with roughly **22 native Zoho integrations** plus a broad set of third-party connectors. The native integrations are the strongest selling point for teams already inside the Zoho ecosystem (CRM, Books, Analytics ties are deep), while several third-party integrations — notably GitHub and Zoho Desk — are reported by reviewers as weak or "flaky." This section documents the verified behaviors, fields, setup patterns, per-tier availability where known, and limitations. Where the research data does not specify a behavior or tier, that gap is called out explicitly rather than filled with assumptions.

> **Build-critical takeaway:** The single most important reusable pattern across all version-control (VCS) integrations is the commit-message linking syntax `[#ISSUEID]` (comma-separated for multiple issues), routed through **per-project Service Hook webhook URLs** under *Settings > Developer Space > Service Hooks*. If you are cloning the integration layer, build this Service Hook → Changeset pipeline first.

---

### 15.1 Native Zoho integrations (catalog)

Zoho's official integrations page lists approximately 22 native Zoho integrations (source: https://www.zoho.com/projects/integrations.html). Confidence on this catalog is **high**, but note that per-tier availability is **not specified** for most of these on the source pages — do not assume "all plans" unless stated below.

| Native integration | What it does | Tier availability (as verified) |
|---|---|---|
| Zoho CRM / Bigin | Associate projects with CRM records across 10 modules; bi-directional task sync | Any Projects plan; module availability depends on CRM edition |
| Zoho Desk | Convert/raise a Desk ticket into a bug in Projects | Not specified |
| Zoho People | Surfaces team-member availability for capacity-based assignment | Not specified |
| Zoho Books / Invoice / Billing / Expense / ERP | Budgets, expense tracking, timesheet-based & GST-ready invoicing, subscription/invoice mgmt, quotes/budgets | Not specified |
| Zoho Analytics | BI add-on turning project data into reports/dashboards | Paid add-on |
| Zoho WorkDrive | File/document layer (replaced Zoho Docs) | Available in all plans (paid WorkDrive may be prompted) |
| Zoho Mail | Convert emails into tasks or bugs from the inbox | Not specified |
| Zoho Meeting | Hold online discussions on specific tasks | Not specified |
| Zoho Cliq | Channel notifications; create tasks/issues from Cliq | Not specified |
| Zoho Sprints | Bridges classic (Projects) and agile (Sprints) workflows | Not specified |
| Zoho Flow | No-code automation to 50+ Zoho apps and hundreds of third-party apps | Not specified |
| Zoho Forms | Auto-create tasks from form submissions | Not specified |
| Zoho Sign | Document signing across projects/tasks | Not specified |
| Zoho Writer | Document authoring | Not specified |
| Zoho Vani | (Listed on integrations page) | Not specified |
| Zoho Notebook | (Listed on integrations page) | Not specified |
| Zoho SalesIQ | (Listed on integrations page) | Not specified |
| Zoho Bigin | Lightweight CRM (pipeline-centric) | Not specified |
| Zoho SalesIQ / others | (Listed on integrations page) | Not specified |

(source: https://www.zoho.com/projects/integrations.html)

**Limitation / honesty note:** The summary research asserts that most native integrations are "available in all plans," but the per-feature source pages generally do **not** confirm tier availability. Only CRM, WorkDrive, Slack, and GitHub have verified tier statements (below). For Vani, Notebook, SalesIQ, Sign, Writer, Forms, Mail, Meeting, Cliq, Desk, People, the financial suite (Books/Invoice/Billing/Expense/ERP), and Sprints, the research data carries only a one-line description and "tier not specified" — treat deeper behavior as undocumented here.

---

### 15.2 Zoho CRM integration (most detailed native tie)

**Confidence: high.** Sources:
- https://help.zoho.com/portal/en/kb/crm/integrations/zoho/zoho-projects/articles/overview-zoho-projects-crm-integration
- https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/crm-integration
- https://help.zoho.com/portal/en/kb/crm/faqs/crm-integrations/articles/faqs-zoho-crm-projects

**Behavior.** You can create a new project or associate an existing one directly from a CRM record. An associated **Account becomes a Business Customer** in Projects; an unassociated **Contact becomes an individual customer**.

**Supported CRM modules (10), each gated by CRM plan:**

| # | Module |
|---|---|
| 1 | Deals (Potentials) |
| 2 | Accounts |
| 3 | Contacts |
| 4 | Sales Orders |
| 5 | Invoices |
| 6 | Campaigns |
| 7 | Cases |
| 8 | Quotes |
| 9 | Purchase Orders |
| 10 | Products |

**Task sync is bi-directional but asymmetric:**
- CRM-originated tasks **auto-sync** into Projects.
- Projects-originated tasks must be **manually pushed** via the "Save and Add Task to Zoho CRM" (a.k.a. "Save to Zoho CRM") action.

**Synced task fields:** title, description, due date, priority, status, task owner.

**Custom-field mapping limitation (confidence: medium):** Native custom-field mapping only covers the **standard layouts of the Deals and Accounts modules**. Custom fields in other modules, custom layouts, or CRM Tasks require **Zoho Flow or Deluge** scripting to bridge.

**Two documented sync constraints (confidence: medium):**
1. A synced task's due date **cannot be extended in CRM beyond the project's strict schedule**.
2. Subtasks **cannot be reopened in CRM** while the parent task is closed in Projects.

**Entity — CRM-associated Project:**
- Fields: associated CRM module record (Account/Contact/Deal/etc.); client users + access level; project/client user assignments; synced task fields (title, description, due date, priority, status, owner).
- Relationships: associated with one CRM record across the 10 supported modules; bi-directional (asymmetric) task sync.

---

### 15.3 Version-control / developer integrations (GitHub, GitLab, Bitbucket, Gitea)

All four VCS providers use the **same core mechanism**: per-project **Service Hooks** that receive commit payloads and create **Changesets** linked to issues/bugs.

**Commit-message linking syntax (confidence: high, build-critical):**
- Single issue: `[#ISSUEID]` — e.g., `[#EPI19] fixed leak`
- Multiple issues: comma-separated inside the brackets — e.g., `[#EPI19,#EPI20]`
- Linked commits appear as **Changesets** on the issue detail page and in an aggregated, project-wide view.

(sources: https://help.zoho.com/portal/en/kb/projects/integration/other-apps/articles/github-integration-projects , https://help.zoho.com/portal/en/kb/projects/integration/other-apps/articles/projects-gitlab-integration)

**Setup pattern (confidence: high):** Copy the Service Hook webhook URL from *Settings > Developer Space > Service Hooks* in Zoho Projects, then register it as a webhook in the external repository's settings.

| Provider | Setup target | Tier availability |
|---|---|---|
| **GitHub** | Add the copied webhook URL as a Webhook in the GitHub repo settings | **Premium and Enterprise plans only** (confidence: medium) |
| **GitLab** | Add the Service Hook URL as a Webhook in GitLab *Settings > Integrations*; Changesets viewable from the project's Issues section | Not specified on the GitLab help page (VCS service hooks generally Premium/Enterprise) |
| **Bitbucket** | Git/Mercurial hosting; same *Developer Space > Service Hooks* model | Premium/Enterprise (inferred from VCS service-hook pattern; not explicitly stated) |
| **Gitea** | Repository hosting + commit tracking; listed among VCS integrations | Not specified |

Sources: GitHub https://help.zoho.com/portal/en/kb/projects/integration/other-apps/articles/github-integration-projects ; GitLab https://help.zoho.com/portal/en/kb/projects/integration/other-apps/articles/projects-gitlab-integration ; Bitbucket https://help.zoho.com/portal/en/kb/projects/integration/other-apps/articles/bitbucket-integration-projects ; Gitea https://www.zoho.com/projects/integrations.html

**Entity — ServiceHook (Developer Space):** Per-project webhook configuration object that receives commit payloads and links commits to issues.
- Fields: webhook URL (Zoho-generated); provider type (GitHub/GitLab/Bitbucket/Gitea); associated project; linked issue IDs (parsed from commit messages).
- Relationships: belongs to a Project; produces Changesets attached to Issues/Bugs.

**Entity — Changeset:** Record of a commit imported from a VCS provider.
- Fields: commit message; linked issue ID(s) via `[#ISSUEID]`; author/committer; repository source.
- Relationships: linked to one or more Issues/Bugs; sourced from a ServiceHook.

**Limitation (community sentiment):** Reviewers consider the GitHub integration **weak/limited** versus competitors ("would love a really good integration with GitHub, but it doesn't integrate simply"). Treat VCS integration as commit-linking only, not deep PR/branch/CI orchestration. (See §15.9.)

---

### 15.4 Slack integration (most detailed third-party tie)

**Confidence: high.** Sources:
- https://help.zoho.com/portal/en/kb/projects/integration/other-apps/articles/slack-integration
- https://projects.zoho.com/slack
- https://slack.com/marketplace/A1DSBBJRF-zoho-projects

**Mapping model:** One project maps to **one Slack channel**. Only the **portal owner** can configure mappings. Install via the Projects Marketplace or the Slack App Directory.

**Tier availability:** **All Zoho service plans.**

**Pushed feed events:**
- Task creation / updates / completions
- Bug/issue creation & status changes
- Comments on tasks/bugs
- Milestone added / completed
- Project announcements

**Six slash commands** (mention the project name or ID next to the entity):

| Command | Action |
|---|---|
| `/setportal` | Set the active portal |
| `/createtask` | Create a task |
| `/createbug` | Create a bug |
| `/createmilestone` | Create a milestone |
| `/createtasklist` | Create a task list |
| `/createstatus` | Create/set a status |

**Entity — Slack channel mapping:**
- Fields: project (name/ID); Slack channel; enabled feeds (tasks, bugs/issues, comments, milestones, announcements).
- Relationships: one project to one channel; configured by portal owner.

---

### 15.5 Microsoft Teams integration

**Confidence: high (behavior), tier not specified.** Sources:
- https://www.zoho.com/projects/integrations/microsoft-teams.html
- https://help.zoho.com/portal/en/kb/projects/integration/microsoft/articles/microsoft-teams-integration

- Adds **three configurable tabs** inside Teams: **Tasks, Gantt Chart, Issues** (showing project data).
- A **Zoho Projects bot** can: create tasks, assign owners, add comments, and send notifications on task/milestone/issue/forum updates.
- Syncs with **Outlook**.
- Tier availability: **not specified.**

---

### 15.6 WorkDrive integration (document layer)

**Confidence: high.** Source: https://help.zoho.com/portal/en/kb/projects/integration/zoho-apps/articles/zoho-workdrive-integration

- **Replaced Zoho Docs** as the file/document layer. Existing Zoho Docs users must **migrate manually**.
- Create/upload/edit/share Writer/Sheet/Show files, code snippets, and screen recordings; import from Google Drive/Dropbox.
- Project-associated **Team Folders** with roles: **Admin / Organizer / Editor / Viewer**.
- **Only private team folders** can be associated with a project.
- **Deleting the integration disassociates task attachments**, but the files themselves remain in WorkDrive.
- Tier availability: **available in all plans** (a paid WorkDrive upgrade may be prompted).

---

### 15.7 Other native Zoho integrations (thin data)

The research data provides only short descriptions for these; tier availability is **not specified** for any of them, and the source is primarily the integrations landing page (https://www.zoho.com/projects/integrations.html).

| Integration | Documented behavior |
|---|---|
| **Zoho Desk** | Convert/raise a Desk ticket into a bug in Projects for dev follow-up. *(Reviewers call this "very limited" — see §15.9.)* |
| **Zoho People** | Surfaces member availability for capacity-based task assignment. |
| **Zoho Books / Invoice / Billing / Expense / ERP** | Budget planning; expense tracking; timesheet-based & GST-ready invoicing (Books); subscription/invoice mgmt (Billing); expense reports (Expense); quotes/invoices/budgets (ERP). |
| **Zoho Analytics** | Paid BI add-on; reports/dashboards from project data. |
| **Zoho Cliq** | Instant channel notifications; add tasks or issues from Cliq. |
| **Zoho Mail** | Convert emails into tasks or bugs from the inbox. |
| **Zoho Meeting** | Online discussions on specific tasks. |
| **Zoho Forms** | Auto-create tasks from form submissions. |
| **Zoho Sign** | Document signing across projects/tasks. |
| **Zoho Sprints** | Bridges classic (Projects) and agile (Sprints) workflows for hybrid teams. |
| **Zoho Flow** | No-code automation to 50+ Zoho apps and hundreds of third-party apps; recommended workaround for native-sync gaps (e.g., CRM custom-field/module mapping). |

Flow sources: https://www.zoho.com/projects/integrations.html , https://www.zohoflow.com/apps/zoho-crm/integrations/zoho-projects/

---

### 15.8 Third-party (non-Zoho) integrations

All sourced from https://www.zoho.com/projects/integrations.html unless noted. Tier availability **not specified** except where stated.

**Microsoft 365 suite** (source also: https://help.zoho.com/portal/en/kb/projects/integration/microsoft/articles/microsoft-integrations):

| Integration | Behavior |
|---|---|
| MS Excel | Import tasks/bugs |
| Microsoft Project | Migrate MS Project plans |
| OneDrive | File management |
| Outlook Calendar | Sync events |
| Office 365 | Extended functionality / SSO |
| SharePoint | Collaboration |

**Google Workspace:**

| Integration | Behavior |
|---|---|
| Google Calendar | Export/track events |
| Google Tasks | Sync tasks |
| Google Sheets | Create projects/tasks |
| Google Apps Marketplace | SSO |
| Gmail add-on | Quick task/bug/status access |
| Chrome extension | Quick task/bug/status access |

**File storage:** Dropbox and Box — attach/manage files and folders within projects/tasks (source also: https://help.zoho.com/portal/en/kb/projects/faqs/integrations/articles/what-are-the-third-party-products-integrated-with-zoho-projects).

**Data migration:** JIRA Cloud, Basecamp, Microsoft Project — import/migrate existing project data.

**Automation:** **Zapier** — connect Projects to thousands of apps via zaps.

**Other:** **Zendesk** (ticketing), **iCal** (event sync), **WhatsApp** (automated communication updates).

---

### 15.9 Limitations & community sentiment (do not sugar-coat)

Community insights below are drawn from search-result snippets; the underlying G2/Capterra pages were **bot-blocked (HTTP 403)** and could not be fetched directly. Treat these as directional, not quantified.

- **Integrations described as "flaky."** Reviewers say many integrations "don't work the way most other similar projects do." (source: https://www.g2.com/products/zoho-projects/reviews)
- **GitHub integration is weak/limited** versus competitors — commit-linking only, not deep workflow integration. (source: https://www.g2.com/products/zoho-projects/reviews)
- **Zoho Desk integration is "very limited"** with several setup bugs reported. (source: https://www.g2.com/products/zoho-projects/reviews)
- **Notification overload** is a recurring complaint — excessive email/feed notifications can confuse users if not configured carefully. This is directly relevant when designing Slack/Cliq/Teams feed events (§15.4–15.5): enable feeds selectively. (source: https://www.techharry.com/2025/11/zoho-projects-review.html)
- **Ecosystem lock-in is the value proposition.** Teams already in the Zoho stack report strong value from the deep native CRM/Books/Analytics data ties; non-Zoho stacks lean on Slack/Google Drive and find them adequate but shallower. (source: https://www.invensislearning.com/blog/zoho-projects-review/)

**Sources that could not be verified directly (transparency):**
- https://www.g2.com/products/zoho-projects/reviews — HTTP 403 (bot-blocked); insights from snippets only.
- https://aaxonix.com/resources/zoho-projects-github-integration/ — ECONNREFUSED (unreachable).
- Reddit r/zoho threads — not surfaced by the search used; community angle relies on G2/Capterra/review-site snippets.
- slack.com/marketplace and projects.zoho.com/slack — not fetched directly; Slack details corroborated via the help.zoho.com Slack article.

---

### 15.10 Builder checklist (reusable patterns)

1. **VCS pipeline:** Implement per-project Service Hooks (*Developer Space > Service Hooks*) that parse `[#ISSUEID]` / `[#ID1,#ID2]` from commit messages and create Changesets on the matching Issues/Bugs. This is shared by GitHub, GitLab, Bitbucket, and Gitea. Gate GitHub behind Premium/Enterprise.
2. **CRM sync:** Build asymmetric task sync (auto-in from CRM, manual push out via "Save to Zoho CRM"); sync only the 6 fields (title, description, due date, priority, status, owner); support 10 modules but only auto-map custom fields for standard Deals/Accounts layouts. Route everything else through Flow/Deluge.
3. **Chat feeds:** One-project-to-one-channel mapping (Slack), portal-owner-only configuration, selectable feed events, and slash-command entity creation. Default feeds to **off/minimal** to avoid the notification-overload complaint.
4. **Document layer:** Associate only private Team Folders; preserve files on integration deletion (disassociate, don't delete); 4-role model (Admin/Organizer/Editor/Viewer).
5. **Escape hatch:** Use Flow/Zapier as the documented workaround for any native-sync gap.
## 16. API & Developer Platform

This section documents the Zoho Projects REST API and surrounding developer tooling as needed to build a faithful clone. Where the research data is thin or only partially confirmed, that is stated explicitly rather than padded.

### 16.1 Overview

Zoho Projects exposes a **REST API** that has been standardized on **V3** with the base URL `https://projectsapi.zoho.com/api/v3`. Legacy help docs still describe the older `/restapi/` V1/V2 endpoint shapes, which retire on **31 December 2025** (source: https://goldstarit.com/zoho-projects-v3-apis-update/) (source: https://projects.zoho.com/api-docs).

Key architectural facts:

- The API is **organized per-portal and per-project**: most paths are scoped as `/portal/[PORTALID]/projects/[PROJECTID]/<entity>/`. Portal ID and project ID are mandatory path components for most operations (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html) (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html) (source: https://www.zoho.com/projects/help/rest-api/milestones-api.html).
- **Auth is OAuth 2.0 only** (`Authorization: Bearer <token>`), with granular per-module, per-operation scopes.
- **Rate limiting is per-API-endpoint, not global.**
- **V3 standardizes** JSON-only payloads, ISO 8601 dates, PATCH for partial updates, page-based pagination, request/response symmetry, custom-field API names, and OR-condition filtering.
- Beyond REST, automation is available via **webhooks** (Enterprise-only), **Deluge custom functions**, and **Blueprints**.

> Limitation on sourcing: the full V3 API docs SPA at `https://projects.zoho.com/api-docs` exceeded the 10 MB fetch limit and could not be scraped directly. Several V3-specific claims (base URL, scopes, pagination, new modules) rely on search-engine snippets and Zoho-partner summaries rather than the primary doc. These are flagged where relevant.

### 16.2 Entities and resource model

Entities exposed by the API include: portals, projects, project groups, milestones, tasklists, tasks (with subtasks, comments, attachments, dependencies, followers, activities, status history, recurrence, reminders), bugs/issues, time logs/timesheets, events, and users. **V3 adds seven new modules**: Blueprints, Attachments, Leaves, Profiles, Roles, Clients, and Module Meta (layouts/custom fields) (source: https://help.zoho.com/portal/en/community/topic/explore-v3-apis-simplified-streamlined).

Resources nest under a portal and (usually) a project:

```
/portal/[PORTALID]/projects/[PROJECTID]/<entity>/
```

The entity reference below lists the fields confirmed in the legacy REST docs (V1/V2 shapes). V3 keeps the same logical entities but changes serialization (JSON-only, ISO dates, custom-field API names).

#### Portal

Top-level account workspace (organization). Root entity; all other resources nest under a portal ID (source: https://www.zoho.com/projects/help/rest-api/portals-api.html).

| Field | Notes |
|---|---|
| `id` | Portal identifier |
| `name` | Portal name |
| `default` | Current-portal flag |
| `role` | Caller's role in the portal |
| `settings` | Portal settings |
| available user count | via `/users/availcount/` |

Relationships: contains Projects, Users, Roles, Profiles, Clients, Groups.

#### Project

Top-level container under a portal. Create/update via POST (legacy), delete via DELETE. Status: `active`, `archived`, `template` (source: https://www.zoho.com/projects/help/rest-api/projects-api.html).

| Field | Notes |
|---|---|
| `id`, `id_string` | Identifiers |
| `name` | max 100 chars |
| `description` | |
| `status` | `active` \| `archived` \| `template` |
| `owner_id`, `owner_name`, `role` | |
| `is_public`, `is_strict` | yes/no |
| `start_date`, `end_date` | `MM-DD-YYYY` (legacy) |
| `start_date_long`, `end_date_long` | epoch ms |
| `created_date(_long)`, `updated_date(_long)` | |
| `project_percent` | |
| `task_count` | `{open, closed}` |
| `milestone_count` | `{open, closed}` |
| `bug_count` | `{open, closed}` |
| `budget_type` | 0=None, 1=Based on Project, 3=Based on Milestone, 5=Based on Task, 7=Based on User |
| `budget_value` | |
| `budget_tracking_method` | 1=Project, 2=Staff, 4=Task/Issue hrs |
| `billing_method` | 1=Based on project hours, 2=Based on staff hours, 3=Fixed cost for project, 4=Based on task/issue hours |
| `threshold`, `currency`, `project_rate`, `fixed_cost`, `cost_per_hour`, `revenue_budget` | Budget/billing |
| `taskbug_prefix`, `bug_prefix` | |
| `custom_status_id` | |
| `IS_BUG_ENABLED` | |
| `enable_rollup`, `enable_sprints` | yes/no |
| `bill_status` | Billable \| Non billable |
| `group_id` | |
| `cascade_setting` | `{date, logHours, plan, percentage, workHours}` |
| `layout_details` | `{task, project}` |
| `link` | `{self, activity, document, forum, timesheet, task, bug, status, milestone, tasklist, event, folder, user}` |

Relationships: belongs to a Portal and optionally a project Group; contains Milestones, Tasklists, Tasks, Bugs, Events, Users, Time logs.

#### Task

Work item within a project/tasklist. Supports subtasks, comments, attachments, dependencies, followers, activities, status history, recurrence, reminders (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html).

| Field | Notes |
|---|---|
| `id`, `id_string`, `key` | `key` e.g. `DC-T666` |
| `name`, `description` | |
| `status` | `{name, id, type, color_code}`; `type` is `open` \| `closed` (V3 also exposes `is_closed_type`) |
| `priority` | None \| Low \| Medium \| High |
| `completed` | |
| `percent_complete` | integer in multiples of 10 (10–100) |
| `start_date(_long)`, `end_date(_long)` | |
| `duration`, `duration_type` | `days` \| `hrs` |
| `created_time(_long)`, `last_updated_time(_long)`, `completed_time(_long)` | |
| `details.owners[]` | `{id, name, zpuid, email, work}` |
| `created_by`, `created_by_zpuid` | |
| `work` | `HH:MM` |
| `work_type` | `work_hrs_per_day` \| `work_in_percentage` \| `work_hours` |
| `log_hours` | `{billable_hours, non_billable_hours}` |
| `billingtype` | None \| billable \| non billable |
| `rate_per_hour`, `cost_per_hour`, `actual_cost`, `planned_cost`, `forecasted_cost`, `budget_value`, `revenue_budget` | |
| `parent_task_id`, `root_task_id`, `depth`, `isparent` | Subtask-tree model |
| `tasklist` `{name, id}`, `tasklist_id` | |
| `project` `{name, id}`, `milestone_id` | |
| `is_reminder_set`, `is_recurrence_set`, `is_sprints_task` | |
| `order_sequence` | |
| `custom_fields[]` | |
| `tags[]` | `{name, id, color_class}` |
| `task_followers` | |
| `link` | `{self, timesheet}` |

Notes / limitations:
- **Subtask nesting up to 6 levels deep** per parent task.
- **Custom task statuses** are supported via the `custom_status` parameter (a status ID), available from the **Premium** plan upward. (It is custom **fields**, not custom statuses, that are Enterprise-only.)
- Recurrence on tasks is limited to **2–30 occurrences**; the task `filter` parameter accepts a maximum of **2 objects** (confidence: medium).

Relationships: belongs to Project + Tasklist; can have parent/root Task; links to Milestone, Bugs (associate/dissociate), Followers, Time logs, Comments, Attachments, Dependencies (FS/SS/SF/FF).

#### Bug / Issue

Issue-tracker record within a project. Supports comments, attachments, followers, resolution, activities, timer, custom views, default/custom/renamed fields, task association (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html).

| Field | Notes |
|---|---|
| `id`, `key`, `title`, `description` | |
| `flag` | Internal \| External |
| `closed` | |
| `project.id` | |
| `status` | `{id, type}` |
| `severity` | `{id, type}` |
| `classification` | `{id, type}` |
| `reproducible` | `{id, type}` |
| `assignee_name`, `reporter_id`, `reported_person` | |
| `bug_followers[]` | |
| `created_time(_format,_long)`, `due_date(_long)`, `updated_time(_format,_long)` | |
| `module` | `{id, name}` |
| `milestone` | `{id, name}` |
| `affectedmile` | |
| `customfields[]` | `{label_name, column_name, value}` |
| `rate_per_hour`, `cost_per_hour` | |
| `resolution` | `{resolution, resolver, resolver_id, resolved_time}` |
| `link` | `{self, timesheet}` |
| `page_info` | `{page, per_page, count, has_next_page}` |

Default (user-customizable, per project) picklists per the Bugs API docs — note exact doc spellings:

| Field | Default values |
|---|---|
| `severity` | Show stopper, Critical, Major, Minor |
| `reproducible` | Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable |
| `classification` | Security, Not a bug, Crash/Hang, DataLoss, Performance, UI/Usabililty *(sic — typo in official doc)*, OtherBug, Feature(New), Enhancement, Support Request |

Relationships: belongs to Project; references Module, Milestone, Severity, Classification, Reproducibility; associates to Tasks; has Comments, Attachments, Followers, Resolution, Activities.

#### Milestone (UI name: "Phase")

Project deliverable marker. Create/update via POST; dedicated status-update endpoint (`1`=notcompleted, `2`=completed) (source: https://www.zoho.com/projects/help/rest-api/milestones-api.html).

> "Milestone" was renamed to **"Phase"** in the UI, but the **REST API still uses milestone terminology** — endpoints under `.../milestones/` with path identifier `[MILESTONEID]`, a JSON `id` field inside a `milestones` array; the word "phase" does not appear in the milestones API docs. Phase and milestone are the same underlying entity (UI-only rename).

| Field | Notes |
|---|---|
| `id` | |
| `name` | max 100 |
| `owner_name`, `owner_id` | |
| `flag` | internal \| external |
| `start_date`, `start_date_long`, `end_date`, `end_date_long` | |
| `status` | |
| `completed_date`, `completed_date_long` | |
| `budget`, `threshold`, `revenue_budget` | |

Relationships: belongs to Project; groups Tasklists/Tasks and Bugs.

#### Tasklist

Grouping of tasks within a project; tasks can be moved between tasklists via the move endpoint (source: https://www.zoho.com/projects/help/rest-api/tasklists-api.html).

| Field | Notes |
|---|---|
| `id`, `name` | |
| `milestone_id` | optional parent milestone |
| `completed` | flag |
| `created_time` | |
| `tasks[]` | |

Relationships: belongs to Project; optionally under a Milestone; contains Tasks. (Every project has at least one task list; the default is named "General".)

#### User

Portal/project member. Add/update/delete at portal or project level; activate/deactivate; available-count endpoint. **PATCH supported for portal user update** (source: https://www.zoho.com/projects/help/rest-api/users-api.html).

| Field | Notes |
|---|---|
| `id`, `name`, `email`, `active` | |
| `role` | admin \| manager \| employee \| contractor \| client |
| `rate`, `zpuid` | |
| `profile_id`, `profile_name` | |
| `profile_type` | 2=admin, 3=client, 6=manager, 7=employee |
| `role_id`, `role_name` | |
| `invoice`, `currency_code` | |
| `associated_projects[]` | |
| `client_company_name`, `client_company_id` | |

Relationships: belongs to Portal; associated with multiple Projects; linked to Roles, Profiles, and (for clients) a Client company.

#### Time log (Timesheet entry)

Logged hours against project/task/bug. Retrieved at project and task level (source: https://www.zoho.com/projects/help/rest-api/log-time.html).

| Field | Notes |
|---|---|
| `id`, `notes` | |
| `owner_id`, `owner_name` | |
| `log_date_format`, `log_date_long` | |
| `hours`, `minutes`, `total_minutes` | |
| `cost` | |
| `bill_status` | Billable \| Non Billable |
| `start_time`, `end_time` | |
| `approver_name`, `approval_status` | Approved \| Pending \| Rejected |
| `invoice_id` | invoiceable only for portals integrated with Zoho Invoice/Finance |
| `created_time_long`, `created_time_format` | |
| `last_modified_date`, `last_modified_time_long`, `last_modified_time_format` | |
| `custom_fields[]` | `{column_name, label_name, value}` |

Endpoints: task-level `/tasks/[TASKID]/logs/`, bug-level `/bugs/[ID]/logs`, and project/general `/projects/[PROJECTID]/logs/`. Supports billable/non-billable hours, approval status, invoice association, and custom fields.

Relationships: belongs to Project, optionally to a Task or Bug; created by a User; may be tied to an Invoice and an approval workflow.

### 16.3 Authentication — OAuth 2.0 and scopes

OAuth 2.0 is the **only** auth method. The access token is sent as `Authorization: Bearer <token>`. Tokens expire (`expires_in` seconds); **refresh tokens are mandatory in V3** (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html) (source: https://www.zoho.com/projects/help/rest-api/projects-api.html) (source: https://ascentbusiness.co.uk/zoho-projects-api-deadline-migrate-to-v3-by-31-december-2025/).

Scopes are **granular per module and per operation**:

```
ZohoProjects.<module>.<READ|CREATE|UPDATE|DELETE|ALL>
```

Examples: `ZohoProjects.projects.READ`, `ZohoProjects.tasks.ALL`. Multiple scopes are **comma-separated**. File operations use separate scopes: `ZohoPC.files.*` and `WorkDrive.files.ALL`.

### 16.4 Rate limiting (per-endpoint)

The limit is **applied per API endpoint, not globally** (source: https://projects.zoho.com/api-docs) (source: https://help.zoho.com/portal/en/community/topic/zoho-projects-api-100-requests-2-min-limit) (source: https://www.zoho.com/developer/help/api/api-limits.html).

| Doc version | Window | Penalty |
|---|---|---|
| V3 | 200 calls / 2-minute window | 10-minute block when exceeded |
| Legacy (V1/V2) | 100 calls / 2-minute window | 30-minute lockout |

Response headers: `RateLimit`, `RateLimit-Remaining`, `RateLimit-Window`, `RateLimit-Window-Unit`, `Retry-After`.

> Developer-experience caveat: Zoho's own community confirms the docs' phrase "particular API request" is ambiguous — developers repeatedly ask whether the limit is global or per-endpoint. The practical answer is **per-endpoint** (source: https://help.zoho.com/portal/en/community/topic/zoho-projects-api-100-requests-2-min-limit).

Separately, **Deluge custom functions** that call Zoho APIs are subject to Zoho-wide integration-task limits (commonly cited as ~5000 Zoho API calls/day via Deluge), distinct from the per-endpoint REST limit (confidence: **low**) (source: https://www.zoho.com/developer/help/api/api-limits.html).

### 16.5 Pagination

- **V3**: page-based pagination on all list endpoints via `page` and `per_page` params; responses include `page_count` / `has_next_page` (a `page_info` object: `page`, `per_page`, `count`, `has_next_page`).
- **Legacy**: index + range offset pagination (`index`, `range`), with `range` max **100**.

(source: https://projects.zoho.com/api-docs) (source: https://help.zoho.com/portal/en/community/topic/explore-v3-apis-simplified-streamlined) (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html)

### 16.6 Multi-datacenter

Zoho is multi-DC; a user's data lives in **exactly one DC**. Developers must call the `api_domain` returned in the token response and **must never hardcode** the domain. Use the matching `accounts.zoho.<dc>` for OAuth (source: https://www.zoho.com/accounts/protocol/oauth/multi-dc.html) (source: https://projects.zoho.com/api-docs).

| Region | API domain | OAuth/accounts domain |
|---|---|---|
| US | `projectsapi.zoho.com` | `accounts.zoho.com` |
| EU | `.eu` | `accounts.zoho.eu` |
| IN | `.in` | `accounts.zoho.in` |
| AU | `.com.au` | `accounts.zoho.com.au` |
| CN | `.com.cn` | `accounts.zoho.com.cn` |

### 16.7 V1/V2 deprecation and V3 migration (mandatory by 31 Dec 2025)

Migration to V3 is **mandatory by 31 December 2025**. Legacy V1/V2 REST and XML/JSON endpoints **stop functioning after the deadline**; V2 is in maintenance mode (source: https://ascentbusiness.co.uk/zoho-projects-api-deadline-migrate-to-v3-by-31-december-2025/) (source: https://www.infomazeelite.com/blog/zoho-announces-mandatory-migration-to-projects-api-v3-what-it-means-for-your-business/) (source: https://goldstarit.com/zoho-projects-v3-apis-update/).

What changes in V3 (a clone targeting parity should match these conventions):

| Concern | Legacy V1/V2 | V3 |
|---|---|---|
| Base path | `/restapi/` | `/api/v3/` |
| Payload format | XML or JSON | JSON only |
| Dates | `MM-DD-YYYY` + epoch `_long` | ISO 8601 |
| Updates | POST | PATCH (partial updates) |
| Pagination | index/range offset (range max 100) | page / per_page |
| Custom fields | `UDF_*` columns | custom-field API names / `cfid` (passed as a `custom_fields` JSON object) |
| Refresh tokens | — | mandatory |
| Filtering | — | OR-condition filtering; request/response symmetry |

> Migration risk signal: multiple Zoho implementation partners (Infomaze, Ascent, Goldstar IT) published urgent migration advisories near the deadline, indicating a large base of integrations still ran on V1/V2 and faced breakage (source: https://www.infomazeelite.com/blog/zoho-announces-mandatory-migration-to-projects-api-v3-what-it-means-for-your-business/).

### 16.8 Selected endpoint behaviors

#### Task dependencies

Dependencies are managed via a single `/taskdependency/` **POST** endpoint, differentiated by a `toupdate` parameter (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html):

| `toupdate` value | Purpose |
|---|---|
| `dependencyset` | Create a dependency |
| `gapupdate` | Update lag/gap |
| `dependencytypeupdate` | Change dependency type |
| `removedependency` | Remove a dependency |

Supported types: **FS, SS, SF, FF**. Lag is set via `gapvalue` / `gaptype` (days or hours). Cross-project dependencies are supported via `childprojId`.

#### Custom fields

Custom fields are **Enterprise-plan only**. Referenced via `UDF_*` columns (legacy) or custom-field API names / `cfid` (V3), passed as a `custom_fields` JSON object (confidence: high; tier note important=false) (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html) (source: https://help.zoho.com/portal/en/community/topic/explore-v3-apis-simplified-streamlined).

#### File / attachment uploads

Per-file cap of **128 MB**; requires `ZohoPC.files` / `WorkDrive.files` scopes (confidence: **medium**) (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html) (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html).

### 16.9 Automation beyond REST

#### Webhooks (Enterprise-only)

Outbound webhooks for **Tasks** and **Issues**, configured at **Settings > Automation > Webhooks**. Method: **POST (default) or GET** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/webhooks-for-tasks) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/issue-webhooks).

| Config field | Limit |
|---|---|
| Name | max 100 chars |
| URL to notify | max 1000 chars |
| Append task parameters | max 3000 chars |
| Append custom parameters | max 3000 chars |
| Append request headers | max 3000 chars |

Operational limits: **max 2000 triggers/day**; **auto-disable after 20 failed calls in one day**.

- **Tier availability: Enterprise plan only.**

#### Custom functions (Deluge) and Blueprints

Automation via **Deluge custom functions** (the `invokeurl` task for outbound HTTP/API calls), attached to workflow rules, blueprint transitions, or buttons. **Blueprints** model workflows as statuses + transitions to automate task state changes. V3 adds a **Blueprints API module** (task creation, updates, execution) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects) (source: https://www.zoho.com/deluge/help/webhook/invokeurl-api-task.html) (source: https://help.zoho.com/portal/en/community/topic/explore-v3-apis-simplified-streamlined).

### 16.10 SDKs and client libraries

Official SDK support is **thin** — a clone team should plan to call the REST API directly rather than depend on a Zoho SDK.

- **Official Python wrapper** (`github.com/zoho/projects-python-wrappers`): covers portals, projects, milestones, tasklists, events. **Manual install** (folder copy), ~3 stars, 9 commits, no releases, **no confirmed V3 support** (confidence: medium) (source: https://github.com/zoho/projects-python-wrappers).
- **No dedicated official Java or PHP Projects SDK.** V3 docs provide code samples in PHP, Python, Java, C#, Go, and Node.js (source: https://projects.zoho.com/api-docs).
- **Community MCP server** exists (`qpiai/zoho-projects-mcp`) — early interest in wiring Zoho Projects into AI/agent tooling, but **not** an official Zoho offering (source: https://glama.ai/mcp/servers/qpiai/zoho-projects-mcp).

### 16.11 Data import / export

There is **no first-class bulk export/import REST endpoint** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/import-data/articles/import-tasks-from-files) (source: https://skyvia.com/data-integration/zoho-projects-csv-file-import-and-export):

- **UI import** (Settings > Import Data) supports **XLS / CSV / JSON / MPP** for tasks, and **CSV** for users.
- **Bulk programmatic ETL** relies on REST loops or third-party tools (e.g., Skyvia: insert/update/delete/upsert and export of projects/tasks/events).

(confidence: medium)

### 16.12 Developer-experience notes and limitations

- A developer publicly called Zoho Projects "my least favorite API to work with out of all the Zoho apps"; Zoho acknowledged the feedback and said it would improve, aligning with the V3 standardization effort (source: https://help.zoho.com/portal/en/community/topic/announcing-the-zoho-projects-api).
- The rate-limit docs' wording ("particular API request") causes repeated confusion about global vs. per-endpoint scope (per-endpoint is correct) (source: https://help.zoho.com/portal/en/community/topic/zoho-projects-api-100-requests-2-min-limit).
- Official SDK traction is minimal; developers largely call REST directly (source: https://github.com/zoho/projects-python-wrappers).

#### Gaps in the research (be transparent)

- The primary V3 API docs SPA (`https://projects.zoho.com/api-docs`) could not be fully fetched (>10 MB); V3 base URL, scopes, and pagination details lean on partner summaries and snippets.
- No directly fetchable developer-sentiment posts were found on Reddit / X / LinkedIn (LinkedIn is login-gated).
- G2 / Capterra / TrustRadius reviews cover product UX, not the API specifically, and surfaced no API-developer reviews.
- File-upload 128 MB cap and SDK/import details are **medium** confidence; the Deluge ~5000 calls/day figure is **low** confidence.
## 17. Pricing & Feature-Gating Matrix

This section documents Zoho Projects' subscription tiers and the per-tier feature/limit gating that a builder must replicate. The single most build-critical asset is the official feature comparison page (source: https://www.zoho.com/projects/pricing-comparison.html), which exposes a detailed feature-by-tier matrix with hard numeric limits. All limit/feature numbers below come directly from that page; dollar prices come from third-party aggregators (see limitations).

### 17.1 Limitations & Source Caveats (read first)

Do not treat this section as a flawless price sheet. Known gaps and discrepancies:

- **Dollar amounts are NOT primary-sourced.** The official comparison page renders prices via JavaScript and could not be scraped for the actual dollar figures. The feature/limit *numbers* were retrieved successfully, but the per-user *prices* below are corroborated from review aggregators (Capterra, tech.co), not the official page (source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.capterra.com/p/169455/Zoho-Projects/pricing/).
- **Some sources could not be fetched.** G2's pricing page returned HTTP 403 (bot-blocked) and tech.co returned a connection error; their figures were taken from search snippets / corroboration rather than direct fetch.
- **Free-trial length is contested.** The official comparison page states a 15-day free trial (no credit card); some third-party sources cite 10 days. Confidence: medium.
- **Subtask nesting depth.** The pricing matrix does not gate subtask depth; the official subtasks help page does not publish a maximum nesting number in the pricing context. (Note: separately, Zoho's task help docs document a 6-level subtask nesting limit — that is a product limit, not a tier gate.)
- A deprecated "Express" tier appears in some third-party blogs. The current official lineup is **Free / Premium / Enterprise / Ultimate** only — do not build an Express tier.

### 17.2 The Four Tiers (headline)

Zoho Projects sells exactly four self-serve editions. Paid plans are available via a no-credit-card free trial without sales contact (source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.zoho.com/projects/zohoprojects-pricing.html).

| Tier | Per-user / mo (annual-billed) | Per-user / mo (monthly-billed) | Max users | Max projects | Storage |
|---|---|---|---|---|---|
| Free | $0 | $0 | 5 | 3 | 5 GB (shared) |
| Premium | $4 | $5 | Unlimited | Unlimited | 100 GB |
| Enterprise | $9 | $10 | Unlimited | Unlimited | 120 GB |
| Ultimate | $14 | ~$15 | Unlimited | Unlimited | 15 GB/user OR 150 GB/org (whichever is higher) |

- Annual billing reflects Zoho's advertised "save over 15%" discount versus monthly. The $4/$9 figures are the annual-billed rates; $5/$10 are the monthly-billed rates for Premium/Enterprise (source: https://www.capterra.com/p/169455/Zoho-Projects/pricing/; source: https://tech.co/project-management-software/zoho-projects-pricing-review).
- Free is "free forever" for up to 5 users. Older sources cite 3 users / 2 projects, indicating the free-tier limits were expanded over time — build to the *current* limits (5 users / 3 projects / 5 GB) (source: https://www.zoho.com/projects/zohoprojects-pricing.html).
- Free excludes Zia AI entirely.

### 17.3 Gating Patterns (the "where features start" summary)

The matrix follows three escalation patterns a builder should internalize:

- **Starts at Premium:** Blueprints, time tracking (timelogs/timesheets), recurring tasks, task duration, task rollup, budgeting + EVM, custom views, custom-module fields, recurring/business automation basics, and Zia content generation.
- **Starts at Enterprise:** custom fields on *built-in* modules (Task/Issue/Project/Milestone/Timelog), SLA on issues, critical path, baselines, inter-project (across-project) dependencies, read-only users, SSO/custom profiles & roles, custom domain, sandboxes, scheduled export, Power BI integration.
- **Highest limits at Ultimate:** custom modules, automation action volumes, storage, and multi-user multi-project timesheets.

### 17.4 Core Limits by Tier

| Capability | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Users | 5 | Unlimited | Unlimited | Unlimited |
| Projects | 3 | Unlimited | Unlimited | Unlimited |
| Storage | 5 GB | 100 GB | 120 GB | 15 GB/user or 150 GB/org |
| Project templates | — | 20 | 30 | 50 |
| Read-only users (included) | — | — | 10 | 100 |
| Resources (equipment/non-login) | — | — | via add-on | 100 |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.5 Tasks, Scheduling & Dependencies

| Feature | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Subtasks | Yes | Yes | Yes | Yes |
| Task dependencies | Within-project, Finish-to-Start only | Within-project, all 4 types | Across-projects, all 4 types | Across-projects, all 4 types |
| Recurring tasks | — | Yes | Yes | Yes |
| Task duration (hrs/days) | — | Yes | Yes | Yes |
| Task rollup | — | Yes | Yes | Yes |
| Reminders | Yes | Yes | Yes | Yes |
| Gantt chart + timeline Gantt | Yes | Yes | Yes | Yes |
| Critical path | — | — | Yes | Yes |
| Baseline (snapshots) | — | — | 15/project, multi-baseline | 15/project, multi-baseline |

- Subtasks roll up to summary tasks, milestones, and the project. The pricing/subtasks help page does not publish a max nesting depth (source: https://help.zoho.com/portal/en/kb/projects/tasks/subtasks/articles/subtasks-projects).
- The Free→Premium dependency jump (Finish-to-Start only → all 4 types) and the Premium→Enterprise jump (within-project → inter-project) are the two key dependency gates (source: https://www.zoho.com/projects/pricing-comparison.html).

### 17.6 Time Tracking & Budgeting

| Feature | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Timelogs / timesheets | — | Yes | Yes | Yes |
| Timesheet approval | — | Yes | Yes | Yes |
| Log restriction | — | Yes | Yes | Yes |
| Multi-user multi-project timesheets | — | — | — | Yes (Ultimate only) |
| Project budget | — | Yes | Yes | Yes |
| Earned Value Management (EVM) | — | Yes | Yes | Yes |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.7 Resource Utilization / Workload

| Feature | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Workload report | — | Project-specific | Across projects | Across projects |
| Planned vs Actual | — | Project-specific | Across projects | Across projects |

The Resource Utilization chart compares assigned hours to capacity (source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.zoho.com/projects/zohoprojects-tips-tricks.html).

### 17.8 Issue Tracker Gating

| Feature | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Add issue via email | — | Yes | Yes | Yes |
| Business rules | — | Yes | Yes | Yes |
| Web-to-issue form | — | Yes | Yes | Yes |
| Issue custom fields | — | — | Yes (120) | Yes (120) |
| Link issues | — | — | Yes | Yes |
| Issue email settings / custom email templates | — | — | Yes | Yes |
| Webhooks (on issues) | — | — | Yes | Yes |
| SLA (service level agreements) | — | — | Yes | Yes |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.9 Blueprints (task process automation)

Blueprints define statuses, transitions, owners, and conditions via drag-and-drop. They are count-gated and not available on Free.

| Limit | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Blueprint tasks | — | 2 | 25 | 50 |
| Parallel transitions | — | — | Yes | Yes |

(source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.zoho.com/projects/blueprint.html)

### 17.10 Workflow / Automation Limits

This is the most heavily count-gated area — replicate the exact per-tier ceilings.

| Limit | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Workflow rules | 2 | 2 | 20 | 40 |
| Macro rules | 2 | 2 | 20 | 40 |
| Webhooks / day | 20 | 200 | 2,000 | 10,000 |
| Automation actions / month | 50 | 500 | 50,000 | 500,000 |
| Custom functions / day | 50 | 500 | 5,000 | 10,000 |
| Zoho Flow actions / month | 100 | 100 | 100 | 100 |
| Schedule functions | — | — | Yes | Yes |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.11 Custom Fields, Views & Layout Rules

Custom fields on **built-in modules** require Enterprise+; **custom-module** fields start at Premium.

| Built-in module custom fields | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Task | — | — | 265 | 265 |
| Issue | — | — | 120 | 120 |
| Project | — | — | 155 | 155 |
| Milestone (Phase) | — | — | 215 | 215 |
| Timelog | — | — | 55 | 55 |
| User custom fields | — | — | Yes | Yes |

| Other field/view limits | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Custom-module fields | — | 52 | 155 | 260 |
| Layout rules / task | — | 2 | 5 | 20 |
| Custom views | — | Yes | Yes | Yes |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.12 Custom Modules

| Limit | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Project custom modules | — | 5 | 10 | 20 |
| Records / project module | — | 10K | 100K | 1M |
| Organization custom modules | — | — | 5 | 20 |
| Records / global module | — | — | 10K | 100K |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.13 Dashboards & Reports

| Limit | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Project dashboards | 1 | 5 | 10 | Unlimited |
| Global dashboards | 1 | 1 | 5 | Unlimited |
| Private dashboards | — | — | Yes | Yes |
| Dashboard sharing | — | — | Yes | Yes |
| Custom reports / module | 1 (predefined) | 20 | 50 | 250 |
| Global custom reports / module | — | 20 | 50 | 250 |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.14 Zia AI Gating

| Feature | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Zia Insights | — | Yes | Yes | Yes |
| Zia Translate | — | Yes | Yes | Yes |
| Zia content generation | — | Yes | Yes | Yes |
| Zia Search | — | — | Yes | Yes |
| MCP Server | Yes | Yes | Yes | Yes |

Free excludes Zia AI. Zia content/insights/translate start at Premium; Zia Search starts at Enterprise (source: https://www.zoho.com/projects/pricing-comparison.html).

> Note: Zoho's marketing AI page (zoho.com/projects/ai.html) states AI is "Included" with "No additional charges across all plans" and its FAQ specifies AI capabilities span Premium, Enterprise, and Ultimate. The pricing page introduces "Smart AI Capabilities with Zia" (Zia Summary, Translate, Task/Subtask Creation, Insights) under Premium, inherited cumulatively by Enterprise and Ultimate. Client users and read-only users cannot access any AI.

### 17.15 Enterprise-Only Governance

Available Enterprise+ (and Ultimate): custom profiles/roles, user hierarchy, teams, read-only users, custom domain, SSO, custom statuses (UI-level), scheduled export, and Power BI integration.

| Feature | Enterprise | Ultimate |
|---|---|---|
| Sandboxes | 1 | 10 |
| Custom profiles/roles, user hierarchy, teams | Yes | Yes |
| Custom domain | Yes | Yes |
| SSO | Yes | Yes |
| Scheduled export | Yes | Yes |
| Power BI integration | Yes | Yes |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.16 Business Calendars, Holidays & Web Tabs

| Limit | Free | Premium | Enterprise | Ultimate |
|---|---|---|---|---|
| Business calendars | — | 1 | 3 | 20 |
| Holiday lists | — | — | 3 | 20 |
| Project web tabs | — | 2 | 30 | 50 |
| Global web tabs | — | 2 | 15 | 30 |

(source: https://www.zoho.com/projects/pricing-comparison.html)

### 17.17 Add-ons

Add-ons attach to a subscribed paid plan and extend plan defaults.

| Add-on | Eligible tiers | Pack / billing |
|---|---|---|
| Client Users | All paid tiers | Billed monthly/annual |
| Read-only Users | Enterprise, Ultimate | 5-user packs |
| Resources (equipment/non-login) | Enterprise, Ultimate | 5-packs |
| Lite Users | Ultimate only | — |
| Custom Domain | Enterprise (positioned as add-on/feature) | — |

(source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.zoho.com/projects/zohoprojects-pricing.html)

### 17.18 Free Trial

The official comparison page states a **15-day free trial, no credit card required**. Some third-party sources state 10 days — discrepancy noted, confidence medium (source: https://www.zoho.com/projects/pricing-comparison.html; source: https://www.g2.com/products/zoho-projects/pricing; source: https://www.capterra.com/p/169455/Zoho-Projects/pricing/).

### 17.19 Suggested Data Model for Gating

To implement this matrix, model three entities (source: https://www.zoho.com/projects/pricing-comparison.html):

- **Plan** — `name (Free|Premium|Enterprise|Ultimate)`, `pricePerUserAnnual`, `pricePerUserMonthly`, `maxUsers`, `maxProjects`, `storageGB`, `trialDays`. An Organization subscribes to one Plan.
- **FeatureFlag/Limit** — `featureKey`, `tier`, `enabled` (boolean), `numericLimit`, `period (per day/month/project/module)`. Each Limit belongs to one Plan and one capability; consumed by Automation, CustomFields, and Reports modules. Note the mix of boolean gates (e.g., critical path, SLA) and numeric caps (e.g., `automationActionsPerMonth`, `baselinesPerProject`, `customFieldsTask`).
- **Addon** — `type (ClientUser|ReadOnlyUser|Resource|LiteUser|CustomDomain)`, `packSize`, `eligibleTiers`, `billingCycle`. Read-only/Resource sold in 5-packs.

### 17.20 Community Reception (value vs. friction)

Ratings: Capterra 4.5/5 (400+ reviews), G2 4.3/5 (300+ reviews), Gartner 4.3.

- **Praised:** value-for-money — enterprise features at SMB prices; task hierarchies and dependencies (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/; source: https://www.g2.com/products/zoho-projects/pricing).
- **Criticized (do not sugar-coat):** per-user pricing gets costly as teams grow; lower plans have limited customization; cluttered UI with a steep learning curve; mobile app less capable than desktop; complex permission settings; and **privacy gaps** where restricted users can still view others' tasks, comments, and client details. UI friction creating tasks/subtasks is called out versus Asana (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/; source: https://www.g2.com/products/zoho-projects/pricing).
- Zoho Help community threads indicate users find the dependency-vs-subtask distinction and Blueprint setup non-obvious (source: https://help.zoho.com/portal/en/community/topic/dependencies-or-subtasks).
## 18. Community Sentiment & Real-World Usage

This section summarizes how Zoho Projects is perceived across review aggregators, vendor case studies, and community forums, and what real-world usage tells a builder about expected pain points. **Important methodological limitation:** several primary sources could not be fetched directly during research (see "Source-Access Limitations" at the end). Where ratings or quotes are reported, they come from search snippets or secondary blogs rather than the live review pages, so treat aggregate numbers as approximate.

### 18.1 Overall sentiment

Across review aggregators and community forums, Zoho Projects reads as a well-liked, affordable, feature-dense PM tool that is **strongest for SMBs already inside the Zoho ecosystem** and **weakest on UI polish, mobile parity, and performance at scale**. The reviewer base skews heavily toward small business: per enlyft, roughly 70% of Zoho Projects customers are small (under $50M revenue), ~13% large (over $1B), and ~11% medium-sized (confidence: medium) (source: https://enlyft.com/tech/products/zoho-projects).

Zoho markets Projects as used by more than 200,000 businesses worldwide (confidence: medium; vendor self-reported) (source: https://www.zoho.com/projects/).

### 18.2 Aggregate ratings

| Platform | Rating | Review count | Notes | Source |
|---|---|---|---|---|
| Capterra | 4.5 / 5 | 863 verified reviews | High confidence | https://www.capterra.com/p/169455/Zoho-Projects/reviews/ |
| G2 | ~4.3 / 5 | 300+ reviews | Review page returned HTTP 403; figure from snippets/secondary blog | https://www.g2.com/products/zoho-projects/reviews ; https://www.invensislearning.com/blog/zoho-projects-review/ |
| Gartner Peer Insights | (rating not captured) | 306 verified in-depth reviews | Product page unreachable (ECONNREFUSED) | https://www.gartner.com/reviews/product/zoho-projects |

Note: one source cites Capterra as "400+ reviews" while the more specific verified count is 863; the 863 figure is the higher-confidence number (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/).

### 18.3 Top praise themes

| Theme | Detail | Confidence | Source |
|---|---|---|---|
| Price-to-value | ~$5/user/mo (monthly) vs Asana ~$13.49/user/mo; ~82% of positive G2 reviews mention excellent value / "enterprise features at SMB price" | high | https://thedigitalprojectmanager.com/tools/zoho-projects-review/ ; https://www.g2.com/products/zoho-projects/reviews |
| Zoho ecosystem integration | Seamless connectivity with Zoho CRM, Books, Desk, Analytics consistently cited as the top strength | high | https://www.g2.com/products/zoho-projects/reviews ; https://www.capterra.com/p/169455/Zoho-Projects/reviews/ |
| Built-in time tracking & timesheets | Log billable/non-billable hours, generate timesheets, integrate with billing; cited as a differentiator vs Asana (which lacks native time tracking) | high | https://thedigitalprojectmanager.com/tools/zoho-projects-review/ ; https://www.invensislearning.com/blog/zoho-projects-review/ |
| Task hierarchy, dependencies & Gantt | 76% of positive reviews praise task hierarchies/dependencies/organization for complex projects; dependencies "highly visual and easy to set up" | high | https://www.g2.com/products/zoho-projects/reviews ; https://thedigitalprojectmanager.com/tools/zoho-projects-review/ |
| Collaboration tooling | Project feeds, forums, built-in chat, @mentions, document sharing with version control highlighted as strengths | medium (vendor feature page) | https://www.zoho.com/projects/features.html |

### 18.4 Top complaint themes (do not sugar-coat)

| Theme | Detail | Confidence | Source |
|---|---|---|---|
| Learning curve | The single most common complaint theme; G2 reviewers report onboarding takes ~2-3 weeks before teams are comfortable; complexity increases past ~10 projects | medium | https://www.g2.com/products/zoho-projects/reviews ; https://www.invensislearning.com/blog/zoho-projects-review/ |
| Dated / cluttered UI | Described as less user-friendly than Asana, especially for creating tasks, sub-tasks, descriptions ("confusing compared to Asana as far as UI is concerned"); font/color/spacing gripes; extra clicks | high | https://www.capterra.com/p/169455/Zoho-Projects/reviews/ ; https://thedigitalprojectmanager.com/tools/zoho-projects-review/ |
| Mobile app gaps | Lacks desktop feature parity; complex task editing and Gantt manipulation work poorly; notifications "do not always sync in real time"; ~41% of critical reviews cite mobile gaps | high (parity) / medium (the 41% figure) | https://www.capterra.com/p/169455/Zoho-Projects/reviews/ ; https://thedigitalprojectmanager.com/tools/zoho-projects-review/ |
| Limited reporting/customization | Report and dashboard customization is a recurring documented weakness; per-client custom reports rarely yield the desired output; customization restricted on lower tiers; ~34% of critical reviews cite limited view/field/workflow customization vs ClickUp/Monday/Trello | high (reporting) / medium (34% figure) | https://www.capterra.com/p/169455/Zoho-Projects/reviews/ ; https://www.cloudwards.net/zoho-projects-review/ ; https://www.invensislearning.com/blog/zoho-projects-review/ |
| Performance issues | Sluggishness on large projects (Gantt drag-and-drop lag); ~18% of critical reviews cite slowness; "needs improvement for very large projects" | medium | https://www.invensislearning.com/blog/zoho-projects-review/ ; https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/ |
| Complex permissions | Granular role/profile permissions praised for control but cited as complex to configure | medium | https://www.invensislearning.com/blog/zoho-projects-review/ |
| Flaky non-Zoho integrations | Integration with non-Zoho third-party apps described as "flaky"; Zoho Desk integration described as "very limited" with bugs reported during setup | medium | https://www.capterra.com/p/169455/Zoho-Projects/reviews/ |
| No native desktop app | Only web-app / Chrome-extension workarounds; cited as a top reviewer frustration | high | https://thebusinessdive.com/zoho-projects-review |
| Minimal/no offline access | Documented limitation | medium | https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/ ; https://www.invensislearning.com/blog/zoho-projects-review/ |
| Misc friction | Spam emails after signup; "duplication of purpose of modules" | medium | https://www.capterra.com/p/169455/Zoho-Projects/reviews/ |

### 18.5 The most concrete performance complaint (forum, verbatim)

The single most specific, quotable performance complaint comes from **Zoho's own community forum**. A user reports that loading tasks and milestones "takes around 30-40 seconds sometimes or it just hangs up" and that the product is "extremely slow sometimes to load functions." The same user also flagged:

- inaccurate user online-status display, and
- the lack of granular read/write/edit/delete permission controls by role.

No staff reply is shown on the thread (confidence: high) (source: https://help.zoho.com/portal/en/community/topic/slow-loading-on-zoho-projects-user-access).

A separate cluster of forum threads concerns notifications not loading; suggested workarounds are clearing cache/cookies, switching browsers, and trying different devices (source: https://help.zoho.com/portal/en/community/topic/notifications-not-loading).

### 18.6 Support sentiment

Support sentiment is mixed: described as helpful but slow, online-only, with no phone option on some plans. One source rated telephone support 4/10 (confidence: medium) (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/ ; https://www.invensislearning.com/blog/zoho-projects-review/).

### 18.7 Developer / API sentiment (build-relevant)

Developer threads on the community forum indicate friction integrating against the API, centered on rate limiting:

- The V3 REST API enforces **per-endpoint** rate limits. Community/help sources cite limits in the ~100-200 calls per 2-minute window range (historically 100, since raised toward ~200). Exceeding one endpoint's limit blocks **only that endpoint** for **10 minutes**; other endpoints are unaffected.
- Responses include `RateLimit`, `RateLimit-Remaining`, `RateLimit-Window`, and `Retry-After` headers.
- Bulk reads max 200 records/request; create/update/delete max 100 records/request.
- Confidence: medium-to-high; exact ceiling varies by source.

(Sources: https://projects.zoho.com/api-docs ; https://help.zoho.com/portal/en/community/topic/zoho-projects-api-100-requests-2-min-limit ; https://www.zoho.com/developer/help/api/api-limits.html)

**Builder implication:** any sync/automation must shard work across endpoints and back off on `Retry-After`, because a single hot endpoint will self-block for a full 10 minutes regardless of other capacity.

### 18.8 Named real-world users

**Confirmed Zoho Projects users (official zoho.com case studies — treat as vendor-curated/promotional):**

| Company | Profile / usage detail | Source |
|---|---|---|
| Techstrom Inc | Business coaching/solutions; uses Tasks, Milestones, templates (marketing planning, direct mail, software implementation, CEO training), file sharing, forums, multi-language. Quote: "We have been so impressed with Zoho Projects we have created a Zoho Business account." | https://www.zoho.com/projects/case-studies/projects-techstrom.html |
| Toneee LLC | Web design / e-commerce services; reports completing 100+ projects in the tool | https://www.zoho.com/blog/general/zoho-projects-case-study-toneeecom.html |
| Cloudcamper | Cloud / Google + Zoho reseller. Managing partner quote: "If we didn't use Zoho Projects, our job would be hard. We'd have to use a shared spreadsheet or something to get an overview of all our projects." | https://www.zoho.com/projects/case-studies/projects-techstrom.html |
| Phoenix Financial Training | Uses Projects alongside Zoho Books, CRM, Bookings, Commerce | https://www.zoho.com/projects/customers/ |

**NOT Projects-verified (low confidence, secondary source):** Third-party blogs list TCS / Tata Consultancy Services, TechMahindra, Netflix, and Yelp (Yelp specifically for Zoho Desk) as Zoho users, but these could **not** be confirmed as Zoho **Projects** users specifically (source: https://blog.datacaptive.com/how-many-companies-use-zoho/).

### 18.9 Expert-review consensus and ideal-customer profile

Expert review blogs converge on: best for teams running repeatable, process-driven projects needing strong reporting/time tracking and Zoho integration; not ideal for users wanting highly visual/flexible workflows, and the UI "lacks user friendliness" for task creation vs Asana (source: https://thedigitalprojectmanager.com/tools/zoho-projects-review/).

Ideal customer profile (confidence: high): SMBs ~5-100 employees; project-based organizations (agencies, consultancies, professional services, contractors) running multiple concurrent client projects; and existing Zoho-ecosystem users. Less suitable for solo freelancers and large enterprises wanting deep customization or modern UX (source: https://www.cloudwards.net/zoho-projects-review/ ; https://thebusinessdive.com/zoho-projects-review ; https://www.zoho.com/projects/customers/).

### 18.10 Source-access limitations (be explicit — data is thin here)

The following primary/community sources could **not** be fetched directly during research; claims drawn from them rely on search snippets or secondary blogs and should be treated with corresponding caution:

- **G2 reviews page** — HTTP 403 Forbidden; relied on search snippets. The ~4.3/5 rating and the "82% value / 76% task-hierarchy" breakdowns therefore are not directly verified against the live page.
- **Gartner Peer Insights** product page — connection refused (ECONNREFUSED); only the 306-review count was captured, not the rating.
- **thedigitalprojectmanager.com** and **thebusinessdive.com** reviews — HTTP 403 / ECONNREFUSED; relied on snippets.
- **Reddit** — Anthropic user agent blocked from reddit.com; no direct r/projectmanagement or other Zoho threads retrievable. **There is effectively no Reddit sentiment data in this dossier.**
- **X/Twitter** and **LinkedIn** — login-gated; not retrieved. **No social-media sentiment data captured.**
- **YouTube** — only blog/aggregator results surfaced; no video transcript fetched.
- **TrustRadius** Zoho Projects page — not directly fetched.
- **PeerSpot** pros-and-cons page — connection refused (ECONNREFUSED).

As a result, sentiment in this section leans heavily on Capterra (the one major aggregator that was reachable), Zoho's own forum and case studies (the latter being promotional), and a handful of expert-review blogs. Independent peer-discussion channels (Reddit, X, LinkedIn) are entirely absent and should not be assumed to corroborate the above.
## 19. Competitor Comparison (Jira / Asana / Monday / ClickUp)

This section positions Zoho Projects against the four most commonly compared
project-management tools — Jira, Asana, Monday.com, and ClickUp — for the
benefit of a builder cloning or competing with Zoho Projects. It documents
where Zoho Projects wins, where it loses, and the concrete feature/price facts
behind each claim.

**Source-quality caveat (read first).** A large share of the head-to-head facts
below come from third-party review/comparison sites (cloudwards, selecthub,
capterra, g2, tech.co, monday.com's own blog, invensislearning) rather than from
primary vendor pricing pages. Several of those pages could not be fetched
directly during research (ECONNREFUSED / 404) and were captured via search
snippets only — see the "Could-not-fetch" list at the end. Competitor prices in
particular are third-party-reported and may lag current vendor pricing. Zoho's
own pricing page renders prices via JavaScript and could not be scraped for
primary confirmation, so Zoho prices were corroborated through tech.co and
Capterra summaries. Treat competitor numbers as directional, not authoritative.

### 19.1 One-paragraph positioning

Zoho Projects competes as the **lowest-cost, deeply structured** option with a
strong feature-per-dollar ratio. Its differentiated wins are aggressive pricing,
built-in time tracking with billable flags and timesheets (a genuine gap in
Asana), Blueprints (drag-and-drop process automation), a classic Gantt with
critical path and baselines, and tight integration with the broader Zoho
ecosystem (CRM, Desk, Books, Sprints, Analytics). Its consistent losses are a
dated/cluttered UI, sluggish Gantt drag-and-drop on large projects, weaker
non-Zoho integrations, fewer collaboration tools than Monday/ClickUp, and a
rigid structured model that scales awkwardly for large enterprises versus Jira's
agile depth. (Sources: <https://www.zoho.com/projects/features.html>,
<https://www.invensislearning.com/blog/zoho-projects-review/>,
<https://www.cloudwards.net/zoho-projects-vs-clickup/>)

### 19.2 Pricing comparison (entry paid tier)

Zoho Projects is the cheapest of the five tools at its entry paid tier. The
table below lists per-user/month figures; Zoho's are corroborated and the
competitors' are third-party-reported (confidence: medium for competitors).

| Tool | Entry paid tier (~/user/mo) | Free plan | Notes |
|------|------------------------------|-----------|-------|
| **Zoho Projects** | **~$4–5** (Premium: $4 annual / $5 monthly) | Free up to 5 users / 3 projects / 5GB | Enterprise ~$9 (annual) / $10 (monthly); Ultimate ~$14 (annual) / ~$15 (monthly). Annual reflects Zoho's "save over 15%" discount. |
| ClickUp | ~$7 | Yes | — |
| Jira | ~$8.60 (Standard) | Free for up to 10 users | — |
| Asana | ~$10.99 | Yes | Third-party reports fewer paid packages (~2) than Zoho's 4 |
| Monday.com | ~$12 | Yes | — |

Confidence: Zoho pricing **high** (corroborated); competitor pricing **medium**
(third-party-reported, may lag). Sources:
<https://www.zoho.com/projects/zohoprojects-pricing.html>,
<https://www.zoho.com/projects/pricing-comparison.html>,
<https://tech.co/project-management-software/zoho-projects-pricing-review>,
<https://monday.com/blog/project-management/project-management-software/>,
<https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/>,
<https://www.cloudwards.net/zoho-projects-vs-asana/>.

**Limitation:** the competitor prices are point-in-time third-party figures and
should be re-verified against each vendor's current pricing page before being
used in any customer-facing comparison.

### 19.3 Target-user split

Each tool occupies a distinct buyer segment. This positioning is consistently
reported across the comparison sources (confidence: high).

| Tool | Primary target | Strength emphasized |
|------|----------------|---------------------|
| **Jira** | Software development / agile teams | Advanced Scrum/Kanban, sprint planning, backlog drag-and-drop, burndown/burnup, velocity |
| **Asana** | Creative / marketing / cross-functional collaboration | Collaboration, ease of use |
| **Monday.com** | Visual, adaptable no-code workflows | Visual boards, no-code customization, collaboration tools |
| **ClickUp** | Max customization / all-in-one | Deep customization, AI, built-in chat |
| **Zoho Projects** | Budget SMBs in (or open to) the Zoho suite | Affordable, multilingual, structured PM with time/billing |

Sources: <https://monday.com/blog/project-management/project-management-software/>,
<https://www.cloudwards.net/zoho-projects-vs-asana/>,
<https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/>.

### 19.4 Where Zoho Projects wins (differentiated strengths)

1. **Price / feature-per-dollar.** Cheapest entry paid tier (~$4–5/user/mo) of
   the five; four self-serve editions (Free, Premium, Enterprise, Ultimate)
   available via no-credit-card trial without sales contact.
   (Sources: <https://tech.co/project-management-software/zoho-projects-pricing-review>,
   <https://www.zoho.com/projects/pricing-comparison.html>)

2. **Built-in time tracking with billing — a gap in Asana.** Asana has **no
   native time tracking** (it relies on custom fields or external integrations),
   whereas Zoho Projects, ClickUp, and Monday all include built-in time
   tracking. Zoho's adds billable/non-billable flags, timesheet approval
   workflows, and timesheet export to invoicing via Zoho Invoice/Books.
   (Confidence: high. Sources:
   <https://www.cloudwards.net/zoho-projects-vs-asana/>,
   <https://monday.com/blog/project-management/project-management-software/>,
   <https://www.zoho.com/projects/features.html>)

3. **Blueprints (drag-and-drop process automation).** Zoho's headline automation
   feature, governing allowed task status transitions and triggered actions —
   positioned against ClickUp/Monday automation builders. Up to 50 task
   blueprints per layout on Ultimate.
   (Sources: <https://www.zoho.com/projects/features.html>,
   <https://www.zoho.com/projects/pricing-comparison.html>)

4. **Classic Gantt with critical path and baselines.** Editable Gantt on
   Premium+, with Critical Path Analysis and Project Baselines (planned vs
   actual) on Enterprise/Ultimate (15 baselines/project on Enterprise). This is
   a more traditional/structured PM strength than the board-first competitors.
   (Sources: <https://www.zoho.com/projects/features.html>,
   <https://www.zoho.com/projects/pricing-comparison.html>)

5. **Issue/Bug tracker with SLA.** A dedicated issue module with custom bug
   statuses, SLA escalation, and (Enterprise) Link Issues moves Zoho closer to
   Jira's software-team use case than Asana/Monday — though Jira's agile depth
   remains greater (see 19.5).
   (Sources: <https://www.zoho.com/projects/features.html>)

6. **Zoho-ecosystem integration.** Native ties to Zoho Sprints, CRM, Desk,
   Books, Flow, and Analytics. Best value accrues mainly when also using other
   Zoho products. (Sources: <https://www.zoho.com/projects/features.html>,
   <https://www.cloudwards.net/zoho-projects-vs-clickup/>)

### 19.5 Where Zoho Projects loses (limitations — not sugar-coated)

1. **Dated/cluttered UI.** Widely described as dated relative to Monday and
   Asana. Reviewers cite odd spacing, font sizes, color scheme, hard-to-find
   features (blueprints, events, resource utilization buried in submenus), and
   that "workflows take more clicks than they should." (Confidence: high.
   Sources: <https://www.invensislearning.com/blog/zoho-projects-review/>,
   <https://monday.com/blog/project-management/project-management-software/>)

2. **Performance at scale.** ~18% of users report occasional slowness/lag,
   especially on very large projects or with many concurrent users; Gantt
   drag-and-drop is specifically called sluggish at scale. (Confidence: medium.
   Source: <https://www.invensislearning.com/blog/zoho-projects-review/>;
   also Capterra: <https://www.capterra.com/p/169455/Zoho-Projects/reviews/>)

3. **Weaker non-Zoho integrations.** Integration breadth outside the Zoho
   ecosystem is flagged as weaker than competitors; full value depends on
   committing to other Zoho products. (Confidence: medium. Sources:
   <https://monday.com/blog/project-management/project-management-software/>,
   <https://www.cloudwards.net/zoho-projects-vs-clickup/>)

4. **Fewer collaboration tools.** Fewer collaboration tools than Monday or
   ClickUp per reviewers. (Source:
   <https://www.cloudwards.net/zoho-projects-vs-clickup/>)

5. **Rigid, less-flexible model that scales awkwardly.** The structured WBS model
   (milestones → task lists → tasks → subtasks) is more rigid than ClickUp's
   flexible hierarchy or Monday's boards. Reviewers consider Zoho limiting when
   scaling PM for larger teams — it sometimes lacks advanced features large teams
   need, where ClickUp offers deeper customization and Monday more collaboration.
   (Confidence: medium. Sources:
   <https://www.cloudwards.net/zoho-projects-vs-clickup/>,
   <https://www.g2.com/products/zoho-projects/reviews>)

6. **Shallower agile than Jira.** Jira targets software/agile teams with advanced
   Scrum/Kanban, sprint planning, backlog drag-and-drop, burndown/burnup, and
   velocity. Zoho Projects offers simpler agile and positions itself for
   business-focused insights (project progress, resource utilization, time);
   Zoho's *deeper* agile lives in the **separate Zoho Sprints product**, not in
   Projects. (Confidence: high. Sources:
   <https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/>,
   <https://www.zoho.com/sprints/jira-alternative.html>)

7. **Reporting/customization ceilings.** Advanced reporting customization is
   noted as limited; mobile notifications are not always real-time; mobile app
   has limitations; permission settings are complex. (Sources:
   <https://www.capterra.com/p/169455/Zoho-Projects/reviews/>,
   <https://www.g2.com/products/zoho-projects/reviews>)

### 19.6 Learning curve / onboarding

Jira has a steeper learning curve and often needs onboarding. Zoho Projects is
considered intuitive and faster to adopt by comparison — though Zoho's *own*
onboarding is reported to take ~2–3 weeks for teams new to formal PM, and G2
reviewers cite a learning curve for its advanced features. (Confidence: medium.
Sources: <https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/>,
<https://www.g2.com/products/zoho-projects/reviews>)

### 19.7 Feature availability by tier (Zoho Projects)

The builder should note that many comparison-relevant capabilities are gated
above Free, which weakens Zoho's free-tier showing against competitors' free
plans. Verified tier facts:

| Capability | Free | Premium | Enterprise | Ultimate |
|------------|------|---------|------------|----------|
| Max projects | 3 | Unlimited | Unlimited | Unlimited |
| Storage | 5GB | 100GB | 120GB | 15GB/user or 150GB/org, whichever is greater |
| Gantt | View-only (read-only timeline/milestones) | Editable | Editable + critical path | Editable + critical path |
| Critical path, cross-project dependencies, global Gantt, portfolio dashboards, task custom fields | No | No | **Yes (gated here)** | Yes |
| Project baselines | No | No | 15/project | Yes |
| Workflow rules / layout | — | 2 | 20 | 40 |
| Webhooks / day | — | 200 | 2,000 | 10,000 |
| Automation executions / mo | — | 500 | — | 500,000 |
| Blueprints / layout | — | (higher tiers) | — | 50 |
| Custom modules (records each) | — | 5 (10K) | 10 (100K) | 20 (1M) |
| Templates | — | 20 | 30 | 50 |
| Read-only users | — | — | 10 | 100 |
| Sandboxes | — | — | — | 10 |
| Issue/Bug tracker | No | Yes | Yes + SLA + Link Issues | Yes |
| Time tracking & timesheets | No | Yes | Yes | Multi-user/multi-project |

Confidence: high (from Zoho's pricing-comparison page). Sources:
<https://www.zoho.com/projects/pricing-comparison.html>,
<https://www.zoho.com/projects/features.html>,
<https://tech.co/project-management-software/zoho-projects-pricing-review>.

### 19.8 Ratings

| Platform | Rating | Basis |
|----------|--------|-------|
| G2 | ~4.3 / 5 | Thousands of reviews |
| Capterra | ~4.5 / 5 | Thousands of reviews |

**G2 themes** — praise: affordability, feature breadth. Dislikes: learning curve
for advanced features, complex permissions, mobile app limitations, occasional
performance issues, weak non-Zoho integrations; onboarding ~2–3 weeks.
**Capterra themes** — praise: transparent pricing with no hidden fees, visual
task dependencies, built-in time tracking with billing, mobile app. Criticism:
limited advanced reporting customization, mobile notifications not always
real-time, sluggish Gantt drag-and-drop on large projects.

Sources: <https://www.g2.com/products/zoho-projects/reviews>,
<https://www.capterra.com/p/169455/Zoho-Projects/reviews/>.

### 19.9 How Zoho frames itself against specific competitors

- **vs ClickUp:** Zoho positions Projects as a "user friendly and cost efficient
  alternative to ClickUp," emphasizing Gantt visualization, drag-and-drop
  Blueprint automation, time tracking with Zoho Invoice, customization,
  unlimited projects, and Power BI integration. (Source:
  <https://www.zoho.com/projects/clickup-alternative.html>)
- **vs Jira:** Zoho directs deeper-agile buyers to the separate **Zoho Sprints**
  product as a Jira alternative, conceding that Projects itself is the simpler,
  business-focused option. (Source:
  <https://www.zoho.com/sprints/jira-alternative.html>)
- **vs Asana:** the recurring Zoho talking point is native time tracking +
  billing, which Asana lacks. (Source:
  <https://www.cloudwards.net/zoho-projects-vs-asana/>)

### 19.10 Data gaps and could-not-fetch sources

The following could not be retrieved during research and represent gaps a
builder should independently verify:

- `cloudwards.net/zoho-projects-vs-clickup/` — ECONNREFUSED (captured via search snippet only)
- `cloudwards.net/zoho-projects-vs-monday-com/` — fetch errored (port/typo + ECONNREFUSED); **direct Monday.com head-to-head data is thin**
- `selecthub.com/.../jira-vs-zoho-projects/` — ECONNREFUSED (via snippet)
- `thedigitalprojectmanager.com/tools/zoho-projects-vs-jira/` — ECONNREFUSED
- `zoho.com/projects/all-features.html` — HTTP 404
- Reddit threads (r/projectmanagement etc.) — not returned by `site:reddit.com` searches; only official Zoho migration pages and a help.zoho.com Asana-migration community topic surfaced. **No genuine community/Reddit sentiment was obtainable.**
- G2 / Capterra full review pages — aggregate ratings via snippets only; individual reviews are auth/JS-gated.

**Net:** competitor pricing and the Monday.com-specific comparison are the
weakest-evidenced parts of this section and should be re-verified against
primary vendor sources before use.
## 20. Strengths, Weaknesses & Target Users

This section synthesizes Zoho Projects' competitive strengths, documented weaknesses/limitations, and the customer profiles it serves best — and least well. It is written for a builder cloning or competing with Zoho Projects, so claims are kept concrete (tier gates, exact limits, named behaviors) and limitations are stated plainly rather than sugar-coated. Where the underlying research was thin or could not be fetched, that is flagged explicitly.

Aggregate market signal up front: Zoho Projects is a value-priced, feature-dense PM tool rated roughly G2 ~4.3/5 (300+ reviews) and Capterra 4.5/5 (863 verified reviews), with Gartner Peer Insights carrying 306 verified reviews. Zoho markets it as used by 200,000+ businesses worldwide (vendor figure, medium confidence). The customer base skews small-business: per enlyft, ~70% of customers are under $50M revenue, ~13% large (>$1B), ~11% medium (medium confidence) (source: https://enlyft.com/tech/products/zoho-projects).

### 20.1 Strengths

| Strength | Detail | Confidence / Notes |
|---|---|---|
| Price-to-feature ratio | Premium ~$4/user/mo, Enterprise ~$9/user/mo, Ultimate ~$14/user/mo (billed annually; ~15%+ annual discount). ~82% of positive reviews cite excellent value; commonly contrasted with Asana (~$13.49/user/mo) and Jira (~$8.60/user). | High (source: https://tech.co/project-management-software/zoho-projects-pricing-review, https://www.cloudwards.net/zoho-projects-review/, https://thedigitalprojectmanager.com/tools/zoho-projects-review/) |
| Built-in time tracking, timesheets & billing | Native timers, timesheets, billable/non-billable task types, project budgeting and invoicing integration (Zoho Invoice/Books). Frequently cited as a top differentiator vs Asana (which lacks native time tracking). | High (source: https://www.cloudwards.net/zoho-projects-review/, https://thebusinessdive.com/zoho-projects-review) |
| Task hierarchy, dependencies & Gantt | Deep task/subtask trees, 4 dependency types, interactive Gantt with baseline and resource utilization/workload. ~76% of positive reviews praise hierarchy/dependencies; dependencies described as "highly visual and easy to set up." | High (source: https://www.g2.com/products/zoho-projects/reviews, https://thedigitalprojectmanager.com/tools/zoho-projects-review/) |
| Automation (Blueprint + Workflow Rules) | Blueprint visual state-machine automation plus field-trigger Workflow Rules. Strong for repeatable, process-driven work — but see weaknesses for the Blueprint manual-transition gotcha. | High (source: https://www.zoho.com/projects/blueprint.html) |
| Granular roles & permissions + client portal | Role/profile permissions with external client users and read-only users. Praised for control. | Medium (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/manage-users-in-zoho-projects) |
| Zoho ecosystem integration | Consistently the single most-cited strength: seamless connectivity with Zoho CRM, Books, Desk, Analytics. Strongest value comes from teams already inside the Zoho suite. | High (source: https://www.cloudwards.net/zoho-projects-review/, https://www.g2.com/products/zoho-projects/reviews) |
| Project templates & collaboration | Templates standardize repeatable processes; project feeds, forums, chat, @mentions, and document sharing with version control are highlighted collaboration features. | Medium (source: https://www.zoho.com/projects/features.html, https://www.zoho.com/projects/case-studies/projects-techstrom.html) |

### 20.2 Weaknesses & Limitations

These are documented in reviews and community forums. They are listed without softening.

| Weakness | Detail | Confidence / Notes |
|---|---|---|
| Steep learning curve | Reviews commonly cite ~2-3 weeks to get comfortable; setup grows complex once a team exceeds ~10 projects. ~62% of critical reviews mention learning-curve/onboarding complexity. | Medium (source: https://www.invensislearning.com/blog/zoho-projects-review/, https://www.g2.com/products/zoho-projects/reviews) |
| Shallow / limited reporting & dashboards | Recurring documented weakness: hard to produce desired per-client custom reports; weak data visualization vs Zoho Analytics or competitors. Custom reports are also paywalled (Premium+) and capped per tier. | High (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/, https://www.cloudwards.net/zoho-projects-review/) |
| Limited customization (views/fields/workflows) | More limited than ClickUp/Monday/Trello; ~34% of critical reviews cite this. Custom fields are entirely unavailable on Free and Premium (Enterprise/Ultimate only). | Medium-High (source: https://www.invensislearning.com/blog/zoho-projects-review/, https://www.zoho.com/projects/pricing-comparison.html) |
| Dated / cluttered UI | Described as dated, cluttered, and less intuitive than Asana — "confusing compared to Asana as far as UI is concerned," especially when creating tasks/sub-tasks/descriptions. Extra clicks throughout. | High (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/, https://thedigitalprojectmanager.com/tools/zoho-projects-review/) |
| Mobile app gaps | Mobile lacks desktop parity: complex automation, detailed reporting, advanced customization, and detailed Gantt editing work poorly; notifications "do not always sync in real time." ~41% of critical reviews cite mobile gaps. | Medium-High (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/, https://thedigitalprojectmanager.com/tools/zoho-projects-review/) |
| No native desktop app | Only web-app / Chrome-extension workarounds exist. Cited as one reviewer's #1 frustration. | High (source: https://thebusinessdive.com/zoho-projects-review) |
| Performance on large projects | Gantt drag-and-drop can lag; ~18% of critical reviews cite slowness. A Zoho community user reports loading tasks/milestones "takes around 30-40 seconds sometimes or it just hangs up" and the product is "extremely slow sometimes to load functions" (no staff reply shown on the thread). Scalability rated good for small-to-large teams but "needs improvement for very large projects." | Medium-High (source: https://help.zoho.com/portal/en/community/topic/slow-loading-on-zoho-projects-user-access, https://www.invensislearning.com/blog/zoho-projects-review/, https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/) |
| Weak non-Zoho integrations | Integration with third-party apps is described as "flaky"; even the in-suite Zoho Desk integration is called "very limited" with setup bugs. Value depends heavily on staying inside the Zoho ecosystem. | Medium-High (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/, https://www.g2.com/products/zoho-projects/reviews) |
| Minimal / no offline access | Documented limitation. | Medium (source: https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/, https://www.invensislearning.com/blog/zoho-projects-review/) |
| Complex permissions setup | Granular control is a strength, but configuration is cited as complex; one user also flagged inaccurate online-status display and wanting more granular read/write/edit/delete controls by role. | Medium (source: https://help.zoho.com/portal/en/community/topic/slow-loading-on-zoho-projects-user-access) |
| Mixed support | Online-only, no phone in some plans; "helpful but takes a while"; one source rated telephone support 4/10. Minor friction: some users report spam emails after signup and "duplication of purpose of modules." | Medium (source: https://www.capterra.com/p/169455/Zoho-Projects/reviews/, https://www.invensislearning.com/blog/zoho-projects-review/) |

### 20.3 Feature gating as a structural weakness

A distinct, builder-relevant weakness: many "PM-essential" capabilities are paywalled higher than competitors, and key limits scale by tier. The cheapest paid tier (Premium) cannot add custom fields at all. The escalating caps below are themselves a planning constraint.

| Capability | Free | Premium | Enterprise | Ultimate | Source |
|---|---|---|---|---|---|
| Projects | 3 | Unlimited | Unlimited | Unlimited | https://www.zoho.com/projects/pricing-comparison.html |
| Users | 5 | — | — (10 read-only) | — (100 read-only) | https://www.zoho.com/projects/pricing-comparison.html |
| Storage | 5GB | 100GB | 120GB | 15GB/user or 150GB/org (whichever higher) | https://www.zoho.com/projects/pricing-comparison.html |
| Custom Fields | No | No | Yes | Yes | https://www.zoho.com/projects/pricing-comparison.html |
| Cross-project dependencies & Critical Path | No | No | Yes | Yes | https://www.zoho.com/projects/pricing-comparison.html |
| Editable Gantt | Read-only | Yes | Yes (global Gantt) | Yes (global Gantt) | https://www.cloudwards.net/zoho-projects-review/ |
| Workflow Rules / layout | 2 | 2 | 20 | 40 | https://www.zoho.com/projects/pricing-comparison.html |
| Blueprints / layout | — | 2 | 25 | 50 | https://www.zoho.com/projects/pricing-comparison.html |
| Custom Modules | — | 5 | 10 | 20 | https://www.zoho.com/projects/pricing-comparison.html |
| Custom Reports / module | — | 20 | 50 | 250 | https://www.zoho.com/projects/pricing-comparison.html |
| Project dashboards | 1 | 5 | 10 | Unlimited | https://www.zoho.com/projects/pricing-comparison.html |

Note: Some review sites cite older Free-tier limits (2 projects / 10MB or 3 users), indicating the Free plan changed over time; current pricing pages state 5 users / 3 projects / 5GB (medium confidence — the official pricing page renders prices/limits via JavaScript and was not fully scrapable; figures corroborated by third-party reviews).

### 20.4 Automation gotcha (builder-critical)

Blueprint transitions must be triggered **manually** per task — a user opens the task and chooses the next transition. There is **no** automatic, field-update-driven transition. For automatic status changes, Workflow Rules are the recommended mechanism. Max 5 webhooks per Blueprint transition. A cloner replicating Blueprint should not assume event-driven auto-advancement (source: https://help.zoho.com/portal/en/community/topic/zoho-blueprint-and-workflow, https://www.zoho.com/projects/blueprint.html).

### 20.5 API constraint (builder-critical)

The V3 REST API rate limit is **per endpoint**: ~200 calls per 2-minute window (historically 100; the increase followed community complaints). Breaching one endpoint's limit blocks **only that endpoint** for 10 minutes; other endpoints are unaffected. Bulk reads max 200 records/request; create/update/delete max 100/request. Responses include RateLimit, RateLimit-Remaining, RateLimit-Window, and Retry-After headers. This is high confidence on the per-endpoint model and 10-minute block, medium confidence on the exact 100-vs-200 figure (sources disagree) (source: https://www.zoho.com/developer/help/api/api-limits.html, https://projects.zoho.com/api-docs, https://help.zoho.com/portal/en/community/topic/zoho-projects-api-100-requests-2-min-limit).

### 20.6 Target users

**Ideal customer profile (good fit):**
- SMBs, roughly 5-100 employees (the base skews <$50M revenue).
- Project-based organizations running multiple concurrent client projects: agencies, consultancies, professional-services firms, contractors. Built-in time tracking + billing makes billable services work a sweet spot.
- Teams already invested in the Zoho ecosystem (CRM, Books, Desk, Analytics) — this is where Zoho Projects' value compounds.
- Teams running repeatable, process-driven projects needing strong time tracking and template standardization.

(source: https://www.cloudwards.net/zoho-projects-review/, https://thebusinessdive.com/zoho-projects-review, https://www.zoho.com/projects/customers/)

**Poor fit:**
- Solo freelancers (overhead/complexity outweighs benefit).
- Large enterprises wanting deep customization and a modern UX.
- Teams wanting highly visual / flexible workflows (ClickUp/Monday are more cohesive and customizable here).
- Very large projects with many concurrent users, given the documented performance ceiling.

(source: https://www.cloudwards.net/zoho-projects-review/, https://www.selecthub.com/project-management-software/jira-vs-zoho-projects/, https://thedigitalprojectmanager.com/tools/zoho-projects-review/)

**Named real-world customers (vendor-curated case studies — treat as promotional):** Techstrom Inc (business coaching; uses Tasks, Milestones, templates, file sharing, forums), Toneee LLC (web design/e-commerce; 100+ projects completed), Cloudcamper (cloud/Google+Zoho reseller), Phoenix Financial Training (uses Projects alongside Books, CRM, Bookings, Commerce). Broader names sometimes listed for "Zoho" (TCS, TechMahindra, Netflix, Yelp) are **not** verified as Zoho Projects users specifically — low confidence (source: https://www.zoho.com/projects/customers/, https://www.zoho.com/projects/case-studies/projects-techstrom.html, https://blog.datacaptive.com/how-many-companies-use-zoho/).

### 20.7 Research limitations / data gaps

The following sources could not be fetched and so are not represented (or are represented only via search snippets), which lowers confidence on some review-sentiment claims:
- G2 reviews page — HTTP 403; relied on snippets.
- Gartner Peer Insights — connection refused.
- thedigitalprojectmanager.com and thebusinessdive.com — 403 / connection refused; snippet-based.
- Reddit, X/Twitter, LinkedIn — blocked or login-gated; no direct community threads retrieved.
- Official Zoho pricing/comparison pages — dollar figures render dynamically (JavaScript) and were not directly scrapable; pricing sourced from third-party reviews.

Specific percentage breakdowns of critical/positive reviews (e.g., "62% cite learning curve," "34% customization," "41% mobile," "18% slowness," "82% value," "76% hierarchy") originate from secondary review blogs, not primary aggregator data, and should be treated as indicative rather than precise (medium confidence).
## 21. Build Blueprint: Cloning Zoho Projects

This is the most important section of the dossier. It translates the verified research into a concrete engineering blueprint for a Zoho-Projects clone. Throughout, statements are tagged **[REPORTING]** when they restate verified Zoho behavior (with source URLs) and **[DESIGN]** when they are an engineering recommendation derived from — but not literally documented by — the research. Where the research is thin or contradictory, that is called out explicitly rather than papered over.

A persistent caveat for the whole section: the Zoho **V3 interactive API console (projects.zoho.com/api-docs)** is a JS-rendered SPA that could not be fully scraped, so several V3 specifics below are corroborated from the older V1 REST help pages (which mirror the same fields) plus partner summaries (source: https://projects.zoho.com/api-docs; https://goldstarit.com/zoho-projects-v3-apis-update/). Treat field-name exactness as "high confidence for V1 shape, infer for V3."

---

### 21.1 Proposed relational data model

**[DESIGN]** The model below is a relational normalization of Zoho's documented object graph. It deliberately mirrors Zoho's canonical hierarchy (source: https://www.acutedata.com/whats-the-difference-between-a-project-and-a-task-list-in-zoho-projects/; https://www.zoho.com/projects/help/rest-api/projects-api.html):

> Portal > Project Group (optional) > Project > Phase/Milestone (optional) > Task List > Task > Sub-task; Issues/Bugs are a sibling module under Project.

Conventions: `PK` = primary key, `FK` = foreign key, `NN` = not null. All entities carry `created_at`, `updated_at`, `created_by` (FK→user) audit columns unless noted; omitted below for brevity. Enums are given inline.

#### Org / Portal
**[REPORTING]** Top-level tenant. Settings (business hours, working days, default dependency type) cascade to projects/tasks (source: https://www.zoho.com/projects/help/rest-api/portals-api.html).

```
portal
  id                PK
  name             NN
  default          bool          -- a user's default portal
  gmt_time_zone    string
  plan             enum(free|premium|enterprise|ultimate)
  bug_singular     string        -- portal can rename "Bug"->"Issue"
  bug_plural       string
  is_display_taskprefix    bool
  is_display_projectprefix bool
  project_prefix   string
  -- settings (could be a child table portal_setting):
  business_hours_id        FK -> business_hours
  default_dependency_type  enum(FS|SS|SF|FF)
  default_link_type        enum(hard|soft|automatic)
  completion_calc_mode     enum(count|percentage|weightage)  -- see 21.7
  root_or_subtask_basis    enum(root|subtask)
```

#### Project Group
**[REPORTING]** Optional layer between Portal and Project. A project belongs to **at most one** group; moving it re-prefixes the project (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/project-groups).

```
project_group
  id           PK
  portal_id    FK -> portal       NN
  name         NN
  prefix       string  -- max 10 chars, alphanumeric + hyphens
```

#### Project
**[REPORTING]** Core work container. Note the documented enum codes — budget_type `0=None,1=Project,3=Milestone,5=Task,7=User`; billing_method `1=project hrs,2=staff hrs,3=fixed cost,4=task/issue hrs` (source: https://www.zoho.com/projects/help/rest-api/projects-api.html).

```
project
  id                 PK
  portal_id          FK -> portal          NN
  project_group_id   FK -> project_group   NULL  -- "Ungrouped" if null
  name               NN  -- max 100
  description        text
  status             enum(active|archived|template)  NN
  owner_id           FK -> user
  is_public          bool
  is_strict          enum(1=not_strict|2=strict)
  start_date         date
  end_date           date
  budget_type        enum(0|1|3|5|7)
  budget_value       float
  budget_tracking_method enum(1=project_hrs|2=staff_hrs|4=task_issue_hrs)
  billing_method     enum(1|2|3|4)
  bill_status        enum(billable|non_billable)
  revenue_budget     float
  currency           string
  project_rate       float
  cost_per_hour      float
  fixed_cost         float
  is_bug_enabled     bool          -- per-project bug-tracking toggle
  taskbug_prefix     string
  bug_prefix         string
  enable_rollup      bool          -- irreversible once true (see 21.8)
  enable_sprints     bool
  task_layout_id     FK -> layout
  project_layout_id  FK -> layout
  -- cascade_setting flags (date, logHours, plan, percentage, workHours)
```

Invariant: **[REPORTING]** every project must contain at least one Task List; the default is named "General" (source: https://www.acutedata.com/whats-the-difference-between-a-project-and-a-task-list-in-zoho-projects/). Enforce in application logic on project create.

#### Phase / Milestone
**[REPORTING]** "Milestone" was renamed "Phase" in the UI but the API still uses `milestone`/`milestone_id`. Status is a **manual binary flag** (`notcompleted|completed`); there is **no completion-percentage column** on the milestone in the API — the % is a derived display value (source: https://www.zoho.com/projects/help/rest-api/milestones-api.html; https://help.zoho.com/portal/en/kb/projects/phases/articles/project-phases).

```
phase   -- table name "milestone" recommended to match API
  id              PK
  project_id      FK -> project   NN
  name            NN  -- max 100
  owner_id        FK -> user
  start_date      date
  end_date        date
  status          enum(notcompleted|completed)  NN
  completed_date  date  NULL
  flag            enum(internal|external)  NN  -- gates client visibility
  budget          float   -- rolled up from task lists
  threshold       float
  revenue_budget  float
```

#### Task List
**[REPORTING]** Optional child of a Phase. API exposes a boolean `completed` and `status active|completed` on update, but **no percentage and no own status field** in the read response (source: https://www.zoho.com/projects/help/rest-api/tasklists-api.html).

```
tasklist
  id            PK
  project_id    FK -> project   NN
  milestone_id  FK -> phase     NULL  -- "Related Phase"
  name          NN
  status        enum(active|completed)
  completed     bool
  flag          enum(internal|external)  NN
  rolled        bool      -- roll-up indicator
  sequence      int       -- sort order
  view_type     string
```

#### Task
**[REPORTING]** The richest object. Subtask tree via `parent_task_id`/`root_task_id`/`depth`/`isparent` (max depth 6). `percent_complete` is restricted to multiples of 10 (10–100). `priority` ∈ {None,Low,Medium,High}. Status is an object with `type` open|closed (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html; https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks).

```
task
  id                PK
  project_id        FK -> project   NN
  tasklist_id       FK -> tasklist  NN
  milestone_id      FK -> phase     NULL
  layout_id         FK -> layout
  key               string  -- e.g. "X9-T8"; deleted IDs never reused
  name              NN
  description       text
  status_id         FK -> custom_status   NN
  priority          enum(None|Low|Medium|High)
  percent_complete  int  CHECK (percent_complete % 10 = 0 AND 0..100)
  completed         bool
  completed_on      date
  start_date        date
  end_date          date
  start_time        time
  end_time          time
  duration          int
  duration_type     enum(days|hrs)
  work              string  -- "HHH:MM" e.g. "208:00"
  work_type         enum(work_hrs_per_day|work_in_percentage|work_hours)
  billingtype       enum(none|billable|non_billable)
  rate_per_hour     float
  cost_per_hour     float
  planned_cost / actual_cost / forecasted_cost / budget_value / revenue_budget  float
  -- subtask tree:
  parent_task_id    FK -> task   NULL
  root_task_id      FK -> task   NULL
  depth             int  CHECK (depth BETWEEN 0 AND 6)
  isparent          bool
  order_sequence    int
  is_recurrence_set bool
  is_reminder_set   bool
```

#### Sub-task
**[DESIGN]** Do **not** model a separate table. A sub-task is a `task` row with `parent_task_id` set; this matches Zoho, where subtasks share the Task schema and are distinguished only by the tree columns (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html). Behavioral rules to enforce in application logic **[REPORTING]**: closing a parent closes all subtasks; reopening a subtask requires reopening its parent; a subtask cannot be created under a closed task (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks).

#### Dependency
**[REPORTING]** Types FS/SS/SF/FF with lag (`gapvalue`+`gaptype` Days|Hours; positive=lag, negative=lead) and hard/soft/automatic linking (source: https://www.zoho.com/projects/help/rest-api/tasks-api.html; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/task-dependency-settings).

```
dependency
  id               PK
  predecessor_id   FK -> task   NN
  successor_id     FK -> task   NN
  dependency_type  enum(FS|SS|SF|FF)  NN
  gap_value        int   -- + = lag, - = lead
  gap_type         enum(days|hours)
  link_type        enum(hard|soft|automatic)
  -- cross-project: predecessor and successor may belong to different projects
  UNIQUE(predecessor_id, successor_id)
```

#### Issue / Bug
**[REPORTING]** Sibling of Task under Project (requires `is_bug_enabled`). Note the **corrected** enum sets (the original research understated classification): severity {Show stopper, Critical, Major, Minor}; reproducible {Always, Sometimes, Rarely, Unable, NeverTried, NotApplicable}; classification has **10** default values {Security, Not a bug, Crash/Hang, DataLoss, Performance, UI/Usabililty *(sic — typo in Zoho's own doc)*, OtherBug, Feature(New), Enhancement, Support Request} (source: https://www.zoho.com/projects/help/rest-api/bugtracker-bugs-api.html; https://www.zoho.com/projects/help/rest-api/bugs-api.html). All are user-customizable per project.

```
issue
  id              PK
  project_id      FK -> project   NN
  key             string  -- e.g. "DC-I40"
  title           NN
  description     text
  status_id       FK -> custom_status   NN
  closed          bool
  resolution      text
  severity        enum(...)        -- customizable picklist
  classification  enum(...)        -- customizable picklist (10 defaults)
  reproducible    enum(...)        -- customizable picklist
  module_id       FK -> module
  milestone_id    FK -> phase      NULL
  affectedmile_id FK -> phase      NULL
  assignee_id     FK -> user
  reporter_id     FK -> user
  flag            enum(internal|external)
  due_date        date
  rate_per_hour / cost_per_hour  float
```

#### Custom Field
**[REPORTING]** Zoho stores custom fields as **stable column names**, not normalized rows: tasks/projects use `UDF_CHAR1...`; bugs use `CHAR1-CHAR12`, `LONG1-LONG4`, `DATE1-DATE4`. 18 field types, max 300 per portal; a field on 1,000+ tasks cannot be deleted (source: https://www.zoho.com/projects/help/issues-customfields.html; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields). **[DESIGN]** A clone has two viable strategies — (a) wide sparse columns mirroring Zoho's `UDF_*` scheme (closest to Zoho, easiest API parity), or (b) a normalized EAV `custom_field` + `custom_field_value` pair (cleaner, better for arbitrary counts). Recommend (b) for the data store with a translation layer that exposes Zoho-style column names at the API boundary.

```
custom_field
  id           PK
  portal_id    FK -> portal
  layout_id    FK -> layout
  column_name  string  -- e.g. "UDF_CHAR1" (API stable id)
  label_name   string
  type         enum(18 types)  -- see 21.x note below
  mandatory    bool
  default_value string
  -- Known limitation: multi-select picklists are weak in Zoho (see community)

custom_field_value
  id              PK
  custom_field_id FK -> custom_field
  entity_type     enum(task|issue|project|...)
  entity_id       int
  value           text
```

The 18 field types **[REPORTING]**: Single Line Text, Multi-Line Text, Pick List, Multi-Select Pick List, User Pick List, Multi User Pick List, Date, Number (≤19 digits), Decimal (≤14 digits), Formula, Phone, Email, URL, Percentage, Currency, Checkbox, Date & Time, Billing Type, Long URL (≤1000 chars) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields). (That list actually enumerates 19 names; Zoho markets it as "18 types" — minor doc inconsistency, flagged.)

#### Custom Status
**[REPORTING]** Every status maps to one of **two immutable types: Open or Closed**. Tasks and issues both use customizable statuses with name + color; the two type buckets cannot be deleted (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields). Note correction: **custom statuses are Premium+; it is custom FIELDS that are Enterprise-only** (source: corrections block).

```
custom_status
  id          PK
  layout_id   FK -> layout
  module      enum(task|issue)
  name        NN
  type        enum(open|closed)  NN
  color_code  string
  -- issue statuses additionally carry workflow transitions (see below)
```

#### Blueprint / State / Transition
**[REPORTING]** Blueprint is a state machine attached to a task layout. Each transition has Before / During / After phases; max 5 webhooks per transition After; up to 4 parallel transitions (max 2 sets from a status); publish requires start=Open, end=Closed, all statuses connected (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects).

```
blueprint
  id            PK
  portal_id     FK -> portal
  layout_id     FK -> layout
  name          NN
  description   text
  criteria      json   -- optional execution filter
  state         enum(draft|published)
  enabled       bool

blueprint_status        -- nodes; reuse custom_status rows or mirror them
  id          PK
  blueprint_id FK -> blueprint
  status_id   FK -> custom_status
  -- needs >=1 incoming and >=1 outgoing transition except Closed

blueprint_transition    -- edges
  id            PK
  blueprint_id  FK -> blueprint
  name          NN  -- unique within blueprint
  from_status_id FK -> blueprint_status
  to_status_id   FK -> blueprint_status
  parallel_set_id int  NULL  -- groups parallel transitions
  -- Before:
  allowed_user_ids   json  -- users/teams/profiles who may act
  entry_criteria     json
  -- During:
  during_fields      json  -- mandatory/optional, order, validations
  -- After:
  field_updates      json
  email_alert_ids    json
  webhook_ids        json  -- max 5
```

#### Role, User, Membership
**[REPORTING]** Three orthogonal concepts: Role (designation, org-level), Profile (permission set), and the granular Permission Set inside a profile. Two top-level categories: Portal Users and Client Users. `profile_type` codes: 2=admin, 3=client, 6=manager, 7=employee (source: https://www.zoho.com/projects/help/rest-api/users-api.html; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/profiles-and-roles-projects).

```
role
  id        PK
  portal_id FK -> portal
  name      NN  -- defaults: Administrator, Manager, Employee, Contractor
  editable  bool

profile
  id           PK
  portal_id    FK -> portal
  name         NN  -- defaults: Admin, Client, Employee, Contractor (+ Viewer, Read-Only, Lite)
  profile_type enum(2|3|6|7)
  user_type    enum(portal_user|client_user)
  is_default   bool

user
  id            PK
  portal_id     FK -> portal   NN
  zpuid         string
  name / email  NN
  active        bool
  role_id       FK -> role     -- one at a time
  profile_id    FK -> profile  -- one at a time
  rate / cost_per_hour / invoice_rate  float
  currency_code string
  client_company_id  FK -> customer   NULL  -- client users only

-- project membership (a user joins many projects)
membership
  id           PK
  user_id      FK -> user      NN
  project_id   FK -> project   NN
  role         enum(manager|employee|contractor|client)
  rate / cost_per_hour / user_budget / revenue_budget  float
  UNIQUE(user_id, project_id)

customer   -- client company; groups client users
  id           PK
  portal_id    FK -> portal
  name         NN
  type         enum(business|individual)
  contact_email / web_address / postal  string
  -- constraint: client email domain MUST differ from portal signup domain
```

Permission sets are granular **[REPORTING]**: module permissions with scope qualifiers View(All/Related/None) and Add/Edit/Delete(All/Both/Added/Owned/None), plus field-level Read Only / Read & Edit / Hidden (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects). **[DESIGN]** Model these as a `permission` table keyed by (profile_id, module, action, scope) plus a `field_permission` table keyed by (profile_id, entity_type, field, access). See 21.9 for why this is one of the hardest parts.

#### Tag
**[REPORTING]** Portal-scoped, minimal: id, name, `color_class` (named class from a fixed palette, **not** free-form hex), created_by. Many-to-many via a generic association with numeric `entityType` codes: PROJECT=2, MILESTONE=3, TASKLIST=4, TASK=5, BUG=6, FORUM=7, STATUS=8 (source: https://www.zoho.com/projects/help/rest-api/tags.html). Zoho does **not** publish a per-portal/per-record tag limit, nor the full color palette — both undocumented (source: same).

```
tag
  id          PK
  portal_id   FK -> portal
  name        NN
  color_class string  -- e.g. "bg-tag1".."bg-tag19" (Projects v3 examples)

tag_association
  tag_id      FK -> tag
  entity_id   int
  entity_type int  -- 2=project,3=milestone,4=tasklist,5=task,6=bug,7=forum,8=status
  PRIMARY KEY(tag_id, entity_id, entity_type)
```

#### Comment, Attachment, Document
**[REPORTING]** Tasks/issues carry comments, followers, and document associations; Documents live in a project space (WorkDrive-style) with folder nesting via `parent_folder_id` and `space_id` = project; versioning supported (source: https://www.zoho.com/projects/help/rest-api/documents-api.html). Note Zoho's docs do **not** list documents as a taggable entity (source: https://www.zoho.com/projects/help/rest-api/tags.html).

```
comment
  id          PK
  entity_type enum(task|issue|...)
  entity_id   int
  author_id   FK -> user
  body        text

attachment
  id          PK
  entity_type enum(task|issue|comment|...)
  entity_id   int
  res_name    string
  mime_type   string
  res_size    int    -- per-file cap reported as 128 MB (medium confidence)
  download_url / preview_url  string

document   -- project file space
  id               PK   -- "res_id"
  project_id       FK -> project   -- "space_id"
  parent_folder_id FK -> document  NULL  -- folder hierarchy
  is_folder        bool
  res_name / res_extn / mime_type  string
  res_size         int
  author_id        FK -> user
```

#### Timelog
**[REPORTING]** Attaches to a Task, a Bug, or stands alone as a general log. `bill_status` Billable|Non Billable; `approval_status` Approved|Pending|Rejected; can be invoiced via `invoice_id` when Zoho Finance is integrated (source: https://www.zoho.com/projects/help/rest-api/log-time.html).

```
timelog
  id              PK
  project_id      FK -> project   NN
  task_id         FK -> task      NULL   -- exactly one of task/bug, or both null (general)
  bug_id          FK -> issue     NULL
  owner_id        FK -> user      NN
  log_date        date
  hours / minutes / total_minutes  int
  bill_status     enum(billable|non_billable)
  approval_status enum(approved|pending|rejected)
  approver_id     FK -> user
  cost_per_hour   float
  notes           text
  name            string  -- required for general logs
  invoice_id      int     NULL
  CHECK (NOT (task_id IS NOT NULL AND bug_id IS NOT NULL))
```

---

### 21.2 Entity-relationship summary

**[REPORTING]** Cardinalities, distilled from the sources above:

- Portal **1—N** Project Group, Project, User, Role, Profile, Tag, Custom Field, Business Hours.
- Project Group **1—N** Project; Project **N—1** Project Group (optional).
- Project **1—N** Phase, Task List, Task, Issue, Timelog, Document, Event, Membership.
- Phase **1—N** Task List (optional association); Phase **1—N** Issue (via `milestone_id`/`affectedmile_id`).
- Task List **1—N** Task. (Mandatory: project always has ≥1 task list.)
- Task **1—N** Sub-task (self-referential tree, max depth 6); Task **1—N** Timelog, Comment, Attachment, Follower.
- Task **N—N** Task via Dependency (predecessor/successor; can be cross-project).
- Issue **N—N** Task (bidirectional association) and Issue **N—N** Issue (typed links: Blocks, Depends on, Is related to, Is duplicate of, Is clone of; **max 10 linked issues, one link type per issue**) (source: https://help.zoho.com/portal/en/kb/projects/issue-tracker/associate-tasks-and-issues/articles/associate-task-issue).
- User **N—N** Project via Membership; User **1** Role and **1** Profile at a time.
- Customer **1—N** Client User; Customer **N—N** Project (indirectly, via client user project assignments).
- Tag **N—N** any taggable entity via tag_association.
- Blueprint **1—N** Status and Transition; Transition references Webhooks/Email Alerts.
- Layout **1—N** Custom Field, Custom Status, Workflow Rule (≤20/layout), Custom Function (≤25/layout), Blueprint.

---

### 21.3 Views to build and what each needs from the model

**[REPORTING + DESIGN]** Zoho ships distinct view layers for Tasks, Issues, and Projects (source: https://www.zoho.com/projects/features.html and the view KB articles cited per row).

| View | Applies to | Reads from the model | Notes / gotchas |
|---|---|---|---|
| **List (Classic / Plain)** | Tasks, Issues, Projects | task/issue rows + custom_field_value join; Group By milestone/tasklist/none; inline edit; sort by any column | Classic supports drag-reorder when grouped; Plain is a flat list (source: https://www.zoho.com/projects/features.html) |
| **Kanban** | Tasks, Issues | rows grouped by a chosen column: tasks by Status/Task List/Priority/Percentage; issues by Status/Severity/Module/Classification/Reproducible | **No true swimlanes** in Zoho Projects — frequently requested, confirmed absent (swimlanes exist only in Zoho Sprints). Issue Kanban drag respects workflow transitions (source: https://help.zoho.com/portal/en/kb/projects/tasks/task-operations/articles/kanban-view; https://help.zoho.com/portal/en/community/topic/where-are-kanban-swimlanes) |
| **Gantt** | Tasks (task-level), Projects (portfolio) | task start/end/duration, dependency edges, percent_complete, baseline snapshots, critical-path computation | Portfolio Gantt shows only projects with **both** start and end dates. Critical path/slack and baselines are **Enterprise-only** (source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/project-gantt-view; https://help.zoho.com/portal/en/kb/projects/tasks/critical-path/articles/view-critical-path-on-gantt-chart) |
| **Calendar** | Org/project | aggregates Tasks, Phases, Issues, Events, Meetings (+ Time-Offs via Zoho People); Week/Day modes; drag-to-reschedule; color-by Module/Project/Assignee | Must distinguish **Events** (native) from **Meetings** (integration-backed) as separate tiles (source: https://help.zoho.com/portal/en/kb/projects/collaboration/calendar/articles/calendar) |
| **Custom Views** | Tasks, Issues, Projects | saved filter: up to 20 criteria, AND/OR groups, selectable columns, 3 sharing scopes (me / specific users / all) | This is the de-facto **saved-search** mechanism (the Search API has no saved-search object) (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-custom-view) |
| **Dashboard / Feed / Activity Stream** | Project, Portfolio | widget gallery (Task/Issue/Phase Status, Top-5, Budget, Timesheet, etc.); Feed = social; Activity Stream = chronological | Widgets aggregate counts and rollups; both Feed and Activity Stream read the audit log (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/dashboard-projects) |

**[DESIGN]** Search and tags are separate subsystems to build alongside views: a keyword/substring Search API over ~11 module types (no boolean DSL) and a Tags CRUD + `globaltags/search` discovery endpoint (source: https://www.zoho.com/projects/help/rest-api/search-api.html; https://www.zoho.com/projects/help/rest-api/tags.html).

---

### 21.4 Automation engine model

**[REPORTING]** Zoho's automation is layered and largely Premium/Enterprise-gated. A clone needs four cooperating engines:

**1. Blueprint = state machine (task workflow).** Statuses (typed Open/Closed) + transitions, each with Before (who/criteria → button visibility), During (mandatory fields, validations, prompts), After (field updates incl. % completion, email alerts, **≤5 webhooks**). Supports parallel transitions (≤4, ≤2 sets/status, all must complete), common/reusable transitions, clone, JSON/PNG export. Publish validation: start=Open, end=Closed, all statuses connected, unique names, each status ≥1 in/out transition except Closed (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects).

**2. Business rules + Workflow rules (criteria → action).** Issue **Business Rules** run in list order with AND/OR criteria; actions = update field, notify, webhook, custom function, Zoho Desk ticket update. **Workflow Rules** (Enterprise, project + task layouts) trigger on Create/Edit/Create-or-Edit or date-&-time (on/before/after start/created/due; once/daily/weekly); exit after **first matching condition** unless "execute next" is set; **max 20 rules/layout** (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/business-rules; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/project-automation/articles/workflow-rules-for-tasks). **[DESIGN]** The "first match wins / explicit chain-to-next" semantics is load-bearing and easy to get wrong — implement an ordered rule evaluator with an explicit `execute_next` flag, not a fire-all model.

**3. SLA timers (issues).** Targets "Resolve Before"/"Close Before" in Calendar or Business hours; matched by **first-matching SLA in the list**; up to 4 escalation levels and up to 10 actions (templated email, feed alert, reassign) to Assignee / Project Owner / selected users / pick-list users (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/sla). **[DESIGN]** Requires a scheduler/timer subsystem evaluating against the Business Hours calendar — non-trivial; see 21.9.

**4. Webhooks + custom functions (Deluge).** Webhooks differ by module: **Issue webhooks** fire **only via business rules** (POST/GET, ≤10 issue params, ≤5 custom params, **1000 calls/day**, disabled after 10 consecutive failures, no retry). **Task webhooks** (POST/GET, custom headers, **2000 triggers/day**, disabled after 20 failures/day). **Custom Functions** are Deluge scripts on workflow rules (max 25/layout, 25 params each, auto-disabled after 20 failures/day) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/issue-webhooks; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/webhooks-for-tasks; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/custom-functions-for-projects).

**[DESIGN]** Schedules run Deluge functions on a cron-like basis; Zoho's per-org active-schedule limit (~10) is a **platform norm not separately confirmed for Projects** (low confidence). Don't hardcode that number from this research.

---

### 21.5 Suggested MVP scope vs later phases

**[DESIGN]** This is a recommendation. Ordering favors the smallest slice that reproduces the core hierarchy + the two views users live in (List, Kanban).

**MVP (Phase 1) — the irreducible core**
- Entities: Portal, User (portal users only), Project, Task List (with the "General" default invariant), Task, Sub-task (tree, depth ≤6), Custom Status (Open/Closed types), Comment, Attachment, Tag.
- Behaviors: task CRUD, status transitions, multiple assignees, percent_complete (multiples of 10), parent/child close-cascade rules.
- Views: List (with Group By + sort) and Kanban (group by status/priority).
- Auth: OAuth 2.0 with per-module scopes; single data center.
- Explicitly out: dependencies, Gantt, billing, blueprint, client users.

**Phase 2 — scheduling & issues**
- Phase/Milestone (manual binary status), Dependencies (FS/SS/SF/FF + lag, hard/soft), Gantt view with drag-reschedule, Issue/Bug module with its own enums and workflow statuses, issue↔task linking.
- Timelog (task/bug/general) + weekly/daily timesheet grid (no billing yet).

**Phase 3 — automation & permissions**
- Roles/Profiles/Permission Sets (module + field-level), Client Users + Customer + Internal/External flag visibility, Workflow Rules, Business Rules, SLA timers, Webhooks.

**Phase 4 — advanced / Enterprise-parity**
- Blueprint state machine, Custom Functions (a Deluge-equivalent scripting runtime), Critical Path + Baselines, EVM, full billing/invoicing pipeline, Calendar (Events + Meetings), recurrence, Task Roll-Up.

---

### 21.6 Gotchas / hard parts to replicate

**[DESIGN, grounded in REPORTING]** These are the parts most likely to consume disproportionate engineering effort or to be subtly wrong.

1. **Gantt critical path & slack.** Zoho recomputes the critical path dynamically: critical tasks red, non-critical blue, slack as dotted lines; with no dependency the last-finishing task is critical, with multiple dependencies the longest-duration predecessor is critical; a task stretching past its slack becomes critical (source: https://help.zoho.com/portal/en/kb/projects/tasks/critical-path/articles/view-critical-path-on-gantt-chart). This is a real CPM implementation over the dependency graph and must recompute on every schedule change. Enterprise-gated in Zoho — but the algorithm is the hard part regardless of tiering.

2. **Dependency rescheduling (hard vs soft links).** Hard links auto-shift successor dates when a predecessor moves; soft links do not; "Automatic" picks a type from parent/child dates. Successor auto-reschedule has documented sub-behaviors (move up if predecessor moves up, extend if extended, reschedule on completion) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/task-dependency-settings). **Cross-project dependencies** make this a graph that spans projects. Combined with Business Hours (manual dates always count as working days, but duration-derived dates skip weekends/holidays — source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/business-hours/articles/business-hour-settings), the scheduling math is the single largest correctness risk.

3. **Permissions matrix.** Three orthogonal axes (Role × Profile × granular Permission Set), with module scope qualifiers (All/Related/Added/Owned/Both/None), field-level access (Read Only / Read & Edit / Hidden), special carve-outs (Project Owner always retains full rights; users with Edit-on-Owned can also edit unassigned tasks), and a parallel **Client-user surface** that is a *filtered view of the same project* driven by the per-item Internal/External flag — not a separate dataset (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects; https://www.zoho.com/blog/general/zoho-projects-how-to-using-the-client-user-role.html). Every read/write path must pass through this matrix. Build it as a centralized authorization layer from day one; retrofitting is painful.

4. **Deluge-style scripting.** Custom Functions and Blueprint transition actions assume a sandboxed scripting runtime with an `invokeurl`-style outbound HTTP primitive, REST-endpoint exposure, per-layout limits, and failure-based auto-disable (source: https://www.zoho.com/deluge/help/webhook/invokeurl-api-task.html; https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/developer-space/developer-space-folder/articles/custom-functions-for-projects). A clone needs an embedded, resource-limited scripting engine — a large undertaking that should be deferred to Phase 4.

5. **Completion-percentage math (genuinely under-specified by Zoho).** Task List % = Σ(task% × weight)/Σ(weight); Phase/Project % adds closed-issue weight. Weight is a numeric "Weightage" field (or 1), **not** duration or work hours. Three portal modes (count / percentage / weightage) plus a Root-vs-Subtask selector. Crucially, with **Task Roll-Up** enabled (Premium/Enterprise, **irreversible**, project-scoped) the parent-task % rollup math is **not documented by Zoho** — simple vs weighted average is unknown (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/portal-configuration/articles/project-completion-percentage; https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/task-roll-up). **A cloner must pick a defined behavior and document it; do not claim Zoho-exact parity here because Zoho itself doesn't specify it.**

6. **Milestone status ≠ completion %.** Milestone status is a manual binary flag that does **not** auto-flip when tasks hit 100%; the % is a separate derived display value (source: https://www.zoho.com/projects/help/rest-api/milestones-api.html). Easy to wrongly auto-complete phases.

7. **API surface realities.** OAuth 2.0 only; per-endpoint rate limits (V3 ~200/2min, 10-min block); page-based pagination; PATCH for partial updates; multi-datacenter (use the `api_domain` from the token response, never hardcode); legacy V1/V2 retired 31 Dec 2025 (source: https://goldstarit.com/zoho-projects-v3-apis-update/; https://www.zoho.com/accounts/protocol/oauth/multi-dc.html). A clone aiming for API compatibility should target the V3 shape. Note the V3 console itself could not be scraped (see section caveat), so validate exact field names against a live tenant before committing to wire formats.

8. **Documented limitations worth honoring (or fixing).** Custom fields do **not** support multi-select well (community-reported); no Kanban swimlanes; tag limits and the full color palette are undocumented; recurring tasks cap at 30 occurrences; issue↔issue links cap at 10 with one link type each (sources: https://www.capterra.com/p/169455/Zoho-Projects/reviews/; https://www.zoho.com/projects/help/rest-api/tags.html; https://help.zoho.com/portal/en/community/topic/recurring-tasks-number-of-occurrences-limited-to-30-any-option-of-an-end-date). A clone can choose to match these limits for parity or deliberately exceed them as a differentiator — but should decide consciously, not inherit them by accident.

---

**Bottom line [DESIGN]:** the hierarchy and CRUD entities are straightforward; the value-and-difficulty is concentrated in (a) the scheduling engine (CPM + dependency rescheduling + business-calendar math), (b) the permissions matrix and client-user filtered surface, and (c) the automation stack (Blueprint state machine + rule evaluator + Deluge-equivalent runtime). Build the hierarchy + List/Kanban first; treat those three as the long poles.

---

## 22. prompt.md Coverage Audit & Gap Fills

This section cross-references every feature/requirement described in the user's own `prompt.md` (the intended design for a Zoho-Projects-like system) against Sections 1–21 of this dossier. Each requirement was classified **COVERED** (already documented above), **PARTIAL** (some of it documented, rest filled here), or **MISSING** (filled here). The gap-fills below document how **Zoho Projects actually implements** the feature, with inline `(source: URL)` citations — or, where the requirement is the user's own design with no Zoho equivalent, that is stated explicitly along with the closest Zoho analog. Nothing here is invented; unverifiable points are flagged.

**Audit summary (40 requirements across 4 groups):**

| Group | Requirements | Covered | Partial | Missing |
|---|---|---|---|---|
| A. Home Dashboard & Portfolio | A1–A10 | 0 | 7 | 3 |
| B. Feed, Discuss & Calendar | B1–B3 | 1 | 2 | 0 |
| C. Projects Module & Interior | C1–C10 | 3 | 6 | 1* |
| D. Tasks, Dependencies, Issues, Reports | D1–D9 | 5 | 2 | 2 |

\* C5's "approval to create a project" is a user-only rule with no native Zoho equivalent (Zoho gates project creation by permission/profile, not an approval workflow).

**Build-critical corrections surfaced by the audit:**
- **Milestone completion is MANUAL** (a binary flag), *not* auto-triggered when all child tasks reach 100%. The user's prompt assumes auto-completion — that must be built as custom logic (see §22.C10).
- **"Created by" is not a native Zoho project-list column** (owner + created-date are the analogs) (see §22.C1).
- **Per-task user color picker** exceeds Zoho parity — Zoho offers per-status colors, a tag palette, and fixed priority colors only (see §22.D7).
- **Calendar Month view IS supported** (default) — earlier caveat in §6.5 corrected.
- **In-Feed project search box** and a **single screen listing every task & project as joinable chat rooms** have no Zoho equivalent — flagged as user's own design (see §22.B1, §22.B2).

### A. Home Dashboard & Portfolio — Gap Fills

Scope: requirements A1–A10 ("Home Dashboard & Portfolio"). The audit found that the spec documents Zoho's **Project Dashboard** and the existence of a **Portfolio Dashboard** (spec §6.4.1/§6.4.2 at lines 1787–1821, §9.9–9.10 at lines 2553–2596), plus the prebuilt widget gallery. It does **not** document the **Global Home** page layout the user describes: the left-navigation rail items, an "Overview" section, a "Recent Projects" list, the top open/closed count cards, the named personal widgets ("All tasks", "Tasks for team members", "All issues", "Issues for my team", "My Milestones", "My Issues"), the **Personal vs Portfolio tabs**, or the four named Portfolio reports (Project Status Report / Ownership / Timeline Summary / Budget Status) with their status enum and filter. Those gaps are filled below.

Key mapping note: Zoho calls the home landing page **Global Home** (introduced in Zoho Projects 7). It has exactly the two dashboards the user wants — **Personal** and **Portfolio** (source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html). Several of the user's specific widget names ("All tasks", "Tasks for team members", "My Milestones", "My Issues", and the per-tab top count cards) are the user's own layout naming; the closest documented Zoho equivalents are mapped per item.

---

#### A1. Left navigation rail (Home, Feed, Discuss, Reports, Calendar, Projects)

Zoho Projects' primary navigation is a left sidebar. The documented top-level items include **Home, Feed, Reports, Calendar, and Projects** (source: https://help.zoho.com/portal/en/community/topic/dashboard-summary-of-all-projects; source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html). "Discuss" maps to Zoho's **Chat/Discuss** collaboration surface (real-time personal/group chat rooms inside Projects), which the spec already documents at §12 (line ~2895) but does **not** place in the left-nav list; treat Discuss as a nav entry pointing at the Chat module. "Projects" is the module that lists/creates/manages all projects; "Feed" is the activity/social stream; "Reports" opens the Reports module; "Calendar" opens the org/project calendar. The exact ordering and whether each is a top-rail icon vs. a sub-item is not pinned in the public KB excerpts (the full ordered enumeration could not be fetched verbatim), so treat ordering as design-author's choice.

Build note: Implement a fixed left rail with Home, Feed, Discuss (→ Chat), Reports, Calendar, Projects; back each with its existing module; ordering is yours to set since Zoho's exact order is not publicly enumerated.

#### A2. "Overview" section in the left panel (Tasks, Issues, Milestones, Timesheets, Expenses)

This is the user's own grouped left-panel design. Zoho does not document a left-panel block literally named "Overview" containing those five links on Global Home. The closest Zoho analogs: each of Tasks, Issues, Milestones (Phases), Timesheets, and Expenses is a real module/tab. Zoho does use the word "Overview" elsewhere — e.g., a custom Task View has a **"show in Overview > Tasks"** option (spec line 1864), and there are global/cross-project module views ("My Tasks", "My Issues" are confirmed global views — spec lines 1698, 1746). So a left-panel "Overview" cluster that deep-links to the global Tasks / Issues / Milestones / Timesheets / Expenses views is consistent with Zoho's module model, but the grouping label itself is custom (no Zoho source for that exact section).

Build note: Build the "Overview" group as five deep-links into the global (cross-project) module views; label is custom — don't expect a 1:1 Zoho screen to match.

#### A3. "Recent Projects" list in the left panel

A "Recent Projects" / recently-accessed-projects shortcut list is a common Zoho navigation affordance but is **not confirmed by name** in the fetchable official KB excerpts (search surfaced it conceptually only). Treat as the user's design with no verbatim Zoho source. The reliable Zoho analog is the **Projects module list** with predefined views and favorites (spec line 1684), plus per-project "favorite" flags.

Build note: Implement a "Recent Projects" list keyed off the current user's last-accessed-project timestamps (most-recent first, cap ~5–10); this is a custom convenience with no exact Zoho citation, so do not block on matching Zoho behavior.

#### A4. Home top count cards: Open/Closed Tasks, Issues, Milestones

Zoho's Personal dashboard "has widgets that tell you all about your work items from upcoming to overdue issues, tasks, milestones, and events" (source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html). The spec already documents prebuilt count/status widgets — **Task Status (open vs closed tasks)**, **Issue Status**, **Phase Status** (spec lines 2582–2585). The user's request is a row of six discrete number cards (Open tasks, Closed tasks, Open issues, Closed issues, Open milestones, Closed milestones). Zoho's native equivalent is the **Numbers (KPI)** widget type (single-metric tile) which the spec documents (spec line 2562), combined with the open/closed split that Task Status / Issue Status / Phase Status widgets already render. So the six-card row is a specific arrangement of Zoho's KPI widgets, each scoped to a count; the exact six-card layout is the user's design but every underlying metric is a documented Zoho widget. Note Zoho task/issue statuses are typed Open or Closed (every status maps to one of the two immutable types — spec line 1209), which is what makes an "open count vs closed count" well-defined; milestones are a manual binary notcompleted/completed (spec line 436) so "open milestone" = notcompleted, "closed" = completed.

Build note: Render six KPI number cards backed by counts where each status' Open/Closed *type* drives tasks/issues, and notcompleted/completed drives milestones; this is Zoho's KPI widget pattern in a custom row layout.

#### A5. Task widgets — "All tasks" and "Tasks for team members" (scrollable, scoped to user + team)

The named cards are the user's design. Zoho's confirmed equivalents: a global **"My Tasks"** view (tasks related to the current user — spec line 1698) and, on the Personal dashboard, work-item widgets for tasks (upcoming/overdue) (source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html). For the team-scoped variant, Zoho's documented analog is the **Team Status** widget (overdue/open per member — spec line 2585) and **Top 5 Go-getters** (members by closed tasks — spec line 2586). There is no single documented widget literally called "Tasks for team members," so it maps to Team Status plus a member-scoped task list. Scoping to "logged-in user and their team" matches Zoho's Personal dashboard being inherently user-centric.

Build note: Build "All tasks" on the My-Tasks (user-scoped) query and "Tasks for team members" on a team-member-scoped task query (Zoho's Team Status widget is the analog); make both scrollable card lists.

#### A6. Issue widgets — "All issues" and "Issues for my team"

Parallel to A5 for the Issue Tracker. Zoho confirms a global **"My Issues"** view (issues reported by or assigned to the current user — spec line 1746) and an **Issue Status** prebuilt widget (spec line 2583). The team-scoped "Issues for my team" maps to the same Team Status / member-scoped pattern as A5. No verbatim Zoho widget named "Issues for my team"; it is the user's naming over Zoho's My-Issues + team-member issue scoping.

Build note: Build "All issues" on the My-Issues query and "Issues for my team" on a team-member-scoped issues query; scrollable card lists, mirroring A5.

#### A7. "My Milestones" and "My Issues" widgets

"My Issues" is a confirmed Zoho global view (spec line 1746). "My Milestones" is not a separately named Zoho widget, but the Personal dashboard explicitly surfaces **milestones** as one of the tracked work-item types ("upcoming to overdue issues, tasks, milestones, and events") (source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html), and predefined phase views exist (All/Active/Completed/Overdue & Open/Due this week/Due this month — spec line 831). So "My Milestones" = a personal-scoped phase/milestone widget filtered to phases the user owns or is involved in. Milestone status is the manual binary notcompleted/completed (spec line 436).

Build note: Implement "My Milestones" as a personal-scoped phase list (owned/involved, using the Active/Overdue/Due-this-week derived views) and reuse the confirmed My-Issues view for "My Issues."

#### A8. Customizable widgets — customize icon top-right (add/remove/rearrange)

Confirmed and concrete. Each Zoho dashboard tile is a widget that can be moved, filtered, enabled/disabled, and removed. To manage them, click the **three-dot menu in the upper-right corner**, then **Customize Widgets**; in the resulting popup, toggle each widget with an **On/Off slider**; hovering a widget reveals per-widget icons; widgets can be **reordered, refreshed, or removed**, and dashboards exported to PDF (source: https://www.techrepublic.com/article/how-to-customize-zoho-projects-dashboard/; source: https://help.zoho.com/portal/en/kb/zoho-projects-plus/dashboards/articles/dashboards-of-zoho-projects-plus). The spec documents the project-dashboard "Create / Add from Gallery / Edit / Clone / Delete / resize" mechanics (spec lines 1791–1813, 2565) but not the Global-Home top-right three-dot → Customize Widgets → On/Off-slider flow specifically; that exact flow is the gap this fills.

Build note: Put a three-dot/customize icon top-right on Home; open a "Customize Widgets" panel with per-widget On/Off sliders plus drag-to-rearrange and per-widget refresh/remove, matching Zoho's documented flow.

#### A9. Two home tabs: "Personal" and "Portfolio"

Confirmed verbatim. "Global Home now supports two types of dashboards: **Personal** and **Portfolio**. The **Personal** dashboard has widgets that tell you all about your work items from upcoming to overdue issues, tasks, milestones, and events" (source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html). All of A4–A8 live on the Personal tab, exactly as the user specifies.

Build note: Implement Home as two tabs — Personal (work-item widgets, A4–A8) and Portfolio (cross-project analytics, A10) — matching Zoho's Global Home split.

#### A10. Portfolio tab — analytics dashboard (Status pie, Ownership, Timeline Summary, Budget Status, customizable, filter)

The Portfolio dashboard is "a compact overview of all the work that's been happening across projects" with widgets covering **project-level timeline, status, ownership, budget health, and clients** (source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html), i.e. a cross-project view "based on owners, groups, timeline, etc." (source: https://help.zoho.com/portal/en/community/topic/dashboard-summary-of-all-projects). The spec acknowledges the Portfolio Dashboard exists (status/ownership/budget health) at lines 1819–1821 but does not document the four named reports, the status-pie enum, the chart-type option, or the filter. Concretely:

- **Project Status Report (pie chart).** Maps to Zoho's "status" portfolio widget. In Zoho, the project **Status field is fully customizable** (create custom statuses, assign colors) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/project-layouts-and-fields). Documented default project statuses surfaced in sources include **Active, In Progress, Completed, On Hold** (and Cancelled) (source: https://help.zoho.com/portal/en/community/topic/project-statuses). The full eight-value set the user lists — **active, approved, in progress, completed, on hold, reopen, to be tested, in testing** — could **not** be confirmed verbatim from a single official Zoho source; treat it as a customizable status set (Zoho lets you define exactly these). The Task/Issue Status widget supports chart type **Bar, Pie, or Donut** (source: https://www.zoho.com/projects/charts-and-reports.html), so a pie-rendered Project Status Report is consistent with Zoho's chart options.
- **Project Ownership Report.** Confirmed as a portfolio dimension — Portfolio summarizes projects "based on owners" / "ownership" (source: https://help.zoho.com/portal/en/community/topic/dashboard-summary-of-all-projects; source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html). Render as projects-per-owner.
- **Project Timeline Summary.** Confirmed — Portfolio gives "comprehensive reports on your overall project timeline" (source: https://www.zoho.com/projects/projects7.html). Note Zoho's portfolio/Gantt timeline only includes projects that have BOTH a start and end date (spec line 1778).
- **Project Budget Status.** Confirmed — Portfolio reports "budget health" / "budget status" (source: https://www.zoho.com/blog/projects/introducing-zoho-projects-7.html); the prebuilt **Budget Status** widget shows Planned vs Actual (spec line 2591).
- **Customizable widgets + filter.** Same customize mechanics as A8 (three-dot → Customize Widgets, On/Off, reorder). Zoho documents that each dashboard widget can be **filtered** ("widgets that can be moved around, filtered, and enabled or disabled") (source: https://www.techrepublic.com/article/how-to-customize-zoho-projects-dashboard/), and the Portfolio data can be sliced by owners/groups/timeline (source: https://help.zoho.com/portal/en/community/topic/dashboard-summary-of-all-projects). The precise Portfolio filter field set is not enumerated in the public excerpts.

Build note: Build the Portfolio tab with four widgets — Project Status Report (pie; statuses sourced from the customizable Project Status field, defaulting to the user's eight values and rendering Bar/Pie/Donut), Project Ownership (projects per owner), Project Timeline Summary (projects with both start+end dates), Project Budget Status (planned vs actual) — all customizable via the same three-dot Customize-Widgets flow, with a portfolio filter (by owner/group/status/timeline).

---

Confidence / sourcing limitations:
- Personal vs Portfolio split, Portfolio widget categories (timeline/status/ownership/budget/clients), and the customize-widgets flow are **well sourced** (Zoho 7 blog, TechRepublic, Projects Plus KB, community KB).
- The four Portfolio report **names** are the user's labels; Zoho confirms the underlying dimensions but not those exact titles.
- The eight-value Project Status pie enum is **partially confirmed** (Active/In Progress/Completed/On Hold documented; approved/reopen/to-be-tested/in-testing are customizable, not confirmed as Zoho defaults).
- Left-nav exact ordering, the "Overview" section label, and the "Recent Projects" list are **custom design** with no verbatim Zoho source; closest analogs documented above.
### B. Feed, Discuss & Calendar — Gap Fills

Scope: requirements B1 (Feed module), B2 (Discuss module), B3 (Calendar module).
Coverage was audited against `zoho-projects-complete-spec.md`. The spec already covers the Feed/Activity Stream concepts (§6.7, §10.1), Status posts (§10.1), Forums (§10.3), built-in Chat Rooms + Cliq (§10.7), and the Calendar/Events/Meetings model (§2.15, §6.5) in depth. The gaps below are the requirement-specific framings the spec does not state concretely or states with now-outdated confidence flags.

---

#### B1. Feed page navigation: project scope toggle, search, and the Feed / Status / Activity Stream sub-tabs

The spec documents Feed, Status posts, and Activity Stream as concepts (§6.7 lines 1874–1879; §10.1 lines 2693–2724) and confirms the by-month and by-category filters and the "specific project | All Projects" scope on a status post (line 2713). What it does NOT frame is the requirement's exact UI shape: a project-scope selector at the top of the Feed surface, a project search, and Feed / Status / Activity Stream as sibling sub-tabs.

Concrete behavior (closest Zoho analog):
- The Feed lives under the left-nav **Collaboration** group; it gives a bird's-eye, social-style stream of all project happenings, surfacing Status, Announcements, Forums, Documents, and the Activity Stream as filterable categories, and can be filtered by a selected month (source: https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/feeds).
- Scope is chosen per-context: a user views the feed of a **specific project**, or posts/views at **"All Projects"** scope. An "All Projects" status post is visible to everyone in the portal (including client users on other projects), whereas a project-scoped post is visible only to that project's members (source: https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/add-status-to-feed). This is the real Zoho analog of the requirement's "Select Project" vs "All Projects" toggle.
- Finding a project + its info: Zoho does NOT expose a dedicated search box embedded inside the Feed page. The product-wide mechanism is the top-nav global search bar (results across projects, tasks, bugs, comments) with a Filter icon to narrow to a specific project, plus the Projects list's predefined views (source: https://help.zoho.com/portal/en/community/topic/global-search-functionality-is-now-made-available-in-zoho-projects-android-mobile-app). The requirement's "search box below the All-Projects toggle, in the Feed" is therefore the user's own design; the closest Zoho analog is the global search bar scoped via its project Filter.
- "Projects divided by status": the Projects list view groups/filters projects by their status. Project `status` is a first-class enum `active | archived | template` at the data layer (spec §2.5 line 384), and project status is additionally customizable (Open/Closed-typed custom statuses) like task status (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/project-layouts-and-fields). So a "projects divided by status" panel maps onto grouping the project list by the project status field.
- The three sub-tabs the requirement names (Feed / Status / Activity Stream) map to Zoho's category filters on the Feed surface rather than three literal top tabs: **Feed** = the aggregated social stream; **Status** = the status-post category (free-text posts with @mentions of users and #tags of work items); **Activity Stream** = the chronological audit log of updates to tasks, bugs, milestones, forums, documents, plus status changes and backlog additions, which can be set as the default surface instead of Feed (source: https://www.zoho.com.cn/projects/help/latest-activities.html; source: https://help.zoho.com/portal/en/community/topic/4-0-default-feed-to-activity-stream-instead-of-feed). Build-relevant distinction: the Activity Stream is a read-only system log and does NOT capture task comments (source: https://help.zoho.com/portal/en-gb/community/topic/projects-activity-stream-needs-to-include-task-comments), whereas the Feed/Status surface is interactive (post status, add task, upload image, file issue, comment inline, and change a task's completion/priority/% inline via the item's down-arrow).

Build note: Model a Feed page with a project-scope control (Specific Project | All Projects) and three sibling sub-tabs — Feed (interactive aggregated stream), Status (user posts with @user / #workitem tagging), Activity Stream (read-only chronological audit log, newest-first, comments excluded). Provide month + category filters (Announcements, Status, Forums, Documents, Activity Stream). For "find a project + its info," either build the requirement's in-feed search box as your own addition or reuse a global search with a project filter. Drive "projects divided by status" off the project status field (active/archived/template plus any custom Open/Closed project statuses) as the group-by key in the Projects list.

---

#### B2. Discuss module: join the default group, start a New Conversation, invite participants, schedule meetings

This is the largest genuine gap. The spec treats built-in real-time chat only as generic "Chat Rooms (built-in)" at medium confidence with a "verify" tier note (§10.7 lines 2891–2895) and never names the **Discuss** module, the default all-users group, the **New Conversation** flow, or meeting scheduling from chat. Zoho Projects has a first-class native module that matches requirement B2 almost exactly.

Concrete behavior:
- The module is named **Discuss** (now also surfaced as **Chat**) and lives under left-nav **Collaboration**. It is real-time team chat: "everyone can virtually come together to discuss important topics," create chat groups or schedule meetings, invite participants, and reach decisions faster (source: https://www.zoho.com/projects/project-chat.html).
- Joining a discussion: "By default, there is one chat group where all the project users can take part," and users "can create other groups to keep conversations separate" with no restriction on group size (source: https://www.zoho.com/projects/project-chat.html). This default-group-everyone-can-join behavior is the real analog of the requirement's "JOIN and have a discussion."
- Starting a new conversation: Collaboration > **Chat** tab > **New Conversation** (top-right) > select a project, enter a conversation title, add participants, click Add; conversations can be **private or public** (source: https://help.zoho.com/portal/en/kb/projects/collaboration/discuss-1/articles/chat-22-11-2024). This is the requirement's "START A NEW CONVERSATION" verbatim.
- Conversation history is preserved for later review of prior decisions; organizers can invite team members into a discussion (source: https://www.zoho.com/projects/project-chat.html).
- A/V + meetings: from Discuss/Chat you can run audio/video meetings, share screen, and "schedule a meeting with them right from Zoho Projects" (source: https://help.zoho.com/portal/en/kb/projects/collaboration/discuss-1/articles/chat-22-11-2024). This connects Discuss to the Meeting entity already modeled in spec §2.15.2.
- Distinction the requirement implies but Zoho splits across two surfaces: Discuss/Chat = real-time, conversational, ephemeral-feeling threads; **Forums** = threaded, long-form, topic-based discussion boards (one set per project, with Categories, question/normal post types, and Best-Answer marking) for durable knowledge capture (spec §10.3 lines 2736–2793; source: https://www.zoho.com/projects/project-forums.html). The requirement's "all tasks and projects are listed; join on a particular project/task and discuss" is closest to: Discuss conversations are scoped to a selected project (and work items carry their own inline comment threads — comments on tasks/issues/pages/forum posts/status, spec §10.2), while a portal-wide list of joinable conversations is the Discuss conversation list. There is no native single screen that lists every task AND every project as joinable chat rooms; that consolidated listing is the user's own design. Closest analogs: per-project Discuss groups + per-work-item comment threads.

Build note: Implement a Discuss module under Collaboration with (1) a default group that auto-includes all project members (the "join" affordance), (2) a "New Conversation" action — pick project, title, participants, private/public visibility, (3) persistent conversation history, (4) participant invites, and (5) an entry point to schedule a Meeting (reuse the Meeting entity from §2.15.2: agenda, external-email invites, join link, RSVP, recording). Keep Forums as a separate long-form/threaded surface; do not collapse Discuss and Forums into one. If you want the requirement's "list all tasks and projects, join any" screen, build it as a custom aggregation over per-project Discuss groups + per-work-item comment threads — it has no 1:1 Zoho equivalent.

---

#### B3. Calendar: Month view is supported, and add/assign/invite mechanics

The spec's Calendar section (§6.5 lines 1825–1848) is largely correct but carries an now-correctable caveat: it states only Week and Day view modes are confirmed and that "a Month mode is not confirmed by the cited sources." The current official Calendar KB article confirms Month view — and that it is the default.

Concrete behavior (corrections + confirmations):
- View modes: **Month (default), Week, and Day** — all three are documented, selectable from a dropdown in the calendar (source: https://help.zoho.com/portal/en/kb/projects/collaboration/calendar/articles/calendar). This supersedes the spec's "Month not confirmed" note in §6.5 line 1848 and §2.16/§6.12 gap flags.
- In Day and Week views, time-beared work items (tasks, events, meetings) render against a 24-hour grid, while Phases and Issues are shown pinned at the top (source: same).
- Item types addable to the calendar: **Tasks, Events, Meetings, Phases (milestones), Issues**, and **Time-Offs** (Time-Offs require the Zoho People integration) (source: same) — matches the requirement's "tasks, issues, milestones, events, and meetings."
- Adding an activity: Collaboration > Calendar, then either click a date or use **"Add Activity"** (upper-right); hovering the more-options icon exposes a tile per activity type. Items can be created and rescheduled by **drag-and-drop** in Week/Day views (source: same). This is the requirement's "user can add activities & tasks."
- Events — invite/attendees: when creating an Event you enter Title, Starts-at and Ends-at date/time, and **select Attendees from the list of users in your project**, set a location, and set recurrence via the Repeat option (source: same). This is the requirement's "add/invite users to a particular event." Native Events invite **internal project users only**; to invite **external people by email** you use a **Meeting** (Zoho Meeting integration), which adds agenda, external-email invites, an auto join link, RSVP, and recording (spec §2.15.2). So "invite users to an event" = native Event attendees; "invite outsiders" = Meeting.
- Reminders: an Event reminder is set from a **"Remind all" / Remind-before** dropdown so attendees stay up to date (source: same); the native Event reminder enum is fixed (on time | 15 mins | 30 mins | 1 hour | 2 hours | 6 hours | 12 hours | 1 day) per spec §2.15.1 line 709.
- "Higher authorities can ASSIGN items with deadlines that reflect on the calendar": this maps to Zoho's normal assignment + due-date model, not a calendar-specific feature — a manager/admin assigns a Task/Issue/Event to a user with a due/end date, and because the calendar aggregates those modules, the assigned dated item automatically appears on the assignee's (and the org/project) calendar. Permission to create Events & Meetings is itself a tier/role-gated feature permission (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/user-management/articles/permission-sets-projects). There is no separate "assign onto calendar" action — assignment + a date is what surfaces it.
- Other confirmed calendar behaviors (already in spec, retained for completeness): color-by Module/Projects/Assignee; export to PDF; import third-party calendars; recurring events daily/weekly/monthly/yearly; per-user holiday icon (source: https://www.zoho.com/projects/projects-calendar.html).

Build note: The clone's calendar should default to Month view and also offer Week and Day (24-hour grid with timed items in the body, Phases/Issues pinned at top). Support adding Tasks, Events, Meetings, Phases, Issues (and optionally Time-Offs) via "Add Activity" or click-a-date, plus drag-to-reschedule in Week/Day. Treat the calendar as an aggregation layer: any dated, assigned work item from Tasks/Issues/Phases/Events/Meetings auto-appears — implement "assign with deadline reflecting on calendar" as assignment + due-date rather than a bespoke calendar action, gated by an Events & Meetings feature permission for "higher authorities." For invites: native Event = internal project-user attendees + fixed reminder enum + coarse recurrence; Meeting = external-email invites + join link + RSVP + recording. Update spec §6.5 to record Month view as confirmed (default).

---

Unfetchable / could-not-confirm sources:
- https://help.zoho.com/portal/en/kb/projects/collaboration/feeds/articles/feeds — fetched, but the page describes Feed concepts only; it does NOT expose the on-page tab/sub-tab layout or an in-feed search box. The Feed sub-tab/category-filter framing in B1 therefore relies on the secondary zoho.com.cn latest-activities page and the add-status-to-feed KB article, not this primary page.
- An in-Feed dedicated project search box could not be confirmed in any Zoho source; documented as the user's own design with the global search bar (+ project Filter) as the closest analog.
- A single native screen listing every task AND every project as joinable chat rooms (B2) could not be confirmed; documented as user's own design with per-project Discuss groups + per-work-item comment threads as the closest analog.
### C. Projects Module & Project Interior — Gap Fills

Scope: requirements C1–C10 ("Projects module & inside a project"). Items fully covered by the spec are skipped (see the coverage matrix in the audit return). Each gap below documents the real Zoho Projects implementation with inline sources and a build note. Where a requirement is the user's own design rule rather than Zoho behavior, that is flagged explicitly with the closest Zoho analog.

---

#### C1. Projects list — exact columns & the "created by" gap

The spec (§6.3, §2.5, §13.4) covers project fields and the portfolio Gantt but does not enumerate the Projects **List View** columns or the predefined views, so C1 was PARTIAL.

Real behavior: The Projects List View is reached from the **Projects** tab in the left navigation. It shows, per project row: **project name (title)**, **project status**, number of tasks completed, **start and end dates**, planned vs. actual cost, budget details, and any project custom fields. Columns are user-controllable inline via **Hide Column / Add column**, and fields are inline-editable by clicking them (the Billing Method field is locked once an invoice exists) (source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/projects-list-view).

- **status, start date, project name, end date** map directly to documented columns.
- **"created by"** is NOT a documented default column in the Projects List View. The closest stored analog is **owner_id / owner_name** (the project owner) on the Project entity (spec §2.5 line 386), plus the API's `created_date`. Treat "created by" as a user-requested column that the cloner should add (the list supports Add column / custom columns, so this is an additive customization, not a conflict).

Build note: ship a configurable column set with defaults {Status, Project Name, Owner, Start Date, End Date} and let "Created By" be an addable column backed by a `created_by_user` field (Zoho exposes owner + created_date but not a distinct creator column out of the box). Make columns show/hide + inline-edit like Zoho.

---

#### C3. Predefined project views — what Zoho actually ships vs. user wishlist

Spec §6.6 covers Custom Views well (20 criteria, AND/OR, column picker, sharing, favorite) and §6.3 covers the portfolio Gantt, but it does NOT enumerate the predefined **project** views (only predefined **phase** views at §3.2), so C3 was PARTIAL.

Real behavior — the officially documented predefined project views are:
- **Active Projects** (default view), **Archived Projects**, and **Trashed Projects** (trashed projects are recoverable for **30 days**) (source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/projects-list-view).
- A **Projects by Client** grouping view exists on the projects page (alongside the plain projects view) (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/project-groups).
- "**Completed**" is NOT a separate stored project view: Zoho has no native "completed" project status — projects are **Active / Archived / Template** at the data layer (spec §2.5 line 384 confirms `status = active | archived | template`), and the community-documented pattern is to use **Archived** to represent "done" projects (source: https://help.zoho.com/portal/en/community/topic/project-active-archived-used-to-set-project-completed).

User-only-design flags & closest Zoho analogs:
- **"View by owner" / "view by group"** — not shipped as named preset views. Closest analogs: **Project Groups** (organizational buckets, can group/filter by client/requirement/users — spec §13.6) and **Project Custom Views** filtered/grouped by owner or group. The community has explicitly requested a built-in "by project group" project view, confirming it is not native (source: https://help.zoho.com/portal/en/community/topic/custom-project-view-by-project-group).
- **"View by client"** — has a real analog: the **Projects by Client** view above.
- **"and much more"** + user CUSTOM views — fully covered by §6.6 Custom Views (these ARE the user-created custom views; the cloner should let users save any filter/group/column combination as a named, sharable view).

Build note: ship presets {Active (default), Archived, Trashed (30-day recycle), Templates, By Client} and let By Owner / By Group be saved Custom Views or Group-By selections rather than hard-coded presets. Model project status as Active/Archived/Template (no native "Completed"); if you want a real Completed status, that is a design extension beyond Zoho.

---

#### C4. Project-module utilities — Manage Groups, Timeline ICS, Export, Help

Spec covers Project Groups as config (§13.6) but does not frame the four module-level utilities C4 lists, so PARTIAL.

Real behavior:
- **Manage Groups** → Zoho's **Project Groups**: created under `Projects tab > Project Groups > New Group`; each group has an optional prefix (≤10 chars, alphanumeric + hyphens), projects assigned via Group Name or drag-and-drop, deleting a group moves its projects back to Active Projects (spec §13.6 already documents this — reuse it; the C4 label "Manage Groups" = this surface) (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/project-groups).
- **Export Projects** → the Projects List View has a native **Export** action: export projects to **XLSX or CSV**, choosing which fields to include (source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/projects-list-view).
- **Project Timeline ICS** → Zoho exposes the project **Calendar** as an **ICS / iCalendar feed**. In the Calendar, the menu icon → **"ICS help"** link surfaces an **iCalendar link** and a **Google Calendar link**; users hover to copy/download the calendar URL, which feeds tasks, milestones, and events into Outlook / iCal / Google Calendar (source: https://help.zoho.com/portal/en/kb/projects/calendar/articles/sync-with-calendars; source: https://www.zoho.com/projects/projects-calendar.html). Note: Zoho ships this as a **Calendar** ICS feed rather than a button literally named "Project Timeline ICS"; that exact label is a user naming choice — the ICS subscription feed is the real analog.
- **Help** → standard Zoho in-product help launcher (KB/help center); no special Projects-only behavior to clone beyond a link to docs.

Build note: implement (1) a Project Groups manager (CRUD + prefix + drag-assign), (2) an Export action on the project list (XLSX/CSV with field picker), (3) a per-portal/per-project ICS subscription URL (read-only iCal feed of tasks/milestones/events) plus a copy-URL affordance, and (4) a Help entry point. Label the ICS item "Project Timeline (ICS)" per the user, backed by a standard iCalendar feed.

---

#### C5. Create new project — full field list, template gallery categories, public/private, approval

Spec §13.1 covers Project Templates and §6.6/§13 cover customization, but the **create-from-scratch field list, the template gallery categories, the public/private toggle at creation, tab customization at creation, and the approval question** were not consolidated, so C5 was PARTIAL.

Real create-project flow (source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/create-projects; source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/create-project-from-template):
- **New Project** button is in the **upper-right corner** of the Projects tab.
- Fields when building from scratch: **Project Title (mandatory)**, Owner, Start Date, End Date, **Project Overview** (description), Group (Group Name), Tags, Business Hours, Budget, Currency, **Task Layout**, Default Billing Status, Billing Method (project hours / staff hours). Tasks/milestones can be added after creation or pre-populated by a template.
- **Tab customization at creation** is real: "Customize the tabs for your project as necessary. You can control the visibility of the modules to others in the project with this option." → C7/C8 tabs (Tasks, Issues, Milestones, etc.) can be shown/hidden per project at creation time.
- **Private vs Public** is set in the same form: scroll to the access setting and "Select either Private or Public as per project requirement." Plus a Premium/Enterprise **"Make this a strict project"** checkbox (all work items must fall within scheduled project dates) — this is the spec's `is_strict / strict_project` field (§2.5 line 401), which is a *date-discipline* setting, NOT the public/private setting; do not conflate them.

Template gallery categories (organized category-wise per C5) — confirmed gallery categories: **Software/IT, Digital Marketing, Construction, Manufacturing, Marketing/Sales, Risk Tracker, Wedding Planner, Travel, Vehicle Inspection, UX Research, Accounting, Apartment Maintenance, Retail Store, Pharma** (source: https://help.zoho.com/portal/en/kb/projects/projects/project-templates/articles/template-gallery). Accessed via the **New Project** button → select a template → **Use Template**, or portal-level options icon beside Projects → **Template Gallery**. (Custom project templates: Premium max 20 / Enterprise max 30 — spec §13.1.)

**APPROVAL to create a project — FLAGGED as a user-only rule.** Zoho Projects has **no documented project-creation approval/sign-off workflow.** Whether a user can create projects is governed purely by **profile/role permissions** (e.g., only Portal Owner/Admin or profiles granted the Add-Project privilege can create), not by an approval queue (no approval step appears in the create-project docs; access is permission-gated — spec §12 covers profiles/permissions). The community pattern for "anyone can see but only admins can change" is profile cloning, not approval (source: https://help.zoho.com/portal/en/community/topic/allow-all-company-users-to-view-all-projects-but-only-owner-admins-can-change-projects). The "needs approval from root/super user/admin" requirement is therefore a **custom design rule with no native Zoho equivalent** — closest analog is a permission gate.

Build note: build the create form with the fields above (Title mandatory), a category-organized template gallery seeded with the 14 categories, a Public/Private radio + optional "strict project" checkbox, and per-project tab/module visibility toggles. For the approval requirement, implement an explicit **create-project approval queue** (submit → pending → root/admin approves) as a NET-NEW workflow — Zoho does not provide it; do not assume any Zoho API supports it. Keep "strict project" separate from "private."

---

#### C7. "Open Details" button & the project-detail page

Spec covers the project entity and dashboard but does NOT mention the **"Open Details"** affordance next to the project title, so C7 was MISSING for that specific UI.

Real behavior: Inside a project, **"Open Details" sits beside the Project Title.** Clicking it opens the project's complete info panel (right-side detail panel) where you can edit project attributes — including the **Project Access** section to flip Private↔Public via the edit icon (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/public-projects). The same "Open Details" / "Open Details in New Tab" pattern recurs on task lists and other entities (source: https://help.zoho.com/portal/en/kb/projects/tasks/task-list/task-list-operations/articles/manage-tasklists). This directly confirms C7's "Open Details button next to project name → complete info page."

Build note: render the project name in the project header with an adjacent **Open Details** control that opens the full project record (all fields incl. owner, dates, budget, access, layout). Make it the same component used for editing Public/Private and strict settings.

---

#### C8. Project-interior tabs — the real top-band nav & three-dot menu

Spec lists project modules in prose but does not enumerate the **in-project top-band tabs** in C8's order, so PARTIAL.

Real behavior: Inside a project, the **top band** tabs let you switch between **Dashboard, Tasks, Gantt & Reports, Documents, Milestones, Timesheets, Issues, and Users** (the visible set depends on per-project module visibility and permissions; tabs are customizable per project — see C5) (source: https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/dashboard-projects; source: https://www.zoho.com/projects/features.html). C8's specific list (Dashboard, Tasks, Issues, Task List, Milestones, three-dot/overflow) maps onto this: Dashboard, Tasks, Issues, Milestones are first-class tabs; **"Task List"** is Zoho's **Task Lists** grouping *within* the Tasks module (the Tasks tab has List/Gantt/Kanban views and a Group-By: Milestones / Task List) rather than a separate top-level tab; the **three-dot / overflow menu** is the real Zoho pattern for surfacing additional modules/actions that don't fit the band (e.g., per-entity "Open Details, Open Details in New Tab, Make as Template, Copy Link, Follow" — source: https://help.zoho.com/portal/en/kb/projects/tasks/task-list/task-list-operations/articles/manage-tasklists). Note "Milestones" is the legacy label; current Zoho UI also uses **"Phases"** for the same object (spec §3.2).

Build note: render an in-project tab band {Dashboard, Tasks, Issues, Milestones, ...} with an overflow "..." menu for the rest (Timesheets, Documents, Users, Gantt & Reports). Treat "Task List" as a Tasks sub-view / group-by, not a peer tab, unless the user specifically wants it promoted. Respect the per-project tab-visibility config from C5.

---

#### C10. Milestones tab — create milestone, milestone→tasks, completion is MANUAL (build-critical)

Spec §3.2 / §2.6 / §3.8 cover the Phase/Milestone entity and the manual-completion trap thoroughly, but C10's **tab-level workflow** (list milestones → create → click to see tasks → completing tasks "hits" the milestone) and the **Create Task field list** were not consolidated against C10, so PARTIAL — and one C10 assumption is WRONG and must be corrected.

Real behavior:
- The **Milestones** tab lists all project milestones; predefined milestone views are **All Phases, Active Phases, Completed Phases, Overdue & Open, Due this week, Due this month** (spec §3.2 line 831). Create via the Milestones/Phases tab; a milestone groups task lists, which group tasks (source: https://help.zoho.com/portal/en/kb/projects/phases/articles/milestones).
- Clicking a milestone shows its associated task lists/tasks — matches C10.
- **CORRECTION (build-critical): completing the tasks does NOT auto-complete ("hit") the milestone.** Zoho milestone status is a **manual binary** (`notcompleted` | `completed`); a phase does **not** auto-flip to completed when its tasks reach 100% — completion is a deliberate manual action (the UI shows only Move/Delete, not auto-complete) (spec §3.8 line 1030; source: https://www.zoho.com/projects/help/rest-api/milestones-api.html; source: https://help.zoho.com/portal/en/community/topic/milestones-how-to-complete). C10's "completing the tasks hits the milestone" is the user's desired behavior, NOT Zoho's. If you want auto-hit, that is a design enhancement beyond Zoho — implement it explicitly.

Create Task field mapping (C10's task fields vs. Zoho): Zoho's task fields cover **name, description, start date, due date, priority, tags, work hours (Work Hours Planned), owners** (spec §4.1 the 9 default fields; §2.8 task entity). The C10 extras — **info, version number, file name, document name, module, team lead, release name, release date** — are NOT standard Zoho task fields; they are **issue/release-note concepts or custom fields**: "module" and "release/affected milestone" belong to the **Issue/Bug** entity (spec §2.10 — issues carry `module` and `milestone_id`/`affectedmile_id`), and version/release name/release date map to Zoho's **release notes** on a phase. So model C10's task as Zoho's standard task layout **plus custom fields** (Enterprise-tier feature, §4.3: up to 300 custom fields, 18 types) for info/version/file name/document name/team lead/release fields.

Build note: Milestones tab = list + predefined views + Create Milestone + drill-in to tasks. Add a **Create Task** button on the milestone with standard fields (name, description, start/due date, priority, tags, work hours, owners) and expose the C10 extras as configurable custom fields. CRITICAL: decide explicitly whether milestone completion is manual (Zoho-accurate) or auto-on-100% (user's stated wish) — they differ; the user asked for auto, Zoho is manual.

---

#### Unfetchable / could-not-verify sources

- https://help.zoho.com/portal/en/kb/projects/projects/project-operations/articles/create-project-from-template — returned HTTP 404 on direct fetch; create-from-template details recovered from the create-projects article and the template-gallery article instead.
- Exact predefined project views beyond Active/Archived/Trashed/By-Client are not enumerated in a single official page; "by owner"/"by group" confirmed as community feature-requests (not native presets) rather than documented presets.
- The literal label "Project Timeline ICS" is not a Zoho UI string; verified analog is the Calendar **ICS / iCalendar feed** ("ICS help" → iCalendar link).
- No official Zoho page documents a **project-creation approval workflow**; absence treated as confirmation that it is permission-gated, not approval-gated (user design rule).
### D. Tasks, Dependencies, Issues & Reports — Gap Fills

Coverage summary (full matrix in the return message). The spec already covers D2 (columns/custom columns), D3 (List/Kanban/Gantt views + Kanban grouping + Gantt arrangement), D6 (FS/SS/SF/FF), D8 (Issue terminology: Severity/Reporter/Classification/Module/Reproducible), and D9 (Workload/Resource Utilization report: Bar + Heatmap, legend values, daily/weekly/monthly, allocation colors, planned-vs-actual). The gaps below are D1 (partial — extra creation-form field labels), D4 (missing — task-bar utilities), D5 (missing — per-task right-click context menu), and D7 (partial — Gantt zoom/timescale + minimize/maximize/resize + color-coding).

---

#### D1. Task-creation fields — mapping the user's extra labels to Zoho analogs

The spec fully documents the 9 default task fields (Owner, Status, Start Date, Due Date, Duration, Priority, Completion %, Work Hours, Completion Date) at §4.1, plus name/description, tags, and work hours. The user's prompt also lists "information / additional information," "version number," "file name," "document name," and an "additional information" block of (module, team lead, release name, release date). These are NOT native fixed task fields in Zoho Projects — they map to Zoho's custom-fields system and to module/document associations:

- **Tags, due/start date, priority, work hours, description** — native task fields (already in spec §4.1, §4.6, §4.14).
- **Version number, file name, document name, team lead, release name, release date** — in Zoho these are modeled as **custom fields** (18 custom field types, up to 300 per portal; custom-field creation is Enterprise-only) and arranged on the task layout via Customization > Layouts and Fields > Tasks. There is no built-in "version"/"release"/"team lead" task field; the builder adds them as custom fields (Single Line Text / Number / Date / User Pick List as appropriate) (source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields).
- **Module** — this is a native field on the **Issue/Bug** entity (picklist {id,name}), NOT on tasks; on tasks it would be a custom pick list (source: https://www.zoho.com/projects/help/rest-api/bugs-api.html).
- **File name / document name** — Zoho handles these via **document association** rather than a text field: a task can have attachments and be associated with project Documents (WorkDrive-backed, versioned), surfaced in the task's Documents/attachments section, not as a "file name" form field (source: https://www.zoho.com/projects/document-management.html; source: https://www.zoho.com/projects/help/rest-api/tasks-api.html).
- **Release name / release date** — closest Zoho analog is the **Release Milestone / Affected Milestone** concept used by the Issue Tracker and Business Rules; for tasks, use a Date custom field + a pick-list custom field (source: spec §5.4.1, https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/issue-tracker/automation/articles/business-rules).

Build note: Provide a task-creation form with the 9 native fields, then implement these extra labels as configurable custom fields (text/number/date/user-picklist) plus a document-association widget. Treat "Module / Team Lead / Release Name / Release Date" as a collapsible "Additional Information" custom-field group on the layout. Do not hard-code them as fixed system fields — Zoho does not, and that keeps the layout user-editable.

---

#### D4. Task-bar (toolbar) utilities on the Tasks list view

The user requires a task-bar with Import, Export, Dissociate Blueprint, Subtasks, and Help. Zoho Projects' Task List View confirms a top/contextual toolbar (typically under a "more" / menu icon at top-right) with:

- **Import Tasks** — select a file format (xls/csv), then drop or upload the attachment; supports mapping all available fields and sub-tasks during import (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/tasks/articles/task-list-view; source: https://help.zoho.com/portal/en/community/topic/importing-tasks-using-all-available-fields-sub-tasks).
- **Export Tasks** — choose the task view and download format; you can drag fields from "Available" to "Selected" to control which columns export (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/tasks/articles/task-list-view).
- **Disassociate Blueprint** (Zoho spells it "Disassociate", the user wrote "Dissociate") — "click Disassociate Blueprint, then click Disassociate to disassociate the Blueprint from all the tasks in the project." This removes the Blueprint workflow from every task in the project at once (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/tasks/articles/task-list-view; source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/automation/task-automation/articles/blueprint-projects).
- **Subtasks** — a collapse/expand control ("Subtask collapse/expand icon") that shows or hides subtasks under their parent tasks in the list (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/tasks/articles/task-list-view).
- **Help** — a generic help/"?" affordance is present across Zoho Projects screens linking to the KB; not separately documented as a Tasks-specific toolbar item (user-design item — treat as a standard help launcher).

Build note: Render a Tasks toolbar with Import, Export, Disassociate Blueprint, and a Subtask expand/collapse toggle (plus a Help/? link). Group low-frequency actions (Import/Export/Disassociate Blueprint) under a single "more" (⋮) menu as Zoho does, and keep the Subtask expand/collapse as a direct icon since it is used constantly.

---

#### D5. Right-click context menu on a task

The user requires a per-task right-click menu: Open Details, Open Details in New Tab, Copy Link, Move, Clone, Create Task Above, Create Task Below, Add Subtask, Delete. Zoho's official docs only enumerate part of this; the rest is a reasonable user-design superset. Verified Zoho analogs:

- **Move** — confirmed: hover/right-click a task to relocate it to another task list or project (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/tasks/articles/task-list-view).
- **Clone** — confirmed: "Hover over any task, then click Clone" to duplicate it (with a customizable instance count) (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/tasks/articles/task-list-view).
- **Copy Link** — confirmed as a Zoho affordance ("Copy Link" copies the task/task-list URL to the clipboard) (source: https://help.zoho.com/portal/en/kb/projects/tasks/task-list/task-list-operations/articles/manage-tasklists).
- **Add Subtask** — Zoho creates subtasks via an "Add Subtask" action, right-click, or drag-and-drop of one task onto another (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/subtasks; spec §4.7).
- **Delete** — confirmed; only Portal Owner, Admin, Manager, and Task Owners may delete (source: spec §4.15).
- **Create Task Above / Create Task Below** — Zoho documents "Create Task List Above" and "Create Task List Below" as right-click items on TASK LISTS (not individual tasks); the per-task "above/below" insert is a user-design extension modeled on that pattern. Closest confirmed analog is the task-list-level create-above/below plus the inline "Add Task" cell for adding a row (source: https://help.zoho.com/portal/en/kb/projects/tasks/task-list/task-list-operations/articles/manage-tasklists).
- **Open Details / Open Details in New Tab** — not explicitly enumerated as named context-menu items in Zoho's KB; in Zoho you open a task's detail page by clicking the task name/ID. These two are user-design items (standard navigation behaviors) with no specific Zoho label.

Build note: Implement the full requested menu. Wire Move/Clone/Copy Link/Add Subtask/Delete to confirmed behaviors; implement Create Task Above/Below as inline row inserts at the clicked task's position (mirroring Zoho's list-level create-above/below); Open Details routes to the task detail view and Open Details in New Tab opens that route in a new browser tab. Note the column-header context menu separately offers Apply Filter, Insert Column Before, Insert Column After, and Hide Column (source: https://help.zoho.com/portal/en/kb/projects/tasks/tasks/tasks/articles/task-list-view) — relevant to D2's "user can add columns."

---

#### D7. Gantt & Kanban view design — zoom/timescale, minimize/maximize/resize, color-coding

The spec (§3.6.1, §6.3, §9.7) covers Gantt drag-and-drop rescheduling, dependency drawing, baseline, full-screen, and PDF export, and explicitly flagged Gantt zoom/scale levels as an UNRESOLVED gap. That gap is now resolved:

- **Zoom / rescale** — the Gantt has **Zoom in (+) and Zoom out (−) icons** to rescale the chart; rescaling lets you fit more Gantt bars or get a clearer view (source: https://www.zoho.com/projects/gantt-chart-software.html).
- **Maximize / minimize / fit** — you can **maximize the chart (a "Max" control)** for a full-width clear view, **fit it to the screen width**, and rescale; Full Screen is also available on the portfolio Gantt (source: https://www.zoho.com/projects/gantt-chart-software.html; source: https://help.zoho.com/portal/en/kb/projects/projects/project-intro/articles/project-gantt-view). This satisfies the user's minimize/maximize/resize requirement.
- **Timescale: day / week / month / quarter / year / custom** — the Gantt timeline can be viewed by **current week, month, quarter, or year, or a custom/specific date range** (source: https://www.zoho.com/projects/gantt-chart-software.html). (Day-level granularity is the base scale.) This satisfies "sort by daily/weekly/monthly/yearly." The Workload/resource view independently supports Days/Weeks/Months + custom range (spec §11.4).
- **Color-coding of bars (progress / status / priority / dependency)** — the Gantt uses **"clear color distinction" to identify overdue tasks, task status, completed tasks, and dependency type**; bars are color-coded for milestones, tasks, dependencies, and progress %, with overdue items shown in red (source: https://www.zoho.com/projects/gantt-chart-software.html; spec §3.6.1). Note: Zoho's bar colors are driven by status/progress/overdue, NOT by a free per-task user-chosen color picker. The user's requirement for "user-settable colors per project/task to mark progress/priority" goes BEYOND Zoho parity — Zoho's only user-settable colors are (a) **per-status colors** (each custom status has a color, set in Customization > Layouts and Fields), (b) **tag colors** (named class from a fixed palette, not free-form hex), and (c) **priority** has fixed enum values (None/Low/Medium/High) typically rendered with fixed colors (source: spec §4.4, §6.10.2; source: https://help.zoho.com/portal/en/kb/projects/settings-in-zoho-projects/customization/layouts-fields/articles/task-layout-and-fields).
- **Expand/Collapse task lists** on the Gantt — toggle between an exhaustive task view per list and just the task-list names (source: https://www.zoho.com/projects/gantt-chart-software.html).
- **Kanban color/drag** — already covered (spec §6.1.1): cards grouped by Status (default) / Task List / Priority / Percentage; drag a card to change the grouped attribute, drag a column to reorder task lists, drag a subtask to reparent. No native swimlanes (spec §6.9).

Build note: Implement Gantt with +/− zoom, a Max/full-screen toggle and fit-to-width (resizable panel), and a timescale selector (Day/Week/Month/Quarter/Year/Custom). For colors, give the user EITHER Zoho-parity (status-driven + priority-driven + overdue=red, plus per-status color config and tag palette) OR — to meet the user's stated "user-settable colors per project/task" — add an explicit per-task/per-project color picker as an above-parity feature, and document it as such. Drive bar fill by progress % and outline/badge by priority so both dimensions read at a glance.

---

#### Unfetchable / moved sources (recorded, not invented)

- https://help.zoho.com/portal/en/kb/projects/reports/gantt-charts/articles/gantt-charts — HTTP 404 (article path still moved; Gantt details sourced from the gantt-chart-software marketing page and the project-gantt-view KB instead).
- https://help.zoho.com/portal/en/kb/projects/tasks/tasks/task-operations/articles/manage-tasks — ECONNREFUSED on direct fetch (toolbar/context items recovered from the task-list-view KB article and search snippets).
- https://help.zoho.com/portal/en/community/topic/context-menu-in-zoho-projects — fetch failed (connection error); context-menu items confirmed from the task-list-view KB and manage-tasklists KB instead.
- https://zenatta.com/new-enhanced-features-functionalities-of-zoho-projects-8/ — ECONNREFUSED (not used; no claims rest on it).
- Per-task "Open Details" / "Open Details in New Tab" / "Create Task Above/Below" (on individual tasks, not task lists) are NOT enumerated in official Zoho KB — flagged as user-design items above, with the closest confirmed Zoho analogs cited.
