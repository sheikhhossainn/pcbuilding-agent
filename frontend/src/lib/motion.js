/**
 * Motion tokens. Every animation in the app picks from here so the whole UI moves the same way.
 *
 * Movement (x, y, scale) uses springs: they can be interrupted mid-flight and keep momentum,
 * which is what makes motion feel physical instead of scripted. Opacity and colour use short
 * tweens, since a spring on opacity only reads as lag. Exits are faster than entrances.
 *
 * Reduced motion: <MotionConfig reducedMotion="user"> in main.jsx drops transform animations
 * for users who ask for it, so these presets fall back to plain cross-fades on their own.
 */

export const ease = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.65, 0, 0.35, 1],
};

export const spring = {
  /** Buttons, chips, menus: quick, no visible overshoot. */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  /** Cards, rows, sheets. */
  smooth: { type: 'spring', stiffness: 320, damping: 34 },
  /** Hero and big reveals: a touch of float. */
  gentle: { type: 'spring', stiffness: 180, damping: 26 },
};

export const tween = {
  exit: { duration: 0.12, ease: ease.out },
  fast: { duration: 0.15, ease: ease.out },
  base: { duration: 0.2, ease: ease.out },
  slow: { duration: 0.35, ease: ease.out },
};

/** A spring for movement with a tween for opacity. */
const moving = (s, opacity = tween.fast) => ({ ...s, opacity });

/** Dim layer behind dialogs and sheets. */
export const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: tween.exit },
  transition: tween.fast,
};

/** Content entering in place (cards, banners). `y` > 0 rises up, < 0 drops down. */
export const fadeIn = (y = 6, s = spring.smooth) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: y > 0 ? -y : y, transition: tween.exit },
  transition: moving(s),
});

/** Popovers and dropdowns opening from their trigger above them. */
export const menu = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: tween.exit },
  transition: moving(spring.snappy, { duration: 0.1 }),
};

/** Centered modal dialog. */
export const dialog = {
  initial: { opacity: 0, scale: 0.95, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: tween.exit },
  transition: moving(spring.smooth),
};

/** Sheet sliding in from an edge: bottom on phones, `side` on wider screens. */
export const sheet = (isNarrow, side = 'right') => {
  const hidden = isNarrow ? { y: '100%' } : { x: side === 'right' ? '100%' : '-100%' };
  return {
    initial: hidden,
    animate: { x: 0, y: 0 },
    exit: { ...hidden, transition: { duration: 0.2, ease: ease.inOut } },
    transition: spring.smooth,
  };
};

/** Height reveal for expandable panels. */
export const collapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0, transition: tween.fast },
  transition: { height: spring.smooth, opacity: tween.base },
};

/** Delay for the `index`-th item of a list, capped so long lists don't drag. */
export const stagger = (index, step = 0.03, max = 8) => Math.min(index, max) * step;
