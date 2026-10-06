# Design — Keyword Monitoring Dashboard

## Purpose

This document translates the supplied dark dashboard reference into a visual system for the local keyword-monitoring product.

The goal is **not** to copy the finance content or impersonate LinkedIn/X.

The goal is to preserve the reference's visual grammar:

- dark, premium, compact;
- data-dense but calm;
- warm red/coral energy;
- thin borders;
- restrained glow;
- strong hierarchy;
- excellent dashboard rhythm;
- minimal chrome;
- serious tool, not generic SaaS.

Use the reference image itself as the final source of truth for visual feel.

---

# 1. Overall atmosphere

The application should feel like a **high-end local intelligence console**.

It should look focused and operational, as if it is quietly monitoring several sources in the background.

Primary qualities:

- near-black workspace;
- warm, subtle ambient red lighting;
- crisp white primary type;
- subdued secondary type;
- thin structural lines;
- compact information density;
- minimal ornament;
- occasional glow only on high-value emphasis;
- polished, quiet interactions.

Avoid:

- bright multicolor dashboards;
- oversized gradient SaaS cards;
- excessive pill shapes;
- huge empty whitespace;
- cartoon illustrations;
- social-network imitation;
- glassmorphism everywhere;
- excessive blur;
- neon cyberpunk styling;
- giant hero sections;
- marketing-page layout.

This is an **application workspace**, not a landing page.

---

# 2. App shell

## Desktop

Use a three-part shell inspired by the reference:

### A. Slim left rail
Approximate visual width: **64–76px**.

Contains:

- product mark at top;
- Dashboard;
- Results;
- Monitors;
- optional Data/System/Settings entry;
- Settings/help near bottom.

Use icons first.

The selected navigation item should be obvious through a compact high-contrast active treatment, similar to the white circular active icon in the reference.

Do not add a wide permanent sidebar full of text unless usability at a later scale clearly requires it.

Tooltips or compact labels may clarify icons.

### B. Top utility bar
Approximate height: **64–74px**.

Contains:

- global search / "Search monitored results";
- small utility controls;
- theme toggle if implemented;
- connection/system indicator;
- compact settings/profile-equivalent control if useful.

Do not create a fake user avatar/account system in V1.

A small local/system status indicator can occupy the visual role that the avatar has in the reference.

Top bar should be visually quiet with a subtle divider.

### C. Main content
Use a generous but dense content region.

Recommended max canvas width: roughly **1400–1500px**, fluid below that.

Desktop gutters should be moderate, not huge.

The composition should fit useful information above the fold.

---

# 3. Surface system

Suggested dark theme roles:

```text
App background       #090909 to #0B0B0B
Primary panel        #0F0F10 to #121212
Elevated panel       #151314 to #181516
Border               rgba(255,255,255,0.08)
Strong border        rgba(255,255,255,0.12)
Primary text         #F5F5F4
Secondary text       #A4A0A0
Muted text           #706C6C
Primary accent       warm coral/red around #F05A4F
Accent deep          dark red/brown around #7A2722
Success              restrained muted green
Warning              muted amber
Error                warm red
```

These are directional rather than mandatory exact values.

The screenshot uses warm red light against black. Recreate that relationship without turning every element red.

---

# 4. Accent and glow

The warm coral/red accent is the signature color.

Use it for:

- primary CTA;
- tiny active indicators;
- selected metric emphasis;
- chart highlight;
- controlled status accents;
- focus moments.

Use atmospheric red glow sparingly.

The reference's first metric card has a warm red light bloom. This can inspire one highlighted dashboard card or an active-monitor state.

Do not:

- glow every card;
- make every border red;
- use strong red backgrounds behind large amounts of text;
- compromise readability.

Glow should behave like ambient light, not decoration.

---

# 5. Typography

Use a highly legible modern sans-serif available without proprietary dependencies.

Good directions:

- Inter;
- Geist;
- system UI;
- another restrained neo-grotesk.

Prefer a tight, technical but readable hierarchy.

Approximate roles:

```text
Page title           30–36px / 600–700
Section title        18–22px / 600
Metric value         28–34px / 500–650
Card title           13–15px / 500–600
Body                 14–16px / 400
Table body           13–14px / 400–500
Metadata             11–12px / 450–550
Micro labels         10–11px / 500
```

Use clean number rendering.

Where supported, use tabular numerals for metrics and timestamps.

Do not uppercase long headings or body text.

Avoid overly wide letter spacing.

---

# 6. Spacing and density

Use an 8px-based rhythm, but allow 4px increments.

Typical values:

```text
4   tiny internal gap
8   compact gap
12  small component gap
16  standard component gap
20  card padding
24  section/card padding
32  major layout gap
40  large separation
```

The reference is dense but not cramped.

Cards should use enough internal space to scan quickly while keeping multiple panels visible at once.

---

# 7. Borders, radius, and depth

The reference uses soft rectangular cards rather than floating white cards.

Recommended:

- radius around **10–14px** for major panels;
- slightly smaller radius for inputs/controls;
- 1px low-contrast borders;
- very subtle shadow or none;
- depth primarily through surface contrast.

Do not use heavy drop shadows.

Do not use exaggerated 24–32px rounded "friendly SaaS" corners.

---

# 8. Dashboard composition

Use the supplied reference layout as inspiration.

## Header row

Left:

- small contextual greeting/status if useful;
- `Dashboard Overview` as the main title.

Right:

- prominent `+ New Monitor` button.

Do not literally use "Create Report."

## Metric row

Use four compact metric cards, for example:

1. **Active Monitors**
2. **New Matches**
3. **Total Indexed**
4. **Next Run** or **Last Sync**

Keep labels small and values large.

Use one card as the current visual focal point through a subtle red/coral ambient light treatment.

Do not fill all cards with different colors.

## Main middle grid

Left, wider panel:

### Discoveries Over Time
A clean time-series chart showing new results over time.

Potential series:

- total;
- or separate source lines if still readable.

Keep grid lines subtle.

Tooltips should show date/time and counts.

Right, narrower panel:

### Monitor Activity
Replace the reference's AI chat panel with useful operational activity.

Examples:

```text
LinkedIn · Completed
14 fetched · 3 new
12 min ago

X · Completed
21 fetched · 5 new
14 min ago

Web · Running
AI Automation Talent — Bangladesh
```

This should feel alive without fake animation.

Use status icons, source badges, timestamps, and concise summaries.

## Lower panel

### Recent Matches

Use a compact high-information table or hybrid list.

Possible columns:

- source;
- author/domain;
- content/title;
- matched keyword;
- published/discovered;
- action.

Do not force entire post text into a narrow table cell. Use sensible truncation and open/detail behavior.

---

# 9. Results page

The Results page is the primary content-consumption surface.

## Top controls

Use one clean toolbar containing:

- search-within-results;
- platform filter;
- monitor or keyword filter;
- date range;
- sort: newest / oldest.

Avoid a massive filter drawer for V1.

## Result layout

Use a unified visual system with subtle source identity.

Each result should quickly communicate:

- platform/source;
- author/domain;
- publication date;
- content/title;
- matched keyword(s);
- original-source action.

### LinkedIn
May show:

```text
LINKEDIN                                      24m ago
Author Name
Role/company metadata if available

Post content...

Matched: AI automation · AI engineer Bangladesh

View original ↗
```

### X
May show:

```text
X                                             1h ago
@handle · Display Name

Post text...

Matched: AI automation Bangladesh

View post ↗
```

### Web / Blog
May show:

```text
WEB · example.com                             Yesterday

Article title
Author if available

Relevant excerpt...

Matched: AI jobs Bangladesh

Read article ↗
```

Do not reproduce the actual LinkedIn or X UI.

Use the application's own design language.

---

# 10. Monitors page

Present monitors in a compact operational view.

Each monitor should show:

- name;
- keyword count;
- enabled platforms;
- frequency;
- status;
- last run;
- next run;
- recent result count.

Actions:

- Run now
- Edit
- Pause/Resume
- Delete

Avoid clutter.

Creation/editing can use a modal, sheet, or dedicated compact page.

---

# 11. New Monitor interaction

The create flow should be extremely easy.

Recommended fields:

### Monitor name
Example: `AI Automation Talent — Bangladesh`

### Keywords / concepts
Use token/chip entry or clear multiline input.

### Sources
Checkboxes/toggles:

- LinkedIn
- X
- Web / Blogs

### Initial lookback
Simple preset selection plus custom if useful.

### Frequency
At minimum:

- 1 hour
- 3 hours
- Custom

### Start
Primary CTA.

Avoid exposing Actor IDs or provider internals in the normal creation flow.

---

# 12. Search field

The reference has a prominent top-bar search field.

Use it as global stored-result search.

Placeholder:

`Search monitored results...`

Keep it compact and unobtrusive.

This is searching the local indexed corpus, not starting a new web scrape.

---

# 13. Buttons

## Primary
Warm coral/red fill.

Use for:

- New Monitor
- Start Monitoring
- Save

Medium radius, not pill-shaped.

Hover should brighten or deepen slightly.

## Secondary
Dark surface with thin border.

Use for:

- Run now
- Edit
- Cancel
- secondary actions.

## Destructive
Use restrained error/red treatment, with confirmation where appropriate.

---

# 14. Inputs and controls

Inputs should be dark, quiet, and clearly interactive.

Use:

- subtle border;
- slightly elevated surface;
- strong focus ring;
- comfortable 40–44px minimum interactive height.

Dropdowns should visually belong to the same surface system.

Avoid default-browser-looking controls where reasonable.

---

# 15. Source badges

Platform identity should be quick to parse.

Use restrained badges/icons for:

- LinkedIn
- X
- Web

Do not reproduce official brand interfaces.

Keep badge color usage subtle enough that the overall palette remains black + neutral + coral.

---

# 16. Status system

Suggested statuses:

- Active
- Paused
- Running
- Completed
- Failed
- Throttled

Status colors should remain muted and professional.

Never use large saturated status blocks.

---

# 17. Charts

Charts should match the reference:

- low-contrast axes;
- minimal grid lines;
- thin strokes;
- dark tooltip;
- warm accent highlight;
- no unnecessary legend clutter.

Do not add charts just to fill space.

The main useful chart is **Discoveries Over Time**.

---

# 18. Motion

Motion should be short and functional.

Use for:

- panel transitions;
- button feedback;
- dropdowns;
- subtle activity indicator during a run.

Avoid:

- card floating;
- scaling every hover;
- looping background animation;
- decorative particles;
- excessive skeleton shimmer.

Respect `prefers-reduced-motion`.

---

# 19. Light mode

If implemented, light mode should remain mature and low-glare.

Suggested direction:

- warm off-white / very light neutral canvas;
- white or near-white panels;
- charcoal primary text;
- muted gray secondary text;
- same warm coral accent;
- fine gray borders.

Do not use pure white everywhere if it creates harsh contrast.

Dark mode is the reference and may be the default.

---

# 20. Responsive behavior

## Large desktop
Preserve the full reference-like dashboard layout.

## Laptop / smaller desktop
Allow the chart/activity grid to compress gracefully.

## Tablet
Stack the activity panel under the chart if needed.

Metric cards can use a 2×2 grid.

## Mobile
Prioritize:

- Results;
- Monitor status;
- Search/filter;
- New Monitor.

Collapse the left rail into a compact mobile navigation.

Do not attempt to preserve a desktop data table on a narrow screen; convert it to cards/list rows.

---

# 21. Empty states

Empty states should be useful, not decorative.

Examples:

### No monitors
`Create your first monitor to start collecting matches.`

### No results
`No matches yet. Your monitor will keep checking while the local service is running.`

### Filter returns nothing
`No stored results match these filters.`

Provide the relevant next action.

---

# 22. Loading states

Use subtle skeletons or compact inline progress.

When a monitor is running, surface the activity meaningfully:

`Searching LinkedIn…`
`Normalizing 18 items…`
`3 new matches saved.`

Do not fake progress percentages unless the provider exposes real progress.

---

# 23. Error states

Errors should be actionable and calm.

Example:

`LinkedIn search failed on the last run. Existing results are safe. Retry now or wait for the next scheduled run.`

Do not show raw stack traces in the normal UI.

Diagnostics can live in a developer/system area.

---

# 24. Accessibility and usability

Maintain:

- strong keyboard navigation;
- visible focus styles;
- readable contrast;
- adequate hit targets;
- semantic structure;
- labels for icon-only controls;
- no color-only communication.

The design should remain beautiful when used entirely with a keyboard.

---

# 25. Do / Don't summary

## Do

- mirror the reference's dark, dense, premium mood;
- use one warm coral/red accent;
- maintain compact cards;
- preserve strong structure;
- make data scannable;
- keep borders subtle;
- use one clear primary action;
- make monitoring state visible;
- let source identity be obvious but restrained;
- prioritize operational clarity.

## Don't

- copy finance content;
- impersonate LinkedIn or X;
- turn it into a generic colorful SaaS dashboard;
- overuse gradients;
- use giant rounded cards;
- clutter the UI with provider internals;
- add AI assistant chat in V1;
- create fake metrics;
- use excessive glows;
- overwhelm the dashboard with charts;
- sacrifice density for decorative whitespace.

---

# 26. Visual success test

When the finished app is placed beside the supplied reference image, it should clearly feel like it belongs to the same **design family**:

- same density;
- same premium darkness;
- same restrained warm glow;
- same precise card rhythm;
- same quiet sophistication.

But it should unmistakably be a **keyword intelligence / monitoring product**, not a finance dashboard.

---

# 27. Reference image notes

The reference is `design-reference.png` in the repository root. Where this document and the image disagree on shape or feel, the image wins.

Observed in the image and adopted:

- **Canvas**: warm near-black; neutrals lean very slightly red, never blue-grey. Soft deep-red ambient light sits in the top-right and bottom-left corners of the canvas only.
- **Shell**: rail and top bar are separated by 1px dividers, not filled slabs. Rail icons sit in ~40px circles; the active item is a solid white circle with a dark icon.
- **Controls are round, panels are soft rectangles**: search is a pill, icon buttons are circles, the theme toggle is a small pill with a white circular thumb. Panels use 12–14px radius.
- **Primary CTA**: a circular `+` chip fused to a pill button, filled with a horizontal deep-red → coral gradient. This overrides "medium radius, not pill-shaped" in §13 for the primary action.
- **Metric cards**: circular outlined icon chip, small label, 28–30px value at weight 500, optional small outlined chip beside the value. Only the first card carries the diagonal bloom (pale-peach hot spot bottom-left, through coral, into the dark panel).
- **Chart**: area chart with a coral fill fading to transparent, a second thin pale line, faint horizontal gridlines, dashed hover cursor with a glowing point, dark tooltip.
- **Table**: sentence-case muted column headers, ~44px rows, 1px dividers, status chips as small outlined rounded-rects (≈5px radius) with a dot and label.
- **Type**: light-to-medium weights throughout; nothing is bold-heavy.

---

# 28. Palette and type override (ui-ux-pro-max)

Decision: **colour and typography come from the ui-ux-pro-max "Data-Dense Dashboard" system; element shapes, layout and anatomy come from the reference image (§27).** This supersedes the warm coral/red palette in §3–§4 and the font suggestion in §5. Wherever earlier sections say "coral" or "warm red", read the mapping below.

**Type**: Fira Sans for UI and body; Fira Code for headings, metric values and numeric data. Self-hosted through `@fontsource`, no network font requests.

**Light theme** (ui-ux-pro-max tokens as given): primary `#1E40AF`, secondary `#3B82F6`, accent/CTA `#D97706` with black text, background `#F8FAFC`, foreground `#1E3A8A`, card `#FFFFFF`, muted `#E9EEF6`, muted text `#475569`, border `#DBEAFE`, destructive `#DC2626`, ring `#1E40AF`.

**Dark theme** (default; same system translated, neutrals tinted blue): background `#070B14`, panel `#0C1220`, elevated `#111A2C`, foreground `#E8EEF9`, secondary text `#9FB0CC`, primary `#3B82F6`, primary deep `#1E40AF`, accent/CTA `#F59E0B` with black text, destructive `#F87171`, ring `#60A5FA`.

**Mapping from the reference's colour moments**: ambient corner light and the focal metric card bloom become blue; the primary CTA becomes the amber accent and is the only amber-filled element per screen; chart fill and main stroke are primary blue with a pale-blue second line; the active rail item stays a solid white circle (solid primary in light theme).
