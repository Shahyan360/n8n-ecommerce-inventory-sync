import { config } from './config.js';
export class ApiError extends Error{constructor(message:string,public status:number,public retryAfter=0){super(message);}}
export async function requestJson(url:string,init:RequestInit={},attempts=3):Promise<any>{
  let last:unknown;
  for(let n=0;n<attempts;n++){
    try{
      const r=await fetch(url,{...init,signal:AbortSignal.timeout(config.API_TIMEOUT_MS)});
      if(!r.ok){const retry=Number(r.headers.get('retry-after')||0);throw new ApiError(`Upstream HTTP ${r.status}`,r.status,retry);}
      const data=await r.json();
      if(data.ok===false)throw new ApiError(`Slack ${data.error||'failed'}`,data.error==='ratelimited'?429:400);
      if(data.errors)throw new ApiError('GraphQL errors returned',data.errors.some((e:any)=>e.extensions?.code==='THROTTLED')?429:400);
      return data;
    }catch(error){
      last=error;
      if(error instanceof ApiError && error.status<500&&error.status!==429)throw error;
      if(n+1<attempts){const delay=error instanceof ApiError&&error.retryAfter?Math.min(60000,error.retryAfter*1000):config.RETRY_BASE_MS*2**n+Math.random()*config.RETRY_BASE_MS;await new Promise(r=>setTimeout(r,delay));}
    }
  }
  throw last;
}
export const jsonPost=(body:unknown,headers:Record<string,string>={}):RequestInit=>({method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
export const internalHeaders=()=>({'x-internal-token':config.INTERNAL_TOKEN});
