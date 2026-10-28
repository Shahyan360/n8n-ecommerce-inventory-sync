import fs from 'node:fs';
const images=[['library/node','24.22.1-bookworm-slim'],['library/postgres','18.6-bookworm'],['library/redis','8.2.2-bookworm'],['n8nio/n8n','2.45.4'],['n8nio/runners','2.45.4']];
const results=[];
for(const [repository,tag] of images){
  try{
    const tokenResponse=await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`,{signal:AbortSignal.timeout(20000)});
    if(!tokenResponse.ok)throw new Error(`Registry token HTTP ${tokenResponse.status}`);
    const {token}=await tokenResponse.json();
    const response=await fetch(`https://registry-1.docker.io/v2/${repository}/manifests/${tag}`,{method:'HEAD',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json'},signal:AbortSignal.timeout(20000)});
    results.push({image:`${repository}:${tag}`,status:response.status,digest:response.headers.get('docker-content-digest')});
  }catch(error){results.push({image:`${repository}:${tag}`,error:error.message});}
}
fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/images.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status!==200))process.exitCode=1;
