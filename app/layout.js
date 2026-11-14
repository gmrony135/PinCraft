import "./globals.css";
import AppProvider from "@/components/providers/AppProvider";

export const metadata = {
  metadataBase: new URL("https://pincraftly.vercel.app"),
  title: {
    default: "PinCraft — Your Pinterest Automation Machine",
    template: "%s · PinCraft",
  },
  description:
    "Connect your own Pinterest and Blogger accounts, choose content categories and 1–6 daily Pins, and manage real scheduled publishing in one private workspace.",
  keywords: [
    "Pinterest automation",
    "viral pin generator",
    "SEO article writer",
    "Pinterest traffic Bangladesh",
  ],
  applicationName: "PinCraft",
  openGraph: {
    title: "PinCraft — Your Pinterest Automation Machine",
    description:
      "Your own Pinterest and Blogger accounts, categories, schedules and confirmed publication history in one workspace.",
    url: "https://pincraftly.vercel.app",
    siteName: "PinCraft",
    type: "website",
    images: ["/brand/pincraft-logo-full-1024.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PinCraft — Your Pinterest Automation Machine",
    description:
      "Connect accounts, choose categories and build a controlled Pinterest and Blogger publishing schedule.",
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
