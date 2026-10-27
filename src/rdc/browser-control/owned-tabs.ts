export function isPageUrl(value:string):boolean {
  try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;} catch{return false;}
}
