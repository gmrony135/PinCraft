import PageShell from '@/components/PageShell';
import AIStudio from '@/components/ai/AIStudio';
export const metadata={title:'Content Studio',description:'Create original artwork, keyword ideas, content plans and editorial reviews in one workspace.',alternates:{canonical:'/content-studio'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell><AIStudio/></PageShell>;}
