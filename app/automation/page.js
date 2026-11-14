import {permanentRedirect} from 'next/navigation';

// Old bookmarks stay useful, without a second setup page or separate menu.
export default function Page(){permanentRedirect('/connector#blogger-recurring');}
