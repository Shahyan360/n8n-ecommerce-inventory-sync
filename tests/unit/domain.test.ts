import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sign,verifySignature} from '../../services/shared/signatures.js';
import {normalize,reorderQuantity,transitions} from '../../services/shared/normalization.js';
import {shopifyFixture,wooFixture} from '../../services/mock-providers/fixtures.js';
import {eligibleRates,packParcels} from '../../services/inventory-service/shipping.js';
describe('Raw webhook authentication',()=>{
  it.each(['shopify','woocommerce'])('%s verifies genuine bytes and rejects tampering',()=>{const raw=Buffer.from('{ "id": 1 }');const sig=sign(raw,'secret');expect(verifySignature(raw,'secret',sig)).toBe(true);expect(verifySignature(Buffer.from('{"id":1}'),'secret',sig)).toBe(false);expect(verifySignature(raw,'wrong',sig)).toBe(false);});
  it.each(['',null,'wrong','a'.repeat(300)])('rejects malformed signature %s',sig=>expect(verifySignature(Buffer.from('{}'),'secret',sig)).toBe(false));
});
describe('Order normalization',()=>{
  it('normalizes Shopify money, variants, weights and destination',()=>{const n=normalize('shopify','shop-us',randomUUID(),'orders/create',shopifyFixture());expect(n.items[0]).toMatchObject({sku:'TSHIRT-BLUE-M',variant:'201',quantity:2,weightKg:0.25});expect(n.payment).toBe('paid');expect(n.total).toBe('49.98');});
  it('normalizes WooCommerce UTC and payment status',()=>{const n=normalize('woocommerce','woo-us',randomUUID(),'order.created',wooFixture());expect(n.updatedAt).toBe('2026-10-28T08:00:00Z');expect(n.payment).toBe('paid');});
  it('rejects a stocked item missing SKU',()=>{const p=shopifyFixture();p.line_items[0].sku='';expect(()=>normalize('shopify','shop-us',randomUUID(),'orders/create',p)).toThrow();});
  it('accepts digital goods without SKU or shipping address',()=>{const p=shopifyFixture();p.line_items[0].sku='';p.line_items[0].requires_shipping=false;expect(normalize('shopify','shop-us',randomUUID(),'orders/create',p).items[0].stocked).toBe(false);});
  it('rejects negative quantity and invalid currency',()=>{const p=shopifyFixture();p.line_items[0].quantity=-1;p.currency='bad';expect(()=>normalize('shopify','shop-us',randomUUID(),'orders/create',p)).toThrow();});
  it('rejects unsafe numeric provider identifiers',()=>{const p:any=shopifyFixture();p.id=Number.MAX_SAFE_INTEGER+10;expect(()=>normalize('shopify','shop-us',randomUUID(),'orders/create',p)).toThrow();});
  it('does not trust unsigned cancellation topic headers',()=>{expect(normalize('shopify','shop-us',randomUUID(),'orders/cancelled',shopifyFixture()).cancelled).toBe(false);});
  it('accepts cancellation payloads with zero current quantity',()=>{const p:any=shopifyFixture();p.cancelled_at='2026-10-28T09:00:00Z';p.line_items[0].current_quantity=0;expect(normalize('shopify','shop-us',randomUUID(),'orders/cancelled',p).cancelled).toBe(true);});
  it('never permits rate lookup to jump to fulfilled',()=>expect(transitions.STOCK_RESERVED).not.toContain('READY_FOR_FULFILLMENT'));
});
describe('Reorder policy',()=>{
  it('includes incoming and outstanding replenishment',()=>expect(reorderQuantity(2,4,8,5,25,6,6)).toBe(0));
  it('rounds recommendations to pack multiple',()=>expect(reorderQuantity(1,2,0,5,25,6,6)).toBe(24));
  it('applies minimum order quantity at the threshold',()=>expect(reorderQuantity(5,0,0,5,6,10,6)).toBe(12));
});
describe('Shipping policy',()=>{
  it('rejects missing parcel dimensions',()=>expect(()=>packParcels([{weight_kg:1,length_cm:10,width_cm:0,height_cm:5,quantity:1}])).toThrow('Missing parcel'));
  it('packs one parcel per physical unit',()=>expect(packParcels([{weight_kg:1,length_cm:10,width_cm:10,height_cm:5,quantity:3}])).toHaveLength(3));
  it('supports a configured vertical SKU stack',()=>expect(packParcels([{weight_kg:1,length_cm:10,width_cm:10,height_cm:5,quantity:3}],'per_sku_stack')).toEqual([{length:'10',width:'10',height:'15',weight:'3',distance_unit:'cm',mass_unit:'kg'}]));
  it('rejects stacks beyond configured physical limits',()=>expect(()=>packParcels([{weight_kg:1,length_cm:10,width_cm:10,height_cm:5,quantity:30}],'per_sku_stack')).toThrow('physical limits'));
  it('filters incorrect currencies, services and transit',()=>{const base={currency:'USD',amount:'6',estimated_days:4,servicelevel:{token:'ground'}};expect(eligibleRates([base,{...base,currency:'EUR'},{...base,estimated_days:null},{...base,estimated_days:10},{...base,servicelevel:{token:'banned'}}],'USD')).toHaveLength(1);});
});
