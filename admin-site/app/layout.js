import './globals.css';

export const metadata = {
  title: 'PinCraft Admin',
  description: 'Owner-only admin dashboard.',
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true, googleBot: { index: false, follow: false, noimageindex: true } },
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
