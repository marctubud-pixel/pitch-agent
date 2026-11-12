export type Fragment={start:number;end:number;raw:string;oversizedWord:{start:number;end:number;reason:'exceeds_template_capacity'}|null};
const graphemes=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
/** The callback is the private builder's real unchanged-template capacity check, not source authority. */
export function paginateText(text:string,fits:(fragment:string)=>boolean):Fragment[]{
 const bounds=[...graphemes.segment(text)].map(x=>x.index);bounds.push(text.length);
 const words=[...new Intl.Segmenter('en',{granularity:'word'}).segment(text)].filter(w=>w.isWordLike&&/^[\p{Script=Latin}\p{N}\p{M}'’\-]+$/u.test(w.segment));
 const inside=(offset:number)=>words.find(w=>w.index<offset&&offset<w.index+w.segment.length);
 const oversized=new Map<number,boolean>();
 const tooLarge=(word:typeof words[number])=>{let result=oversized.get(word.index);if(result===undefined){result=!fits(word.segment);oversized.set(word.index,result);}return result;};
 const output:Fragment[]=[];let at=0;
 while(at<bounds.length-1){
  const start=bounds[at];let stop=Math.min(at+96,bounds.length-1);
  while(stop<bounds.length-1&&!text.slice(start,bounds[stop]).trim())stop++;
  if(stop<bounds.length-1)for(let n=stop;n>at+24;n--)if(/[。！？.!?；;\n]\s*$/u.test(text.slice(bounds[n-1],bounds[n]))){stop=n;break;}
  let end=bounds[stop];if(!text.slice(end).trim())end=text.length;
  while(true){
   const word=inside(end);
   if(word){
    if(text.slice(start,word.index).trim())end=word.index;
    else if(!tooLarge(word))end=word.index+word.segment.length;
    // Only a whole word independently proven over this template's capacity may split.
   }
   const fragment=text.slice(start,end);
   if(fragment.trim()&&fits(fragment)){
    const broken=inside(end)??inside(start);if(broken&&!tooLarge(broken))throw Error('ORDINARY_WORD_SPLIT');
    output.push({start,end,raw:fragment,oversizedWord:broken?{start:broken.index,end:broken.index+broken.segment.length,reason:'exceeds_template_capacity'}:null});break;
   }
   const last=bounds.findIndex(x=>x>=end);if(last-at<=1)throw Error('TEXT_CANNOT_FIT_TEMPLATE');
   end=bounds[at+Math.max(1,Math.floor((last-at)/2))];
  }
  at=bounds.indexOf(end);if(at<0)throw Error('NON_GRAPHEME_PAGE_BREAK');
 }
 return output;
}
export function assertGraphemeLineBoundaries(lines:string[]){
 const joined=lines.join(''),allowed=new Set([...graphemes.segment(joined)].map(x=>x.index));allowed.add(joined.length);let end=0;
 for(const line of lines){end+=line.length;if(!allowed.has(end))throw Error('UNSUPPORTED_TEMPLATE_GRAPHEME_LINE_SPLIT');}
}

/** Keep a paragraph whole whenever it fits an empty unchanged-template page. */
export function paginateParagraphs(paragraphs:string[],fits:(fragment:string)=>boolean):Fragment[]{
 if(!paragraphs.length||paragraphs.some(p=>!p.trim()))throw Error('PARAGRAPH_REQUIRED');
 const text=paragraphs.join('\n\n'),ends:number[]=[];let end=0;
 for(const [i,p] of paragraphs.entries()){end+=(i?2:0)+p.length;ends.push(end);}
 const output:Fragment[]=[];let start=0,index=0;
 while(index<ends.length){
  if(fits(text.slice(start,ends[index]))){let last=index;while(last+1<ends.length&&fits(text.slice(start,ends[last+1])))last++;const end=ends[last];output.push({start,end,raw:text.slice(start,end),oversizedWord:null});start=end;index=last+1;}
  else {const end=ends[index];for(const f of paginateText(text.slice(start,end),fits))output.push({...f,start:start+f.start,end:start+f.end,oversizedWord:f.oversizedWord?{...f.oversizedWord,start:start+f.oversizedWord.start,end:start+f.oversizedWord.end}:null});start=end;index++;}
 }
 return output;
}
