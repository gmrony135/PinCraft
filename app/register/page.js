import PageShell from '@/components/PageShell';
import AccountPage from '@/components/auth/AccountPage';
export const metadata={title:'Create account',description:'Secure email/password and Google account access for your private PinCraft automation workspace.',alternates:{canonical:'/register'},robots:{index:false,follow:true}};
export default function Page(){return <PageShell><AccountPage mode='signup'/></PageShell>;}
