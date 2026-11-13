import "./globals.css";
import AppProvider from "@/components/providers/AppProvider";

export const metadata = {
  metadataBase: new URL("https://pincraftly.vercel.app"),
  title: {
    default: "PinCraft — Your Pinterest Automation Machine",
    template: "%s · PinCraft",
  },
  description:
    "Create pin titles and SEO article drafts, save your content, and explore the PinCraft automation workspace. Live posting and Google Login require configuration.",
  keywords: [
    "Pinterest automation",
    "viral pin generator",
    "SEO article writer",
    "Adsterra income",
    "Pinterest traffic Bangladesh",
  ],
  applicationName: "PinCraft",
  openGraph: {
    title: "PinCraft — Your Pinterest Automation Machine",
    description:
      "A simple workspace for Pinterest pin ideas, SEO articles, and automation planning. Try the free content tools.",
    url: "https://pincraftly.vercel.app",
    siteName: "PinCraft",
    type: "website",
    images: ["/brand/pincraft-logo-full-1024.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PinCraft — Your Pinterest Automation Machine",
    description:
      "Create pin ideas and SEO articles. Explore your library and the automation UI preview.",
    images: ["/brand/pincraft-logo-full-1024.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PinCraft",
  },
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/pincraft-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/brand/favicon-32.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e60023",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
