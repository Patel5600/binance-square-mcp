#!/usr/bin/env node
import http from 'node:http';
import readline from 'node:readline';
import {publishText,publishImages,publishVideo} from './square.mjs';

const SERVER={name:'binance-square-mcp',version:'0.4.0'};
const PROTOCOL='2025-06-18';

const tools=[
{name:'binance_square_publish_text',description:'Publish a new text post to Binance Square using the server-side Binance Square OpenAPI key. This changes external state; the host should request user confirmation before publishing.',inputSchema:{type:'object',properties:{text:{type:'string',minLength:1,description:'Exact post text to publish.'},title:{type:'string',description:'Optional article title.'}},required:['text'],additionalProperties:false}},
{name:'binance_square_publish_images',description:'Publish a Binance Square image post using 1 to 4 local image files, with the server-side Binance Square OpenAPI key. This changes external state; the host should request user confirmation before publishing.',inputSchema:{type:'object',properties:{text:{type:'string',minLength:1},images:{type:'array',items:{type:'string'},minItems:1,maxItems:4},title:{type:'string'},cover:{type:'string'}},required:['text'],additionalProperties:false}},
{name:'binance_square_publish_video',description:'Publish a Binance Square video using a local video file and duration in seconds, with the server-side Binance Square OpenAPI key. This changes external state; the host should request user confirmation before publishing.',inputSchema:{type:'object',properties:{video:{type:'string'},duration:{type:'number',exclusiveMinimum:0},text:{type:'string'}},required:['video','duration'],additionalProperties:false}}
];

async function callTool(name,args){
  if(name==='binance_square_publish_text') return publishText(args);
  if(name==='binance_square_publish_images') return publishImages(args);
  if(name==='binance_square_publish_video') return publishVideo(args);
  throw new Error('Unknown tool: '+name);
}

function response(id,result){return{jsonrpc:'2.0',id,result};}
function error(id,code,message){return{jsonrpc:'2.0',id,error:{code,message}};}

async function dispatch(message){
  if(message.method==='initialize') return response(message.id,{protocolVersion:PROTOCOL,capabilities:{tools:{},logging:{}},serverInfo:SERVER});
  if(message.method==='notifications/initialized') return null;
  if(message.method==='ping') return response(message.id,{});
  if(message.method==='tools/list') return response(message.id,{tools});
  if(message.method==='tools/call'){
    try{
      const data=await callTool(message.params?.name,message.params?.arguments??{});
      return response(message.id,{content:[{type:'text',text:JSON.stringify(data,null,2)}],structuredContent:data,isError:false});
    }catch(e){return error(message.id,-32000,e instanceof Error?e.message:String(e));}
  }
  if(message.id!==undefined) return error(message.id,-32601,'Method not found: '+message.method);
  return null;
}

async function readJson(req){
  const chunks=[];
  for await(const chunk of req) chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function send(res,status,body,extra={}){
  res.writeHead(status,{'content-type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*',...extra});
  res.end(JSON.stringify(body));
}

function authorized(req){
  const expected=process.env.MOBILE_POST_TOKEN?.trim();
  if(!expected) return false;
  const auth=req.headers.authorization||'';
  const supplied=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
  return supplied.length===expected.length && supplied===expected;
}

async function runMobilePublish(req,res){
  if(!authorized(req)){
    send(res,401,{ok:false,error:'Unauthorized'});
    return;
  }
  let body;
  try{body=await readJson(req);}catch{
    send(res,400,{ok:false,error:'Invalid JSON'});
    return;
  }
  if(typeof body?.text!=='string'||!body.text.trim()){
    send(res,400,{ok:false,error:'text must be a non-empty string'});
    return;
  }
  if(body.text.length>100000){
    send(res,413,{ok:false,error:'text is too large'});
    return;
  }
  try{
    const data=await publishText({text:body.text,title:typeof body.title==='string'&&body.title.trim()?body.title.trim():undefined});
    send(res,200,{ok:true,published:true,data});
  }catch(e){
    send(res,502,{ok:false,error:e instanceof Error?e.message:String(e)});
  }
}

function runHttp(){
  const port=Number(process.env.PORT||8787);
  const host=process.env.HOST||'0.0.0.0';
  const server=http.createServer(async(req,res)=>{
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,authorization,mcp-session-id','Access-Control-Max-Age':'86400'});
      res.end();
      return;
    }

    const pathname=new URL(req.url,'http://localhost').pathname;

    if(req.method==='GET' && (pathname==='/health'||pathname==='/ping')){
      send(res,200,{ok:true,pong:pathname==='/ping',server:SERVER});
      return;
    }

    if(req.method==='POST' && pathname==='/api/publish'){
      await runMobilePublish(req,res);
      return;
    }

    if(req.method!=='POST' || pathname!=='/mcp'){
      send(res,404,{error:'Not found'});
      return;
    }

    let message;
    try{message=await readJson(req);}catch{
      send(res,400,error(null,-32700,'Parse error'));
      return;
    }

    const result=await dispatch(message);
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','content-type,authorization,mcp-session-id');
    res.setHeader('Access-Control-Expose-Headers','mcp-session-id');

    if(!result){res.writeHead(202);res.end();return;}
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(result));
  });

  server.listen(port,host,()=>process.stderr.write('binance-square-mcp listening on http://'+host+':'+port+'/mcp\n'));
}

if(process.env.MCP_TRANSPORT==='http') runHttp();
else runStdio();
