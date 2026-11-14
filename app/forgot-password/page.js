import PageShell from '@/components/PageShell';
import AccountPage from '@/components/auth/AccountPage';
export const metadata={title:'Reset password',description:'Secure email/password and Google account access for your private PinCraft automation workspace.',alternates:{canonical:'/forgot-password'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell><AccountPage mode='reset'/></PageShell>;}
