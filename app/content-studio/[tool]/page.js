import {notFound} from 'next/navigation';
import PageShell from '@/components/PageShell';
import AIStudio from '@/components/ai/AIStudio';
import {studioTool} from '@/lib/studio-tools.mjs';
import {pageOpenGraph} from '@/lib/seo.mjs';

export async function generateMetadata({params}){
 const tool=studioTool((await params).tool);
 if(!tool)return {title:'Tool not found',robots:{index:false,follow:true}};
 return {title:tool.label,description:tool.description,alternates:{canonical:tool.href},openGraph:pageOpenGraph({title:tool.label,description:tool.description,path:tool.href}),robots:{index:true,follow:true}};
}
export default async function Page({params}){
 const tool=studioTool((await params).tool);
 if(!tool)notFound();
 return <PageShell><AIStudio key={tool.id} tool={tool}/></PageShell>;
}
