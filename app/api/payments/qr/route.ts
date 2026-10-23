import {getPaymentConfig} from '../../../../lib/payment-config';
import {imageResponse} from '../../../../lib/receipt-files';
import {ApiError,error} from '../../../../lib/server';
export async function GET(){try{const c=await getPaymentConfig();if(!c.enabled||!c.qrKey)throw new ApiError(404,'QR not available.');return imageResponse(c.qrKey);}catch(e){return error(e);}}
