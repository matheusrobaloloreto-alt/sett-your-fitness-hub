import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Wraps <Routes> at the app root so every route — including public pages
 * (Landing, Auth, PublicRegistration, etc.) and pages that don't use AppLayout —
 * gets the same fade+slide transition.
 */
export function AnimatedRoutesWrapper({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}

