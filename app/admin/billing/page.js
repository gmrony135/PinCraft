import PageShell from '@/components/PageShell';
import BillingAdmin from '@/components/workspace/BillingAdmin';
export const metadata={title:'Payment administration',description:'Restricted manual payment review and subscription pricing administration.',alternates:{canonical:'/admin/billing'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell><BillingAdmin/></PageShell>;}
