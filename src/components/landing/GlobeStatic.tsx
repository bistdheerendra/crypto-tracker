/** Lightweight CSS/SVG globe used on small viewports and prefers-reduced-motion. */
export function GlobeStatic({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative h-full w-full flex items-center justify-center ${className}`}
      aria-hidden
    >
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(62,166,255,0.22),rgba(6,18,37,0.95)_55%,rgba(2,8,23,1))] border border-accent/20 shadow-[0_0_60px_rgba(62,166,255,0.12)]" />
      <svg
        viewBox="0 0 400 400"
        className="relative w-[88%] h-[88%] opacity-90"
      >
        <defs>
          <radialGradient id="globeGlow" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#3ea6ff" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#0a1a2e" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#020817" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="150" fill="url(#globeGlow)" stroke="#3ea6ff" strokeOpacity="0.35" strokeWidth="1.2" />
        {/* Latitude lines */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const ry = 150 * Math.cos((lat * Math.PI) / 180);
          return (
            <ellipse
              key={lat}
              cx="200"
              cy={200 - 150 * Math.sin((lat * Math.PI) / 180)}
              rx="150"
              ry={Math.max(8, Math.abs(ry) * 0.35)}
              fill="none"
              stroke="#3ea6ff"
              strokeOpacity="0.18"
              strokeWidth="0.8"
            />
          );
        })}
        {/* Longitude meridians */}
        {[-60, -30, 0, 30, 60].map((lng) => (
          <ellipse
            key={lng}
            cx={200 + lng * 0.55}
            cy="200"
            rx={Math.max(12, 55 - Math.abs(lng) * 0.35)}
            ry="150"
            fill="none"
            stroke="#3ea6ff"
            strokeOpacity="0.16"
            strokeWidth="0.8"
          />
        ))}
        {/* Atmosphere ring */}
        <circle
          cx="200"
          cy="200"
          r="162"
          fill="none"
          stroke="#38a8e8"
          strokeOpacity="0.2"
          strokeWidth="6"
        />
        {/* Static signal dots */}
        <circle cx="265" cy="145" r="4" fill="#2ee6a8" opacity="0.9" />
        <circle cx="150" cy="175" r="3.5" fill="#ff5c72" opacity="0.85" />
        <circle cx="230" cy="240" r="3.5" fill="#f5b94a" opacity="0.85" />
        <circle cx="175" cy="255" r="3" fill="#2ee6a8" opacity="0.75" />
      </svg>
    </div>
  );
}
