import type {Order,PaymentConfig,Service} from './catalog';

// Contracts for this Worker's own responses. Untrusted request bodies stay unknown.
export type SessionUser={name:string;contact:string;isOwner:boolean};
export type Integration={configured:boolean;botUsername?:string|null};
export type BootstrapResponse={
 user:SessionUser|null;services:Service[];paymentConfig:PaymentConfig;
 integration:Integration;setupRequired?:boolean;
};
export type OrderResponse={order:Order};
export type OrdersResponse={orders:Order[]};
export type Api=<T extends object=Record<string,unknown>>(path:string,options?:RequestInit)=>Promise<T>;
