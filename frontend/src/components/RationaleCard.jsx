import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function RationaleCard({ explanation }) {
  if (!explanation) return null;

  return (
    <motion.section
      aria-label="Why these parts"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5 sm:p-6 border-l-4 border-l-accent"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="text-accent" size={18} aria-hidden="true" />
        <h3 className="text-base font-semibold text-fg tracking-tight">Why these parts</h3>
      </div>
      <p className="text-fg-2 text-sm leading-relaxed whitespace-pre-line">{explanation}</p>
    </motion.section>
  );
}
