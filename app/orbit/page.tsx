import type {Metadata} from 'next';
import Orbit from './orbit';
import './orbit.css';

export const metadata:Metadata={title:'K9 Orbit | K9 Service'};
export default function OrbitPage(){return <Orbit/>;}
