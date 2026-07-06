# Design Document — Theme 1: Financial Dashboard

---

## Layout & Structure

- **Overall canvas**: White rounded-rectangle card set on a light neutral gray outer background (~#F0F0F0). The dashboard occupies roughly 90% of the viewport width with generous outer padding.
- **Top header bar**: Full-width horizontal strip. Left side holds a hamburger/collapse icon, a circular black logo badge ("Nº"), and the brand text "Financial Dashboard" stacked in two lines. Right side holds a circular "+" action button, a user avatar with name ("Dwayne Tatum / CEO Assistant"), and a pill-shaped search field ("Start searching here…").
- **Welcome banner row**: Below the header, a wide horizontal band split into two halves. Left half shows a date widget (large day number "19", weekday+month "Tue, December") and an orange-red CTA pill button ("Show my Tasks →") and a small calendar icon. Right half shows a large assistant greeting ("Hey, Need help? 👋 / Just ask me anything!") with a microphone icon button on the far right.
- **Main card grid**: Three-column layout (roughly 30% / 40% / 30%) beneath the banner. Cards are uniformly rounded rectangles with subtle shadow.
  - Column 1: VISA card widget (top), Annual Profits bubble chart (bottom).
  - Column 2: Total Income / Total Paid stat cards stacked vertically (top), Activity Manager card (bottom-left), Business Plans candlestick widget (bottom-middle), Wallet Verification CTA (bottom-right).
  - Column 3: System Lock icon tile + 13 Days timer card + mini bar chart (top row), Main Stocks line chart card (middle), Review Rating card (bottom).
- **Spacing**: Cards have consistent internal padding (~20–24px equivalent), gap between cards is uniform (~16px).
- **No traditional sidebar**: Navigation is entirely header-based.

---

## Typography

- **Brand name** ("Financial Dashboard"): Bold / ~18px, black.
- **Section headings** ("Annual profits", "Activity manager", "Main Stocks"): Medium weight, ~13–14px, dark gray/black.
- **Large KPI numbers** ("$23,194.80", "$8,145.20", "$16,073.49", "13 Days"): Bold, ~22–26px, black.
- **Sub-labels** ("Total income", "Total paid", "Main Stocks Extended & Limited"): Regular, ~11–12px, medium gray.
- **Card sub-values** ("109 hours, 23 minutes", "+9.3%", "+ $25.00"): Regular, ~11–13px; percentage in coral accent.
- **Welcome greeting** ("Hey, Need help?"): Bold, ~32–36px, black. Second line uses a blinking cursor ("|") suggesting a live typing effect.
- **Date display** ("19"): Extra-bold / ~48px, black. "Tue, December" regular ~13px, gray.
- **VISA label**: Bold italic, ~14px, black (card brand logotype style).
- **Masked card number** ("**** 2719"): Bold monospace-style, ~18px.
- **Button labels** ("Receive", "Send", "Show my Tasks", "Enable"): Medium/semibold, ~13–14px.
- **Axis/legend labels** ("$14K", "$9.3K", "2022", "2023", "Team", "Insights"): Regular, ~11px.
- Text alignment: mostly left-aligned within cards; centered for the greeting and donut chart center label.

---

## Color

- **Canvas/outer background**: Light neutral gray (~#EBEBEB).
- **Card backgrounds**: Pure white (#FFFFFF).
- **Primary accent**: Coral / orange-red (~#E8533A or #E05A3A) — used on CTA buttons, active chart bars, donut arc, progress dots, percentage labels, and icon badges.
- **Secondary accent**: Black (#000000 or near-black) — used for the logo badge, "Receive" button fill, headings, large numbers.
- **Text primary**: Near-black (~#1A1A1A) for all primary content.
- **Text secondary**: Medium gray (~#888888–#AAAAAA) for labels, sub-values, helper text.
- **Bubble chart fill**: Concentric circles in varying coral opacity — outermost is very light salmon (~#F5C5BB), innermost is full coral (~#E8533A).
- **Line chart stroke**: Coral with a light coral fill beneath the curve.
- **Badge/tag backgrounds** ("Team", "Insights", "Today"): Light gray pills with small colored dot indicators (coral dot on "Team").
- **Growth rate donut**: Black outer ring, coral filled arc for 36%.
- **Status positive** ("+9.3%", "+15.8%"): Coral/orange-red with small upward-trend icon.
- **No dark mode** — this is a fully light theme.

---

## Components

### Charts
- **Concentric bubble/ring chart** (Annual Profits): Four overlapping circles in graduated coral shades. Labels "$14K", "$9.3K", "$6.8K", "$4K" float inside each ring. No axis.
- **Donut chart** (Growth rate): Bold black ring, 36% filled in coral, center label "36% Growth rate".
- **Line/area sparkline** (Main Stocks): A wavy coral line with a very light coral fill beneath it spanning the full card width. No visible axis gridlines. Value "$16,073.49" and "+9.3%" displayed above.
- **Mini bar chart** (top-right card, unlabeled): Small vertical bar chart, bars rendered in coral, appears to track a trend over months. Very compact, no axis labels.
- **Candlestick-like mini chart** (Activity Manager / Business plans): Vertical bars of varying heights in coral tones, suggesting price or volume over time.
- **Dot heatmap** (13 Days card): A 5×5-ish grid of small filled circles in coral, representing days/hours consumed.
- **Year comparison sparkline** (top-right): A very small line chart with "2022" and "2023" labels and a coral badge marking the current year peak.

### KPI / Stat Tiles
- "Total income — $23,194.80" with "Weekly" dropdown, a circular clock icon, and "View on chart mode" link in coral.
- "Total paid — $8,145.20" with "Weekly" dropdown.
- "13 Days / 109 hours, 23 minutes" with a clock icon.
- "$16,073.49 / Main Stocks / +9.3%" with a network/graph icon.

### Cards
- **VISA card widget**: White card, "VISA" bold top-left, "Direct Debits" pill dropdown top-right, "Linked to main account" gray label, masked number "**** 2719", two action buttons ("Receive" — black fill; "Send" — outlined), "Monthly regular fee $25.00" and "Edit cards limitation" coral link. Left side has two vertical icon buttons ("+", share icon).
- **System Lock tile**: Small square card with a padlock icon (outlined) and label "System Lock" below.
- **Wallet Verification card**: White card with a sunburst/asterisk decorative icon in coral, title "Wallet Verification", body text "Enable 2-step verification to secure your wallet.", large coral fill "Enable" button.
- **Review Rating card**: Small card with a dismissible "×", a rating prompt "How is your business management going?", and five sentiment face icons (from frowning to smiling) as a rating scale.

### Buttons
- **Primary CTA** ("Show my Tasks →"): Pill shape, coral fill, white bold text, right-arrow.
- **"Receive"**: Rounded rectangle, black fill, white text.
- **"Send"**: Rounded rectangle, light gray outlined, dark text.
- **"Enable"**: Rounded rectangle, coral fill, white semibold text, full width of card.
- **"View on chart mode"**: Text link in coral with a small upward-trend icon prefix.
- **"Edit cards limitation"**: Text link in coral with a small pencil icon.

### Navigation & Header Elements
- **Hamburger icon**: Three horizontal lines, top-left.
- **Logo badge**: Black circle with white "Nº" text.
- **"+" action button**: Circular, light gray outlined, centered plus symbol.
- **User avatar**: Small circular photo, name + role label beside it.
- **Search field**: Pill-shaped input, light gray background, placeholder text "Start searching here…", magnifying glass icon on left.
- **Microphone button**: Circular, light gray outlined, microphone icon.
- **Calendar icon**: Small outlined calendar with a red dot indicator.

### Dropdowns & Filters
- **"Weekly" dropdown**: Small pill with caret, light gray fill.
- **"2023" dropdown**: Small pill, light gray fill, used in Annual Profits section.
- **"Direct Debits" dropdown**: Small pill in VISA card header.
- **Filter tags** ("Team •", "Insights ×", "Today ×"): Rounded pill badges with a close "×" or colored dot, in light gray. Preceded by a search field ("Search in activities…") with magnifying glass.

### Progress & Status
- **Dot heatmap grid**: Coral circles of uniform size in a grid, tracking time/days.
- **Business plan steps** (Bank loans, Accounting, HR management): Vertical list with orange circle bullet icons and labels.

---

## Data Visible in the Image

| Element | Value |
|---|---|
| Date | 19 Tue, December |
| Total income | $23,194.80 |
| Total paid | $8,145.20 |
| Monthly regular fee | $25.00 |
| Masked card number | **** 2719 |
| Timer | 13 Days / 109 hours, 23 minutes |
| Growth rate (donut) | 36% |
| Main Stocks value | $16,073.49 |
| Main Stocks change | +9.3% |
| Annual profits (outer to inner) | $14K, $9.3K, $6.8K, $4K |
| Activity chart value | $43.20 USD |
| Year markers | 2022, 2023 |
| User name | Dwayne Tatum |
| User role | CEO Assistant |
| Business plans listed | Bank loans, Accounting, HR management |

---

## Limitations

- Exact hex color codes are approximated (e.g., the coral accent may be #E05A3A, #E8533A, or similar — pixel-exact values not confirmed).
- Pixel measurements are proportional estimates, not absolute px values.
- Font family is not named in the image; appears to be a geometric sans-serif (possibly Inter or similar).
- Icon library names not confirmed — described by visual appearance only.
