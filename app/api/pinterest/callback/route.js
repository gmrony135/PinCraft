import { NextResponse } from 'next/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json({code:'pinterest_manual_mode',error:'Pinterest is uploaded/scheduled manually in your own Pinterest account. PinCraft does not collect session cookies or use this callback.'},{status:410,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
