#!/usr/bin/env node
import http from 'node:http';
import readline from 'node:readline';
import {
  publishText,
  publishImages,
  publishVideo,
  publishImagesFromUrls,
  publishVideoFromUrl,
  getXTrends,
  searchXPosts
} from './square.mjs';
import {researchMarket,researchToken,researchDefi} from './research.mjs';

const SERVER={name:'binance-square-mcp',version:'0.6.0'};
const PROTOCOL='2025-06-18';

const tools=[
{name:'binance_square_publish_text',description:'Publish a new text post to Binance Square using the server-side Binance Square OpenAPI key. This changes external state; the host should request user confirmation before publishing.',inputSchema:{type:'object',properties:{text:{type:'string',minLength:1},title:{type:'string'}},required:['text'],additionalProperties:false}},
{name:'binance_square_publish_images',description:'Publish a Binance Square image post or image-cover article using 1 to 4 local image files and the server-side Binance Square OpenAPI key. This changes external state.',inputSchema:{type:'object',properties:{text:{type:'string',minLength:1},images:{type:'array',items:{type:'string'},minItems:1,maxItems:4},title:{type:'string'},cover:{type:'string'}},required:['text'],additionalProperties:false}},
{name:'binance_square_publish_video',description:'Publish a Binance Square video using a local video file and duration in seconds. This changes external state.',inputSchema:{type:'object',properties:{video:{type:'string'},duration:{type:'number',exclusiveMinimum:0},text:{type:'string'}},required:['video','duration'],additionalProperties:false}},
{name:'x_get_trends',description:'Discover current trend-like hashtags from public X search data. This uses a third-party public-data service and requires no X API token.',inputSchema:{type:'object',properties:{maxTrends:{type:'integer',minimum:1,maximum:20,default:20}},additionalProperties:false}},
{name:'x_search_posts',description:'Search public X posts through the configured third-party public-data service. No X API token is required.',inputSchema:{type:'object',properties:{query:{type:'string',minLength:1},maxResults:{type:'integer',minimum:1,maximum:20,default:10}},required:['query'],additionalProperties:false}},
{name:'research_market',description:'Get current Binance public market data plus recent candles for a symbol.',inputSchema:{type:'object',properties:{symbol:{type:'string',default:'BTCUSDT'},interval:{type:'string',default:'1h'},limit:{type:'integer',minimum:1,maximum:100,default:24}},additionalProperties:false}},
{name:'research_token',description:'Get current CoinGecko market, supply and developer metadata for a token by CoinGecko ID.',inputSchema:{type:'object',properties:{id:{type:'string',minLength:1}},required:['id'],additionalProperties:false}},
{name:'research_defi',description:'Get current DefiLlama protocol data including TVL and chain coverage.',inputSchema:{type:'object',properties:{protocol:{type:'string',minLength:1}},required:['protocol'],additionalProperties:false}}
];

async function callTool(name,args){
  if(name==='binance_square_publish_text')return publishText(args);
  if(name==='binance_square_publish_images')return publishImages(args);
  if(name==='binance_square_publish_video')return publishVideo(args);
  if(name==='x_get_trends')return getXTrends(args);
  if(name==='x_search_posts')return searchXPosts(args);
  if(name==='research_market')return researchMarket(args);
  if(name==='research_token')return researchToken(args);
  if(name==='research_defi')return researchDefi(args);
  throw new Error('Unknown tool: '+name);
}
function response(id,result){return{jsonrpc:'2.0',id,result};}
function error(id,code,message){return{jsonrpc:'2.0',id,error:{code,message}};}

async function dispatch(message){
  if(message.method==='initialize')return response(message.id,{protocolVersion:PROTOCOL,capabilities:{tools:{},logging:{}},serverInfo:SERVER});
  if(message.method==='notifications/initialized')return null;
  if(message.method==='ping')return response(message.id,{});
  if(message.method==='tools/list')return response(message.id,{tools});
  if(message.method==='tools/call'){
    try{const data=await callTool(message.params?.name,message.params?.arguments??{});return response(message.id,{content:[{type:'text',text:JSON.stringify(data,null,2)}],structuredContent:data,isError:false});}
    catch(e){return error(message.id,-32000,e instanceof Error?e.message:String(e));}
  }
  if(message.id!==undefined)return error(message.id,-32601,'Method not found: '+message.method);
  return null;
}

async function readJson(req){
  const chunks=[];
  for await(const chunk of req)chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function send(res,status,body,extra={}){
  res.writeHead(status,{'content-type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*',...extra});
  res.end(JSON.stringify(body));
}
function authorized(req){
  const expected=process.env.MOBILE_POST_TOKEN?.trim();
  if(!expected)return false;
  const auth=req.headers.authorization||'';
  const supplied=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
  return supplied.length===expected.length&&supplied===expected;
}
async function readAuthorizedJson(req,res){
  if(!authorized(req)){send(res,401,{ok:false,error:'Unauthorized'});return null;}
  try{return await readJson(req);}catch{send(res,400,{ok:false,error:'Invalid JSON'});return null;}
}

async function runMobilePublish(req,res){
  const body=await readAuthorizedJson(req,res);if(!body)return;
  if(typeof body?.text!=='string'||!body.text.trim()){send(res,400,{ok:false,error:'text must be a non-empty string'});return;}
  if(body.text.length>100000){send(res,413,{ok:false,error:'text is too large'});return;}
  try{
    const data=await publishText({text:body.text,title:typeof body.title==='string'&&body.title.trim()?body.title.trim():undefined});
    send(res,200,{ok:true,published:true,data});
  }catch(e){send(res,502,{ok:false,error:e instanceof Error?e.message:String(e)});}
}

async function runMobileImages(req,res){
  const body=await readAuthorizedJson(req,res);if(!body)return;
  if(typeof body?.text!=='string'||!body.text.trim()){send(res,400,{ok:false,error:'text must be a non-empty string'});return;}
  if(body.text.length>100000){send(res,413,{ok:false,error:'text is too large'});return;}
  try{
    const data=await publishImagesFromUrls({
      text:body.text,
      images:Array.isArray(body.images)?body.images:[],
      title:typeof body.title==='string'&&body.title.trim()?body.title.trim():undefined,
      cover:typeof body.cover==='string'&&body.cover.trim()?body.cover.trim():undefined
    });
    send(res,200,{ok:true,published:true,data});
  }catch(e){send(res,502,{ok:false,error:e instanceof Error?e.message:String(e)});}
}

async function runMobileVideo(req,res){
  const body=await readAuthorizedJson(req,res);if(!body)return;
  if(typeof body?.video!=='string'||!body.video.trim()){send(res,400,{ok:false,error:'video must be a non-empty HTTPS URL'});return;}
  if(body.text!==undefined&&typeof body.text!=='string'){send(res,400,{ok:false,error:'text must be a string when provided'});return;}
  try{
    const data=await publishVideoFromUrl({video:body.video.trim(),duration:body.duration,text:body.text});
    send(res,200,{ok:true,published:true,data});
  }catch(e){send(res,502,{ok:false,error:e instanceof Error?e.message:String(e)});}
}

async function runXSearch(req,res,url){
  if(!authorized(req)){send(res,401,{ok:false,error:'Unauthorized'});return;}
  const query=url.searchParams.get('query')||'';
  const maxResults=Number(url.searchParams.get('maxResults')||10);
  if(!query.trim()){send(res,400,{ok:false,error:'query is required'});return;}
  try{send(res,200,{ok:true,data:await searchXPosts({query,maxResults})});}
  catch(e){send(res,502,{ok:false,error:e instanceof Error?e.message:String(e)});}
}

async function runXTrends(req,res,url){
  if(!authorized(req)){send(res,401,{ok:false,error:'Unauthorized'});return;}
  const maxTrends=Number(url.searchParams.get('maxTrends')||20);
  try{send(res,200,{ok:true,data:await getXTrends({maxTrends})});}
  catch(e){send(res,502,{ok:false,error:e instanceof Error?e.message:String(e)});}
}

async function runResearch(req,res,pathname,url){
  if(!authorized(req)){send(res,401,{ok:false,error:'Unauthorized'});return;}
  try{
    let data;
    if(pathname==='/api/research/market')data=await researchMarket({symbol:url.searchParams.get('symbol')||'BTCUSDT',interval:url.searchParams.get('interval')||'1h',limit:Number(url.searchParams.get('limit')||24)});
    else if(pathname==='/api/research/token')data=await researchToken({id:url.searchParams.get('id')||''});
    else if(pathname==='/api/research/defi')data=await researchDefi({protocol:url.searchParams.get('protocol')||''});
    else{send(res,404,{ok:false,error:'Research endpoint not found'});return;}
    send(res,200,{ok:true,data});
  }catch(e){send(res,502,{ok:false,error:e instanceof Error?e.message:String(e)});}
}

function runHttp(){
  const port=Number(process.env.PORT||8787);
  const host=process.env.HOST||'0.0.0.0';
  const server=http.createServer(async(req,res)=>{
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,authorization,mcp-session-id','Access-Control-Max-Age':'86400'});res.end();return;}
    const url=new URL(req.url,'http://localhost');
    const pathname=url.pathname;
    if(req.method==='GET'&&(pathname==='/health'||pathname==='/ping')){send(res,200,{ok:true,pong:pathname==='/ping',server:SERVER});return;}
    if(req.method==='POST'&&pathname==='/api/publish'){await runMobilePublish(req,res);return;}
    if(req.method==='POST'&&pathname==='/api/publish/images'){await runMobileImages(req,res);return;}
    if(req.method==='POST'&&pathname==='/api/publish/video'){await runMobileVideo(req,res);return;}
    if(req.method==='GET'&&pathname==='/api/x/search'){await runXSearch(req,res,url);return;}
    if(req.method==='GET'&&pathname==='/api/x/trends'){await runXTrends(req,res,url);return;}
    if(req.method==='GET'&&(pathname==='/api/research/market'||pathname==='/api/research/token'||pathname==='/api/research/defi')){await runResearch(req,res,pathname,url);return;}
    if(req.method!=='POST'||pathname!=='/mcp'){send(res,404,{error:'Not found'});return;}
    let message;try{message=await readJson(req);}catch{send(res,400,error(null,-32700,'Parse error'));return;}
    const result=await dispatch(message);
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','content-type,authorization,mcp-session-id');
    res.setHeader('Access-Control-Expose-Headers','mcp-session-id');
    if(!result){res.writeHead(202);res.end();return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
  });
  server.listen(port,host,()=>process.stderr.write('binance-square-mcp listening on http://'+host+':'+port+'/mcp\n'));
}
function runStdio(){
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',async(line)=>{if(!line.trim())return;try{const result=await dispatch(JSON.parse(line));if(result)process.stdout.write(JSON.stringify(result)+'\n');}catch(e){process.stdout.write(JSON.stringify(error(null,-32700,e instanceof Error?e.message:String(e)))+'\n');}});
}
if(process.env.MCP_TRANSPORT==='http')runHttp();else runStdio();
