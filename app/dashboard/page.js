import PageShell from '@/components/PageShell';
import WorkspaceDashboard from '@/components/workspace/WorkspaceDashboard';
import HowToWorkSection from '@/components/onboarding/HowToWorkSection';
import PublishingOverview from '@/components/publishing/PublishingOverview';
import {manualPinterestMode} from '@/lib/publishing/mode.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Dashboard',description:'Your reviewed Blogger jobs, manual Pinterest packs, permissions and actual runner activity.',alternates:{canonical:'/dashboard'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell><HowToWorkSection/>{manualPinterestMode()?<PublishingOverview/>:<WorkspaceDashboard/>}</PageShell>;}
