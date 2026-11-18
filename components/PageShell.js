import Navbar from './Navbar';
import Footer from './Footer';
import JsonLd from './seo/JsonLd';
export default function PageShell({children,className='',jsonLd}) { return <><Navbar/><main className={`min-h-[65vh] bg-[#fafafa] ${className}`}>{jsonLd && <JsonLd data={jsonLd}/>}{children}</main><Footer/></>; }
