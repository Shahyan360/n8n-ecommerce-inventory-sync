import {config,type StoreConfig} from '../shared/config.js';
import {requestJson,jsonPost} from '../shared/http.js';
export async function fetchOrders(store:StoreConfig,since:string):Promise<any[]>{
  const result:any[]=[];
  if(config.MODE==='MOCK_MODE')return requestJson(`${config.MOCK_URL}/stores/${store.id}/orders`);
  if(store.platform==='woocommerce'){
    for(let page=1;;page++){
      const url=new URL(`${store.domain.replace(/\/$/,'')}/wp-json/wc/v3/orders`);
      url.search=new URLSearchParams({modified_after:since.replace('Z',''),dates_are_gmt:'true',per_page:'100',page:String(page),orderby:'modified',order:'asc'}).toString();
      const orders=await requestJson(url.toString(),{headers:{Authorization:`Basic ${Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString('base64')}`}});
      result.push(...orders);if(orders.length<100)break;if(page>=1000)throw new Error('Reconciliation pagination safety limit');
    }
  }else{
    let after:string|null=null;
    const query=`query Reconcile($after:String,$search:String!){orders(first:50,after:$after,query:$search,sortKey:UPDATED_AT){pageInfo{hasNextPage endCursor} nodes{id legacyResourceId createdAt updatedAt cancelledAt currencyCode displayFinancialStatus displayFulfillmentStatus email totalPriceSet{shopMoney{amount}} totalTaxSet{shopMoney{amount}} totalDiscountsSet{shopMoney{amount}} totalShippingPriceSet{shopMoney{amount}} shippingAddress{name address1 address2 city provinceCode zip countryCodeV2} lineItems(first:250){pageInfo{hasNextPage} nodes{id sku quantity currentQuantity originalUnitPriceSet{shopMoney{amount}} variant{id legacyResourceId product{id legacyResourceId}} requiresShipping}}}}}`;
    for(let page=0;page<1000;page++){
      const response=await requestJson(`https://${store.domain}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`,jsonPost({query,variables:{after,search:`updated_at:>='${since}'`}},{'X-Shopify-Access-Token':store.token!}));
      const orders=response.data.orders;
      for(const o of orders.nodes){
        if(o.lineItems.pageInfo.hasNextPage)throw new Error('Order has >250 lines: manual bulk reconciliation required');
        result.push({id:o.legacyResourceId,created_at:o.createdAt,updated_at:o.updatedAt,cancelled_at:o.cancelledAt,currency:o.currencyCode,financial_status:o.displayFinancialStatus?.toLowerCase(),fulfillment_status:o.displayFulfillmentStatus==='FULFILLED'?'fulfilled':o.displayFulfillmentStatus==='PARTIALLY_FULFILLED'?'partial':null,email:o.email,total_price:o.totalPriceSet.shopMoney.amount,total_tax:o.totalTaxSet.shopMoney.amount,total_discounts:o.totalDiscountsSet.shopMoney.amount,total_shipping_price_set:{shop_money:o.totalShippingPriceSet.shopMoney},shipping_address:o.shippingAddress?{...o.shippingAddress,province_code:o.shippingAddress.provinceCode,country_code:o.shippingAddress.countryCodeV2}:null,line_items:o.lineItems.nodes.map((l:any)=>({id:l.id,sku:l.sku,quantity:l.quantity,current_quantity:l.currentQuantity,price:l.originalUnitPriceSet.shopMoney.amount,variant_id:l.variant?.legacyResourceId,product_id:l.variant?.product?.legacyResourceId,requires_shipping:l.requiresShipping}))});
      }
      if(!orders.pageInfo.hasNextPage)return result;
      after=orders.pageInfo.endCursor;
    }
    throw new Error('Reconciliation pagination safety limit');
  }return result;
}
export async function writeMetadata(store:StoreConfig,externalId:string,state:string){
  if(config.ALLOW_METADATA_WRITES!=='true')return;
  if(config.MODE==='MOCK_MODE'){await requestJson(`${config.MOCK_URL}/metadata`,jsonPost({store:store.id,externalId,state}));return;}
  if(store.platform==='woocommerce')await requestJson(`${store.domain}/wp-json/wc/v3/orders/${encodeURIComponent(externalId)}`,{method:'PUT',headers:{'content-type':'application/json',Authorization:`Basic ${Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString('base64')}`},body:JSON.stringify({meta_data:[{key:'_automation_state',value:state}]})});
  else {
    const result=await requestJson(`https://${store.domain}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`,jsonPost({query:'mutation State($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){userErrors{field message}}}',variables:{m:[{ownerId:`gid://shopify/Order/${externalId}`,namespace:'automation',key:'state',type:'single_line_text_field',value:state}]}},{'X-Shopify-Access-Token':store.token!}));
    if(result.data?.metafieldsSet?.userErrors?.length)throw new Error('Shopify rejected metadata update');
  }
}
