import { Link } from "react-router-dom";
import logoSet from "@/assets/logo-set.jpg";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "default" | "inverted";
  size?: "sm" | "md" | "lg" | "xl";
  /** Kept for backwards compatibility — the image already contains the wordmark, so this is ignored by default. */
  showWordmark?: boolean;
  /** Kept for backwards compatibility — same reason as showWordmark. */
  sublabel?: string;
  asLink?: boolean;
  to?: string;
  className?: string;
}

// The logo asset (logo-set.jpg) already contains the full lockup
// (symbol + "Set Training App" wordmark) on a white background.
// We size by height and let aspect-ratio drive width.
const heightMap = {
  sm: "h-6",
  md: "h-9",
  lg: "h-14",
  xl: "h-20",
};

export function Logo({
  variant = "default",
  size = "md",
  asLink = false,
  to = "/",
  className,
}: LogoProps) {
  const inverted = variant === "inverted";

  const img = (
    <img
      src={logoSet}
      alt="Set Training App"
      className={cn(
        heightMap[size],
        "w-auto object-contain select-none",
        // White JPG background: multiply removes the white on light surfaces;
        // invert + screen produces a white-on-dark mark for the Ink footer.
        inverted ? "invert mix-blend-screen" : "mix-blend-multiply",
        className
      )}
      draggable={false}
    />
  );

  return asLink ? (
    <Link to={to} aria-label="Set Training App" className="inline-flex items-center">
      {img}
    </Link>
  ) : (
    img
  );
}
