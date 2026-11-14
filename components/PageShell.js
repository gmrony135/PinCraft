import Navbar from './Navbar';
import Footer from './Footer';
export default function PageShell({children,className=''}) { return <><Navbar/><main className={`min-h-[65vh] bg-[#fafafa] ${className}`}>{children}</main><Footer/></>; }
