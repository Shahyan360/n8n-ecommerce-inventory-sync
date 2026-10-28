import path from 'node:path';
export function pgTool(name){return process.env.PG_BIN?path.join(process.env.PG_BIN,`${name}${process.platform==='win32'?'.exe':''}`):`${name}${process.platform==='win32'?'.exe':''}`;}
