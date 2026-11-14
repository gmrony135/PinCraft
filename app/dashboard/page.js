import PageShell from '@/components/PageShell';
import WorkspaceDashboard from '@/components/workspace/WorkspaceDashboard';
import PublishingOverview from '@/components/publishing/PublishingOverview';
import {manualPinterestMode} from '@/lib/publishing/mode.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Dashboard',description:'Your reviewed Blogger jobs, manual Pinterest packs, permissions and actual runner activity.',alternates:{canonical:'/dashboard'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell>{manualPinterestMode()?<PublishingOverview/>:<WorkspaceDashboard/>}</PageShell>;}
