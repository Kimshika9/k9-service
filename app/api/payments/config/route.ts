import {getPaymentConfig,publicPaymentConfig} from '../../../../lib/payment-config';
import {json,error} from '../../../../lib/server';
export async function GET(){try{return json({paymentConfig:publicPaymentConfig(await getPaymentConfig())});}catch(e){return error(e);}}
