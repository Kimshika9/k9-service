import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'K9 Service — Digital power. From the void.',description:'Telegram bots, Mini Apps, websites and creative services. One identity. Many capabilities.',icons:{icon:'/favicon.svg'},openGraph:{title:'K9 Service',description:'Your next idea starts here.',images:['/brand/k9-energy.png']}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
