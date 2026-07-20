import React from "react";
import { motion } from "framer-motion";

interface LanguageAnimationWrapperProps {
  children: React.ReactNode;
}

/**
 * LIGHTWEIGHT Language wrapper
 * - Removed expensive blur/glow background
 * - Removed key={language} that forced full re-render on language switch
 * - Simple opacity transition
 */
const LanguageAnimationWrapper: React.FC<LanguageAnimationWrapperProps> = ({
  children,
}) => {
  return (
    <div style={{ position: "relative" }}>
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{ position: "relative", zIndex: 1 }}
        >
            {children}
        </motion.div>
    </div>
  );
};

export default LanguageAnimationWrapper;
