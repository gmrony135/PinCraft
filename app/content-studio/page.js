import PageShell from '@/components/PageShell';
import ContentStudioHub from '@/components/ai/ContentStudioHub';
export const metadata={title:'Content Studio',description:'Choose Article Writer, Pin Generator, a blog featured image, keywords, weekly planning or editorial review. One focused tool for each task.',alternates:{canonical:'/content-studio'},robots:{index:true,follow:true}};
export default function Page(){return <PageShell><ContentStudioHub/></PageShell>;}
