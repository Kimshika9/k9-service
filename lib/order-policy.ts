import {normalizeStatus} from './catalog.ts';
export const terminalStatuses=['Done','Rejected','Cancelled'];
export function assertOwnerAction(action:string,o:{status:string;paymentStatus:string;amount:number|null},reason=''){
 const status=normalizeStatus(o.status);
 if(terminalStatuses.includes(status))throw new Error('This order is already closed.');
 if(['reject','hold'].includes(action)&&!reason.trim())throw new Error('Please provide a reason for the customer.');
 const allowed:Record<string,string[]>={quote:['Pending Review','Pending Payment','On Hold','Processing'],approve:['Pending Approval'],process:['Approved','On Hold'],deliver:['Processing'],done:['Processing','Delivered'],hold:['Pending Review','Pending Payment','Pending Approval','Approved','Processing'],reject:['Pending Review','Pending Payment','Pending Approval','Approved','On Hold'],note:['Pending Review','Pending Payment','Pending Approval','Approved','Processing','Delivered','On Hold']};
 if(!allowed[action]?.includes(status))throw new Error('That action is not available for this order’s current status.');
 if(['approve','process','deliver','done'].includes(action)&&(o.paymentStatus!=='Paid'||o.amount==null))throw new Error('Verify the KBZPay payment before approving or completing this order.');
 if(action==='quote'&&['Paid','Proof Submitted'].includes(o.paymentStatus))throw new Error('Review the current payment before changing the quote.');
}
export const actionStatus:Record<string,string>={quote:'Pending Payment',approve:'Approved',process:'Processing',deliver:'Delivered',done:'Done',hold:'On Hold',reject:'Rejected'};
export function canCustomerCancel(o:{status:string;paymentStatus:string}){return ['Pending Review','Pending Payment','On Hold'].includes(normalizeStatus(o.status))&&['Unpaid','Rejected'].includes(o.paymentStatus);}
export function normalizeTransaction(value:string){const s=value.trim().replaceAll(' ','').toUpperCase();if(!/^[A-Z0-9-]{6,64}$/.test(s))throw new Error('Enter a valid transaction ID (6–64 letters or digits).');return s;}
export function validateAmount(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<100||n>1000000000)throw new Error('Enter a whole MMK amount between 100 and 1,000,000,000.');return n;}
