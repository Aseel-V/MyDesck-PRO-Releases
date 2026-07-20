import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PartyPopper } from 'lucide-react';


export default function NewYearOverlay() {

  const [show, setShow] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const today = new Date();
    // Check if today is Jan 1st
    // Month is 0-indexed (0 = Jan)
    const isJan1st = today.getMonth() === 0 && today.getDate() === 1;

    if (isJan1st) {
      const currentYear = today.getFullYear();
      setYear(currentYear);
      const seenKey = `seen_newyear_${currentYear}`;
      const hasSeen = localStorage.getItem(seenKey);

      if (!hasSeen) {
        setShow(true);
        // Mark as seen so it doesn't show again this year
        localStorage.setItem(seenKey, 'true');
      }
    }
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setShow(false)}
        >
          <motion.div
            initial={{ scale: 0.5, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.5, y: 50 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl shadow-sky-500/20"
          >
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            </div>

            <div className="relative p-8 text-center space-y-6">
              <motion.div
                initial={{ rotate: -15, scale: 0.8 }}
                animate={{ rotate: 15, scale: 1.1 }}
                transition={{
                  repeat: Infinity,
                  repeatType: "reverse",
                  duration: 0.8
                }}
                className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-sky-400 to-emerald-400 rounded-full shadow-lg shadow-sky-500/30"
              >
                <PartyPopper size={40} className="text-white" />
              </motion.div>

              <div>
                <motion.h2
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-sky-300 via-white to-emerald-300"
                >
                  Happy New Year {year}!
                </motion.h2>
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-3 text-slate-300"
                >
                  Wishing you a prosperous and successful year ahead with MyDesck PRO.
                </motion.p>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShow(false)}
                className="w-full py-3 px-4 bg-white text-slate-900 font-bold rounded-xl shadow-lg hover:shadow-xl hover:shadow-white/20 transition-all"
              >
                Let's Start!
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
