import PageShell from '@/components/PageShell';
import WorkspaceDashboard from '@/components/workspace/WorkspaceDashboard';
export const metadata={title:'Dashboard',description:'Your own confirmed publications, automation schedules, connection health and real activity.',alternates:{canonical:'/dashboard'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell><WorkspaceDashboard/></PageShell>;}
