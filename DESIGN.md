---
name: Low Tide
description: A lifeguard's conditions board that reads green claims and brands against source passages checked word for word.
colors:
  rescue: "#d62b1f"
  rescue-edge: "#a51e15"
  flag-yellow: "#f6c400"
  flag-green: "#23784a"
  mark: "#fbe27a"
  water: "#17313e"
  board: "#ffffff"
  haze: "#eaeff0"
typography:
  display:
    fontFamily: "Big Shoulders Stencil, sans-serif"
    fontSize: "clamp(4.5rem, 17vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.8
    letterSpacing: "0.01em"
    fontVariation: "'opsz' 72"
  headline:
    fontFamily: "Big Shoulders Stencil, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "0.01em"
  verdict:
    fontFamily: "Big Shoulders Stencil, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 900
    lineHeight: 1.11
    letterSpacing: "0.02em"
  plaque:
    fontFamily: "Big Shoulders Stencil, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.33
    letterSpacing: "0.02em"
  title:
    fontFamily: "Big Shoulders Stencil, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0.01em"
  tab:
    fontFamily: "Big Shoulders Stencil, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "0.02em"
  claim-echo:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.375
  quote:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.1rem"
    fontWeight: 400
    lineHeight: 1.7
  lead:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.43
rounded:
  none: "0px"
  plaque: "3px"
  tab: "4px"
spacing:
  gutter: "20px"
  gutter-wide: "32px"
  stack: "16px"
  row: "32px"
  row-gap: "40px"
  waterline: "48px"
components:
  board-panel:
    backgroundColor: "{colors.rescue}"
    textColor: "{colors.board}"
  button-check:
    backgroundColor: "{colors.rescue}"
    textColor: "{colors.board}"
    typography: "{typography.plaque}"
    rounded: "{rounded.none}"
    padding: "12px 28px"
  button-check-hover:
    backgroundColor: "{colors.rescue-edge}"
  button-plaque:
    backgroundColor: "{colors.board}"
    textColor: "{colors.water}"
    typography: "{typography.label}"
    rounded: "{rounded.plaque}"
    padding: "6px 12px"
  button-plaque-hover:
    backgroundColor: "{colors.water}"
    textColor: "{colors.board}"
  tab-active:
    backgroundColor: "{colors.board}"
    textColor: "{colors.water}"
    typography: "{typography.tab}"
    rounded: "{rounded.tab}"
    padding: "10px 20px 8px"
  tab-inactive:
    backgroundColor: "{colors.rescue-edge}"
    textColor: "{colors.board}"
    typography: "{typography.tab}"
    rounded: "{rounded.tab}"
    padding: "10px 20px 8px"
  input-entry:
    backgroundColor: "{colors.board}"
    textColor: "{colors.water}"
    typography: "{typography.lead}"
    rounded: "{rounded.plaque}"
    padding: "16px"
  board-row:
    backgroundColor: "{colors.board}"
    textColor: "{colors.water}"
    typography: "{typography.body}"
    padding: "32px 0"
  passage-plate:
    backgroundColor: "{colors.haze}"
    textColor: "{colors.water}"
    typography: "{typography.quote}"
    rounded: "{rounded.plaque}"
    padding: "20px"
  quote-mark:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.water}"
    typography: "{typography.quote}"
  flag-legend:
    backgroundColor: "{colors.board}"
    textColor: "{colors.water}"
    typography: "{typography.label}"
    padding: "20px 24px"
    width: "288px"
  loader-row-wet:
    backgroundColor: "{colors.water}"
    textColor: "{colors.board}"
  loader-row-dry:
    backgroundColor: "{colors.haze}"
    textColor: "{colors.water}"
---

# Design System: Low Tide

## Overview

**Creative North Star: "The Lifeguard's Conditions Board"**

Low Tide is the board a lifeguard posts at the foot of the stand: a rescue-red painted panel, white rows ruled in deep-water ink, stencil caps you can read from the sand, and a beach flag that tells you the conditions. A verdict is never a score. It is a flag run up a pole, in the three colors every beachgoer already knows, with the exact passage behind it written out underneath. The page is built for a judge watching a projector and a shopper holding a phone, so everything reads at arm's length and nothing hides behind a hover.

The layout is a grounded list. One column, one board row per finding or check, each opening with its flag and a stencil title and then the evidence. Low Tide's own sentences are plain and short; the words it quotes from a source slow down into a reading serif under a yellow highlighter, because the quote is the proof. Motion is spent on one authored moment: during a live check, deep water floods a tide staff and drains one mark per real step, then the flag hoists when the answer lands. A tampered quote is pulled in the same language: its flag comes down and the swapped word is struck through in red.

The world refuses the eco scorecard of rounded cards and rating badges, and a green flag never reads as a certification. Depth is paint, not simulated plywood.

**Key Characteristics:**
- One loud red board (header, footer, CHECK plaque) over a white ground with deep-water ink.
- Verdict color lives only in flag cloth: yellow, green, red, or a dashed empty flag.
- Three voices: stencil caps for the board, a plain hyperlegible sans for Low Tide, a reading serif for every quoted source.
- Flat, nearly square, ruled in 2px ink.
- One authored motion: the tide drains during a live check, the flag hoists on arrival, and a pulled finding lowers its flag.

## Colors

A painted-signal palette: one saturated rescue red, beach-flag cloth in yellow, green and red, and deep-water ink on white board.

### Primary
- **Rescue Red** (#d62b1f): the board itself. Header and footer panels, the CHECK plaque, the red flag cloth (Red flags, Red flag), the red bands of the tide staff, and red ink under the Red Ink Rule. White type on it holds 4.97:1.
- **Rescue Edge** (#a51e15): the same paint in shadow. The inactive mode tab, and the CHECK plaque on hover and while a check runs.

### Secondary
- **Flag Yellow** (#f6c400): yellow flag cloth (Needs qualification, Mixed record), the 6px underline under each phrase of a claim that drew a finding, and the pulsing marker on the loader step now running.
- **Flag Green** (#23784a): green flag cloth only (OK if they can prove it, Strong record, Good sign). Never text, never a fill behind text.

### Tertiary
- **Highlighter** (#fbe27a): a pale yellow laid under verbatim source quotes and nothing else. Ink on it holds 10.5:1.

### Neutral
- **Deep-Water Ink** (#17313e): all text, every 2px rule and border, flag poles and outlines, the focus ring, and the flood of the tide loader. Secondary text is this ink at 75% (6.2:1 on white), captions at 70%, hairlines between evidence entries at 25%.
- **Board White** (#ffffff): the page ground, board rows, the active tab, the entry field, the flag legend sign, and all type on red or water.
- **Haze** (#eaeff0): the cool grey plate under a Green Guides passage in claim mode, and the drained ground of the tide staff once a step finishes.

### Named Rules
**The Flag Carries the Color Rule.** A verdict's color appears only as flag cloth: on the verdict pole, on a row's flag, in the legend. The verdict label beside it is always ink stencil caps. No colored text labels, no rows tinted by verdict, no colored badges.

**The Red Ink Rule.** Rescue-red text means the check rejected something or could not run: "Finding removed", the swapped word in a tampered quote, a failed tamper test, an entry hint. It is never emphasis and never a heading.

**The Highlighter Is Verbatim Rule.** The highlighter goes only under words copied exactly from a source and checked word for word. The claim's matched phrases get a flag-yellow underline instead, and Low Tide's own sentences get neither.

## Typography

**Display Font:** Big Shoulders Stencil (with sans-serif fallback)
**Body Font:** Atkinson Hyperlegible Next (with sans-serif fallback)
**Reading Font:** Source Serif 4 (with Georgia, serif)

**Character:** The stencil is the paint on the stand: condensed, heavy, always in caps, readable from a distance. Atkinson is Low Tide talking plainly to a shopper; Source Serif is the source talking, set for slow reading.

### Hierarchy
- **Display** (900, clamp(4.5rem, 17vw, 6rem), 0.8, optical size 72): LOW TIDE on the red board. Once per page.
- **Headline** (800, 3rem rising to 3.75rem from 640px, 0.92): the brand question, "Is {brand} sustainable?", breaking a long link host rather than overflowing.
- **Verdict** (900, 2.25rem, 0.02em): the brand verdict label beside the pole, in ink.
- **Plaque** (800, 1.5rem, 0.02em): the CHECK plaque label and the tide loader's title.
- **Title** (800, 1.35rem, 1.05): a board row's verdict label or check name, under or beside its flag.
- **Tab** (800, 1.25rem, 0.02em): the mode tabs and the legend sign's title.
- **Claim echo** (Source Serif 4, 400, 1.875rem rising to 2.6rem from 640px, 1.375): the checked claim repeated in curly quotes above the findings, max 40ch.
- **Quote** (Source Serif 4, 400, 1.1rem, 1.7): every verbatim passage, max 68ch.
- **Lead** (Atkinson, 400, 1.125rem, 1.625): the board's one plain line (max 52ch), the finding's phrase in bold, the idle line, error text, the brand rule line.
- **Body** (Atkinson, 400, 1rem, 1.625): explanations under each finding and each piece of evidence, max 65ch.
- **Label** (Atkinson, 700, 0.875rem): plaques, captions, source links (2px underline), row sub-labels. Sentence case, never tracked caps.

Every stencil role is set uppercase with 0.01em to 0.02em tracking.

### Named Rules
**The Three Voices Rule.** Stencil caps speak for the board (names, headings, verdicts, plaque labels). Atkinson speaks for Low Tide. Source Serif speaks only for someone else's words: the Guides, a page about the brand, the shopper's own claim. Low Tide's sentences never go in serif, and source words never go in stencil or sans.

**The Caps Are Paint Rule.** Stencil is always uppercase and never sets running text or an explanation. A sentence that needs reading goes in Atkinson.

## Layout

A single grounded column, at most 1024px wide, with 20px side gutters that open to 32px from 640px. The page reads top to bottom like a real stand: the red board (display name, one plain line, and on desktop the flag legend sign beside them), two mode tabs cut into the board's lower edge, the white entry strip with the CHECK plaque, a row of sample plaques, a hand-drawn waterline (a 2px ink wave at 40%, with 48px above and below), then the results, and the red board again as the footer.

Results are a list of board rows. Each row opens with a 2px ink rule and has 32px of vertical padding. From 768px a row is two columns: a 13.5rem flag column (flag above its title) and the evidence column, 40px apart. Below 768px the flag sits beside its title and the evidence stacks underneath. The list closes with a final 2px rule over the removed-quote count when there is one. In brand mode the verdict pole stands beside the headline from 640px, bottoms aligned, and stacks above it on phones (160px tall, 224px from 640px).

The entry field and CHECK plaque sit side by side from 640px and stack on phones. Sample plaques wrap freely. The flag legend appears only from 1024px; on smaller screens every flag has its label next to it. Spacing moves in 8, 16, 20, 32, 40 and 48px steps, with 96px below the results.

### Named Rules
**The Grounded List Rule.** Results are one list of ruled rows read top to bottom. Never a grid of tiles, never cards side by side.

## Elevation & Depth

The system is flat. Nothing casts a shadow, nothing blurs, nothing floats. Depth comes from paint and water: the red board against white, the deep-water flood rising over the tide staff, and 2px ink rules. The highlighter's 2px spread around each quote is bleed so the yellow covers letter edges, not elevation, and the staff's graduations are a drawn repeating stripe, not a gradient.

### Named Rules
**The Painted, Not Built Rule.** The board is paint on a flat plane. No ledge borders, bevels, corner bolts, drop shadows, or layered panels pretending to be plywood.

## Shapes

Nearly square. Plaques, the entry field, the passage plate and the loader frame take a 3px corner, just enough to read as cut sign board. The mode tabs round only their top corners (4px) and meet the white strip flush. The CHECK plaque, board rows, the legend sign and the board panels are square. Circles appear only as the loader's status markers and the finial on the verdict pole.

Structure is drawn in one stroke weight: 2px deep-water ink for plaque borders, the field, row rules, the loader frame and the staff divisions. A 1px hairline at 25% ink splits evidence entries within one brand check. The recurring silhouettes are the beach flag (a waving cloth on a round-capped pole), the red and white tide staff with its E-shaped graduations, and the wave line.

## Components

### Buttons
Painted plaques, pressed rather than lifted.
- **CHECK plaque:** rescue red, white stencil caps ("Check claim", "Check brand"), square, 12px 28px. Hover deepens to rescue edge; a press drops it 2px; while running it reads "Checking…" or "Researching…" on rescue edge.
- **Sample plaque:** white with a 2px ink border, 3px corners, bold 14px ink label, 6px 12px. Hover floods it with ink and turns the label white. Disabled at 40% with no flood.
- **Tamper plaque:** the sample plaque placed under a verified passage, labelled "Tamper test: change one word"; it reads "Checking the edited quote…" at 60% while it runs.
- **Focus:** every control shows a 3px deep-water ring offset 3px.

### Navigation
- **Mode tabs:** "A claim" and "A brand" in stencil caps, cut into the red board's lower edge 6px apart, 20px side padding opening to 28px from 640px. The active tab is board white with ink text, continuous with the entry strip below; the inactive tab is rescue edge with white text and a deeper red on hover. Both lock while a check runs.

### Inputs / Fields
- **Entry field:** white, 2px ink border, 3px corners, 16px padding, 18px text, placeholder at 75% ink. The claim is a three-row textarea that resizes vertically; the brand is a single line. Focus turns the border rescue red inside the ink focus ring. A validation hint appears beneath in bold red ink.

### Board Rows
- **Finding row (claim mode):** flag and ink stencil verdict label in the flag column. Then the claim's phrase in bold curly quotes, the explanation, and the passage plate: haze, 3px corners, 20px padding (24px from 640px), the section's surrounding text in serif with the matched quote under the highlighter. The caption links the section on the left and says "Quote checked word for word" on the right at 70% ink. The tamper plaque follows.
- **Not covered:** a dashed empty flag, the label "Not covered by the Guides", no plate, and one plain sentence saying Low Tide won't stretch a rule to fit a term the Guides never use.
- **Check row (brand mode):** flag, check name, and a bold sub-label (Good sign, Red flag, Both, Not found). Evidence sits flush on the white row, not on a plate, with entries split by hairlines: a note, the serif quote under the highlighter, and a caption with the host link, "their own site" where it applies, and "Quote checked word for word against this page". A "Both" check puts a small flag and label above each entry. An empty check says "Low Tide couldn't find a source it could verify for this. That isn't the same as a no."

### Pulled Finding
The tamper test's result keeps its row. The flag cloth drops 14px and fades over 800ms, leaving the dashed outline on the pole. "Finding removed" replaces the verdict label, a bold red line names the section the quote no longer matches, the passage loses its highlighter and shows the original word struck through in red beside the swapped word in bold red, and the caption turns red: "Edited quote failed the word for word check". The tamper plaque goes away. Under the list, the closing line counts removed findings and records the swap.

### Beach Flag
The page's one pictorial device. An ink pole with a round cap and a waving cloth in the verdict's color, outlined in ink. "Both" flies a split cloth, green with a red triangle. An answer without a colored verdict (Not covered, Not found, Not enough evidence, the idle state) flies nothing: a dashed outline on the pole. Sizes run 16×20px inline, 28×32px in the legend, 32×40px at a row head and 40×48px in the idle state. Row flags hoist from 15px below on arrival, staggered 180ms, over 1.1s on a long ease-out (cubic-bezier(0.16, 1, 0.3, 1)).

### Verdict Pole
Brand mode's answer: a tall ink pole on a base plate with a round finial. The big flag hoists 118px over 1.1s when the answer lands; "Not enough evidence" leaves a dashed empty flag. Beside it sit the headline question, the ink verdict label, the plain rule line (for example "2 good signs, 3 red flags across 4 checks."), and two small notes: it describes verified evidence, not a certification, and where that evidence came from.

### Tide Staff Loader
A live check's loading state. A 2px ink frame with 3px corners, a head row with a stencil title and a plain time hint, then one row per real step. Each row pairs a tide staff section (alternating red and white bands, E-shaped graduations, a stencil numeral) with the step's label. Unfinished rows are flooded deep water with white text; the first wet row carries a drifting surf edge (7s loop) and a pulsing flag-yellow marker. A finished row drains to haze with ink text and a drawn check, colors crossing over 700ms. The loader scrolls itself to center.

### Flag Legend Sign
Desktop only (from 1024px). A 288px white sign on the red board beside the headline, titled "What the flags mean" in stencil, listing one flag per verdict for the current mode.

### Motion
Five movements, all tied to the check: the waterline draws itself in (900ms ease-out), the tide edge drifts and the active marker pulses while a live check runs, flags hoist when answers land, and a pulled flag lowers. Under prefers-reduced-motion all of them stop, and a pulled flag's cloth is simply gone, leaving the dashed outline.

## Do's and Don'ts

### Do:
- **Do** put every verdict on a flag: the cloth carries the color, the label stays ink stencil caps.
- **Do** set every source quote in Source Serif 4 (1.1rem, 1.7) under the highlighter, captioned with its source link and "Quote checked word for word".
- **Do** reserve the haze plate for the claim-mode Green Guides passage; brand evidence sits flush on the white row, split by 25% ink hairlines.
- **Do** rule every board row with a 2px deep-water line and keep results in one list.
- **Do** show honest empty answers (Not covered, Not found, Not enough evidence) as a dashed empty flag with one plain sentence.
- **Do** keep a pulled finding in its row: flag lowered, the swapped word struck through in red, "Finding removed" in place of any verdict label.
- **Do** keep the footer text exactly: "Low Tide reads your claim against the FTC Green Guides (16 CFR Part 260). It is not legal advice. Every quote is checked word for word against the Guides before it is shown." Brand mode adds one sentence: "In brand mode, every quote is checked word for word against the page it came from."
- **Do** stop every animation under prefers-reduced-motion.

### Don't:
- **Don't** fly a colored flag or show a verdict label that no verified quote backs. Answers without a quote (Not covered, Not found, Not enough evidence) fly the dashed empty flag.
- **Don't** build the eco scorecard: no rounded cards, no rating badges, no container rounder than 4px.
- **Don't** let a green flag read as a certification: no seal, ribbon, or badge framing around a flag.
- **Don't** color a verdict label, tint a row by verdict, or set flag green as text.
- **Don't** fake the board's hardware: no ledge borders, bevels, corner bolts, or drop shadows.
- **Don't** use rescue-red text for emphasis or headings; red ink means something was rejected.
- **Don't** put the highlighter on Low Tide's own words or on the claim; the claim's phrases take the flag-yellow underline.
- **Don't** use the words "illegal", "violation", or "lawsuit" anywhere in the UI. Low Tide is a reading of guidance, not legal advice.
- **Don't** use em dashes in UI copy.
