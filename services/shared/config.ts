import 'dotenv/config';
import fs from 'node:fs';
import { z } from 'zod';

const env = z.object({
  MODE:z.enum(['MOCK_MODE','LIVE_MODE']).default('MOCK_MODE'),
  LIVE_ACTIVATED:z.string().default('false'),
  DATABASE_URL:z.string().min(1), INTERNAL_TOKEN:z.string().min(32),
  MOCK_WEBHOOK_SECRET:z.string().min(16),
  MOCK_URL:z.string().url().default('http://127.0.0.1:3002'),
  INVENTORY_URL:z.string().url().default('http://127.0.0.1:3001'),
  GATEWAY_URL:z.string().url().default('http://127.0.0.1:3100'),
  N8N_URL:z.string().url().default('http://127.0.0.1:5678'),
  SHIPPO_TOKEN:z.string().default(''),SLACK_TOKEN:z.string().default(''),SLACK_CHANNEL:z.string().default('operations'),
  SHOPIFY_API_VERSION:z.string().regex(/^20\d\d-(01|04|07|10)$/).default('2026-10'),
  SHIPPO_API_VERSION:z.string().default('2018-02-08'),
  API_TIMEOUT_MS:z.coerce.number().positive().default(5000),
  RETRY_BASE_MS:z.coerce.number().nonnegative().default(200),
  RESERVATION_MINUTES:z.coerce.number().positive().default(30),
  MAX_TRANSIT_DAYS:z.coerce.number().int().positive().default(7),
  ALLOWED_SERVICES:z.string().default('ground,priority'),
  PACKING_POLICY:z.enum(['per_unit','per_sku_stack']).default('per_unit'),
  MAX_PARCELS:z.coerce.number().int().positive().default(1000),
  MAX_PARCEL_WEIGHT_KG:z.coerce.number().positive().default(25),
  MAX_PARCEL_SIDE_CM:z.coerce.number().positive().default(120),
  ALLOW_METADATA_WRITES:z.string().default('false'),
  INVENTORY_SNAPSHOT_URL:z.string().default(''),INVENTORY_SNAPSHOT_TOKEN:z.string().default('')
});
export const config=env.parse(process.env);
export type Platform='shopify'|'woocommerce';
export interface StoreConfig {id:string; platform:Platform; domain:string; secret:string; token?:string; consumerKey?:string; consumerSecret?:string; allowPartial:boolean; allowBackorder:boolean}
export const stores:StoreConfig[]=config.MODE==='MOCK_MODE' ? [
  {id:'shop-us',platform:'shopify',domain:'demo.myshopify.com',secret:config.MOCK_WEBHOOK_SECRET,allowPartial:false,allowBackorder:true},
  {id:'woo-us',platform:'woocommerce',domain:'https://woo.example.test',secret:config.MOCK_WEBHOOK_SECRET,allowPartial:true,allowBackorder:true},
  {id:'shop-eu',platform:'shopify',domain:'eu.myshopify.com',secret:config.MOCK_WEBHOOK_SECRET,allowPartial:false,allowBackorder:false}
] : z.array(z.object({id:z.string().regex(/^[a-z0-9-]+$/),platform:z.enum(['shopify','woocommerce']),domain:z.string(),secret:z.string().min(16),token:z.string().optional(),consumerKey:z.string().optional(),consumerSecret:z.string().optional(),allowPartial:z.boolean(),allowBackorder:z.boolean()})).min(1).parse(JSON.parse(fs.readFileSync(process.env.STORES_FILE||'config/stores.live.json','utf8')));
if(config.MODE==='LIVE_MODE'){
  if(config.LIVE_ACTIVATED!=='true') throw new Error('LIVE_MODE requires LIVE_ACTIVATED=true');
  if(!config.SHIPPO_TOKEN||!config.SLACK_TOKEN||!config.INVENTORY_SNAPSHOT_URL) throw new Error('Live Shippo, Slack and authoritative inventory snapshot configuration required');
  for(const store of stores){
    if(store.platform==='shopify'&&(!store.token||!/^[-a-z0-9]+\.myshopify\.com$/.test(store.domain))) throw new Error('Shopify token or domain missing');
    if(store.platform==='woocommerce'&&(!store.consumerKey||!store.consumerSecret||!store.domain.startsWith('https://'))) throw new Error('WooCommerce HTTPS credentials required');
  }
  if(!config.INVENTORY_SNAPSHOT_URL.startsWith('https://'))throw new Error('Live snapshot connector requires HTTPS');
}
