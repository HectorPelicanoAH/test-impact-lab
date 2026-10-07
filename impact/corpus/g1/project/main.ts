import { same as first } from '@lib/one';
import { same as second } from './lib/two';
import { renamed } from './lib/barrel';
import type { Port } from './port';
export function direct() { first(); second(); renamed(); }
export function viaPort(port: Port) { return port.send(); }
export function invoke(callback: () => void) { callback(); }
export function callbackUser() { invoke(first); }
export async function literal() { return import('./lib/one'); }
export async function dynamic(name: string) { return import(name); }
export function aliasLocal() { const fn = first; fn(); }