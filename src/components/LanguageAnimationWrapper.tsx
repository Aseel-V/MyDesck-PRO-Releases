import React from "react";

interface LanguageAnimationWrapperProps {
  children: React.ReactNode;
}

/**
 * LIGHTWEIGHT Language wrapper
 * - Removed expensive blur/glow background
 * - Removed key={language} that forced full re-render on language switch
 * - Simple opacity transition
 *
 * The fade is CSS rather than framer-motion, and that is the point rather than a preference.
 *
 * This wraps whole public pages — the landing page, safety and support, the solution pages — so
 * whatever it renders at is what the user sees. framer-motion's `initial={{ opacity: 0 }}` made the
 * page invisible until an animation frame ran, and Electron creates its window with `show: false`,
 * so the renderer produced no frames while React mounted. requestAnimationFrame never fired, the
 * animation never started, and the page sat at opacity 0 permanently: a complete DOM nobody could
 * see, which is exactly what a white window looks like.
 *
 * Moving it to CSS was not enough on its own: a CSS animation holds its first keyframe just the
 * same when no frames are being produced, so `from { opacity: 0 }` stranded the page exactly as
 * framer-motion had. The entrance therefore moves the content rather than hiding it. If the
 * animation never runs, the content is still on screen and merely un-animated. The animation can
 * fail; the page cannot disappear with it.
 */
const LanguageAnimationWrapper: React.FC<LanguageAnimationWrapperProps> = ({
  children,
}) => {
  return (
    <div style={{ position: "relative" }}>
        <div className="page-fade-in" style={{ position: "relative", zIndex: 1 }}>
            {children}
        </div>
    </div>
  );
};

export default LanguageAnimationWrapper;
