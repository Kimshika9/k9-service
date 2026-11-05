type Callback<T>=(error:string|null,value?:T)=>void;
type NativeButton={
 show:()=>void;hide:()=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void;
};
export type CloudStorage={
 getItem:(key:string,callback:Callback<string>)=>void;
 setItem:(key:string,value:string,callback:Callback<boolean>)=>void;
};
type BottomButton=NativeButton&{
 setParams:(params:{text:string;color?:string;text_color?:string;is_active?:boolean})=>void;
 showProgress?:(leaveActive?:boolean)=>void;hideProgress?:()=>void;
};
export type MiniHost={
 platform?:string;
 MainButton?:BottomButton; SecondaryButton?:BottomButton; BackButton?:NativeButton; CloudStorage?:CloudStorage;
 HapticFeedback?:{selectionChanged?:()=>void;notificationOccurred?:(type:'success')=>void};
 ready?:()=>void;expand?:()=>void;close?:()=>void;openTelegramLink?:(url:string)=>void;
 setHeaderColor?:(color:string)=>void;setBackgroundColor?:(color:string)=>void;setBottomBarColor?:(color:string)=>void;
 enableClosingConfirmation?:()=>void;disableClosingConfirmation?:()=>void;disableVerticalSwipes?:()=>void;enableVerticalSwipes?:()=>void;
 isVersionAtLeast?:(version:string)=>boolean;isVerticalSwipesEnabled?:boolean;
};

export function getMiniHost(){
 const app=(window as Window&{Telegram?:{WebApp?:MiniHost}}).Telegram?.WebApp;
 return app?.platform&&app.platform!=='unknown'?app:undefined;
}

export function miniBotLink(value:unknown){
 if(typeof value!=='string')return undefined;
 const username=value.trim().replace(/^@/,'');
 return /^[A-Za-z0-9_]{5,32}$/.test(username)?'https://t.me/'+username:undefined;
}

export async function loadMiniBotLink(signal:AbortSignal){
 const response=await fetch('/api/connection/status',{signal});
 if(!response.ok)return undefined;
 const data=await response.json() as {bot?:{username?:unknown}|null}|null;
 return miniBotLink(data?.bot?.username);
}
