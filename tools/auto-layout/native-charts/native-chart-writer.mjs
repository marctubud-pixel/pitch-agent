import {parseChartEvidence,digest} from './chart-data.mjs';
import {applyPresentationChartFont} from '/Users/marc/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations/container_tools/artifact_tool_utils.mjs';

/** Native adapter only. Caller owns placement, brand, visible source/restriction text and finalization. */
export function addNativeChart(slide,validated,chartId,placement,brand,explicitRegular=false) {
  const data=parseChartEvidence(validated.original,validated.sources);
  if(data.catalogDigest!==validated.catalogDigest||digest(data)!==digest(validated)) throw new Error('CHART_VALIDATED_BINDING');
  const c=data.charts.find(c=>c.chartId===chartId); if(!c) throw new Error('CHART_UNKNOWN_ID');
  const keys=['slideNumber','name','left','top','width','height'];
  if(Object.keys(placement).sort().join('|')!==keys.sort().join('|')||!Number.isSafeInteger(placement.slideNumber)||placement.slideNumber<1||!/^chart-[a-zA-Z0-9_-]+$/.test(placement.name)||!['left','top','width','height'].every(k=>Number.isFinite(placement[k])&&placement[k]>=0)||placement.width<=0||placement.height<=0) throw new Error('CHART_PLACEMENT');
  if(Object.keys(brand).sort().join('|')!==['fontFamily','titleSize','axisSize','legendSize','labelSize'].sort().join('|')||typeof brand.fontFamily!=='string'||!brand.fontFamily.length||!['titleSize','axisSize','legendSize','labelSize'].every(k=>Number.isFinite(brand[k])&&brand[k]>=12&&brand[k]<=64)) throw new Error('CHART_BRAND');
  const {left,top,width,height}=placement;
  const chart=slide.charts.add(c.type,{
    ...(explicitRegular?{chartFill:'#FFFFFF'}:{}),
    position:{left,top,width,height},title:c.title,titleTextStyle:{...(explicitRegular?{bold:false}:{}),fontSize:brand.titleSize},
    categories:c.categories.map(x=>x.label),series:c.series.map(s=>({name:s.name,values:s.values,valuesFormatCode:c.numberFormat})),
    ...(c.type==='bar'?{barOptions:{direction:c.direction,grouping:'clustered'}}:{lineOptions:{grouping:'standard',smooth:false}}),
    hasLegend:true,legend:{position:'bottom',overlay:false,textStyle:{...(explicitRegular?{bold:false}:{}),fontSize:brand.legendSize}},
    xAxis:{visible:true,textStyle:{...(explicitRegular?{bold:false}:{}),fontSize:brand.axisSize}},
    yAxis:{visible:true,title:{text:c.unit,textStyle:{...(explicitRegular?{bold:false}:{}),fontSize:brand.axisSize}},numberFormatCode:c.numberFormat,textStyle:{...(explicitRegular?{bold:false}:{}),fontSize:brand.axisSize}},
    dataLabels:{showValue:true,position:c.type==='bar'?'outEnd':'top',numberFormatCode:c.numberFormat,numberFormatSourceLinked:false,textStyle:{...(explicitRegular?{bold:false}:{}),fontSize:brand.labelSize}},
  });
  chart.name=placement.name;applyPresentationChartFont(chart,{fontFamily:brand.fontFamily});
  return Object.freeze({chartId,dataHash:c.dataHash,catalogDigest:data.catalogDigest,placement:{...placement},brand:{...brand}});
}
export function chartPackageManifest(validated,occurrences) {
  const data=parseChartEvidence(validated.original,validated.sources);
  if(!Array.isArray(occurrences)||!occurrences.length||new Set(occurrences.map(x=>x.placement.name)).size!==occurrences.length) throw new Error('CHART_OCCURRENCES');
  for(const o of occurrences) if(!data.charts.some(c=>c.chartId===o.chartId&&c.dataHash===o.dataHash)||o.catalogDigest!==data.catalogDigest) throw new Error('CHART_OCCURRENCE_BINDING');
  return {schema:'native-chart-package-manifest-v1',catalogDigest:data.catalogDigest,sourcesDigest:data.sourcesDigest,occurrences:structuredClone(occurrences)};
}
export const requiredNativeChartOwnerSlides=occurrences=>[...new Set(occurrences.map(x=>x.placement.slideNumber))].sort((a,b)=>a-b);
