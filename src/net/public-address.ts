// Conservative public-read profile, independently implemented from IANA address registries.
// Checked 2026-09-29: https://www.iana.org/assignments/iana-ipv4-special-registry/
// and https://www.iana.org/assignments/iana-ipv6-special-registry/ (updated 2025-10-09).
// Special allocations (including globally reachable exceptions) remain denied in v1.
import { isIP } from 'node:net';
export interface NormalizedAddress { address: string; family: 4 | 6; value: bigint }
export function normalizeAddress(raw: string): NormalizedAddress | null {
  if (typeof raw !== 'string' || raw !== raw.trim() || raw.includes('%')) return null;
  const family = isIP(raw);
  if (family === 4) {
    const parts = raw.split('.').map(Number);
    return {address: parts.join('.'), family: 4, value: parts.reduce((v,p)=>(v<<8n)+BigInt(p),0n)};
  }
  if (family !== 6) return null;
  let text = raw.toLowerCase();
  if (text.includes('.')) {
    const at = text.lastIndexOf(':'), tail = normalizeAddress(text.slice(at+1));
    if (!tail || tail.family !== 4) return null;
    text = text.slice(0,at+1)+(tail.value>>16n).toString(16)+':'+(tail.value&65535n).toString(16);
  }
  const halves = text.split('::'), left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const parts = halves.length === 2 ? [...left,...Array(8-left.length-right.length).fill('0'),...right] : left;
  const value = parts.reduce((v,p)=>(v<<16n)+BigInt('0x'+p),0n);
  if (value>>32n === 65535n) return normalizeAddress([24n,16n,8n,0n].map(n=>Number((value>>n)&255n)).join('.'));
  return {address:parts.map(p=>parseInt(p,16).toString(16)).join(':'), family:6, value};
}
const V4_SPECIAL = ['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8',
  '169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.31.196.0/24',
  '192.52.193.0/24','192.88.99.0/24','192.168.0.0/16','192.175.48.0/24',
  '198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'];
const V6_SPECIAL = ['2001::/23','2001:db8::/32','2002::/16','2620:4f:8000::/48','3fff::/20'];
function inRange(value: NormalizedAddress, cidr: string): boolean {
  const [address, prefix] = cidr.split('/'), base = normalizeAddress(address)!;
  if (base.family !== value.family) return false;
  const shift = BigInt((value.family === 4 ? 32 : 128)-Number(prefix));
  return value.value>>shift === base.value>>shift;
}
export function isPublicAddress(raw: string): boolean {
  const address = normalizeAddress(raw);
  if (!address) return false;
  if (address.family === 4) return !V4_SPECIAL.some(block=>inRange(address,block));
  // Only current global unicast 2000::/3. Excludes NAT64, ULA, link-local,
  // multicast, unspecified, transition and future unsupported allocations.
  return inRange(address,'2000::/3') && !V6_SPECIAL.some(block=>inRange(address,block));
}
export function sameAddress(a: string, b: string): boolean {
  const left = normalizeAddress(a), right = normalizeAddress(b);
  return !!left && !!right && left.family === right.family && left.value === right.value;
}
