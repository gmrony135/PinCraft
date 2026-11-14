import PageShell from '@/components/PageShell';
import Subscription from '@/components/workspace/Subscription';
export const metadata={title:'Subscription',description:'One Pinterest account and website to start; approved subscriptions for additional connections.',alternates:{canonical:'/subscription'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell><Subscription/></PageShell>;}
