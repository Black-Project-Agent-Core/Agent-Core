import {MemoryControllerError} from './disclosure.js';
import {tokenizeMemoryText} from './semantic-document.js';

export const IDENTIFIER_TOKENIZER_VERSION = 'code-identifiers/v1' as const;
export interface IdentifierTokens {exact:string[];subwords:string[];truncated:boolean}
const MAX_INPUT=131072,MAX_TOKENS=4096,MAX_TOKEN=256;
const tokenCharacter=/[\p{L}\p{N}\p{M}_./\\-]/u;
const wordCharacter=/[\p{L}\p{N}]/u;

/** Bounded scan of original code points; normalization never manufactures a cut token. */
export function tokenizeRetrievalText(value:string):IdentifierTokens {
 const output:IdentifierTokens={exact:[],subwords:[],truncated:false};
 let token:string[]=[],points=0,emissions=0,oversized=false,stopped=false;
 const emit=()=>{
  if(!token.length&&!oversized)return;
  if(oversized){output.truncated=true;token=[];oversized=false;return;}
  const raw=token.join('').normalize('NFC');token=[];
  if(!wordCharacter.test(raw))return;
  const exact=raw.toLowerCase().replaceAll('\\','/');
  // Legacy lexical single-character filtering measures lowercased UTF-16 length.
  if(exact.length<2)return;
  const split=raw.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu,'$1 $2')
   .replace(/(\p{Ll})(\p{Lu})/gu,'$1 $2')
   .replace(/(\p{L})(\p{N})/gu,'$1 $2').replace(/(\p{N})(\p{L})/gu,'$1 $2')
   .split(/[\s_./\\-]+/u).map(word=>word.toLowerCase());
  const words=[...new Set(split)].filter(word=>word!==exact&&Array.from(word).length>1&&wordCharacter.test(word));
  if(emissions+1+words.length>MAX_TOKENS){output.truncated=true;stopped=true;return;}
  output.exact.push(exact);output.subwords.push(...words);emissions+=1+words.length;
 };
 for(const char of value){
  if(points++>=MAX_INPUT){
   output.truncated=true;
   // A delimiter at the first excluded point proves the buffered token is complete.
   if(!tokenCharacter.test(char))emit();
   token=[];break;
  }
  if(tokenCharacter.test(char)){
   if(token.length<MAX_TOKEN)token.push(char);else oversized=true;
  }else emit();
  if(stopped)break;
 }
 if(!stopped&&points<=MAX_INPUT)emit();
 return output;
}
export function flattenRetrievalTokens(tokens:IdentifierTokens):string[]{return [...tokens.exact,...tokens.subwords];}

/** Shared lexical policy only. Canonical/semantic/consolidation tokenization stays unchanged. */
export function lexicalRetrievalTokens(value:string,kind:'query'|'document'='document'):{tokens:string[];degraded:boolean}{
 const parsed=tokenizeRetrievalText(value);
 if(parsed.truncated&&kind==='query')throw new MemoryControllerError('MEMORY_INPUT_INVALID');
 return {tokens:parsed.truncated?tokenizeMemoryText(value):flattenRetrievalTokens(parsed),degraded:parsed.truncated};
}
