import "./globals.css";

export const metadata = {
  title: "PinCraft — Crafted Pins, Daily Traffic",
  description:
    "Pinterest + Blog Automation in 1 Click. Choose a category, AI crafts pins and blog posts daily. You just relax.",
  applicationName: "PinCraft",
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
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#e60023",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-white">{children}</body>
    </html>
  );
}
