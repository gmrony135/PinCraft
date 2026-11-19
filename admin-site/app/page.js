import AdminApp from './AdminApp';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'PinCraft Admin',
  robots: { index: false, follow: false, nocache: true },
};

// Public Firebase Web identifiers only. No Admin credentials reach the browser.
export default function Page() {
  const firebase = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  };
  return <AdminApp firebase={firebase} />;
}
