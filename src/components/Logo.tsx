interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Logo({ className = '', size = 'md' }: LogoProps) {
  // Size mapping
  const dimensions: Record<NonNullable<LogoProps['size']>, string> = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-28 h-28',
  };

  return (
    <div
      className={`
        relative inline-flex items-center justify-center
        ${dimensions[size]} ${className}
      `}
    >
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500/30 via-fuchsia-500/25 to-sky-400/30 blur-xl" />

      {/* Inner glass badge */}
      <div className="relative flex items-center justify-center w-full h-full rounded-2xl bg-slate-950/95 border border-slate-700/80 shadow-[0_12px_35px_rgba(15,23,42,0.9)] overflow-hidden">
        {/* soft highlight */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.22),transparent_55%)] opacity-80" />

        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 w-[72%] h-[72%] drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]"
        >
          <defs>
            <linearGradient
              id="logoGradient"
              x1="2"
              y1="2"
              x2="22"
              y2="22"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#38bdf8" /> {/* sky-400 */}
              <stop offset="50%" stopColor="#6366f1" /> {/* indigo-500 */}
              <stop offset="100%" stopColor="#c084fc" /> {/* fuchsia-400 */}
            </linearGradient>
          </defs>

          {/* Abstract briefcase / screen shape */}
          <path
            d="M4 7C4 5.89543 4.89543 5 6 5H18C19.1046 5 20 5.89543 20 7V17C20 18.1046 19.1046 19 18 19H6C4.89543 19 4 18.1046 4 17V7Z"
            stroke="url(#logoGradient)"
            strokeWidth="2"
            className="animate-[pulse_3s_ease-in-out_infinite]"
          />

          {/* Inner graph / M shape */}
          <path
            d="M7 12L10.5 15L13.5 11L17 14"
            stroke="url(#logoGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Location dot */}
          <circle
            cx="17"
            cy="9"
            r="1.5"
            fill="#34d399"
            className="animate-bounce"
            style={{ animationDuration: '3s' }}
          />
        </svg>
      </div>
    </div>
  );
}
