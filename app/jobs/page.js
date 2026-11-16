import PageShell from '@/components/PageShell';
import PublishingJobs from '@/components/publishing/PublishingJobs';
import PinterestPublishingJobs from '@/components/publishing/PinterestPublishingJobs';
export const metadata={title:'Publishing jobs',description:'Your private Blogger and manual Pinterest jobs, status history, retries and publication reports.',alternates:{canonical:'/jobs'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell><PublishingJobs/><PinterestPublishingJobs/></PageShell>;}
