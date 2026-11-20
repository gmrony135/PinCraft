import AdminApp from './AdminApp';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'PinCraft Admin',
  robots: { index: false, follow: false, nocache: true },
};

// Login is Gmail + PIN, checked on the server. No Firebase sign-in runs in the browser.
export default function Page() {
  return <AdminApp />;
}
