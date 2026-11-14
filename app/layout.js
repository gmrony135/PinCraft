import "./globals.css";
import AppProvider from "@/components/providers/AppProvider";

export const metadata = {
  metadataBase: new URL("https://pincraftly.vercel.app"),
  title: {
    default: "PinCraft — Blogger Publishing & Manual Pin Packs",
    template: "%s · PinCraft",
  },
  description:
    "Review your existing articles and Pin artwork, schedule Blogger posts, then download a manual Pinterest pack with the verified article URL.",
  keywords: [
    "Blogger publishing",
    "Pin generator",
    "SEO article writer",
    "Manual Pinterest scheduling",
  ],
  applicationName: "PinCraft",
  openGraph: {
    title: "PinCraft — Blogger Publishing & Manual Pin Packs",
    description:
      "Reviewed Blogger publishing and downloadable manual Pinterest packs. Separate real article receipts from user-reported Pin links.",
    url: "https://pincraftly.vercel.app",
    siteName: "PinCraft",
    type: "website",
    images: ["/brand/pincraft-logo-full-1024.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PinCraft — Blogger Publishing & Manual Pin Packs",
    description:
      "Schedule reviewed Blogger articles. Upload and schedule your Pins yourself inside Pinterest.",
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
