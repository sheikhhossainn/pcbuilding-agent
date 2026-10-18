# Builder UI/UX redesign: follow-up (refine) flow

## What is wrong today (from the screenshot and the code)

1. **The dock covers the page.** The composer is centered on the viewport, not on the parts column, so on
   desktop the "Refining your build" chip, the suggestion chips and "Start over" float over part rows and
   the summary rail (the Power card is cut by "Start over").
2. **Three loaders for one job.** While a refine runs we show the `BuildProgress` card, a separate
   "Understood" chip row, skeleton rows and a floating status pill above the dock.
3. **The change report repeats itself.** `RefineSummary` lists every before/after pair, then every row
   repeats it ("Changed · +৳12,800", "Was …"). Five changes push the parts list below the fold.
4. **The report hides the consequence.** The refine above put the build ৳2,149 over budget; the card
   only says "Net change +৳151". The red bar is far away in the rail.
5. **Interpretation chips read like debug output.** `Processor "ryzen", "7"`.
6. **Delta colors disagree.** Savings are green, increases are plain white, removals show as green.
7. **Only one level of undo.** After two refines, the first build is gone.
8. **A destructive button sits next to the input.** "Start over" wipes the build, one mis-click from Send.

Research notes (AI UX pattern guides, see links below): refine is a scoped edit, not a regenerate, so the
UI should show *what will change / what changed* and keep undo; keep a version list so a good build
survives an aggressive refine; restoring should not delete newer versions; label each version from the
user's own words.

- https://aiuxplayground.com/pattern/response-refinement
- https://app.uxcel.com/courses/ai-fundamentals-for-ux/safety-nets-undo-430/designing-version-histories-for-ai-generated-content-6573
- https://uxdesign.cc/the-undo-problem-in-ai-products-c90ff080de3b

## Design

### 1. Composer dock (Composer.jsx)
- Dock aligns to the parts column on desktop (same grid as the page: 8 of 12 columns), so it never covers
  the summary rail. Phones keep full width.
- One panel: a context strip (version label + suggestion chips, horizontally scrollable, edge-faded)
  sits *inside* the dock card, above the input. Nothing floats over the page.
- While busy, the strip shows the live status line instead of chips; the floating pill is gone.
- "Start over" leaves the dock. Starting fresh lives in the header as "New build".

### 2. Refine in progress (new `RefineProgress`)
One card replaces BuildProgress + Understood chips for a refine: quotes the user's message, shows how it
was understood (chips) as soon as the server knows, and the step bar. Only the rows being re-picked
skeleton; kept rows dim slightly so the eye goes to what is changing.

### 3. Refine result (RefineSummary.jsx, rewritten)
- Headline: "Changed 5 parts" + net delta + **budget impact** ("now ৳2,149 over budget" in the bad tone,
  or "৳3,000 left").
- The user's message in quotes, then clean interpretation chips.
- Changed parts as compact pills (`Processor +৳12,800`) that scroll to and flash the row. Full
  before/after list behind "Details" (rows already show it).
- Actions: Undo, and when over budget a one-tap "Fit my budget" refine. Dismiss.

### 4. Part rows (PartRow.jsx)
- Changed rows get an accent bar on the left edge instead of a full accent border.
- Delta pill colored by meaning: cost up = warn, cost down = ok.
- "Was" line shows the old price struck through.

### 5. Version history (useBuild.js + new `HistoryCard`)
- Every finished build/refine pushes a version `{id, label, total, at, snapshot}` (label = the user's
  message). Kept in the saved session, capped at 10.
- Rail card "Versions" lists them newest first with total and delta; "Restore" puts that version back
  as a new current state without deleting the others. Undo = restore the previous version.

### 6. Copy and small fixes
- Backend `describePatch`: keywords become one phrase, `"ryzen 7"` instead of `"ryzen", "7"`.
- Over-budget suggestion names the number: "Bring it under ৳90,000".
- Header: "Clear" becomes "New build".

- "Clear" / "New build" can be undone from the toast, since the dock no longer guards it.

### 7. Rest of the site
- Build page heading shows what the build is for (use case + budget) under "Your build".
- Not done yet: hero retailer picker inside the composer toolbar; presets with budget tags.

## Deviations
- The over-budget suggestion stays "Make it cheaper": the engine is tested on that wording, a new
  phrase like "Bring it under ৳90,000" might come back as a clarifying question.
