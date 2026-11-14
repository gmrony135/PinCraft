import PageShell from '@/components/PageShell';
import Connector from '@/components/workspace/Connector';
export const metadata={title:'Connector',description:'Connect your own Pinterest accounts and Blogger websites with explicit publishing permissions.',alternates:{canonical:'/connector'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell><Connector/></PageShell>;}
