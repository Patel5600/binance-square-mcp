const BINANCE_PUBLIC='https://api.binance.com/api/v3';
const COINGECKO='https://api.coingecko.com/api/v3';
const DEFILLAMA='https://api.llama.fi';
const cache=new Map();
const TTL=15_000;

async function jsonGet(url){
  const cached=cache.get(url);
  if(cached&&Date.now()-cached.at<TTL)return cached.data;
  const response=await fetch(url,{headers:{accept:'application/json','user-agent':'qube-research/1.0'}});
  const raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch{throw new Error('Research source returned non-JSON HTTP '+response.status+'.');}
  if(!response.ok)throw new Error('Research source error HTTP '+response.status+': '+(data.msg||data.error||data.message||raw.slice(0,200)));
  cache.set(url,{at:Date.now(),data});
  return data;
}

export async function researchMarket({symbol='BTCUSDT',interval='1h',limit=24}={}){
  const clean=String(symbol).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const allowed=['1m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d'];
  if(!allowed.includes(interval))throw new Error('Unsupported interval.');
  const n=Math.min(100,Math.max(1,Number(limit)||24));
  const ticker=await jsonGet(BINANCE_PUBLIC+'/ticker/24hr?symbol='+encodeURIComponent(clean));
  const candles=await jsonGet(BINANCE_PUBLIC+'/klines?symbol='+encodeURIComponent(clean)+'&interval='+encodeURIComponent(interval)+'&limit='+n);
  return {source:'binance-public-api',symbol:clean,ticker:{lastPrice:Number(ticker.lastPrice),priceChangePercent:Number(ticker.priceChangePercent),highPrice:Number(ticker.highPrice),lowPrice:Number(ticker.lowPrice),volume:Number(ticker.volume),quoteVolume:Number(ticker.quoteVolume),trades:Number(ticker.count)},candles:candles.map(k=>({openTime:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),closeTime:k[6]}))};
}

export async function researchToken({id}={}){
  const clean=String(id||'').trim().toLowerCase();
  if(!clean)throw new Error('id is required, e.g. bitcoin or ethereum.');
  const data=await jsonGet(COINGECKO+'/coins/'+encodeURIComponent(clean)+'?localization=false&tickers=false&market_data=true&community_data=false&developer_data=true');
  return {source:'coingecko-public-api',id:data.id,name:data.name,symbol:data.symbol,market:{marketCap:data.market_data?.market_cap?.usd??null,fullyDilutedValuation:data.market_data?.fully_diluted_valuation?.usd??null,currentPrice:data.market_data?.current_price?.usd??null,priceChange24h:data.market_data?.price_change_percentage_24h??null,volume24h:data.market_data?.total_volume?.usd??null,ath:data.market_data?.ath?.usd??null,athChangePercent:data.market_data?.ath_change_percentage?.usd??null},supply:{circulating:data.market_data?.circulating_supply??null,total:data.market_data?.total_supply??null,max:data.market_data?.max_supply??null},developer:{stars:data.developer_data?.stars??null,commits4Weeks:data.developer_data?.commit_count_4_weeks??null}};
}

export async function researchDefi({protocol}={}){
  const clean=String(protocol||'').trim();
  if(!clean)throw new Error('protocol is required, e.g. aave or lido.');
  const data=await jsonGet(DEFILLAMA+'/protocol/'+encodeURIComponent(clean));
  return {source:'defillama-public-api',id:data.id??null,name:data.name??null,symbol:data.symbol??null,url:data.url??null,chains:data.chains??[],tvl:data.tvl??null,currentChainTvls:data.currentChainTvls??null,change_1d:data.change_1d??null,change_7d:data.change_7d??null,mcap:data.mcap??null,category:data.category??null,methodology:data.methodology??null};
}
