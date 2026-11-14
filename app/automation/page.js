import PageShell from '@/components/PageShell';
import Automations from '@/components/workspace/Automations';
import BlogAutomationSetup from '@/components/publishing/BlogAutomationSetup';
import {manualPinterestMode} from '@/lib/publishing/mode.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Blogger automation setup',description:'Configure category-relevant current-topic article generation and up to six daily Blogger slots. Pinterest is optional and manual.',alternates:{canonical:'/automation'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell>{manualPinterestMode()?<BlogAutomationSetup/>:<Automations/>}</PageShell>;}
