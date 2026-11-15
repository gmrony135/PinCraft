// Every creation feature has one canonical destination. The Studio itself is
// a selection hub, never a second copy of a writer, generator or review form.
export const WRITING_TOOLS = [
  {id:'article',label:'Article Writer',href:'/article-writer',description:'Turn a title into a complete article. Review it before publishing.',detail:'Long-form writing'},
  {id:'pin',label:'Pin Generator',href:'/pin-generator',description:'Create Pin copy, get topic ideas and make download-only artwork in the same flow.',detail:'Pinterest copy & art'},
];
export const STUDIO_TOOLS = [
  {id:'image',slug:'artwork',label:'Artwork',href:'/content-studio/artwork',description:'Create and download Pin artwork or a blog featured image.',detail:'Pin & blog formats'},
  {id:'keywords',slug:'keywords',label:'SEO & hashtags',href:'/content-studio/keywords',description:'Explore search-intent clusters and relevant hashtag ideas.',detail:'Research & discovery'},
  {id:'plan',slug:'content-plan',label:'7-day content plan',href:'/content-studio/content-plan',description:'Organize one niche into a varied week of article and Pin ideas.',detail:'Weekly planning'},
  {id:'quality',slug:'review',label:'Content review',href:'/content-studio/review',description:'Check a draft’s clarity, structure and unsupported claims.',detail:'Editorial feedback'},
];
export const studioTool = slug => STUDIO_TOOLS.find(tool => tool.slug === slug);
