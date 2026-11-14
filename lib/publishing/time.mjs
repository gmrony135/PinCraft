export const AUDIENCE_TIMEZONE='America/New_York';
export const AUDIENCE_SLOTS=['10:00','12:00','14:00','16:00','20:00','21:00'];
const cache=new Map();
function formatter(timeZone){if(!cache.has(timeZone)){if(cache.size>30)cache.clear();cache.set(timeZone,new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));}return cache.get(timeZone);}
export function zonedInput(value,timeZone=AUDIENCE_TIMEZONE){const p=Object.fromEntries(formatter(timeZone).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
export function localToUTC(value,timeZone=AUDIENCE_TIMEZONE){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw new Error('Choose a complete local date and time.');
 const stamp=Date.parse(value+':00Z');if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,16)!==value)throw new Error('Choose a real calendar date and time.');
 const offsets=new Set();for(let h=-36;h<=36;h+=6){const at=stamp+h*3600000;offsets.add(Date.parse(zonedInput(at,timeZone)+':00Z')-at);}
 const candidates=[...offsets].map(offset=>stamp-offset).filter(at=>zonedInput(at,timeZone)===value);
 if(!candidates.length)throw new Error('That local time does not exist because the clock changes. Choose another time.');
 if(candidates.length>1)throw new Error('That local time happens twice when the clock changes. Choose a time outside the repeated hour.');
 return new Date(candidates[0]).toISOString();
}
export function nextAudienceTimes(now=Date.now()){
 for(let day=0;day<3;day++){const date=zonedInput(now+day*86400000,AUDIENCE_TIMEZONE).slice(0,10);for(const slot of AUDIENCE_SLOTS){const pin=Date.parse(localToUTC(date+'T'+slot,AUDIENCE_TIMEZONE));if(pin>now+30*60000)return {blog:zonedInput(pin-20*60000,AUDIENCE_TIMEZONE),pin:zonedInput(pin,AUDIENCE_TIMEZONE)};}}
 throw new Error('Choose your next audience time.');
}
