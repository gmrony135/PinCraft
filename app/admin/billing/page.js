import PageShell from '@/components/PageShell';
import BillingAdmin from '@/components/workspace/BillingAdmin';

export const metadata = {
  title: 'Payment review',
  description: 'Owner-only payment review.',
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return <PageShell><BillingAdmin /></PageShell>;
}
