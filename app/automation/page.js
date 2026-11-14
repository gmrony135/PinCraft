import PageShell from '@/components/PageShell';
import Automations from '@/components/workspace/Automations';
import PublishingGuide from '@/components/publishing/PublishingGuide';
import {manualPinterestMode} from '@/lib/publishing/mode.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Publishing setup',description:'Review and schedule a Blogger article, then upload your Pinterest pack manually.',alternates:{canonical:'/automation'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell>{manualPinterestMode()?<PublishingGuide/>:<Automations/>}</PageShell>;}
