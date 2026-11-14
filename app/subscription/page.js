import PageShell from '@/components/PageShell';
import Subscription from '@/components/workspace/Subscription';
import { manualPinterestMode } from '@/lib/publishing/mode.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Subscription',description:'One owned Blogger website to start; approved subscriptions for additional sites. Pinterest stays manual.',alternates:{canonical:'/subscription'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell><Subscription manualPinterest={manualPinterestMode()}/></PageShell>;}
