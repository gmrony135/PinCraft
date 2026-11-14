import {notFound} from 'next/navigation';
import PageShell from '@/components/PageShell';
import AIStudio from '@/components/ai/AIStudio';
import {studioTool} from '@/lib/studio-tools.mjs';

export async function generateMetadata({params}){
 const tool=studioTool((await params).tool);
 if(!tool)return {title:'Tool not found',robots:{index:false,follow:true}};
 return {title:tool.label,description:tool.description,alternates:{canonical:tool.href},robots:{index:true,follow:true}};
}
export default async function Page({params,searchParams}){
 const tool=studioTool((await params).tool);
 if(!tool)notFound();
 const format=(await searchParams)?.format==='featured'?'featured':'pin';
 return <PageShell><AIStudio key={tool.id} tool={tool} initialUseCase={format}/></PageShell>;
}
