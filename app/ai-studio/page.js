import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AIStudio from '@/components/ai/AIStudio';
export const metadata = { title: 'AI Studio', description: 'Create Pinterest and blog artwork, SEO keyword clusters, hashtags, seven-day content plans and editorial reviews with verified server-side AI and automatic fallback.', alternates: { canonical: '/ai-studio' } };
export default function AIStudioPage() { return <><Navbar /><main className="min-h-[70vh] bg-[#fafafa]"><AIStudio /></main><Footer /></>; }
