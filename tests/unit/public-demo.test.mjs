import {describe,it,expect} from 'vitest';
import {Simulation} from '../../web/public/simulator.mjs';
describe('Public browser simulator',()=>{
  it('processes a paid order and selects mock quotes',async()=>{const s=new Simulation(),o=await s.process({quantity:2});expect(o.state).toBe('READY_FOR_FULFILLMENT');expect(o.quotes[0].amount).toBe(9);expect(s.summary().reserved).toBe(2);});
  it('does not reserve unpaid orders',async()=>{const s=new Simulation(),o=await s.process({paid:false});expect(o.state).toBe('AWAITING_PAYMENT');expect(s.summary().reserved).toBe(0);});
  it('deduplicates deliveries without duplicating stock or quotes',async()=>{const s=new Simulation(),o=await s.process({deliveryId:'same'});const duplicate=await s.replay(o.id);expect(duplicate.duplicate).toBe(true);expect(s.orders).toHaveLength(1);expect(s.summary().reserved).toBe(2);});
  it('allows only one competing order to take the last unit',async()=>{const s=new Simulation(),orders=await s.race();expect(orders.filter(o=>o.state==='READY_FOR_FULFILLMENT')).toHaveLength(1);expect(orders.filter(o=>o.state==='BACKORDERED')).toHaveLength(1);expect(s.summary().reserved).toBe(1);s.assertBalances();});
  it('releases stock only once on repeated cancellation',async()=>{const s=new Simulation(),o=await s.process({});await s.cancel(o.id);await s.cancel(o.id);expect(s.summary().reserved).toBe(0);s.assertBalances();});
  it('enforces store partial-allocation policy',async()=>{const s=new Simulation(),shop=await s.process({quantity:30});expect(shop.state).toBe('BACKORDERED');expect(shop.allocations).toHaveLength(0);const woo=await s.process({quantity:30,platform:'woocommerce'});expect(woo.state).toBe('PARTIALLY_ALLOCATED');expect(s.summary().reserved).toBe(18);});
  it('retries shipping without a second reservation',async()=>{const s=new Simulation(),o=await s.process({shippingFailure:true});expect(o.state).toBe('STOCK_RESERVED');await s.retryShipping(o.id);expect(o.state).toBe('READY_FOR_FULFILLMENT');expect(s.summary().reserved).toBe(2);});
  it('rejects invalid input without poisoning the processing queue',async()=>{const s=new Simulation();await expect(s.process({quantity:-1})).rejects.toThrow();expect(s.orders).toHaveLength(0);expect((await s.process({})).state).toBe('READY_FOR_FULFILLMENT');});
});
