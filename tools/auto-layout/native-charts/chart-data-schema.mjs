const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text={type:'string',minLength:1,maxLength:1000};
const id={...text,maxLength:80,pattern:'^[a-zA-Z][a-zA-Z0-9_-]*$'};
const array=(items,minItems,maxItems)=>({type:'array',items,minItems,maxItems});
const enumeration=values=>({type:'string',enum:values});
const integer={type:'integer',minimum:0};
const evidence=object({sourceId:id,sourceHash:{type:'string',pattern:'^[a-f0-9]{64}$'},indexing:enumeration(['utf16']),start:integer,end:integer,text});
const bound=object({text,evidence});
export const CHART_DATA_SCHEMA=object({schema:enumeration(['chart-data-v1']),charts:array(object({chartId:id,type:enumeration(['bar','line']),direction:enumeration(['column','bar']),title:bound,unit:object({kind:enumeration(['decimal','count','ratio']),label:bound}),period:bound,population:bound,limitations:array(bound,1,16),categoryCount:{type:'integer',minimum:1,maximum:100},seriesCount:{type:'integer',minimum:1,maximum:16},categories:array(object({categoryId:id,label:bound}),1,100),series:array(object({seriesId:id,name:bound,values:array(object({decimal:{type:'string',maxLength:64,pattern:'^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$'},lexeme:{type:'string',minLength:1,maxLength:70},conversion:enumeration(['identity','percent-to-ratio-v1']),evidence}),1,100)}),1,16),numberFormat:enumeration(['0','0.0','0.00','0.000','0%','0.0%','0.00%'])}),1,32)});
