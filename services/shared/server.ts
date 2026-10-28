import Fastify,{LogController} from 'fastify';
import {timingSafeEqual} from 'node:crypto';
import {config} from './config.js';
export function makeServer(){
  const app=Fastify({bodyLimit:2*1024*1024,requestTimeout:90000,logger:{level:'info',redact:['req.headers.authorization','req.headers.x-internal-token','req.headers.x-shopify-hmac-sha256','req.headers.x-wc-webhook-signature','body','payload']},logController:new LogController({disableRequestLogging:true})});
  app.addHook('preHandler',async(req,reply)=>{
    if(req.url.startsWith('/internal/')||req.url.startsWith('/admin/')){
      const supplied=Buffer.from(String(req.headers['x-internal-token']||''));const expected=Buffer.from(config.INTERNAL_TOKEN);
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply.code(401).send({error:'Unauthorized'});
    }
  });
  app.setErrorHandler((error:any,req,reply)=>{
    req.log.error({type:error.name,code:error.code,route:req.routeOptions.url},'Request failed');
    reply.code(error.statusCode||500).send({error:error.statusCode&&error.statusCode<500?error.message:'Operation failed; inspect operational audit'});
  });return app;
}
