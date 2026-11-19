import PageShell from '@/components/PageShell';
import HowToWorkSection from '@/components/onboarding/HowToWorkSection';
export const metadata = {
  title: 'How to Work',
  description: 'Watch the PinCraft tutorial video to learn how to use the PinCraft workspace.',
  alternates: { canonical: '/how-to-work' },
};
export default function Page() {
  return <PageShell><HowToWorkSection /></PageShell>;
}
