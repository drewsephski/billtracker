"use client";

import { motion, useReducedMotion } from "framer-motion";

/** A short entrance, never a looping distraction. Server content stays visible. */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 1, y: 0 }}
      animate={reduced ? {} : { y: [8, 0], opacity: [0.7, 1] }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
