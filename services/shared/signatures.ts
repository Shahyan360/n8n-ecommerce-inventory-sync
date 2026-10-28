import {createHmac,timingSafeEqual} from 'node:crypto';
export const sign=(raw:Buffer,secret:string)=>createHmac('sha256',secret).update(raw).digest('base64');
export function verifySignature(raw:Buffer,secret:string,signature:unknown){
  if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(signature))return false;
  const expected=Buffer.from(sign(raw,secret),'base64'),actual=Buffer.from(signature,'base64');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
