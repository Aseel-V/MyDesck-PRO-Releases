import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Because #root has "height: 100vh; overflow: auto", the window doesn't scroll.
    // The #root element scrolls.
    const root = document.getElementById('root');
    if (root) {
      root.scrollTo(0, 0);
    }
    // Also try window just in case layout changes
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
