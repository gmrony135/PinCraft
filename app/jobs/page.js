import PageShell from '@/components/PageShell';
import PublishingJobs from '@/components/publishing/PublishingJobs';
export const metadata={title:'Publishing jobs',description:'Your reviewed Blogger jobs, verified article links, safe retries and manual Pinterest packs.',alternates:{canonical:'/jobs'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell><PublishingJobs/></PageShell>;}
