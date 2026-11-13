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
    icon: "/icon.svg",
  },
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
