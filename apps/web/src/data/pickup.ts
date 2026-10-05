import {useEffect,useState} from 'react';
import {nestRequest} from '../services/nestClient';
import {STORE_CONTEXT_CHANGED_EVENT} from './multiStoreStore';
export type PickupMethod={id:string;name:string;kind:'immediate'|'order'|'delivery';active:boolean;lead_days?:Record<string,number>};
export type DeliveryAddress={zipCode:string;street:string;number:string;district:string;city:string;state:string;complement?:string};
export function usePickupMethods(publicMode=false){
 const [methods,setMethods]=useState<PickupMethod[]>([]);const [error,setError]=useState('');
 useEffect(()=>{let alive=true;let generation=0;const reload=()=>{const run=++generation;setMethods([]);void nestRequest<PickupMethod[]>(publicMode?'/totem/pickup-methods':'/pickup-methods').then(rows=>{if(alive&&run===generation){setMethods(rows);setError('');}}).catch(e=>{if(alive&&run===generation)setError(e.message);});};reload();window.addEventListener(STORE_CONTEXT_CHANGED_EVENT,reload);return()=>{alive=false;window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT,reload);};},[publicMode]);
 return {methods,error};
}
