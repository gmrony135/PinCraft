import {Suspense} from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PublishingCenter from '@/components/publishing/PublishingCenter';

export const metadata={
 title:'Publish your Blogger article',
 description:'Review your own complete article, select your verified Blogger blog, then publish now or schedule. Pinterest stays manual.',
 alternates:{canonical:'/publish'},
 robots:{index:false,follow:false},
};
export default function PublishPage(){
 return <><Navbar/><main><Suspense fallback={<div className="container-x py-20 text-center text-[13px] text-neutral-500">Loading reviewed publishing…</div>}><PublishingCenter/></Suspense></main><Footer/></>;
}
