# Squark IP — Service-Domain Research Brief

**Purpose.** Complete, sourced research on Squark IP's full practice, so all of it can be modeled and built into the project system. This is the companion to `patent-hml-claim-charts.md` (which covers HML ranking + claim charts / EoU in depth). This document covers the other four service domains — **Prior Art & Invalidation + Novelty search**, **Freedom to Operate (FTO)**, **Reverse Engineering**, and **Risk & Strategy** — plus the **Patent Monetization** lifecycle that ties them together, and a **unified cross-service data model**.

> Research method: Squark's own service pages were fetched to capture *their* stated methodology, then each domain was deep-researched via web-enabled agents fetching authoritative primary sources (US statutes/MPEP/FRE, Supreme Court, EPO, WIPO, USPTO) and leading practitioner/KPO guides. Live-search quota was exhausted, so sourcing is via direct page fetches. Nothing is fabricated; industry practice is labeled as such and law is cited to primary sources. Full URLs are inline.

---

## 0. Squark IP — what they do (the practice map)

**Positioning:** *"Patent intelligence, re-imagined — unlock the value inside every patent."* **Industries:** Hi-Tech, MedTech, Life Sciences. **Domains:** Blockchain, Agri-Tech, Fintech, Automotive, Semiconductors. **Offices:** Gurugram, Jaipur. (Source: squarkip.com)

**Six services, and the single pipeline that connects them:**

| # | Service | One-line | Their stated stages |
|---|---|---|---|
| 1 | **Patent Monetization** | Turn a portfolio into licensing revenue | 8 stages: Intake → **Ranking/Triage** → Target ID → Deep Diligence → **Claim Charts** → Campaign → Litigation Support → Alerts |
| 2 | **Prior Art & Invalidation** | Find references that kill / weaken a claim | 5 stages: Search Strategy → Multi-DB Search → NPL Sweep → Reference Selection & element-by-element Claim Mapping → QC |
| 3 | **Claim Charts & EoU** | Prove a claim reads on a product | *(see `patent-hml-claim-charts.md`)* |
| 4 | **Freedom to Operate** | Clear a product against others' live patents | 4 steps: Define Product/Features → Landscape & Search (live only) → Mapping & Risk Rating → Opinion & Design-Around |
| 5 | **Reverse Engineering** | Produce court-ready technical evidence | Semiconductor delayering + firmware/binary + protocol/5G testbeds → implementation evidence aligned to claims |
| 6 | **Risk & Strategy** | De-risk IP for launch/funding/IPO/M&A | 4 stages: Map Portfolio & Products → Identify Risks & Gaps → Score & Prioritise → De-Risk Roadmap |

**They are one connected system, not six silos.** Every service manipulates the same core objects — **patents → claims → claim-elements/limitations**, mapped to a **right-hand target** (a product feature, a prior-art reference, or a standard clause), with **evidence** and a **ranking/risk rating**. Reverse Engineering *produces the evidence* that fills Claim Charts; the **HML ranking** feeds **Monetization**; **Prior-Art/Invalidation** de-risks the charts (Alice + prior-art "pressure test"); **FTO** and **Risk & Strategy** are the defensive/advisory mirror. That shared spine is exactly why one project system can host all six (see §6).

**The single most important shared primitive is the All-Elements Rule:** a claim is infringed / anticipated / essential only if **every** limitation is found (literally or by equivalent) in the target. It drives H/M/L ranking, invalidity mapping, FTO risk rating, design-around logic, and "no chart row ships without evidence." (Sources: Cornell LII https://www.law.cornell.edu/wex/patent_infringement ; MPEP 2131 https://www.uspto.gov/web/offices/pac/mpep/s2131.html)

---

## 1. Patent Monetization (the umbrella lifecycle)

Squark's 8-stage flow is the standard monetization pipeline; stages 2 and 5 are the HML + claim-chart core covered in the companion doc. The full lifecycle:

1. **Portfolio Intake** — ingest claims, families, classifications; align objectives.
2. **Ranking & Triage** — HML score for strength, infringement likelihood, monetization readiness → "crown-jewel"/"deal-driver" top-list. *(→ HML doc)*
3. **Target Identification** — surface high-probability licensees with preliminary EoU.
4. **Deep Diligence** — full evidence charts + **§101/Alice review** + **prior-art screening** on priority assets (this is where domains 2 & 3 feed in).
5. **Claim Charts** — production-grade charts with technical declarations. *(→ claim-charts doc)*
6. **Campaign Support** — technical assistance, meet-and-confers, depositions, hearings.
7. **Litigation Support** — claim construction, expert reports, trial prep.
8. **Monetization Alerts** — ongoing surveillance for new products reading on the portfolio.

**Carrot vs. stick** exit: licensing (proactive) vs. assertion/litigation/PTAB (adversarial). ML-augmented, multi-tier QC. (Sources: squarkip.com/patent-monetization ; PatentBrief https://patentbrief.org/patent-monetization)

**Build note:** Monetization is the *program/matter* wrapper; the other services are the *work* inside it. A monetization matter spawns prior-art screens, claim charts, RE teardowns, and (defensively) risk reviews — all sharing the same patents/claims.

---

## 2. Prior Art & Invalidation + Novelty / Patentability Search

### 2.1 Two services, one technique, different stakes
Both find prior art and map it to claim language; they differ in **direction, exhaustiveness, and stakes**:
- **Novelty / patentability** — *forward*, pre-filing: "is our invention new (§102) and non-obvious (§103) enough to earn its own patent?" Broad-but-bounded, lower cost. **A search can only prove *non*-novelty, never novelty** (you can't prove the absence of undiscovered art) — hence opinions are always hedged. (Sources: GreyB https://www.greyb.com/blog/patentability-search/ ; Sagacious https://www.sagaciousresearch.com/blog/patentability-search/)
- **Invalidity / prior-art** — *backward*, against an already-granted claim: exhaustive, litigation-grade, because IPR estoppel bars art you "reasonably could have raised" and one missed reference can lose the case.

### 2.2 Legal grounds (what the search is built to feed)
- **§102 Anticipation** — a **single** reference discloses **every** element (expressly or **inherently**). The "**knock-out**/killer reference" (clean §102) is the strongest result. (Source: MPEP 2131 https://www.uspto.gov/web/offices/pac/mpep/s2131.html ; 35 U.S.C. §102 https://www.law.cornell.edu/uscode/text/35/102)
- **§103 Obviousness** — a **combination** (primary + secondary references) obvious to a PHOSITA, run on the four **Graham v. John Deere** factors; **KSR v. Teleflex** supplies 7 combination rationales (incl. "obvious to try") and requires "articulated reasoning," while **secondary considerations** (commercial success, long-felt need, etc.) can rebut. Combination charts must supply the **motivation-to-combine** narrative. (Source: MPEP 2141 https://www.uspto.gov/web/offices/pac/mpep/s2141.html ; §103 https://www.law.cornell.edu/uscode/text/35/103)
- The claim's **priority/critical date** is the temporal cutoff — establishing it is the first analytical step.

### 2.3 Forum → search-scope (encode this as validation in the system)
| Forum | Grounds allowed | Prior-art types | Key constraint |
|---|---|---|---|
| **IPR** (PTAB) | §102, §103 only | patents + printed publications only | 1-yr service bar (§315(b)); **estoppel** (§315(e)); ~12-mo final decision; *Phillips* construction |
| **PGR** (PTAB) | §101/§102/§103/§112 | all (incl. public-use/on-sale) | file ≤9 mo post-grant |
| **EPO opposition** | novelty (Art.54), inventive step (Art.56), insufficiency (Art.83), added matter (Art.123(2)) | all | file ≤9 mo post-grant; EP-wide |
| **Ex parte reexam** | §102/§103 (must raise an **SNQ**) | patents + printed publications | ex parte, **no estoppel** |
| **District court / ITC** | full statutory set (§101/102/103/112) | all | Local-Rule Invalidity Contentions (L.R. 3-3) + claim charts |

(Sources: 35 U.S.C. §§311/315/321/303 Cornell LII; IPR https://en.wikipedia.org/wiki/Inter_partes_review ; EPO opposition https://en.wikipedia.org/wiki/Opposition_procedure_before_the_European_Patent_Office ; N.D. Cal. Patent Local Rules https://www.cand.uscourts.gov/rules/patent-local-rules/)

### 2.4 Search strategy, databases, deliverables
- **Query axes (run iteratively):** keyword+synonyms/translations, **classification (CPC/IPC/USPC)** — the language-independent backbone, **citation (forward/backward)**, **assignee/inventor**, and **semantic/AI**. Plus **NPL & standards** sweeps (academic journals, 3GPP/IEEE/IETF/ISO/ETSI) — an NPL doc can be a §102 "printed publication" if provably public before the critical date. (Sources: GreyB NPL https://www.greyb.com/blog/non-patent-literature-search/ ; CPC https://en.wikipedia.org/wiki/Cooperative_Patent_Classification)
- **Databases:** free — USPTO **Patent Public Search**, **Espacenet** (140M+ docs, Patent Translate), WIPO **PATENTSCOPE**, **Google Patents** (120M+, semantic, NPL); commercial — **Questel Orbit** (FamPat), **Minesoft PatBase**, **Clarivate Derwent (DWPI)** (curated English abstracts), **PatSnap**, **IEEE Xplore** (11,000+ standards). Work at **patent-family** granularity.
- **Deliverables:** search report + **search-string log** (proves exhaustiveness — critical for estoppel), reference list with **X/Y/A relevancy** (X=§102 knock-out, Y=§103 combination, A=background), **invalidity claim charts** (element-by-element), **SNQ statement** (reexam), and **patentability opinion** (novelty). (Sources: GreyB invalidity https://www.greyb.com/blog/patent-invalidation-search/ ; USPTO PPS https://www.uspto.gov/patents/search/patent-public-search)

**Build note:** the `forum` field must *gate* allowable `ground` and `reference.type` (IPR = 102/103 + patents/printed-pubs only). The **SearchStringLog** and **QCReview** are compliance artifacts (auditable), because estoppel and Local-Rule deadlines are unforgiving.

---

## 3. Freedom to Operate (FTO)

### 3.1 What it is (and how it differs)
FTO reads **others' live claims onto your product** to assess *prospective infringement risk* — the mirror image of novelty (your invention vs. prior-art disclosures) and invalidity (prior art vs. one patent). A patent is only a right to **exclude**, so owning your own patents does **not** clear you. FTO is **jurisdiction-bounded** (infringement is territorial — 35 U.S.C. §271(a): make/use/sell/offer/import) and **live-patents-only** (only in-force rights create liability; **expired/abandoned = "safe harbor"** = a *positive* clearance result). (Sources: Wikipedia FTO https://en.wikipedia.org/wiki/Freedom_to_operate ; Fish & Richardson https://www.fr.com/insights/ip-law-essentials/freedom-to-operate/ ; §271 https://www.law.cornell.edu/uscode/text/35/271 ; PatSnap https://www.patsnap.com/resources/blog/articles/freedom-to-operate-fto-analysis-guide-2025-2/)

### 3.2 Methodology (Squark's 4 steps)
1. **Define product & features** — detailed feature hierarchy (essential/important/optional); vague descriptions are the top cause of missed risk.
2. **Landscape & search → filter to LIVE** — search by claim/feature (keyword/CPC/citation/assignee/semantic) across make/use/sell territories (tiered: Tier-1 = US/EP/CN/JP/IN), then **verify legal status**: term = **20 yrs from filing + PTA** (§154), **maintenance/annuity** paid (US at 3.5/7.5/11.5 yrs; India annual from year 3), expiry, terminal disclaimers — via **USPTO**, **EPO Register/INPADOC**. Store status **time-stamped** (revival risk). (Sources: §154 https://www.law.cornell.edu/uscode/text/35/154 ; USPTO maintain https://www.uspto.gov/patents/maintain ; EPO Register https://www.epo.org/en/searching-for-patents/legal/register)
3. **Map & risk-rate** — element-by-element claim→feature chart (MET/ABSENT/ARGUABLE; literal + doctrine-of-equivalents); a claim "reads on" only if **all** elements MET. Risk rubric: **High** = practices all independent-claim elements of a valid patent → act before launch; **Medium** = arguable non-infringement or credible invalidity; **Low** = clear design-around. Weighted by patent strength, remaining term, owner litigiousness, damages. (Source: IP Value Labs https://ipvaluelabs.com/insights/freedom-to-operate-analysis-checklist)
4. **Opinion & design-around** — a **clearance opinion** + engineer-usable design-arounds.

### 3.3 The clearance opinion — willfulness defense + privilege (a real design constraint)
The opinion's business value is **defensive**: *Halo v. Pulse* (2016) measures culpability by the infringer's knowledge **at the time it acted**, and treble damages (§284) require "egregious"/subjectively-willful conduct — so a **contemporaneous** competent opinion rebuts willfulness. §298 says its *absence* can't be held against you (but obtaining one affirmatively helps). **Critical:** an opinion is **privileged by default**, and *relying on it in litigation triggers subject-matter waiver* (EchoStar) — so the system must record **date/version/author** and flag **opinion-counsel vs trial-counsel** and the waiver risk. (Sources: Halo https://www.law.cornell.edu/supremecourt/text/14-1513 ; §284 https://www.law.cornell.edu/uscode/text/35/284 ; §298 https://www.law.cornell.edu/uscode/text/35/298 ; WilmerHale https://www.wilmerhale.com/en/insights/publications/waiver-of-privilege-when-relying-upon-advice-of-counsel-in-defense-to-an-allegation-of-willful-infringement-june-9-2006)

### 3.4 Design-around + monitoring
**Design-around** (legitimate, encouraged): from the all-elements rule, **remove ≥1 element from *every* independent claim** (feature-mod / process-change / material-substitution / alt-approach). Menu when a high-risk patent is found: design-around / license / purchase / challenge validity / delay to expiry. **Continuous monitoring** because FTO decays (pubs at ~18 mo, grants, status changes) — patent-watch on new pubs/grants/legal-status/assignee/class. (Sources: Design-around https://en.wikipedia.org/wiki/Design_around ; Cypris https://www.cypris.ai/insights/how-to-conduct-a-freedom-to-operate-fto-analysis-complete-guide-for-r-d-teams)

**Effort tiers:** Preliminary FTO (concept) ~20–40 h; Detailed (dev) ~100–200 h; Final (pre-launch) ~40–80 h; then rolling monitoring.

---

## 4. Reverse Engineering (produces the evidence)

### 4.1 Why it exists in the workflow
RE physically/technically **locates each claim limitation inside a product the accused party doesn't document**, producing the right-hand evidence column of the EoU/claim chart. TechInsights: RE gives "technical evidence of use (EoU) by mapping patent claims to specific structures or circuits inside a chip." (Source: https://www.techinsights.com/capabilities/reverse-engineering)

### 4.2 Three domains
- **Semiconductor:** destructive pipeline — **decapsulation → delayering (chemical/plasma etch) → SEM/optical imaging → stitch/align/segment → circuit/netlist/schematic extraction → layout extraction for claim mapping**. TechInsights' 4 modes: process RE, circuit extraction, system RE, performance testing. Each claim limitation is located as a structure/interconnect in the extracted schematic; the microscopy image + schematic excerpt is that row's evidence. (Sources: RE https://en.wikipedia.org/wiki/Reverse_engineering ; TechInsights above ; Sagacious labs https://sagaciousresearch.com/reverse-engineering/)
- **Firmware / binary / software:** **OWASP FSTM** 9-stage method — obtain → extract filesystem (`binwalk`, `unsquashfs`) → static analysis (**Ghidra / IDA / Radare2**, disassembly/decompilation) → dynamic (**QEMU/Firmadyne** emulation, `gdb`, **Frida** instrumentation). Firmware acquired via UART/JTAG, bootloader dump, or update MITM. For a claimed *method*, evidence = the decompiled routine / call graph / instrumented run showing the ordered claim steps. When discovery yields it, **on-site source-code review** (Copperpod). (Sources: OWASP FSTM https://scriptingxss.gitbook.io/firmware-security-testing-methodology/ ; Copperpod https://www.copperpodip.com/source-code-review)
- **Protocol / network (ties to SEP essentiality):** **packet capture** (Wireshark/tcpdump, monitor mode); **SDR testbeds** (RTL-SDR/USRP + open cellular stacks) to force a device through procedures and capture signaling; decode **RRC** (3GPP TS 36.331/38.331) to show which standardized procedure runs. **SEP proof is two mappings:** (a) claim limitation → mandatory standard clause (paper), (b) device → implements that clause (capture). (Sources: Packet analyzer https://en.wikipedia.org/wiki/Packet_analyzer ; SDR https://en.wikipedia.org/wiki/Software-defined_radio ; RRC https://en.wikipedia.org/wiki/Radio_Resource_Control ; SEP essentiality https://greyb.com/blog/check-sep-essentiality/)

### 4.3 Legality & admissibility (must be modeled)
- **RE is generally legal when the sample is lawfully bought:** a recognized **trade-secret** route (*Kewanee Oil*); **copyright/interoperability** fair use (*Sega v. Accolade*); **semiconductor mask-work** privilege (**17 U.S.C. §906(a)**). (Sources: Trade secret https://en.wikipedia.org/wiki/Trade_secret ; §906 https://www.law.cornell.edu/uscode/text/17/906)
- **Caveats:** **DMCA §1201** anti-circumvention bites when defeating DRM/encryption (relevant to OTT/codec work) — the §1201(f) interoperability exemption doesn't squarely cover litigation-evidence RE, so circumvention needs specific legal clearance; **EULA no-RE clauses** can be enforced (*Bowers v. Baystate*). (Source: §1201 https://www.law.cornell.edu/uscode/text/17/1201)
- **Court-ready = chain-of-custody + Daubert.** Every specimen/artifact needs an unbroken **chain-of-custody** log (custodian, transfers, conditions) or it can be ruled inadmissible; the expert opinion must satisfy **FRE 702 / Daubert** (tested, peer-reviewed, known error rate, generally accepted) — so RE must use documented, repeatable, published techniques with retained raw artifacts + tool/version provenance. (Sources: Chain of custody https://en.wikipedia.org/wiki/Chain_of_custody ; FRE 702 https://www.law.cornell.edu/rules/fre/rule_702 ; Daubert https://en.wikipedia.org/wiki/Daubert_standard)

**Labs:** TechInsights (ex-Chipworks), Sagacious IP (6 RE labs), Copperpod. **Turnaround:** chip teardown ~weeks; full transistor-level extraction ~months.

---

## 5. Risk & Strategy + Patent Landscape

Squark's flow (Map → Identify → Score → De-Risk Roadmap) is the mainstream **IP audit → risk register → whitespace → remediation** cycle (WIPO frames the entry as an **IP audit**). (Source: WIPO IP audit https://www.wipo.int/en/web/business/ip-audit)

- **IP Risk Register / Exposure Matrix:** one row per exposure — *likelihood × impact = score*, plotted on a 4-quadrant heatmap, each with an **owner** + review date. Categories: patent/TM/copyright/trade-secret + ownership-chain, encumbrance, FTO, open-source, **SEP-FRAND**, operational. (Source: PatentPC https://patentpc.com/blog/how-to-build-an-ip-risk-register-for-your-organization)
- **Pre-IPO IP risk:** the S-1 requires IP risk factors (**Reg S-K Item 105**) + an IP description (**Item 101**); the audit cures chain-of-title / employee-&-contractor assignment / open-source / encumbrance defects **before** investor diligence. (Sources: Item 105 https://www.law.cornell.edu/cfr/text/17/229.105 ; Item 101 https://www.law.cornell.edu/cfr/text/17/229.101)
- **M&A IP due diligence:** 8-step buy-side/sell-side (inventory → **chain of title** → status/validity → **encumbrances/licenses/liens** → infringement/litigation → trade-secret/open-source/AI → jurisdictional coverage → **deal terms** (reps/warranties/indemnities/escrow)). Sharpest finding: the most expensive discovery is a post-close ownership gap (an unsigned contractor assignment). **FRAND commitments = encumbrances** that cap exclusionary value. (Sources: Perspire IP https://www.perspireip.com/blog/ip-due-diligence-checklist/ ; WIPO SEP https://www.wipo.int/en/web/patents/topics/sep)
- **Portfolio gap / whitespace:** plot (a) own claims, (b) product features, (c) competitor portfolios on a tech taxonomy; a cell where a product/competitor is active but your claims are absent = **coverage gap → filing**; sparse-for-everyone = **greenfield**. 7 methods (classification-gap, problem-solution matrix, co-occurrence heatmap, citation-network, competitor-gap, cross-industry, semantic clustering). (Source: PatSnap https://www.patsnap.com/resources/blog/articles/stop-overlooking-patent-white-spaces-methods/)
- **Defensive publication:** create prior art to block competitors' patents cheaply — venues: **IP.com Prior Art Database**, **Research Disclosure** (examiners must search it by PCT statute), **Technical Disclosure Commons**. Patent vs. defensive-pub vs. trade-secret tradeoff (exclusivity vs. FTO-only vs. secrecy). (Sources: Research Disclosure https://www.researchdisclosure.com/ ; TDCommons https://www.tdcommons.org/)
- **Patent landscape:** WIPO methodology — scope → search strategy → data collection/normalization (USPTO/EPO/WIPO/CNIPA/JPO) → pattern analysis/visualization (trends, geography, clustering, citation networks, competitive positioning, whitespace) → recommendations. Deliverables: dashboards, heatmaps, network diagrams, whitespace maps. (Source: WIPO patent analytics https://www.wipo.int/en/web/patent-analytics)
- **Board-ready reporting:** tie IP to revenue ("% of sales from patent-covered products", pipeline index vs peers), not filing counts. **De-Risk Roadmap** = sequenced filings/publications/clearances tied to milestones.

---

## 6. Unified cross-service data model

The six services share a spine. A single model can host all of them; the shared core is **Patent → Claim → ClaimElement**, mapped to a polymorphic **right-hand target**, with **Evidence** and a **rating**.

### 6.1 Shared core (used by every service)
- **Matter / Project** — `service_type` (MONETIZATION | INVALIDITY_SEARCH | NOVELTY_SEARCH | CLAIM_CHART/EoU | FTO | REVERSE_ENGINEERING | RISK_STRATEGY | LANDSCAPE), client, scope, jurisdictions[], status/stage, lead + reviewers, SLA/deadline, confidentiality. A **Monetization** matter is the umbrella that spawns child matters (§1).
- **Patent** — number, title, assignee, inventors, jurisdiction, filing/**priority**/grant dates, **computed expiry** (20-yr+PTA), **legal_status** (LIVE/LAPSED/EXPIRED/ABANDONED/REVIVABLE) + maintenance status per jurisdiction, **family_id**, CPC/IPC. *(reused across matters — many-to-many with Matter)*
- **Claim** → **ClaimElement** (limitation) — decomposed, ordered, labeled `[1a]…`, is_independent, is_means_plus_function. *The universal left column.*
- **Target (right-hand side, polymorphic)** — `target_type`: **AccusedProduct** (EoU/infringement/RE) | **PriorArtReference** (invalidity/novelty) | **StandardClause** (SEP) | **OwnProductFeature** (FTO/risk). Build the mapping once, reuse for all.
- **Mapping row** — ClaimElement ↔ Target, with `status` (MET/ABSENT/ARGUABLE / EXPRESS/INHERENT), `theory` (LITERAL/DOE), evidence links, confidence, reviewer. *The universal chart/analysis row.*
- **Evidence Artifact** — typed (datasheet, screenshot, teardown SEM image, netlist, decompilation, pcap, RRC trace, standard doc, source-code cite), with source, locator, **provenance (tool+version)**, and — for RE — a **chain-of-custody** link. Many-to-many with Mapping rows.
- **Rating** — polymorphic score: **HML** (monetization), **X/Y/A** (invalidity), **Critical/High/Med/Low exposure** (FTO), **H/M/L essentiality** (SEP), **likelihood×impact** (risk) — plus a free-text rationale and factor scores (detectability, breadth, validity, market, term).
- **Deliverable** — search report / claim chart / **FTO opinion** / invalidity chart / risk matrix / landscape / expert declaration; version + QC state.
- **QC Review** — reviewer, round, checklist, verdict (the mandatory second-reviewer pass everywhere).
- **Task / Person** — PM scaffolding over all of the above.

### 6.2 Service-specific extensions
- **Invalidity/Novelty:** `SearchProject.forum` (gates allowable grounds/art types), `Reference` at family granularity + `publicly_accessible_before_critical_date`, `CombinationGround` (KSR rationale + motivation), **`SearchStringLog`** (auditable, for estoppel).
- **FTO:** `Market/Jurisdiction` per product (make/use/sell set), `BlockingPatent.legal_status` (drives risk only if LIVE + territory-overlap), `DesignAround` (which element it removes per independent claim), **`Opinion`** (privilege default, opinion-vs-trial-counsel, waiver flag), `MonitoringWatch` + `WatchAlert`.
- **Reverse Engineering:** `Sample/Specimen` (lawful-acquisition proof + append-only `CustodyEvent`), `EvidenceArtifact` typed with tool/version/hash, `ExpertDeclaration` (FRE-702 defensible).
- **Risk & Strategy:** `IPRisk` (likelihood/impact/score/owner/status), `DeRiskAction` (Filing/DefensivePublication/Clearance/AssignmentCure/LienRelease/Design-around/Invalidation, tied to a milestone), `GapItem/WhitespaceItem`, `LandscapeDataset`, `IPAsset` (ownership_chain, encumbrances incl. SEP-FRAND flag).

### 6.3 Rules to enforce (from the law)
1. **All-elements everywhere:** a claim "reads on" / is "anticipated" / is "essential" only if **every** ClaimElement maps — auto-drives H/M/L, FTO risk, and design-around targets; "no chart row ships without ≥1 Evidence Artifact."
2. **FTO live-only + territorial:** a BlockingPatent contributes risk only if `legal_status = LIVE` in a jurisdiction overlapping a product Market; expired/abandoned → `safe_harbor` (positive clearance).
3. **Forum gates grounds:** IPR = §102/§103 + patents/printed-pubs only; PGR/court = full set.
4. **Evidence is compliance-grade:** SearchStringLog + QCReview + RE CustodyEvent are auditable/immutable (estoppel, Local-Rule, Daubert).
5. **Opinion privilege:** default privileged; litigation reliance surfaces a subject-matter-waiver warning.

---

## 7. Consolidated sources
**Primary law:** 35 U.S.C. §§100/101/102/103/112/154/271/282/284/298/311/315/321/303 (Cornell LII) · 17 U.S.C. §§906/1201 · 37 CFR §229.101/.105 (Reg S-K) · FRE 702 · MPEP 2131/2141/2145 · *Markman* 517 U.S. 370 · *Halo Electronics v. Pulse* · N.D. Cal. Patent Local Rules.
**Institutional:** USPTO (Patent Public Search, maintenance) · EPO (opposition, Register/INPADOC) · WIPO (PATENTSCOPE, IP audit, patent analytics, SEP/FRAND) · SEC Reg S-K · OWASP FSTM.
**Practitioner/KPO & vendors:** GreyB · Sagacious IP · Copperpod IP · Lumenci · Ingenious e-Brain · MaxVal · PatSnap · TechInsights · Cypris.ai · IP Value Labs · PowerPatent · PatentBrief · Fish & Richardson · WilmerHale · PatentPC · Perspire IP · Research Disclosure · Technical Disclosure Commons · IP.com · Ocean Tomo · Espacenet/Google Patents/Derwent/IEEE Xplore · Wikipedia (RE, FTO, patent infringement, SEP, RRC, packet analyzer, SDR, chain of custody, Daubert, design-around, term of patent) · **squarkip.com** (own methodology).

*(Full per-claim URLs are inline in each section.)*

---

### Caveats
- Exact **numeric thresholds** (H/M/L cutoffs, risk-score bands, essentiality scores) are proprietary per firm — Squark defines its own.
- Some vendor/firm methodology pages are gated; public pages were used and labeled as practitioner sources.
- **India-specific** term/annuity/fee specifics reflect the Patents Act 1970 (s.53 / Rule 80) as summarized by Indian IP sources — confirm current fee amounts against ipindia.gov.in before hard-coding.
- This is a **research brief, not a spec** — validate the data model and each service's exact stage/deliverable definitions against Squark's real templates before building.
