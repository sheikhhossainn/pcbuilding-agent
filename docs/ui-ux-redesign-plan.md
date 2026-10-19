# UI/UX redesign plan: a "Mac app" feel

Branch: `feature/ui-ux-redesign`

## Goal

When someone uses BuildMyPC, it should feel like a well-made macOS app. It responds to every input right away. Motion follows physics instead of fixed durations. Surfaces have depth and material. A few sounds confirm the big moments. Nothing gets in the way.

UX comes before decoration. Each animation and sound has to do one of these jobs, or it gets cut:

1. **Confirm**: show the user that their action registered.
2. **Orient**: show where something came from and where it went.
3. **Reward**: mark a finished build or a saving found.

## What the code does today

The base is solid. This is a refinement pass, not a rewrite.

| Area | Current state | Gap |
|---|---|---|
| Stack | React 19, Vite 8, Tailwind 4, framer-motion 12, lucide | Fine. framer-motion is imported in full: no `LazyMotion`, so a bigger bundle. |
| Tokens | `index.css` has dark-only colour tokens and `.card`/`.btn`/`.chip` primitives | No elevation, radius, motion or blur tokens. Radii are ad hoc (`rounded-lg`, `xl`, `2xl`). |
| Motion | Every component has its own `transition={{ duration: 0.18, ease: [0.23,1,0.32,1] }}`. The same curve is copy-pasted in ~15 places. | No shared motion system. Everything is tween-based, with no springs. Dialogs fade and slide but don't scale. Elements don't carry over between screens (hero to builder). |
| Feedback | `.btn:active scale(.97)`, toasts, row flash, `AnimatedPrice` count-up | No sound, no haptics. Only one toast is shown at a time (`useToast` replaces it). A finished build has no "moment". |
| Loading | `BuildProgress` stepper and `animate-pulse` skeletons | Pulse looks cheap next to a shimmer. Parts pop in all at once when the job completes. |
| Surfaces | Opaque `--surface` cards, one shadow token (`--shadow-float`) | No translucency or vibrancy. The header is blurred only on mobile. |
| Navigation | Mouse and touch only | No keyboard shortcuts and no command palette. Mac power users expect ⌘K. |
| Accessibility | Focus rings, `useDialogFocus`, global `prefers-reduced-motion` kill-switch | The kill-switch also removes useful feedback such as opacity fades. It should fall back to cross-fades instead. |
| Theme | Dark only | macOS users expect it to follow the system theme. |

Files that matter most: `src/index.css`, `Builder.jsx`, `Composer.jsx`, `Hero.jsx`, `PartRow.jsx`, `BuildList.jsx`, `BuildProgress.jsx`, `SwapDrawer.jsx`, `CrossCheckDialog.jsx`, `SettingsDialog.jsx`, `Toast.jsx`/`useToast.js`, `Header.jsx`, `summary/*`.

## Design principles (the "Mac feel" checklist)

- **Springs, not durations.** Interactive motion uses springs, so it can be interrupted and keeps its momentum. Tweens are only for colour and opacity.
- **Fast in, faster out.** Entrances take 200–350 ms and exits 120–200 ms. Nothing blocks input while it animates.
- **Animate from the origin.** A dialog grows out of the button that opened it. The swap drawer grows out of its row. The composer morphs from the hero into the dock.
- **Material and depth.** Translucent "vibrancy" surfaces (blur plus saturation) for the header, dock, menus and sheets. There are three elevation levels, and the shadow grows with height.
- **Quiet by default.** At most 6 sounds, short (<150 ms), soft and synthesized. They never play on page load, and the user can mute them in one click.
- **Only `transform` and `opacity` animate.** Never animate layout properties. The target is 60 fps on a mid-range Android phone.
- **Reduced motion is still motion.** When the user asks for less motion, slides and scales become cross-fades. Feedback doesn't disappear.

## Phases

Each phase can be shipped and reviewed on its own. Merge them in order.

### Phase 0: Foundations (no visible change)

1. **`src/lib/motion.js`**: one place for motion tokens.
   ```js
   export const spring = {
     snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }, // buttons, chips, menus
     smooth: { type: 'spring', stiffness: 320, damping: 34 },            // cards, rows, sheets
     gentle: { type: 'spring', stiffness: 180, damping: 26 },            // hero, big reveals
   };
   export const ease = { out: [0.23, 1, 0.32, 1], inOut: [0.65, 0, 0.35, 1] };
   export const fade = { duration: 0.16, ease: ease.out };
   // Presets: fadeUp, popIn (scale .96→1), sheet (y 100%→0), dialog (scale .94 + origin)
   ```
   Replace every inline `transition={{...}}` with these presets. That is about 15 sites; grep `ease: [0.23`.
2. **`LazyMotion` + `m`** in `main.jsx` with `domAnimation` (`domMax` only if `layoutId` needs it). This cuts the framer bundle by about 60%.
3. **Design tokens** in `index.css`:
   - Radius scale: `--r-sm 8px`, `--r-md 12px`, `--r-lg 16px`, `--r-xl 22px`. Map it into `@theme`.
   - Elevation: `--elev-1` (cards: hairline plus a 1 px soft shadow), `--elev-2` (popovers), `--elev-3` (dialogs and sheets). Use layered shadows: one tight, one wide.
   - Material: `.material` = `background: color-mix(in oklab, var(--surface) 72%, transparent); backdrop-filter: blur(20px) saturate(180%)`. Fall back to opaque when `backdrop-filter` isn't supported, or when the user sets `prefers-reduced-transparency`.
   - Inner highlight: `inset 0 1px 0 rgba(255,255,255,.04)` on raised surfaces, the macOS "top edge light".
4. **`useReducedMotion` policy**: change the global CSS kill-switch so it only collapses *movement*. Opacity fades still play at about 120 ms. Framer presets read `useReducedMotion()` and swap to `fade`.

### Phase 1: Feedback layer (sound and haptics)

1. **`src/lib/sound.js`**: a tiny Web Audio engine. It has **no audio files**, so no network cost and nothing to license.
   - Create the `AudioContext` lazily, on the first user gesture, so autoplay rules are respected.
   - Each sound is synthesized (sine or triangle with a short envelope) and lasts <150 ms, with a peak gain around 0.08.
   - The sound set:
     | Event | Sound |
     |---|---|
     | Build complete | two-note rising "ding" (Mac "Glass"-like) |
     | Part swapped / store switched | soft "tick-pop" |
     | Copied / link shared | short "tink" |
     | Remove part / undo | low muted "thock" |
     | Error / can't build | two-note falling, quieter |
     | Saving found in Compare stores | bright rising triad |
   - Throttle: one sound per 80 ms at most, and none while the tab is hidden.
2. **Haptics**: `navigator.vibrate(8)` for confirmations and `[10,40,10]` for errors. Android only, and it fails silently elsewhere.
3. **`useFeedback()` hook**: `feedback('success' | 'swap' | 'copy' | 'remove' | 'error' | 'reward')` plays the sound and the haptic, and respects the settings.
4. **Settings**: add `sound: on|off` and `haptics: on|off` to `useSettings` (localStorage). Put a speaker toggle in the header and a "Sound & haptics" section in `SettingsDialog`. **Default: sound on at low volume, played only after the first interaction.** (Decision to confirm. The alternative is default off, with a one-time hint.)
5. Wire it into `useBuild` (job completed or failed), swap, remove, undo, share/copy, and cross-check adopt/best price.
6. Tests: `sound.test.js` covers the throttle, the mute and the "no context before a gesture" rule, with a fake `AudioContext`.

### Phase 2: Surfaces and visual polish

1. **Header**: a floating `.material` island at every width. Its shadow grows when the page scrolls (an `IntersectionObserver` sentinel, so no scroll listener).
2. **Cards**: switch to `--elev-1`, the inner highlight and `--r-lg`. On hover (pointer: fine only), a 1 px lift plus a brighter border, using a spring.
3. **Buttons**:
   - The press is a spring scale (`whileTap={{ scale: 0.96 }}`) instead of the CSS transition, so a fast double-tap feels right.
   - The primary button gets a subtle gradient and inner highlight.
   - Focus rings get a soft glow (`box-shadow` ring) instead of a hard outline.
4. **Typography**: tighten heading tracking (`-0.02em`), use optical sizes (Inter `opsz` through the variable font) and a modular scale. Prices stay in tabular numerals, and the total uses a larger display weight.
5. **Skeletons**: replace `animate-pulse` with a moving shimmer gradient (CSS `background-position`, GPU-cheap).
6. **Iconography**: one consistent stroke (1.75) and size scale (14/16/18/20). Add an `Icon` wrapper so these stop varying per file.
7. **Light theme (follows the system)**: add `:root[data-theme=light]` tokens and `prefers-color-scheme`, with a toggle in settings (System / Light / Dark). The current dark theme stays the default.

### Phase 3: Signature motion moments

These are the moments users remember.

1. **Hero to builder morph.** The hero composer (`Composer variant="hero"`) and the dock composer share `layoutId="composer"`. When the first build starts, the prompt box glides and shrinks into the bottom dock while the part list fades in behind it. Hero text and presets exit with a fast stagger. *(Files: `Hero.jsx`, `Composer.jsx`, `Builder.jsx`; needs `domMax`.)*
2. **Build assembly.** When a job completes, rows enter in category order (core first) with a 40 ms stagger and a `smooth` spring (y 12 to 0, scale .98 to 1). Each row's price ticks in. The total `AnimatedPrice` counts up in step, and the budget bar fills with a spring. Then the "build complete" sound plays. The whole sequence takes ≤900 ms and can be skipped: any input finishes it instantly.
3. **Progress that feels alive.**
   - The stepper bar fills continuously inside each stage, using a time-based estimate that eases toward 90%.
   - Each finished step gets a check-mark draw-in (SVG `pathLength`).
   - The status line cross-fades between messages instead of snapping.
4. **Refine diff.** Changed rows do a brief "flip" (old name slides up and out, new name slides in). The price delta chip pops. Removed rows already strike through, so keep that and move it onto spring timing.
5. **Swap from origin.** The drawer opens from the row it belongs to. On desktop the row's image has a `layoutId` and flies into the drawer header. When the user picks an item, its card flies back into the row.
6. **Dialogs as macOS sheets.**
   - Desktop: scale from .94 with `transform-origin` set to the trigger button's position, and the backdrop blurs in.
   - Phone: a bottom sheet with **drag-to-dismiss** (`drag="y"`, `dragConstraints`, velocity threshold) and a rubber-band at the top.
   - Applies to the Settings, CrossCheck and Swap dialogs.
7. **Compare stores reveal.** Each store column fills in as its result arrives (this already streams through `progress`). The "Best price" chip lands with a `snappy` spring, and the saving counts up, with the reward sound when the saving is greater than 0.
8. **Toasts as a stack.** `useToast` keeps a queue of up to 3, stacked like macOS notifications: newer on top, older scaled to .95 and dimmed. Swipe to dismiss. Undo actions stay.

### Phase 4: Interaction UX (power and comfort)

1. **Command palette (⌘K / Ctrl+K)**: `CommandPalette.jsx`.
   - Actions: New build, Compare stores, Share, Copy spec, Export, Switch store → X, Swap <category>, Undo, Settings, Toggle sound.
   - Fuzzy search, keyboard navigation, and a spring pop from the centre.
   - On mobile, a "⌘" button in the header menu.
2. **Shortcuts**:
   - `/` focuses the composer.
   - `⌘Z` undoes, using the existing `undoRefine` and versions.
   - `⌘⇧C` opens Compare stores. `Esc` closes the topmost layer.
   - The palette shows each shortcut as a `kbd` chip. A `?` sheet lists them all.
3. **Optimistic actions**: remove and swap update at once with an Undo toast, so there's no waiting state. Swap already returns quickly, so drop the drawer's close delay.
4. **Smarter empty states**: animated illustration lines (SVG trace like `AmbientBackground`) and one clear next action.
5. **Scroll polish**: scroll-linked header shrink, `scroll-margin` on rows (already in place), and a "jump to total" pill on mobile that springs in after scrolling past the rail.
6. **Hover intent**: preview part specs in a popover after hovering for 400 ms (desktop only), using the existing `getSpecChips`.

### Phase 5: Performance, accessibility and verification

1. **Budgets**:
   - Main JS ≤ +15 KB gzip over the current size (sound and palette are small, and LazyMotion offsets them).
   - INP < 200 ms. CLS 0 during the build reveal, because rows reserve their height.
   - 60 fps during the reveal on a CPU throttled 4× (Chrome performance panel).
2. **Accessibility**:
   - Every animation has a reduced-motion path.
   - Sounds are never the only signal (aria-live text stays).
   - The palette is a `role="dialog"` combobox with `aria-activedescendant`.
   - Drag-to-dismiss sheets keep a close button.
3. **Checks per phase**:
   - `npm run lint`, `npm test`, `npm run build`.
   - Manual check in the browser preview at 375 px and 1440 px.
   - Before/after screen recordings of the hero morph, build reveal, swap and compare.
4. **Prerender and SEO**: the hero morph must not change the prerendered markup (`scripts/prerender.mjs`). Check that `SeoContent` still renders without JavaScript.

## New and changed files

New:
- `src/lib/motion.js`
- `src/lib/sound.js` (+ test)
- `src/hooks/useFeedback.js`
- `src/hooks/useShortcuts.js`
- `src/components/CommandPalette.jsx`
- `src/components/Sheet.jsx` (shared dialog/sheet shell with drag-to-dismiss, used by Settings, Swap and CrossCheck)
- `src/components/ToastStack.jsx`

Changed:
- `index.css` (tokens, material, shimmer, light theme)
- `main.jsx` (LazyMotion)
- `useSettings.js` (sound, haptics, theme)
- `useToast.js` (queue)
- `useBuild.js` (feedback hooks)
- Every component with inline transitions (they move to presets)
- `Composer.jsx`, `Hero.jsx` and `Builder.jsx` (morph)
- `PartRow.jsx` and `BuildList.jsx` (assembly, flip)
- `BuildProgress.jsx`
- `SwapDrawer.jsx`, `CrossCheckDialog.jsx`, `SettingsDialog.jsx` (moved onto `Sheet`)
- `Header.jsx` (material, sound toggle, palette entry)

No backend changes.

## Order and size

| Phase | Size | Ship as |
|---|---|---|
| 0 Foundations | S | 1 PR, no visual diff except slightly springier motion |
| 1 Sound + haptics | S | 1 PR |
| 2 Surfaces | M | 1 PR (light theme can be split out) |
| 3 Signature moments | L | 2 PRs: (morph + assembly + progress), then (sheets + swap origin + compare + toasts) |
| 4 Interaction UX | M | 1 PR |
| 5 Verification | runs across all phases | final perf/a11y pass before merging to `dev` |

## Open decisions

1. **Sound default**: on (quiet) or off with a hint? The recommendation is on, quiet, and only after the first click.
2. **Light theme**: this time, or later? The recommendation is to include it in Phase 2, since it's cheap once the tokens exist.
3. **Command palette scope**: actions only, or also a search over parts in the DB? The recommendation is actions only for now.
