import { useEffect } from 'react';
import { m, animate, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { formatPrice } from '../lib/format';
import { ease } from '../lib/motion';

// Counts to the new value over 400ms so a changed total reads as a change.
export default function AnimatedPrice({ value, className = '' }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, (v) => formatPrice(Math.round(v)));

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return undefined;
    }
    const controls = animate(motionValue, value, { duration: 0.45, ease: ease.out });
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);

  return <m.span className={className}>{text}</m.span>;
}
