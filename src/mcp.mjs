#!/usr/bin/env node
import http from 'node:http';
import readline from 'node:readline';
import {publishText,publishImages,publishVideo} from './square.mjs';

const SERVER={name:'binance-square-mcp',version:'0.3.0'};
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

async function runStdio(){
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of rl){
    if(!line.trim()) continue;
    let message;
    try{message=JSON.parse(line)}catch{continue}
    const result=await dispatch(message);
    if(result) process.stdout.write(JSON.stringify(result)+'\n');
  }
}

function runHttp(){
  const port=Number(process.env.PORT||8787);
  const host=process.env.HOST||'0.0.0.0';
  const server=http.createServer(async(req,res)=>{
    if(req.method==='OPTIONS'){
      res.writeHead(204,{
        'Access-Control-Allow-Origin':'*',
        'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers':'content-type,mcp-session-id',
        'Access-Control-Max-Age':'86400'
      });
      res.end();
      return;
    }

    if(req.method==='GET' && (req.url==='/health' || req.url==='/ping')){
      res.writeHead(200,{
        'content-type':'application/json',
        'Access-Control-Allow-Origin':'*',
        'Cache-Control':'no-store'
      });
      res.end(JSON.stringify({ok:true,pong:req.url==='/ping',server:SERVER}));
      return;
    }

    if(req.method!=='POST' || new URL(req.url,'http://localhost').pathname!=='/mcp'){
      res.writeHead(404,{
        'content-type':'application/json',
        'Access-Control-Allow-Origin':'*'
      });
      res.end(JSON.stringify({error:'Not found'}));
      return;
    }

    const chunks=[];
    for await(const chunk of req) chunks.push(chunk);

    let message;
    try{
      message=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch{
      res.writeHead(400,{
        'content-type':'application/json',
        'Access-Control-Allow-Origin':'*'
      });
      res.end(JSON.stringify(error(null,-32700,'Parse error')));
      return;
    }

    const result=await dispatch(message);
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','content-type,mcp-session-id');
    res.setHeader('Access-Control-Expose-Headers','mcp-session-id');

    if(!result){
      res.writeHead(202);
      res.end();
      return;
    }

    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(result));
  });

  server.listen(port,host,()=>process.stderr.write('binance-square-mcp listening on http://'+host+':'+port+'/mcp\n'));
}

if(process.env.MCP_TRANSPORT==='http') runHttp();
else runStdio();
