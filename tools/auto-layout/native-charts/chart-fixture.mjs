import {textDigest} from './chart-data.mjs';
/** All literals are invented for engineering verification. No research or customer evidence. */
export function engineeringFixture() {
  let text='SYNTHETIC ENGINEERING FIXTURE ONLY\nUTF16 boundary probe 😀\n';
  const sourceId='synthetic-original';
  const records=[];
  const bound=value=>{const start=text.length;text+=value+'\n';const e={sourceId,sourceHash:'',indexing:'utf16',start,end:start+value.length,text:value};records.push(e);return {text:value,evidence:e};};
  const cell=(decimal,lexeme=decimal,conversion='identity')=>{const b=bound(lexeme);return {decimal,lexeme,conversion,evidence:b.evidence};};
  const make=(chartId,type,direction,unitKind,unit,format,rows)=>({
    chartId,type,direction,title:bound(`Synthetic ${chartId}`),unit:{kind:unitKind,label:bound(unit)},period:bound('2024–2026 synthetic period'),population:bound('Invented engineering observations'),
    limitations:[bound('Synthetic fixture. No business conclusion or customer evidence.')],categoryCount:3,seriesCount:2,
    categories:['2024','001','中文 类别'].map((label,i)=>({categoryId:`category-${i}`,label:bound(label)})),
    series:rows.map((row,i)=>({seriesId:`series-${i}`,name:bound(['甲组 A','Second 02'][i]),values:row.map(v=>Array.isArray(v)?cell(...v):cell(v))})),numberFormat:format,
  });
  const raw={schema:'chart-data-v1',charts:[
    make('column-percent','bar','column','ratio','ratio','0.0%',[[['0.31','31.0%','percent-to-ratio-v1'],'-0.04','0'],['0.27','0.12','0.08']]),
    make('horizontal-decimal','bar','bar','decimal','units','0.00',[['-2.50','0','3.25'],['1.10','-0.75','2.00']]),
    make('line-decimal','line','column','decimal','units','0.0',[['0','-1.5','2.5'],['1.0','0','-0.5']]),
  ]};
  const sha256=textDigest(text);records.forEach(e=>e.sourceHash=sha256);
  return {raw,sources:[{sourceId,text,sha256,kind:'synthetic-engineering-fixture'}]};
}
