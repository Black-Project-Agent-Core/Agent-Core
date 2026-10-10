import {expect,test} from 'vitest';
import {flattenRetrievalTokens,IDENTIFIER_TOKENIZER_VERSION,tokenizeRetrievalText} from '../src/memory/identifier-tokenizer.js';
test('retains_exact_and_splits_boundaries',()=>{
 const examples:Record<string,string[]>= {memoryRecall:['memory','recall'],HTTPServer:['http','server'],snake_case:['snake','case'],'foo-bar':['foo','bar'],'src/memory/host-runtime.ts':['src','memory','host','runtime','ts'],'src\\memory\\host-runtime.ts':['src','memory','host','runtime','ts'],ERR_CACHE_404:['err','cache','404'],OAuth2Client:['auth','client'],caféSession:['café','session']};
 for(const [input,subwords] of Object.entries(examples)){
  const actual=tokenizeRetrievalText(input);expect(actual.exact).toEqual([input.normalize('NFC').toLowerCase().replaceAll('\\','/')]);expect(actual.subwords).toEqual(subwords);expect(actual.truncated).toBe(false);
 }
 expect(IDENTIFIER_TOKENIZER_VERSION).toBe('code-identifiers/v1');expect(tokenizeRetrievalText('cafe\u0301Session')).toEqual(tokenizeRetrievalText('caféSession'));
 expect(tokenizeRetrievalText('１２３')).not.toEqual(tokenizeRetrievalText('123'));
});
test('occurrences_preserve_term_frequency_without_double_expansion',()=>{
 const result=tokenizeRetrievalText('memoryRecall memoryRecall memory');
 expect(result.exact).toEqual(['memoryrecall','memoryrecall','memory']);expect(result.subwords).toEqual(['memory','recall','memory','recall']);
 expect(flattenRetrievalTokens(result)).toEqual([...result.exact,...result.subwords]);
 expect(tokenizeRetrievalText('foo_foo').subwords).toEqual(['foo']);expect(tokenizeRetrievalText('a')).toEqual({exact:[],subwords:[],truncated:false});
});
test('bounds_expansion_without_partial_identifiers',()=>{
 expect(tokenizeRetrievalText('x'.repeat(257))).toEqual({exact:[],subwords:[],truncated:true});
 const input=' '.repeat(131070)+'abc';expect(tokenizeRetrievalText(input)).toEqual({exact:[],subwords:[],truncated:true});
 const many=tokenizeRetrievalText('ab '.repeat(4097));expect(flattenRetrievalTokens(many)).toHaveLength(4096);expect(many.truncated).toBe(true);
 expect(tokenizeRetrievalText('///---...\\\\')).toEqual({exact:[],subwords:[],truncated:false});
 expect(tokenizeRetrievalText('')).toEqual({exact:[],subwords:[],truncated:false});
 expect(tokenizeRetrievalText('x'.repeat(256)).truncated).toBe(false);
});
test('exact_single_codepoint_keeps_legacy_utf16_case_behavior',()=>{
 expect(tokenizeRetrievalText('𐐀').exact).toEqual(['𐐨']);
 expect(tokenizeRetrievalText('İ').exact).toEqual(['i\u0307']);
});
