import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const V1 = 'https://www.binance.com/bapi/composite/v1/public/pgc/openApi';
const V2 = 'https://www.binance.com/bapi/composite/v2/public/pgc/openApi';
const X_PUBLIC_API = 'https://x.pcstyle.dev/api/v1';
const POLL_MS = 3000;
const POLL_RETRIES = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

function localKeyPath(){return path.join(os.homedir(),'.config','binance-square','openapi-key');}
export function resolveKey(){
  const env=process.env.BINANCE_SQUARE_OPENAPI_KEY?.trim();
  if(env)return env;
  const file=localKeyPath();
  if(fs.existsSync(file)){const key=fs.readFileSync(file,'utf8').trim();if(key)return key;}
  throw new Error('Missing BINANCE_SQUARE_OPENAPI_KEY. Configure the key in the server environment.');
}
export function maskKey(key){return !key?'':key.length<=9?key.slice(0,2)+'...':key.slice(0,5)+'...'+key.slice(-4);}
function mimeFor(file){const ext=path.extname(file).toLowerCase();return({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.avi':'video/x-msvideo','.webm':'video/webm'})[ext]??'application/octet-stream';}
async function request(endpoint,key,body,base=V2){
  const response=await fetch(base+endpoint,{method:'POST',headers:{'X-Square-OpenAPI-Key':key,'Content-Type':'application/json',clienttype:'binanceSkill'},body:JSON.stringify(body)});
  const raw=await response.text();
  if(endpoint==='/content/add'&&response.status===504)return{id:null,shareLink:null,publishStatus:'success_without_post_id'};
  let json;try{json=JSON.parse(raw)}catch{throw new Error('Binance returned non-JSON HTTP '+response.status+'.');}
  if(json.code!=='000000')throw new Error('Binance API error ['+json.code+']: '+(json.message??'unknown error'));
  return json.data;
}
async function putFile(url,file,contentType){
  const response=await fetch(url,{method:'PUT',headers:{'Content-Type':contentType},body:fs.readFileSync(file)});
  if(!response.ok)throw new Error('Media upload failed: HTTP '+response.status+' '+response.statusText);
}
async function pollMedia(key,ticket){
  for(let attempt=1;attempt<=POLL_RETRIES;attempt++){
    const data=await request('/image/imageStatus',key,{fileTicket:ticket});
    if(data.status===1)return data.imageUrl;
    if(data.status===2)throw new Error('Media processing failed: '+(data.failedReason??'unknown reason'));
    if(attempt<POLL_RETRIES)await new Promise(r=>setTimeout(r,POLL_MS));
  }
  throw new Error('Media processing timed out.');
}
function extractCover(video){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'square-video-'));
  const cover=path.join(dir,path.parse(video).name+'-cover.png');
  const result=spawnSync('ffmpeg',['-y','-loglevel','error','-i',video,'-frames:v','1','-q:v','2',cover],{encoding:'utf8'});
  if(result.error)throw new Error('ffmpeg unavailable: '+result.error.message);
  if(result.status!==0)throw new Error('ffmpeg cover extraction failed: '+(result.stderr||'unknown error'));
  if(!fs.existsSync(cover)||fs.statSync(cover).size===0)throw new Error('ffmpeg produced an empty cover image.');
  return{dir,cover};
}
function probeVideoDuration(video){
  const result=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',video],{encoding:'utf8'});
  if(result.error)return null;
  const duration=Number.parseFloat((result.stdout||'').trim());
  return Number.isFinite(duration)&&duration>0?duration:null;
}
async function uploadImage(key,file){
  if(!fs.existsSync(file))throw new Error('Image not found: '+file);
  const ticket=await request('/image/presignedUrl',key,{imageName:path.basename(file)});
  await putFile(ticket.presignedUrl,file,mimeFor(file));
  return pollMedia(key,ticket.fileTicket);
}
export async function publishText({text,title}){
  if(!text?.trim())throw new Error('text must not be empty.');
  const key=resolveKey();const body={contentType:title?2:1,bodyTextOnly:text};if(title)body.title=title;
  return request('/content/add',key,body,V1);
}
export async function publishImages({text,images,title,cover}){
  if(!text?.trim())throw new Error('text must not be empty.');
  const files=Array.isArray(images)?images:[];
  if(title){if(files.length)throw new Error('Article mode cannot use images[]; provide exactly one cover.');if(!cover)throw new Error('Article mode requires one cover image.');}
  else{if(cover)throw new Error('cover is only valid for article mode.');if(files.length<1||files.length>4)throw new Error('Image posts require 1 to 4 images.');}
  const key=resolveKey();const body={contentType:title?2:1,bodyTextOnly:text};
  if(title){body.title=title;body.cover=await uploadImage(key,cover);}
  else{body.imageList=[];for(const file of files)body.imageList.push(await uploadImage(key,file));}
  return request('/content/add',key,body,V1);
}
export async function publishVideo({video,duration,text}){
  if(!video)throw new Error('video is required.');
  if(!Number.isFinite(Number(duration))||Number(duration)<=0)throw new Error('duration must be a positive number of seconds.');
  if(!fs.existsSync(video))throw new Error('Video not found: '+video);
  const key=resolveKey();const stat=fs.statSync(video);
  const ticket=await request('/video/preSign',key,{fileName:path.basename(video),size:stat.size});
  await putFile(ticket.presignedUrl,video,mimeFor(video));await pollMedia(key,ticket.fileTicket);
  const temp=extractCover(video);
  try{const cover=await uploadImage(key,temp.cover);const body={contentType:3,fileTicket:ticket.fileTicket,cover,videoTimeSeconds:Number(duration),isPublish:true};if(text)body.bodyTextOnly=text;return request('/content/add',key,body,V1);}
  finally{try{fs.rmSync(temp.dir,{recursive:true,force:true})}catch{}}
}
async function xPublicGet(endpoint,params={}) {
  const url=new URL(X_PUBLIC_API+endpoint);
  for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
  const response=await fetch(url,{headers:{accept:'application/json'}});
  const raw=await response.text();
  let json;try{json=JSON.parse(raw)}catch{throw new Error('Public X search returned non-JSON HTTP '+response.status+'.');}
  if(!response.ok)throw new Error('Public X search error HTTP '+response.status+': '+(json.detail||json.message||raw.slice(0,200)));
  return json;
}
export async function getXTrends({maxTrends=20}={}) {
  const n=Math.min(20,Math.max(1,Number(maxTrends)||20));
  const data=await xPublicGet('/search',{q:'trending OR #trending',feed:'top',limit:n,format:'json'});
  const posts=data.posts??data.data?.posts??[];
  const counts=new Map();
  for(const p of posts){
    const text=p.text??p.content??'';
    for(const token of text.match(/#[\p{L}\p{N}_]+/gu)??[])counts.set(token,(counts.get(token)||0)+1);
  }
  const trends=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([name,count],i)=>({rank:i+1,name,tweetCount:count}));
  return{source:'public-x-search',trends};
}
export async function searchXPosts({query,maxResults=10}={}) {
  if(!query?.trim())throw new Error('query must not be empty.');
  const n=Math.min(20,Math.max(1,Number(maxResults)||10));
  const data=await xPublicGet('/search',{q:query.trim(),feed:'latest',limit:n,format:'json'});
  const posts=data.posts??data.data?.posts??[];
  return{query:query.trim(),posts:posts.map(p=>({id:p.id??null,text:p.text??p.content??'',createdAt:p.created_at??p.createdAt??null,authorId:p.author?.username??p.username??null,metrics:p.metrics??p.public_metrics??{}}))};
}

function isPrivateIp(address){
  if(net.isIPv4(address)){
    const [a,b,c]=address.split('.').map(Number);
    return a===10||a===127||(a===169&&b===254)||(a===192&&b===168)||(a===172&&b>=16&&b<=31)||a===0||a>=224;
  }
  if(net.isIPv6(address)){
    const ip=address.toLowerCase();
    return ip==='::1'||ip==='::'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe8')||ip.startsWith('fe9')||ip.startsWith('fea')||ip.startsWith('feb')||ip.startsWith('ff');
  }
  return true;
}
async function assertSafeRemoteUrl(url){
  if(url.username||url.password)throw new Error('Media URL cannot contain credentials.');
  if(url.protocol!=='https:')throw new Error('Media URL must use HTTPS.');
  const host=url.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0')throw new Error('Local media hosts are not allowed.');
  const addresses=net.isIP(host)?[host]:((await lookup(host,{all:true})).map(x=>x.address));
  if(!addresses.length||addresses.some(isPrivateIp))throw new Error('Media URL resolves to a non-public address.');
}
async function downloadRemoteFile(url,maxBytes,kind){
  let current=new URL(url);
  for(let redirect=0;redirect<=3;redirect++){
    await assertSafeRemoteUrl(current);
    const response=await fetch(current,{redirect:'manual',headers:{accept:kind==='video'?'video/*':'image/*,*/*;q=0.8'}});
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');
      if(!location)throw new Error('Media redirect missing location.');
      current=new URL(location,current);continue;
    }
    if(!response.ok)throw new Error('Media download failed: HTTP '+response.status);
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>maxBytes)throw new Error('Media file exceeds the '+Math.round(maxBytes/1024/1024)+' MB limit.');
    const contentType=response.headers.get('content-type')||'';
    if(kind==='image'&&!contentType.toLowerCase().startsWith('image/'))throw new Error('URL did not return an image.');
    if(kind==='video'&&!contentType.toLowerCase().startsWith('video/'))throw new Error('URL did not return a video.');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qube-media-'));
    const extFromType=(contentType.toLowerCase().split(';')[0]||'').trim();
    const typeExt=({'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm','video/x-msvideo':'.avi'})[extFromType]||(kind==='video'?'.mp4':'.jpg');
    const file=path.join(dir,'input'+typeExt);
    const out=fs.createWriteStream(file,{flags:'wx'});
    let total=0;
    try{
      const reader=response.body?.getReader();
      if(!reader)throw new Error('Media response has no body.');
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        total+=value.byteLength;
        if(total>maxBytes){await reader.cancel();throw new Error('Media file exceeds the '+Math.round(maxBytes/1024/1024)+' MB limit.');}
        if(!out.write(Buffer.from(value)))await new Promise(resolve=>out.once('drain',resolve));
      }
      await new Promise((resolve,reject)=>{out.end(err=>err?reject(err):resolve());});
      if(total===0)throw new Error('Media file is empty.');
      return{dir,file};
    }catch(e){
      try{out.destroy();}catch{}
      try{fs.rmSync(dir,{recursive:true,force:true})}catch{}
      throw e;
    }
  }
  throw new Error('Too many media redirects.');
}

async function downloadOpenAIImageRef(ref){
  const link=typeof ref==='string'?ref:ref?.download_link;
  const mime=typeof ref==='object'&&ref?.mime_type?String(ref.mime_type).toLowerCase():'';
  if(!link)throw new Error('Invalid OpenAI file reference: missing download_link.');
  if(mime&&!mime.startsWith('image/'))throw new Error('Only image file references are supported for image publishing.');
  return downloadRemoteFile(link,MAX_IMAGE_BYTES,'image');
}
export async function publishImagesFromFileRefs({text,openaiFileIdRefs,title}){
  const refs=Array.isArray(openaiFileIdRefs)?openaiFileIdRefs:[];
  if(!text?.trim())throw new Error('text must not be empty.');
  if(refs.length<1||refs.length>4)throw new Error('Image publishing requires 1 to 4 OpenAI file references.');
  const downloads=[];
  try{
    for(const ref of refs)downloads.push(await downloadOpenAIImageRef(ref));
    return await publishImages({text,images:downloads.map(d=>d.file),title});
  }finally{for(const d of downloads){try{fs.rmSync(d.dir,{recursive:true,force:true})}catch{}}}
}

export async function publishImagesFromUrls({text,images,title,cover}){
  const imageUrls=Array.isArray(images)?images:[];
  if(title){if(imageUrls.length)throw new Error('Article mode accepts only cover URL.');if(!cover)throw new Error('Article mode requires cover URL.');}
  else if(imageUrls.length<1||imageUrls.length>4)throw new Error('Image posts require 1 to 4 image URLs.');
  const downloads=[];
  try{
    if(title){const d=await downloadRemoteFile(cover,MAX_IMAGE_BYTES,'image');downloads.push(d);return await publishImages({text,title,cover:d.file});}
    for(const url of imageUrls){const d=await downloadRemoteFile(url,MAX_IMAGE_BYTES,'image');downloads.push(d);}
    return await publishImages({text,images:downloads.map(d=>d.file)});
  }finally{for(const d of downloads){try{fs.rmSync(d.dir,{recursive:true,force:true})}catch{}}}
}
export async function publishVideoFromUrl({video,duration,text}){
  const d=await downloadRemoteFile(video,MAX_VIDEO_BYTES,'video');
  try{
    const seconds=duration==null?probeVideoDuration(d.file):Number(duration);
    if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Video duration is unavailable. Provide duration in seconds.');
    return await publishVideo({video:d.file,duration:seconds,text});
  }finally{try{fs.rmSync(d.dir,{recursive:true,force:true})}catch{}}
}
