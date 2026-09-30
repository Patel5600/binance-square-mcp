#!/usr/bin/env node
import readline from 'node:readline';
import {publishText,publishImages,publishVideo,resolveKey,maskKey} from './square.mjs';
const SERVER={name:'binance-square-mcp',version:'0.1.0'};
const PROTOCOL='2025-06-18';
function send(m){process.stdout.write(JSON.stringify(m)+'\n');}
function ok(id,result){send({jsonrpc:'2.0',id,result});}
function fail(id,code,message){send({jsonrpc:'2.0',id,error:{code,message}});}
const tools=[
{name:'binance_square_publish_text',description:'Publish a new text post or article to Binance Square. Supplied text is not rewritten.',inputSchema:{type:'object',properties:{text:{type:'string'},title:{type:'string'}},required:['text'],additionalProperties:false}},
{name:'binance_square_publish_images',description:'Publish an image post with 1-4 images, or an article with exactly one cover image.',inputSchema:{type:'object',properties:{text:{type:'string'},images:{type:'array',items:{type:'string'},minItems:1,maxItems:4},title:{type:'string'},cover:{type:'string'}},required:['text'],additionalProperties:false}},
{name:'binance_square_publish_video',description:'Publish a Binance Square video. Currently fails closed until ffmpeg cover extraction is implemented.',inputSchema:{type:'object',properties:{video:{type:'string'},duration:{type:'number',exclusiveMinimum:0},text:{type:'string'}},required:['video','duration'],additionalProperties:false}},
{name:'binance_square_auth_status',description:'Check whether a Square API key is configured without revealing the secret.',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];
async function callTool(name,args){
 if(name==='binance_square_auth_status'){try{const key=resolveKey();return{configured:true,key:maskKey(key)}}catch{return{configured:false}}}
 let data;
 if(name==='binance_square_publish_text') data=await publishText(args);
 else if(name==='binance_square_publish_images') data=await publishImages(args);
 else if(name==='binance_square_publish_video') data=await publishVideo(args);
 else throw new Error('Unknown tool: '+name);
 return{success:true,postId:data?.id??null,link:data?.shareLink??null,publishStatus:data?.publishStatus??'success'};
}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
 if(!line.trim()) continue;
 let m; try{m=JSON.parse(line)}catch{continue}
 if(m.method==='initialize'){ok(m.id,{protocolVersion:PROTOCOL,capabilities:{tools:{}},serverInfo:SERVER});continue}
 if(m.method==='notifications/initialized') continue;
 if(m.method==='ping'){ok(m.id,{});continue}
 if(m.method==='tools/list'){ok(m.id,{tools});continue}
 if(m.method==='tools/call'){try{const data=await callTool(m.params?.name,m.params?.arguments??{});ok(m.id,{content:[{type:'text',text:JSON.stringify(data,null,2)}],structuredContent:data,isError:false})}catch(e){fail(m.id,-32000,e instanceof Error?e.message:String(e))}continue}
 if(m.id!==undefined) fail(m.id,-32601,'Method not found: '+m.method);
}