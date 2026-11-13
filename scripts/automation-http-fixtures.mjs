// TEST PROCESS PRELOAD ONLY. Never imported by the production application.
// It is impossible to activate these doubles with an API request or app flag.
import { MockAgent,setGlobalDispatcher } from 'undici';
const hosts=[process.env.FIRESTORE_EMULATOR_HOST,process.env.FIREBASE_AUTH_EMULATOR_HOST];
if(process.env.AUTOMATION_HTTP_FIXTURES!=='1'||process.env.FIREBASE_EMULATORS!=='1'||process.env.FIREBASE_PROJECT_ID!=='demo-pincraft-local'||hosts.some(host=>!/^127\.0\.0\.1:\d+$/.test(host||''))||process.env.VERCEL_ENV==='production')throw new Error('Refusing non-isolated Firebase HTTP fixtures.');
const mock=new MockAgent();mock.disableNetConnect();mock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);setGlobalDispatcher(mock);
const scopes='pins:read,pins:write,boards:read,boards:write,user_accounts:read';
const pin=mock.get('https://api.pinterest.com');
pin.intercept({path:'/v5/oauth/token',method:'POST'}).reply(200,{access_token:'isolated-http-pinterest-access',refresh_token:'isolated-http-pinterest-refresh',token_type:'bearer',expires_in:3600,refresh_token_expires_in:5184000,scope:scopes}).persist();
pin.intercept({path:'/v5/user_account',method:'GET'}).reply(200,{username:'isolated_owner'}).persist();
const board={id:'12345678901',name:'Isolated consent test board',privacy:'PUBLIC',owner:{username:'isolated_owner'}};
pin.intercept({path:/^\/v5\/boards\?/,method:'GET'}).reply(200,{items:[board]}).persist();
pin.intercept({path:'/v5/boards/12345678901',method:'GET'}).reply(200,board).persist();
pin.intercept({path:'/v5/pins',method:'POST'}).reply(200,{id:'9876543210987'}).persist();
pin.intercept({path:'/v5/pins/9876543210987',method:'GET'}).reply(200,{id:'9876543210987',board_id:'12345678901',link:'https://example.com/post'}).persist();
const google=mock.get('https://oauth2.googleapis.com');
google.intercept({path:'/token',method:'POST'}).reply(200,{access_token:'isolated-http-blogger-access-NEVER-SAVE',refresh_token:'isolated-http-blogger-refresh',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/blogger'}).persist();
google.intercept({path:'/revoke',method:'POST'}).reply(200,'').persist();
const blogger=mock.get('https://www.googleapis.com');
blogger.intercept({path:/^\/blogger\/v3\/users\/self\/blogs\?/,method:'GET'}).reply(200,{items:[{id:'123456789012',name:'Isolated consent test blog',url:'https://example.com'}]}).persist();
blogger.intercept({path:'/blogger/v3/users/self/blogs/123456789012',method:'GET'}).reply(200,{blog:{id:'123456789012',name:'Isolated consent test blog',url:'https://example.com'},blog_user_info:{hasAdminAccess:true}}).persist();
mock.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(200,{status:'completed',output_text:'{"ready":true}'}).persist();
console.log('ISOLATED FIREBASE TEST SERVER: provider OAuth/HTTP responses are test doubles, not live account consent or publication.');
