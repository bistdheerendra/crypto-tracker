"use client";

import Link from "next/link";
import { useId } from "react";

type BrandLogoSize = "sm" | "md" | "lg";
type BrandLogoVariant = "horizontal" | "stacked";

interface BrandLogoProps {
  size?: BrandLogoSize;
  variant?: BrandLogoVariant;
  href?: string;
  className?: string;
  showMark?: boolean;
  onClick?: () => void;
}

const SIZE = {
  sm: { mark: 28, title: "text-[13px] leading-tight", tag: "text-[9px] tracking-[0.22em]" },
  md: { mark: 34, title: "text-base sm:text-lg leading-tight", tag: "text-[10px] tracking-[0.28em]" },
  lg: { mark: 42, title: "text-xl leading-tight", tag: "text-xs tracking-[0.32em]" },
} as const;

function LogoMark({ size, gradId }: { size: number; gradId: string }) {
  return (
    <div
      className="relative shrink-0 rounded-[10px] p-[1px] bg-gradient-to-br from-accent/80 via-accent/30 to-bull/50 shadow-[0_0_20px_rgba(62,166,255,0.25)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div className="w-full h-full rounded-[9px] bg-bg-secondary/95 flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 32 32" className="w-[68%] h-[68%]" fill="none">
          <defs>
            <linearGradient id={gradId} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3ea6ff" />
              <stop offset="1" stopColor="#2ee6a8" />
            </linearGradient>
          </defs>
          <path
            d="M5 24C10 18 14 16 16 16C18 16 22 18 27 24"
            stroke={`url(#${gradId})`}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M7 19C11 15 14 13.5 16 13.5C18 13.5 21 15 25 19"
            stroke={`url(#${gradId})`}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.75"
          />
          <path
            d="M9 14.5C12 12 14 11 16 11C18 11 20 12 23 14.5"
            stroke={`url(#${gradId})`}
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity="0.5"
          />
          <circle cx="16" cy="16" r="2.25" fill={`url(#${gradId})`} />
          <circle cx="16" cy="16" r="5" stroke="#3ea6ff" strokeOpacity="0.25" strokeWidth="0.75" />
        </svg>
      </div>
    </div>
  );
}

function Wordmark({ size, variant }: { size: BrandLogoSize; variant: BrandLogoVariant }) {
  const { title, tag } = SIZE[size];

  if (variant === "stacked") {
    return (
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className={`font-semibold tracking-tight text-text-primary ${title}`}>Dheerendra</span>
        <span
          className={`font-bold uppercase bg-gradient-to-r from-accent via-accent to-bull bg-clip-text text-transparent ${tag}`}
        >
          Intelligence
        </span>
      </span>
    );
  }

  return (
    <span className={`font-semibold tracking-tight min-w-0 ${title}`}>
      <span className="text-text-primary">Dheerendra</span>{" "}
      <span className="bg-gradient-to-r from-accent to-bull bg-clip-text text-transparent">Intelligence</span>
    </span>
  );
}

export function BrandLogo({
  size = "md",
  variant = "horizontal",
  href,
  className = "",
  showMark = true,
  onClick,
}: BrandLogoProps) {
  const gradId = useId().replace(/:/g, "");
  const { mark } = SIZE[size];

  const content = (
    <span
      className={`inline-flex items-center gap-2.5 group transition-opacity hover:opacity-90 ${className}`}
    >
      {showMark && (
        <span className="transition-transform duration-300 group-hover:scale-[1.03]">
          <LogoMark size={mark} gradId={gradId} />
        </span>
      )}
      <Wordmark size={size} variant={variant} />
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex" onClick={onClick}>
        {content}
      </Link>
    );
  }

  return content;
}
