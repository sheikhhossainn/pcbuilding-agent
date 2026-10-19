import { useEffect, useRef } from 'react';
import { m, animate, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { formatPrice } from '../lib/format';
import { ease } from '../lib/motion';

/**
 * Counts to the new value so a changed price reads as a change.
 * `from` sets where it counts up from when it first appears (e.g. 0 as a build assembles);
 * by default it starts at the value itself and only animates later changes.
 */
export default function AnimatedPrice({ value, from, delay = 0, className = '' }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(reduceMotion || from === undefined ? value : from);
  const text = useTransform(motionValue, (v) => formatPrice(Math.round(v)));
  const firstRun = useRef(true);

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return undefined;
    }
    // `delay` only shapes the first count (a row arriving); later changes start at once.
    const wait = firstRun.current ? delay : 0;
    firstRun.current = false;
    const controls = animate(motionValue, value, { duration: 0.55, ease: ease.out, delay: wait });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion, motionValue]);

  return <m.span className={className}>{text}</m.span>;
}
