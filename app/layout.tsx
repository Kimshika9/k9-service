import type { Metadata, Viewport } from 'next';
import './globals.css';
import './horizon.css';
import './orbit/tokens.css';
export const metadata:Metadata={title:'K9 Service — Digital power. From the void.',description:'Telegram bots, Mini Apps, websites and creative services. One identity. Many capabilities.',icons:{icon:'/favicon.svg'},openGraph:{title:'K9 Service',description:'Your next idea starts here.',images:['/brand/k9-energy.png']}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head><script id="telegram-web-app" src="https://telegram.org/js/telegram-web-app.js?64" defer/></head><body>{children}</body></html>}
