# Patent HML Ranking & Claim Charts — Research & System-Design Brief

**Purpose.** Establish the complete, sourced context for the two workflows the firm wants to build into the dashboard: (1) the **HML** patent-ranking system and (2) the **Claim Chart (CC)** system (client-provided *and* firm-created). This is research only — it maps how the work is actually done in the IP industry (with citations) and proposes a data model for a later build. Nothing here is fabricated; industry/practitioner jargon is flagged as such and statutory terms are cited to primary sources (35 U.S.C., 37 CFR, USPTO/MPEP, the Supreme Court, Cornell LII, N.D. Cal. Patent Local Rules).

> Research method: compiled from four parallel web-research passes. The session's live-search quota was exhausted, so sourcing was gathered by fetching authoritative pages directly. Source URLs are listed per section and consolidated at the end.

---

## 1. The big picture — where HML and Claim Charts fit

This is the **patent assertion / licensing / infringement-analysis** domain (a.k.a. patent monetization). The canonical pipeline, consistent across firms, runs:

```
Portfolio  →  Mining & Ranking (HML)  →  Subject-patent claim construction  →
Multi-level target screening  →  Element-by-element EoU/Claim Chart  →
Report / Opinion  →  License (carrot)  or  Litigate / PTAB (stick)
```

The firm receives, from a client, **(a) a set of features** (of a product or a technical standard) and **(b) a set of patents**. The job is to determine how well each patent **"reads on"** those features, **rank** each H/M/L, and then **prove** the strong ones element-by-element in **claim charts**. HML is the *ranking/triage* layer; the claim chart is the *proof* artifact.

Your own firm (Squark IP) publicly describes a 4-stage version of the charting process — **Scope & Claim Selection → Evidence Gathering → Element Mapping → QC & Delivery**, with §101/*Alice* + prior-art "pressure-test" screening and standards-essentiality mapping. The system below is designed to mirror that.

Sources: Ocean Tomo (patent mining) https://oceantomo.com/services/portfolio-development-strategy/patent-mining-claims-analysis/ · PatentBrief (monetization, carrot/stick) https://patentbrief.org/patent-monetization · Squark IP https://squarkip.com/claim-charts

---

## 2. Foundational rule: the All-Elements Rule (why H/M/L works the way it does)

> **All-Elements (All-Limitations) Rule:** a claim is infringed only if the accused product contains **every** element/limitation of that claim (literally or by equivalent). If even **one** element is absent, there is **no** infringement.

This single rule is the logic behind H/M/L. It is why a "partial" match is a *Medium/needs-work* result rather than a near-High — under the law, a missing element defeats infringement outright.

Sources: Cornell LII (patent infringement / all-elements) https://www.law.cornell.edu/wex/patent_infringement · PatentBrief (claim mapping) https://patentbrief.org/claim-mapping

---

## 3. The HML system

### 3.1 What HML ranks
Each **patent** (really each **independent claim**) is scored for how completely it **reads on** the client's **feature set** (or a standard). Ranking is done by subject-matter experts doing **claim-based analysis** and produces a prioritized "top-list" of "deal-driver" patents.

### 3.2 H / M / L — the mapping-completeness axis (your definition)
Grounded directly in the All-Elements Rule and the per-element **present / partly-present / absent** determination:

| Rank | Meaning | Rule basis |
|------|---------|------------|
| **H (High)** | **Every** limitation of the (independent) claim maps to a supplied feature — the claim reads on the feature set (literally or via equivalents). Fully chartable. | all elements present |
| **M (Medium)** | **Some** limitations map, but ≥1 is only *partly present* or arguable. Under strict law this "defeats infringement," which is exactly why it's *needs-more-work* rather than High. | ≥1 element partial |
| **L (Low)** | A **key/independent-claim** limitation is **absent** — nothing meaningful reads on. Drop. | ≥1 element absent |

Sources: Intepat (claim mapping) https://www.intepat.com/blog/understanding-claim-mapping-in-patents · PatentBrief https://patentbrief.org/claim-mapping · PATHtoIP (Low/Medium/High likelihood per product) https://www.pathtoip.com/claim-chart-analysis/ · PioneerIP (H/M/L relevance) https://www.pioneerip.com/news/claim-charts-keep-getting-better

### 3.3 The second axis — value / strength (which "H" patents are worth asserting)
A patent can read on a product yet still be a poor asset. Firms score a second axis on the matched patents:

- **Detectability** — *the single most-cited driver.* Can infringement be proven from public info, or does it need physical testing / reverse engineering / source code? Spectrum: competitor advertises it → visible on inspection → requires reverse engineering → undetectable (a claim you can't detect "is worthless" for enforcement). This is why some claims are "chartable" (observable/front-end) and others are not (hidden server-side logic).
- **Claim breadth / robustness** and **design-around difficulty**.
- **Market relevance / commercial impact** (Wide / Moderate / Niche).
- **Legal robustness** — validity/invalidation risk, remaining life, family breadth, prosecution history.

Common vendor label sets (all the same idea): H/M/L · A/B/C · Red/Amber/Green · Platinum/Gold/Silver · Tier-1/2/3 · Wide/Moderate/Niche.

Sources: LogicApt (detectability, Tier-I/II) https://logicapt.com/services/patent-ranking/ · BlueIron (detectability = value) https://blueironip.com/detectability-key-factor-patent-value/ · Lumenci (strength/detectability/market) https://business.lumenci.com/success-story/ip-monetization-through-portfolio-valuation · Ingenious e-Brain (objective+subjective, Platinum/Gold/Silver) https://iebrain.com/service/patent-services/patent-licensing-monetization/patent-ranking/ · GreyB (technical/legal/economic) https://xray.greyb.com/intellectual-property/patent-scoring-and-rating

### 3.4 The multi-level screening funnel — *this is your "1st Level pass → 2nd Level pass"*
Every serious shop runs a cheap coarse screen across many patents, then an expensive deep pass on survivors:

- **Level 1 — fast HML relevance screen** (~15–30 min/patent; whole set). A "concentric"/light screen that buckets each patent (and/or product) H/M/L. **Deliberately biased toward false positives** — its job is to *narrow*, not to prove. You don't know how many charts you'll need until Level-1 is done.
- **Level 2 — detailed pass to a Final List.** Promote H (and selected M) hits to full limitation-by-limitation analysis; this yields the shortlist that gets charted.

Documented funnel magnitudes (for calibration): Lumenci 100,000+ patents → 3,200+ charts → 1,200+ products; PioneerIP 50,000+ searched → 304+ charts → 4,018 potential infringers; EU 5G SEP study: full charting of 45,000 declared patents is economically impossible, so firms **sample ~10% (min 100, max 1,000)**. The EU study formalizes the two passes as **"Light Assessment (~30 min, screening only, false-positive-biased)"** vs **"Rigorous Levels D–G (4–8 hrs/patent, defensible charting)."**

Sources: PATHtoIP https://www.pathtoip.com/claim-chart-analysis/ · PioneerIP https://www.pioneerip.com/news/claim-charts-keep-getting-better · Lumenci https://lumenci.com/services/claim-charts/ · IPWatchdog (EU SEP study, screen-rigor levels, over-declaration) https://ipwatchdog.com/2024/01/23/navigating-sep-determination-challenges-quality-claim-charts/ · Papersflow (cheap-screen-first) https://papersflow.ai/blog/patent-workflow-from-search-to-claims

### 3.5 Your HML task list → industry stage
| Your task | What it is in practice |
|---|---|
| **1. 1st Level pass** | Level-1 fast HML relevance screen across the full patent set; bucket each H/M/L against the feature set. |
| **2. 2nd Level pass — Final list** | Level-2 detailed narrowing of the H/M hits to the shortlist that will be charted. |
| **3. Patent Analysis – Detailed for defendants** | Per-defendant target analysis: map the strong patents to specific companies/products (architecture + revenue/SKU matching), build the patent × target matrix and the detailed EoU charts. |
| **4. Report** | Package the ranked list + charts into the infringement/EoU report/opinion delivered to the client. |

---

## 4. Claim Charts

### 4.1 What a claim chart is
A structured (usually tabular) device that takes a patent **claim**, splits it into its **limitations**, and maps each limitation — row by row — against something outside the patent: an **accused product** (infringement/EoU), a **prior-art reference** (invalidity), or a **standard section** (SEP essentiality). It's the standard way to demonstrate element-by-element correspondence under the All-Elements Rule. In litigation it's defined by rule as "a chart identifying specifically where and how **each limitation** of each asserted claim is found within each Accused Instrumentality" (N.D. Cal. Patent L.R. 3-1(c)).

Sources: Wikipedia (Claim chart) https://en.wikipedia.org/wiki/Claim_chart · N.D. Cal. Patent Local Rules https://www.cand.uscourts.gov/rules/patent-local-rules/ · Ocean Tomo (art of the claim chart) https://oceantomo.com/insights/the-art-of-the-claim-chart/

### 4.2 Structure
**Two-column core** (landscape):
- **Left** = the claim text **parsed into successive limitations**, one per row, each labeled `[1a]`, `[1b]`, `[1c.1]`… (parse at semicolons; gerunds = method steps; "wherein" = sub-limitations).
- **Right** = the corresponding evidence, **with a pinpoint citation**.

A **three-column** variant adds a claim-construction / mapping-argument column. Best-practice guidance says each right-column cell has three parts:
1. **Assertion** — "the accused product embodies this limitation…" (invalidity: "the reference discloses…").
2. **Fact** — *where*, in the **product's own nomenclature**: part numbers, component names, source-code file+line, col:line cites, manual sections.
3. **Explanation** — "**because** …", tying fact to the claim requirement. (Mere juxtaposition of claim text and a quote is deficient.)

Sources: Wikipedia https://en.wikipedia.org/wiki/Claim_chart · Software Litigation Consulting / Schulman (Part III, structure) https://www.softwarelitigationconsulting.com/claim-charts-book/claim-charts-book-part-iii/ · GHB Intellect (3-column, graphical) https://ghbintellect.com/claim-chart/

### 4.3 Types (same structure, different right-hand target)
| Type | Right-hand side | Prepared by | Used for |
|---|---|---|---|
| **Infringement chart** | accused product feature | patent owner / plaintiff | proving infringement (all-elements) |
| **Evidence-of-Use (EoU) chart** | accused product feature (public evidence) | patent owner / KPO | licensing & pre-suit monetization (the firm's core artifact) |
| **Invalidity chart** | prior-art reference(s) | accused infringer / defendant | §102 anticipation (1 ref) / §103 obviousness (multi + motivation) / §101 / §112 defense, IPR/PTAB |
| **Preliminary Infringement Contentions (PIC)** | accused instrumentality | plaintiff | court-filed early disclosure (public info + reverse engineering, pre-discovery) |
| **SEP essentiality chart** | technical-standard clause | SEP holder | proving standard-essentiality |
| **Claim-construction chart** | disputed-term meanings | litigation | Markman hearing |

EoU charts come in **tiers of depth**: **two-pager** (screening) → **licensing-grade** (one independent claim mapped) → **litigation/Rule-11/PIC-grade** (independent **+** dependent claims, court-ready).

Sources: Wikipedia https://en.wikipedia.org/wiki/Claim_chart · Patlytics (EoU) https://www.patlytics.ai/blog/evidence-of-use-chart · Lumenci (tiers) https://lumenci.com/services/claim-charts/ · Solve Intelligence (invalidity) https://www.solveintelligence.com/blog/post/ai-invalidity-chart-guide · Sagacious (two-pager) https://sagaciousresearch.com/evidence-of-use-eou-claim-chart

### 4.4 Evidence that goes into the mapping
**Public / pre-discovery (EoU & PICs):** datasheets, spec sheets, user/developer manuals, SDK/API docs, marketing pages, white papers, demo videos, screenshots, product photos; **teardown / reverse-engineering reports, die shots**; firmware traces, config files, logs, architecture diagrams; **regulatory/financial filings (SEC 8-K/10-K)**; **standards documents** (3GPP/IEEE) for SEPs.
**Discovery-grade (ICs & expert reports):** **source code** with pinpoint file+line cites; deposition testimony; internal schematics/engineering docs.
Quality note: marketing alone is disfavored; a screenshot "may show a feature exists but not *how* it works" — internal operation must be corroborated, not inferred ("inventor's fallacy").

Sources: Schulman outline https://www.softwarelitigationconsulting.com/claim-charts-book/claim-charts-book-outline/ · IIPRD https://www.iiprd.com/claim-chart/ · Powerpatent (evidence, "how it works") https://powerpatent.com/blog/using-claim-charts-for-licensing-and-patent-monetization

### 4.5 Quality bars & common pitfalls (design the system to prevent these)
- **All elements or nothing** — omit a limitation and there's no infringement; "no orphaned elements."
- **One limitation per row; pinpoint citations** — reject "see generally, manual" and broad page ranges.
- **Explain "why," not just "where."**
- Pitfalls that get charts struck: conclusory/boilerplate cells; "Frankencharts" (mixing evidence from incompatible products/modes); element-skipping; over-broad mapping; unverified/assumption-based rows (Rule 11 exposure — *S. Bravo*, *Judin*).
- A **mandatory second-reviewer QA pass** and per-element **confidence status** (direct / partial / background / missing) are standard controls.

Sources: GreyB (15 mistakes) https://greyb.com/blog/15-claim-chart-mistake-problems-patent-litigation/ · Perspire IP (second-reviewer, orphaned elements) https://www.perspireip.com/blog/patent-claim-chart-services/ · Powerpatent (AI workflow, confidence levels) https://powerpatent.com/blog/ai-claim-charting-workflow-from-patent-claims-to-litigation-ready-evidence · The Plus IP Firm (Rule 11 case law) https://plusfirm.com/what-is-a-reasonable-investigation-under-rule-11-for-a-patent-infringement-lawsuit/

---

## 5. Client-provided (CC From Client) vs. firm-created (CC New)

These are **two distinct, recognized engagement models** — a real modeling fork, not a cosmetic flag.

### 5.1 Model A — verify-and-strengthen a client's chart/theory  →  *your "CC (From Client)"*
The client (patent owner or their counsel) hands over a preliminary **theory** or a starter chart (often a PDF/Word file, sometimes a prior litigation chart). The firm **scores it, finds the gaps, and closes them** — sold industry-wide as "EoU Assessment: evaluate existing claim charts with scoring, gap analysis, and enhancement." Vendors describe it as "ongoing support for refining and supplementing the claim chart until success" and "collaborates with you to identify supporting evidence, conduct additional iterations."

| Your CC-From-Client task | What it is |
|---|---|
| **1. Theory Verify** | Independently prove each row is grounded in checkable public evidence — does the feature actually exist and operate as claimed (not inferred from a marketing bullet)? Are all limitations covered, incl. dependent ones the client skipped? Do evidence dates/versions fall in the infringement period? |
| **2. Client Q&A** | The iterative refinement loop with the client — clarify claim scope, resolve ambiguous mappings, align on target selection. |
| **3. Additional Research on defendants** | Deepen the evidence on the accused companies/products to strengthen the client's theory (teardown, source, more documents). |

Sources: Lumenci (EoU assessment/scoring/gap analysis) https://lumenci.com/services/claim-charts/ · Copperpod (refine & supplement) https://www.copperpodip.com/evidence-of-use · MaxVal (collaborate/iterate) https://www.maxval.com/patent-infringement-evidence-of-use-search-and-analysis/

### 5.2 Model B — build a NEW chart from scratch  →  *your "CC (New)"*
The firm gets only the patent (or list) and constructs the theory and chart end-to-end.

| Your CC-New task | What it is |
|---|---|
| **1. Understanding Claim** | **Claim construction** — construe each term (*Phillips*: intrinsic-first — claims → specification → prosecution history), parse the claim into preamble + transitional phrase + limitations, start from the **broadest independent claim**. |
| **2. Research on Defendants** | Identify accused products across targets and gather **evidence of use** (manuals, teardown, source, screenshots, standards). |
| **3. Finalising Chart** | Map every limitation element-by-element to a feature with a pinpoint citation; mark literal vs **doctrine-of-equivalents**; validate (no skipped limitations, real cites); second-reviewer QA; set maturity status. |

Sources: PatentBrief (claim charting, construction) https://patentbrief.org/claim-charting · Sagacious (method) https://sagaciousresearch.com/blog/how-to-perform-claim-mapping-prepare-eou-charts · IIP Search (EoU steps) https://iipsearch.medium.com/how-to-create-an-evidence-of-use-eou-chart-for-patents-3516fd5d4ea2

### 5.3 As data
Keep **one Claim Chart** entity with an `origin` enum (`client_provided` | `firm_created`) + provenance (source file, originating party, imported date). Firm-created charts own structured **Rows + Evidence** with full lineage and QA history; client-provided charts may exist as an attached document plus a *lighter/optional* row structure and always carry a linked **verification** task. Same pattern via `chart_type` cleanly separates infringement/EoU vs invalidity vs SEP (identical structure, different right-hand target).

---

## 6. End-to-end workflow (the project spine)

1. **Portfolio review + mining/ranking** → ranked "top-list" of deal-driver patents (HML).
2. **Subject-patent analysis / claim construction** ("Understanding the Claim").
3. **Target identification + multi-level relevance screening** (1st pass → 2nd pass → Final List).
4. **Detailed EoU / claim charting** per surviving patent × target ("Detailed for defendants").
5. **Report / opinion** (packaged deliverable).
6. **Assertion / licensing / litigation** (carrot → license; stick → suit/PTAB).

Engagements are run as **stage-gated projects** with named stages, tiered screening, explicit **review gates**, per-element **confidence statuses**, a mandatory **second-reviewer QA pass**, and a chart **maturity status** (preliminary "two-pager" → licensing-grade → litigation-ready). Typical turnaround: an EoU search ~8 business days; a chart from a few days (single simple claim) to weeks (standards/software claim needing code analysis).

Sources: Lumenci (7 stages) https://lumenci.com/services/claim-charts/ · Ingenious e-Brain (5 stages) https://iebrain.com/service/patent-services/patent-licensing-monetization/evidence-of-use-eou-chart-prepartion/ · Arctic Invent (5 stages) https://www.arcticinvent.com/services/infringement-search-eou-claim-charting/ · Origiin (5 steps, ~8 days) https://origiin.com/5-steps-to-evidence-of-use-search-eou-search/ · Squark IP https://squarkip.com/claim-charts

---

## 7. Deliverables catalog (adjacent products the firm produces)
EoU/infringement claim chart · two-pager EoU · licensing-grade chart · litigation/Rule-11/PIC chart · **invalidity claim chart** · **SEP essentiality chart** · claim-construction chart · **FTO (freedom-to-operate) opinion** · **patentability/novelty search report** · ranked patent "top-list"/"deal-drivers" · infringement/EoU report & written opinion.

---

## 8. Standard-Essential Patents (SEP) — if a "feature set" is actually a standard
If the client's "features" are a technical standard (3GPP/5G/Wi-Fi/codec), the analysis shifts from *infringement* to **essentiality**: infringement asks whether a *product* uses the invention; essentiality asks whether the *standard itself requires* it (**technical-necessity test** — read the standard "like an engineer"; mandatory "shall/must" = essential, optional = not). SEP charts are 3-column (claim's "essential integers" → standard clause → correspondence). PatentCloud's documented H/M/L essentiality rubric (closest public analog) ranks from two indicators — **TS Relevancy** (independent claims ↔ declared technical specs) and **Claim Scope Support** — and a patent is **High only when both are High**; crucially **Low ≠ non-essential** ("further examination required"). Over-declaration is why ranking matters: only ~20–30% of declared SEPs (and maybe 10–15% for 5G) are actually essential.

Sources: PowerPatent (necessity test) https://powerpatent.com/blog/claim-charts-for-seps-step-by-step-essentiality-mapping · PatentCloud/Inquartik (H/M/L essentiality) https://www.inquartik.com/blog/patentcloud-infographic-essentiality-rankings-claim-chart-mapping/ · Wikipedia (SEP/FRAND) https://en.wikipedia.org/wiki/Standard-essential_patent · IPWatchdog https://ipwatchdog.com/2024/01/23/navigating-sep-determination-challenges-quality-claim-charts/

---

## 9. Terminology glossary (primary-sourced)

- **Patent claim** — the numbered sentence(s) defining the invention's legal boundary; must "particularly point out and distinctly claim" the invention (35 U.S.C. §112(b)). https://www.law.cornell.edu/uscode/text/35/112 · https://www.uspto.gov/learning-and-resources/glossary
- **Independent claim** — stands alone, broadest. **Dependent claim** — refers back to and "specif[ies] a further limitation," incorporating all limitations of the parent (§112(c)–(d)). https://www.law.cornell.edu/uscode/text/35/112
- **Claim element / limitation** — the discrete requirements within a claim; the unit mapped one-by-one in a chart ("each limitation…", N.D. Cal. L.R. 3-1(c)). https://www.cand.uscourts.gov/rules/patent-local-rules/
- **Claim construction (Markman)** — the court's interpretation of claim terms; "exclusively within the province of the court" (*Markman v. Westview*, 517 U.S. 370). At the USPTO: "broadest reasonable interpretation consistent with the specification" (MPEP §2111). https://www.law.cornell.edu/supremecourt/text/517/370 · https://www.uspto.gov/web/offices/pac/mpep/s2111.html
- **"Reads on"** — a claim covers a product/reference when every limitation is present in it (all-elements rule). *(practitioner term)* https://www.law.cornell.edu/wex/patent_infringement
- **Evidence of Use (EoU)** — facts showing a product actually practices the claims; the pre-litigation, publicly-sourced form of an infringement chart. *(industry term)* https://www.iiprd.com/growing-importance-of-mapping-patents-through-evidence-of-use-and-claim-charts/
- **Accused product / instrumentality** — the thing alleged to infringe; "Accused Instrumentality" is broader (apparatus/product/**process/method/act**) (N.D. Cal. L.R. 3-1(b)). https://www.law.cornell.edu/wex/patent_infringement
- **Defendant / target** — *target* = pre-suit candidate for licensing/assertion; becomes *defendant* once litigation is filed (status, not two entities). https://www.law.cornell.edu/wex/defendant
- **Preliminary infringement contentions** — the patentee's mandatory early chart-disclosure in litigation (N.D. Cal. L.R. 3-1). https://www.cand.uscourts.gov/rules/patent-local-rules/
- **Prior art** — everything public before the effective filing date (35 U.S.C. §102). https://www.law.cornell.edu/uscode/text/35/102
- **Anticipation (§102)** — one reference discloses every element (lack of novelty). **Obviousness (§103)** — combination would have been obvious to a PHOSITA. https://www.law.cornell.edu/uscode/text/35/103
- **Invalidity** — a granted patent/claim fails patentability; presumed valid, burden on the challenger (35 U.S.C. §282). https://www.law.cornell.edu/uscode/text/35/282
- **Freedom-to-operate (FTO)** — prospective clearance analysis of whether making/using/selling would infringe others' in-force patents. https://en.wikipedia.org/wiki/Freedom_to_operate
- **Novelty / patentability search** — pre-filing prior-art search; can only show *non-novelty*, never prove novelty. https://en.wikipedia.org/wiki/Novelty_(patent)
- **Patent prosecution** — obtaining a patent and defending its validity before the PTO. https://www.law.cornell.edu/wex/patent_prosecution
- **Patent family** — patents/applications for one invention across jurisdictions; "defined by databases, not law" (DOCDB simple vs INPADOC extended). https://en.wikipedia.org/wiki/Patent_family
- **Priority date / effective filing date** — the date novelty is judged from; Paris Convention priority period = 12 months (35 U.S.C. §100(i)). https://en.wikipedia.org/wiki/Priority_right
- **SEP / FRAND** — a patent that must be used to comply with a standard; licensed on fair, reasonable, non-discriminatory terms. https://en.wikipedia.org/wiki/Standard-essential_patent
- **Detectability** — how provable infringement is from a product; a top driver of enforcement value. *(industry term)* https://blueironip.com/detectability-key-factor-patent-value/
- **Portfolio mining** — systematically triaging a portfolio to find licensable/assertable assets and who practices them. *(industry term)* https://generalpatent.com/consulting/ip-portfolio-mining.html

---

## 10. Proposed data model (for the eventual pdash build)

Reasoning from the pipeline in §6. Entities and key relationships:

| Entity | Key attributes | Relationships |
|---|---|---|
| **Project / Matter** | client, matter type (EoU-charting / invalidity / FTO / mining / SEP), scope, budget, dates, status, confidentiality, lead+team | Client 1─* Project; Project *─* Patent; Project 1─* Target, Deliverable, Task |
| **Client / Org** | name, industry, contact, engagement history | 1─* Project |
| **Patent** | number, title, assignee, inventors, jurisdiction, filing/**priority**/grant dates, expiry, legal status, **family id**, CPC/IPC, claim count, remaining life | 1─* Claim; *─* Project (reusable across engagements) |
| **Patent Family** | family id, priority date(s), members | 1─* Patent |
| **Claim** | number, type (**independent/dependent**), `depends_on`, text, `is_asserted` | Patent 1─* Claim; dependent → parent Claim(s) |
| **Claim Element / Limitation** | ordered label (`1a`,`1b`…), text, `is_preamble`, construction note | Claim 1─* Element (ordered) — the chart's *left column* |
| **Feature (client-provided)** | name, description, domain, source (client vs analyst) | *─* Claim/Patent; *─* Accused Product — the client's pivot |
| **Target / Defendant** | name, industry, revenue/size, `stage` enum (`target`→`defendant`) | 1─* Accused Product |
| **Accused Product / Instrumentality** | name, model/version, vendor, market, `type` (product/method/service) | Target 1─* Product; Product carries Features — the chart's *right column* |
| **Claim Chart** | `chart_type` (EoU/infringement · invalidity · SEP-essentiality), `origin` (**client_provided/firm_created**), provenance (source file, originating org, imported date), workflow state (draft→review→revision→final), **maturity** (two-pager→licensing→litigation), author, reviewers, jurisdiction, mapping basis (literal/DOE), priority-date asserted, version | Project 1─* Chart; Chart → 1 Claim(+Patent); Chart → 1 right-hand subject (Product **or** Prior-Art Ref **or** Standard section — polymorphic); Chart 1─* Chart Row |
| **Chart Row** | `claim_element_id`, mapped/quoted product text, analyst explanation, `mapping_type` (literal/DOE), **confidence** (direct/partial/background/missing) | Chart 1─* Row; Row → 1 Element; Row *─* Evidence |
| **Evidence / Citation** | source type (datasheet/manual/webpage/screenshot/teardown/standard/source-code/filing), URL/citation, quoted snippet, image blob, locator (page/§/line), date accessed, public-availability flag | *─* Chart Row (one item can back many rows; one row cites many) |
| **HML Ranking / Assessment** | `patent_id`, subject (`target_id` or feature-set), **rating H/M/L**, `rationale`, structured factor scores (**detectability**, EoU strength, claim breadth, validity risk, remaining life, target revenue), assessor, date | keyed to (Patent, Target/Feature-set); references supporting Chart(s). *Rating + factor scores must be first-class queryable fields, not prose.* |
| **Review / QA pass** | reviewer, round, verdict (pass/rework/fail), checklist (all elements mapped? cites public+dated? construction applied?), comments, timestamp | Chart 1─* Review (multi-round) — drives workflow state |
| **Deliverable / Report** | title, version, format (chart set / ranked list / memo), included Charts+Rankings, recipient, delivery date, status | Project 1─* Deliverable; bundles Charts+Rankings |
| **Task / Person** | assignee, due date, state; roles (analyst/reviewer/lead/PM) | Tasks attach to Project and to a work object (a Chart, a Patent) |

**Design notes:**
1. **Two HML axes** — model both *mapping-completeness* (H/M/L from element roll-up) and *value/strength* (detectability etc.) as separate scored dimensions on the Ranking; the final H/M/L a client sees is usually the completeness rank, gated by the value axis for "which H's to assert first."
2. **The chart's left column is claim structure** (Claim → ordered Elements); **the right column is polymorphic** (product / prior-art / standard) driven by `chart_type`. Build once, reuse for all three chart kinds.
3. **`origin` is a first-class fork** (§5.3): firm-created = structured Rows+Evidence+QA; client-provided = imported doc + verification task + optional rows.
4. **Statuses to visualize on the PM board:** per-Chart maturity (two-pager→litigation-ready) and workflow state (draft→review→final); per-Row confidence (direct/partial/background/missing); per-Ranking H/M/L; the funnel counts (screened → charted → targets).
5. **Reusability:** Patents and Claims should be reusable across Projects (many-to-many) — the same patent gets re-charted against different targets in different engagements.

---

## 11. Consolidated sources
Primary/legal: 35 U.S.C. §§100/102/103/112/282 (Cornell LII) · 37 CFR §1.75 · MPEP §2111 · *Markman v. Westview* 517 U.S. 370 · USPTO glossary · N.D. Cal. Patent Local Rules · Cornell LII Wex (patent infringement, anticipation, defendant, prior art, prosecution).
Practitioner/industry: Wikipedia (Claim chart, SEP, Patent family, FTO, Novelty, Priority right) · Software Litigation Consulting / Schulman (Parts I & III, outline) · Ocean Tomo · GHB Intellect · UpCounsel · IIPRD · Patlytics · XLSCOUT · Lumenci · Sagacious IP · Copperpod IP · Ingenious e-Brain · MaxVal · Origiin · PatentBrief · Intepat · PATHtoIP · PioneerIP · Effectual Services · LogicApt · Terrifio · PowerPatent · PatentCloud/Inquartik · IPWatchdog · GreyB · Perspire IP · Papersflow · BlueIron IP · General Patent Corp. · Squark IP (own methodology).

*(Full per-claim URLs are inline in each section above.)*

---

### Caveats / what a follow-up pass should add
- Exact **numeric H/M/L score thresholds** are proprietary to each firm and were not public in any source — the firm defines its own cutoffs.
- A future session with live web-search budget should pull **Federal Circuit case law** on the all-elements rule / doctrine of equivalents directly, and verify specific vendor tools (PatSnap, Questel, GreyB, TechInsights teardown) before the system relies on any of them.
- This is a **research brief, not a spec** — the data model is a starting point to validate against the firm's actual HML rubric and chart templates before building.
