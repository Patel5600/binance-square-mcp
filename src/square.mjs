import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const V1 = 'https://www.binance.com/bapi/composite/v1/public/pgc/openApi';
const V2 = 'https://www.binance.com/bapi/composite/v2/public/pgc/openApi';
const POLL_MS = 3000;
const POLL_RETRIES = 10;

function localKeyPath() { return path.join(os.homedir(), '.config', 'binance-square', 'openapi-key'); }

export function resolveKey() {
  const env = process.env.BINANCE_SQUARE_OPENAPI_KEY?.trim();
  if (env) return env;
  const file = localKeyPath();
  if (fs.existsSync(file)) { const key = fs.readFileSync(file, 'utf8').trim(); if (key) return key; }
  throw new Error('Missing BINANCE_SQUARE_OPENAPI_KEY. Configure the key in the MCP host environment.');
}

export function maskKey(key) {
  if (!key) return '';
  return key.length <= 9 ? key.slice(0, 2) + '...' : key.slice(0, 5) + '...' + key.slice(-4);
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return ({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.avi':'video/x-msvideo','.webm':'video/webm'})[ext] ?? 'application/octet-stream';
}

async function request(endpoint, key, body, base = V2) {
  const response = await fetch(base + endpoint, { method:'POST', headers:{'X-Square-OpenAPI-Key':key,'Content-Type':'application/json',clienttype:'binanceSkill'}, body:JSON.stringify(body) });
  const raw = await response.text();
  if (endpoint === '/content/add' && response.status === 504) return {id:null,shareLink:null,publishStatus:'success_without_post_id'};
  let json; try { json = JSON.parse(raw); } catch { throw new Error('Binance returned non-JSON HTTP ' + response.status + '.'); }
  if (json.code !== '000000') throw new Error('Binance API error [' + json.code + ']: ' + (json.message ?? 'unknown error'));
  return json.data;
}

async function putFile(url, file, contentType) {
  const response = await fetch(url, {method:'PUT',headers:{'Content-Type':contentType},body:fs.readFileSync(file)});
  if (!response.ok) throw new Error('Media upload failed: HTTP ' + response.status + ' ' + response.statusText);
}

async function pollMedia(key, ticket) {
  for (let attempt=1; attempt<=POLL_RETRIES; attempt++) {
    const data = await request('/image/imageStatus', key, {fileTicket:ticket});
    if (data.status === 1) return data.imageUrl;
    if (data.status === 2) throw new Error('Media processing failed: ' + (data.failedReason ?? 'unknown reason'));
    if (attempt < POLL_RETRIES) await new Promise(r=>setTimeout(r,POLL_MS));
  }
  throw new Error('Media processing timed out.');
}

function extractCover(video) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'square-video-'));
  const cover = path.join(dir, path.parse(video).name + '-cover.png');
  const result = spawnSync('ffmpeg', ['-y','-loglevel','error','-i',video,'-frames:v','1','-q:v','2',cover], {encoding:'utf8'});
  if (result.error) throw new Error('ffmpeg unavailable: ' + result.error.message);
  if (result.status !== 0) throw new Error('ffmpeg cover extraction failed: ' + (result.stderr || 'unknown error'));
  if (!fs.existsSync(cover) || fs.statSync(cover).size === 0) throw new Error('ffmpeg produced an empty cover image.');
  return {dir, cover};
}

async function uploadImage(key, file) {
  if (!fs.existsSync(file)) throw new Error('Image not found: ' + file);
  const ticket = await request('/image/presignedUrl', key, {imageName:path.basename(file)});
  await putFile(ticket.presignedUrl, file, mimeFor(file));
  return pollMedia(key, ticket.fileTicket);
}

export async function publishText({text,title}) {
  if (!text?.trim()) throw new Error('text must not be empty.');
  const key=resolveKey(); const body={contentType:title?2:1,bodyTextOnly:text}; if(title) body.title=title;
  return request('/content/add',key,body,V1);
}

export async function publishImages({text,images,title,cover}) {
  if (!text?.trim()) throw new Error('text must not be empty.');
  const files=Array.isArray(images)?images:[];
  if(title){ if(files.length) throw new Error('Article mode cannot use images[]; provide exactly one cover.'); if(!cover) throw new Error('Article mode requires one cover image.'); }
  else { if(cover) throw new Error('cover is only valid for article mode.'); if(files.length<1||files.length>4) throw new Error('Image posts require 1 to 4 images.'); }
  const key=resolveKey(); const body={contentType:title?2:1,bodyTextOnly:text};
  if(title){ body.title=title; body.cover=await uploadImage(key,cover); }
  else { body.imageList=[]; for(const file of files) body.imageList.push(await uploadImage(key,file)); }
  return request('/content/add',key,body,V1);
}

export async function publishVideo({video,duration,text}) {
  if(!video) throw new Error('video is required.');
  if(!Number.isFinite(Number(duration))||Number(duration)<=0) throw new Error('duration must be a positive number of seconds.');
  if(!fs.existsSync(video)) throw new Error('Video not found: ' + video);
  const key=resolveKey();
  const stat=fs.statSync(video);
  const ticket=await request('/video/preSign',key,{fileName:path.basename(video),size:stat.size});
  await putFile(ticket.presignedUrl,video,mimeFor(video));
  await pollMedia(key,ticket.fileTicket);
  const temp=extractCover(video);
  try {
    const cover=await uploadImage(key,temp.cover);
    const body={contentType:3,fileTicket:ticket.fileTicket,cover,videoTimeSeconds:Number(duration),isPublish:true};
    if(text) body.bodyTextOnly=text;
    return request('/content/add',key,body,V1);
  } finally {
    try { fs.rmSync(temp.dir,{recursive:true,force:true}); } catch {}
  }
}