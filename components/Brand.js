import Link from "next/link";

/** Official PinCraft brand mark (red pin + pencil). */
export function BrandMark({ size = 34, variant = "color", className = "" }) {
  const src =
    variant === "white"
      ? "/brand/pincraft-mark-white.png"
      : "/brand/pincraft-mark-red.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="PinCraft logo"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Logo({ size = 34, className = "", href = "/" }) {
  return (
    <Link
      href={href}
      aria-label="PinCraft home"
      className={`inline-flex items-center gap-2.5 py-1 ${className}`}
    >
      <BrandMark size={size} />
      <span className="text-[21px] font-extrabold tracking-[-0.02em] text-neutral-900">
        Pin<span className="text-brand-600">Craft</span>
      </span>
    </Link>
  );
}
