// EXPLICIT LOCAL TEST FIXTURES ONLY. Not imported by app/, components/ or lib/.
import sharp from 'sharp';
import {AutomationError} from '../lib/automation/errors.mjs';
import {rawQuality} from './ai-fixtures.mjs';
import {isolatedFirebase} from './automation-fixtures.mjs';

export function newsXML(now=Date.now(),{stale=false,irrelevant=false,singlePublisher=false,unsafe=false}={}){
 const date=new Date(now-(stale?72:2)*3600000).toUTCString(),topic=unsafe?'Garden investment scam allegations':irrelevant?'Football match results this weekend':'Balcony garden container planting for compact homes';
 return '<rss><channel>'+['Studio Journal',singlePublisher?'Studio Journal':'Plant Review'].map((publisher,i)=>`<item><title>${topic}${i?' with a careful light plan':''} - ${publisher}</title><pubDate>${date}</pubDate><link>https://news.google.com/rss/articles/explicit-local-fixture-${i}</link><source url="https://example.com/">${publisher}</source></item>`).join('')+'</channel></rss>';
}
export function trendXML(now=Date.now(),{relevant=true,stale=false}={}){return `<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title>${relevant?'balcony garden containers':'unrelated sports final'}</title><pubDate>${new Date(now-(stale?72:1)*3600000).toUTCString()}</pubDate><ht:news_item><ht:news_item_title>${relevant?'Balcony garden container planting with a careful light plan':'Football match results tonight'}</ht:news_item_title><ht:news_item_url>https://example.com/explicit-fixture-signal</ht:news_item_url><ht:news_item_source>Explicit Synthetic Publisher</ht:news_item_source></ht:news_item></item></channel></rss>`;}

const intro='Starting a balcony garden is easier when the plan begins with the space you actually have, rather than a photograph of someone else’s home. Measure the floor, notice how the light changes, and decide which paths, doors, and shared areas must stay clear. A compact arrangement can still feel welcoming when each container has a reason to be there. This guide offers a measured way to plan a small balcony garden: test the layout, learn the conditions, choose manageable plants, and build a care routine you can adjust. Follow your building’s rules and consult a qualified professional whenever weight, drilling, or safety is uncertain.';
const sectionCopy=[
 {
  heading:'Plan the balcony garden before buying containers',
  paragraphs:[
   'Before choosing pots, measure the clear floor area, the door swing, and the route people use to move through the balcony. Sketch those measurements and mark the places where someone might sit, stand, or reach a doorway. This simple map helps a balcony garden fit everyday routines instead of turning into an obstacle. Test possible locations with empty pots or paper outlines first. Leave enough room to reach each container comfortably, and treat the usable walking space as part of the design rather than spare space waiting to be filled.',
   'Check the building rules before attaching anything to a railing, wall, or exterior surface. When a question involves weight, drilling, drainage, or a shared structure, do not guess from a photograph or a product description; ask the responsible manager or a qualified professional. Keep exits and drainage paths clear, and choose stable locations that do not require an unsafe lean. These boundaries are part of thoughtful garden planning, not a reason to abandon it. Resolving them early makes later choices easier and helps the project remain considerate of neighbours.'
  ],
  subheading:'Rehearse the layout with empty pots',
  subparagraph:'Use the first layout as a low-cost rehearsal. Put empty containers, a chair, and a watering can where you think they belong, then walk through the balcony at the times you normally use it. Notice whether doors open freely, the chair remains comfortable, and each pot is within easy reach. Take a photo from the doorway and from the seat. If anything feels cramped, remove one item before buying plants. This exercise turns a decorating idea into a plan based on the movements and limits of your own home.'
 },
 {
  heading:'Observe light and growing conditions first',
  paragraphs:[
   'Spend several ordinary days noticing how sunlight moves across the balcony instead of relying on a single midday snapshot. Record which areas receive direct light, where shade lasts, and whether a nearby wall changes the pattern. The goal is not to create a technical forecast; it is to describe the conditions you can actually observe. A short morning and afternoon note gives you a more useful starting point than a general label such as “sunny.” Keep the notes with your sketch so the layout and plant choices respond to the same real space.',
   'Also notice wind exposure, sheltered corners, and how rain reaches the containers. Conditions can differ between the outer edge and the wall, so do not assume that two pots beside each other will behave identically. Read each plant’s care information and compare it with your observations. If the advice is unclear, ask a knowledgeable local nursery about options suited to your circumstances. Starting with that conversation is more reliable than copying a list made for a different climate, building, or balcony orientation.'
  ],
  subheading:'Keep an observation note, not a rigid schedule',
  subparagraph:'A simple observation note can include the date, the part of the balcony you checked, and one change you noticed. Write down whether the area was bright or shaded and whether the conditions seemed different from the previous visit. You do not need specialist equipment to begin describing what is in front of you. Avoid treating a short record as proof that a plant will thrive; it is only a way to ask better questions. Over time, these notes help you explain the setting when you seek specific advice.'
 },
 {
  heading:'Choose manageable plants and containers',
  paragraphs:[
   'Select a small first group of plants after you understand the available light and the room each container can occupy. Compare the plant’s care label with your notes, and choose varieties whose needs seem compatible with the conditions you can provide. If several options look suitable, begin with fewer rather than filling every open corner. A modest collection makes it easier to observe each plant and notice when a placement needs reconsidering. The best starting choice is one you can reach, identify, and care for without turning the balcony into a crowded storage area.',
   'Think about a container’s dimensions, drainage design, material, and placement before buying it. Follow the manufacturer’s instructions and the rules for your building, especially where a pot would sit above a walkway or attach to a structure. Keep water from collecting where it could damage a surface or affect another resident. If you are unsure whether a position or mounting method is safe, stop and ask a qualified person. Practical container choices protect the usefulness of the space and make future rearranging less difficult.'
  ],
  subheading:'Start with a small, adjustable collection',
  subparagraph:'Choose a first arrangement that you can change without a major purchase or a complicated installation. Keep plant labels, note where each pot sits, and leave a little room to move items if your observations suggest a better location. When comparing supplies, check measurements and care instructions rather than selecting an item only because it appears in a photograph. A flexible beginning gives you time to learn what suits the balcony. It also makes it easier to pause, simplify, or ask for help when a choice does not fit your real constraints.'
 },
 {
  heading:'Build a repeatable balcony garden care routine',
  paragraphs:[
   'Make the care routine small enough to fit into an ordinary week. Choose a moment when you can look closely at the leaves, soil surface, and container condition, then follow the care guidance for the particular plant. Do not let a decorative calendar replace observation or instructions from a reliable source. If something looks different, note what changed before making several adjustments at once. This patient approach gives you a clearer record of what you tried and helps prevent a busy balcony garden from becoming another demanding task on your schedule.',
   'Review the arrangement after you have lived with it for a while. Ask whether the pots are easy to reach, the walking route remains clear, and the space still works for its ordinary purpose. Remove a container or simplify the layout if that makes the balcony more comfortable. A change is useful information, not evidence that the project failed. Keep your notes and ask a qualified person about uncertainties involving safety, plant health, or building requirements. Adjusting one decision at a time makes the next step easier to understand.'
  ],
  subheading:'Review one change at a time',
  subparagraph:'When you decide to adjust the garden, write down the reason and change one manageable thing first. You might move a pot to a different observed light condition, reduce the number of containers, or ask a nursery about an unanswered care question. Give yourself enough time to notice what follows before making another change. There is no need to compare your balcony with a polished image or someone else’s routine. A useful garden is one that fits your home, your available time, and the safety rules that apply to the space.'
 }
];
const faqs=[
 {question:'How should I start a balcony garden?',answer:'Begin by measuring the clear space and observing its light at different times of day. Check building rules, keep paths and drainage clear, and try a small layout with empty containers before buying plants. Choose the next step only after you understand the conditions you can provide.'},
 {question:'Which plants are right for a small balcony?',answer:'There is no single plant list that suits every balcony. Compare each plant’s care information with your own observations about light, shelter, and available room. A knowledgeable local nursery can help you consider suitable options. Start with a manageable number and keep the labels for reference.'},
 {question:'How can I keep balcony containers safe?',answer:'Follow your building’s rules and the instructions supplied with each container. Do not guess about weight limits, drilling, mounting, or drainage. Keep exits and shared paths clear, and ask the responsible building manager or a qualified professional when a safety question is uncertain.'}
];
const listSection={heading:'A practical balcony garden checklist',intro:'Use these small checks before you add another pot or plant.',items:['Measure the clear floor space and keep the walking route open.','Observe light and shelter at more than one time of day.','Read plant-care information and ask a local nursery when it is unclear.','Check building rules before mounting anything or changing drainage.','Start with a modest number of containers and keep useful notes.']};
const conclusion='A balcony garden does not need to be finished in one afternoon. Begin with a measured layout, learn the conditions you can observe, and choose a small collection that fits your home. Keep paths clear, follow building rules, and ask qualified people about uncertain safety or care questions. Review the arrangement after you have used it for a while, then make one practical change at a time. The aim is not to copy a photograph; it is to create a manageable green space that works for your real circumstances.';
const metaDescription='Plan a small balcony garden by measuring your space, observing light, choosing suitable containers, and building a practical care routine that fits your home.';

export function automaticArticle(_sourceTitle){
 return {
  title:'A Practical Balcony Garden Plan for Smaller Spaces',category:'Gardening',intro,
  sections:sectionCopy.map(section=>({heading:section.heading,paragraphs:section.paragraphs,subsections:[{heading:section.subheading,paragraphs:[section.subparagraph]}]})),
  listSection,faqs,conclusion,focusKeyword:'balcony garden',secondaryKeywords:['balcony containers','small space gardening','balcony plant care','container garden layout','balcony light conditions','compact garden planning'],metaDescription,slug:'practical-balcony-garden-plan',
  imageBriefs:[
   {role:'cover',sectionIndex:null,prompt:'A calm, realistic compact balcony garden with a few containers and clear walking space, soft natural light, landscape editorial photography, no text or logos.',altText:'A compact balcony garden with a few containers and an open walking path'},
   {role:'section',sectionIndex:0,prompt:'A measured balcony floor plan beside empty containers, door clearance visible, calm natural light, landscape editorial photography, no text or logos.',altText:'Empty containers arranged to test a small balcony garden layout'},
   {role:'section',sectionIndex:2,prompt:'A modest selection of balcony plants in well-spaced containers, natural daylight, practical home setting, landscape editorial photography, no text or logos.',altText:'A small group of plants in spaced containers on a balcony'}
  ]
 };
}
export const automaticQuality=()=>({...rawQuality,score:90,summary:'Explicit synthetic editorial result for local tests, not a genuine quality assessment.',checks:['Clarity','Topical relevance','Structure','Unsupported claims','Responsible advice'].map(label=>({label,status:'pass',detail:'Explicit synthetic passing test check.'}))});

let pngPromise;
const testPNG=()=>pngPromise||=(async()=>sharp({create:{width:640,height:480,channels:3,background:{r:78,g:124,b:83}}}).png().toBuffer())();
export function automaticAI({quality=automaticQuality,hold=null,failImageAt=null}={}){
 const calls=[];let imageCalls=0;
 const send=async(url,init={})=>{
  isolatedFirebase();const endpoint=String(url);
  if(endpoint.startsWith('https://api.cloudflare.com/client/v4/accounts/')){
   const number=++imageCalls;calls.push({task:'image',number,endpoint});if(hold)await hold('image');if(failImageAt===number)throw new AutomationError('provider_request','Explicit synthetic image provider failure',{upstreamStatus:503,retryable:true});return testPNG();
  }
  if(endpoint!=='https://api.groq.com/openai/v1/chat/completions')throw new Error('Unexpected synthetic AI endpoint');
  const prompt=JSON.parse(init.body).messages[0].content,input=JSON.parse(prompt.split('Task data: ')[1]),task=prompt.includes('Create an original, practical, publish-ready blog article')?'article':'quality';calls.push({task,input});
  if(hold)await hold(task);
  const result=task==='article'?automaticArticle(input.title):quality();
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]};
 };
 const config={accountId:'a'.repeat(32),token:'isolated-cloudflare-token-fixture',models:['@cf/black-forest-labs/flux-1-schnell']};
 return {calls,dependencies:{candidates:[{provider:'groq',model:'isolated-blog-automation',key:'isolated-noncredential-fixture',timeout:1000}],send,circuit:new Map(),config}};
}
