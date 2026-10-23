import {customer,error,json} from '../../../../lib/server';
import {detailOrder} from '../../../../lib/order-engine';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return json({order:await detailOrder((await params).id,await customer(request))});}catch(e){return error(e);}}
