import { isIP } from 'node:net';

const normalize=(ip:string)=>ip.toLowerCase().replace(/^::ffff:(?=\d+\.)/,'');
export function trustedProxyIps(value='') {
  const ips=value.split(',').map(ip=>ip.trim()).filter(Boolean);
  if(ips.some(ip=>!isIP(ip))) throw new Error('TRUSTED_PROXY_IPS must contain exact IP addresses separated by commas.');
  return new Set(ips.map(normalize));
}
export function clientIp(remote:string|undefined,forwarded:string|undefined,trusted:ReadonlySet<string>) {
  let address=normalize(remote??'unknown');
  if(!trusted.has(address)||!forwarded) return address;
  const chain=forwarded.split(',').map(ip=>ip.trim());
  // Fail closed to the socket address for malformed or excessively long chains.
  if(chain.length>20||chain.some(ip=>!isIP(ip))) return address;
  for(const ip of chain.reverse()) {
    if(!trusted.has(address)) break;
    address=normalize(ip);
  }
  return address;
}
