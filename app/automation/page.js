import PageShell from '@/components/PageShell';
import Automations from '@/components/workspace/Automations';
export const metadata={title:'Automations',description:'Choose categories, 1–6 daily Pins and your own publishing times for authorized Pinterest and Blogger accounts.',alternates:{canonical:'/automation'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell><Automations/></PageShell>;}
