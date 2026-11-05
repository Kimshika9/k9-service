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
