import PageShell from '@/components/PageShell';
import Connector from '@/components/workspace/Connector';
export const metadata={title:'Connector',description:'Manage Blogger account permissions, verified blogs and explicitly authorized recurring posts. Pinterest remains manual.',alternates:{canonical:'/connector'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell><Connector/></PageShell>;}
