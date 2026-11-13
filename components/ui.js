"use client";

// PinCraft design system components (mobile-app first)

export function Logo({ size = "md", showCraft = true, onClick, variant = "color" }) {
  const dims = {
    sm: { mark: 26, text: "text-lg", gap: "gap-2" },
    md: { mark: 32, text: "text-[22px]", gap: "gap-2.5" },
    lg: { mark: 44, text: "text-[28px]", gap: "gap-3" },
  }[size];

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center ${dims.gap} ${onClick ? "tap" : "cursor-default"}`}
      aria-label="PinCraft home"
    >
      <BrandMark size={dims.mark} variant={variant} />
      <span
        className={`font-extrabold tracking-tight ${
          variant === "white" ? "text-white" : "text-neutral-900"
        } ${dims.text}`}
      >
        Pin<span className={variant === "white" ? "text-white" : "text-pin-600"}>Craft</span>
      </span>
    </button>
  );
}

/** Official PinCraft brand mark (pin + pencil). */
export function BrandMark({ size = 32, variant = "color", className = "" }) {
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

/** Red rounded app icon (used on coloured surfaces). */
export function AppIcon({ size = 56, radius = 18, className = "" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/pincraft-icon.png"
      alt="PinCraft app icon"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    />
  );
}

// Legacy inline SVG helpers kept for compatibility (PinIcon used in Pinterest screen)
export function PinIcon({ size = 32, className = "" }) {
  return <BrandMark size={size} className={className} />;
}

export function PencilIcon({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4 20 L4.8 16.2 L16.6 4.4 A2.2 2.2 0 0 1 19.7 7.5 L7.9 19.3 Z"
        fill="#E60023"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M15.2 5.9 L18.2 8.9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BackHeader({ title, subtitle, onBack, right }) {
  return (
    <header className="sticky top-0 z-30 -mx-5 mb-5 border-b border-neutral-100 bg-white/90 px-5 pb-3.5 pt-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Go back"
          className="tap grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 active:bg-neutral-200"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold text-neutral-900">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-neutral-500">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}

export function BottomNav({ items, active, onChange }) {
  return (
    <nav className="sticky bottom-0 z-30 -mx-5 mt-8 border-t border-neutral-100 bg-white/95 px-2 pb-safe pt-2 backdrop-blur-xl">
      <div className="flex items-end justify-around">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className={`tap flex min-w-[62px] flex-col items-center gap-1 rounded-2xl px-2 py-1.5 ${
                isActive ? "text-pin-600" : "text-neutral-400"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10.5px] font-semibold tracking-tight">
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-[17px] font-bold tracking-tight text-neutral-900">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Toast({ show, message, tone = "success" }) {
  if (!show) return null;
  const tones = {
    success: "bg-neutral-900 text-white",
    error: "bg-pin-600 text-white",
    info: "bg-blue-600 text-white",
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-5">
      <div
        className={`animate-pop-in flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg ${tones[tone]}`}
      >
        {message}
      </div>
    </div>
  );
}

export function Spinner({ size = 18, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        opacity=".25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CopyButton({ text, label = "Copy", className = "" }) {
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {}
      }}
      className={`chip bg-neutral-100 text-neutral-600 active:bg-neutral-200 ${className}`}
      type="button"
    >
      {label}
    </button>
  );
}
