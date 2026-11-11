import {isDeepStrictEqual} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseChartEvidence, digest, decimalNumber} from './native-charts/chart-data.mjs';
import {validateContentAdmissions} from '../workbench/chart-content.mjs';

const need = (ok, code) => {if (!ok) throw Object.assign(new Error(code), {code, status:422});};
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k));
const text = value => typeof value === 'string' && value.trim() && value.length <= 2000 && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const skill = '/Users/marc/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations/container_tools';
const python = process.env.RUNTIME_PYTHON ?? '/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const run = promisify(execFile);

function sourceData(chart) {
  return {type:chart.type,direction:chart.direction,title:chart.title,unit:chart.unit,numberFormat:chart.numberFormat,
    categories:chart.categories.map(c=>c.label),series:chart.series.map(s=>({name:s.name,values:s.values}))};
}
export function validateEditableChartData(data) {
  need(exact(data,['type','direction','title','unit','numberFormat','categories','series']), 'DRAFT_CHART_DATA_INVALID');
  need(['bar','line','pie'].includes(data.type), 'DRAFT_CHART_TYPE_UNSUPPORTED');
  need(['column','bar'].includes(data.direction) && (data.type === 'bar' || data.direction === 'column'), 'DRAFT_CHART_DIRECTION_INVALID');
  need(text(data.title) && text(data.unit) && ['0','0.0','0.00','0.000','0%','0.0%','0.00%'].includes(data.numberFormat), 'DRAFT_CHART_LABEL_INVALID');
  need(Array.isArray(data.categories) && data.categories.length > 0 && data.categories.length <= 100 && data.categories.every(text), 'DRAFT_CHART_CATEGORIES_INVALID');
  need(Array.isArray(data.series) && data.series.length > 0 && data.series.length <= 16, 'DRAFT_CHART_SERIES_INVALID');
  for (const s of data.series) {
    need(exact(s,['name','values']) && text(s.name) && Array.isArray(s.values) && s.values.length === data.categories.length, 'DRAFT_CHART_MATRIX_INVALID');
    for (const value of s.values) {
      need(Number.isFinite(value) && !Object.is(value,-0) && Math.abs(value) <= Number.MAX_SAFE_INTEGER, 'DRAFT_CHART_NUMBER_INVALID');
      need(!/[eE]/.test(String(value)), 'DRAFT_CHART_NUMBER_INVALID');
      decimalNumber(String(value));
    }
  }
  if (data.type === 'pie') need(data.series.length === 1 && data.series[0].values.every(v=>v>=0) && data.series[0].values.reduce((a,b)=>a+b,0)>0, 'DRAFT_CHART_PIE_INVALID');
}
function parsedSource(source) {
  need(exact(source,['version','identity','raw','sources','chartId','snapshotHash']) && source.version === 'editable-chart-source-v1', 'DRAFT_CHART_SOURCE_INVALID');
  const {snapshotHash,...body}=source;need(snapshotHash === digest(body), 'DRAFT_CHART_SOURCE_CHANGED');
  const parsed=parseChartEvidence(source.raw,source.sources), chart=parsed.charts.find(c=>c.chartId===source.chartId);
  need(chart, 'DRAFT_CHART_SOURCE_INVALID');
  return chart;
}
function originalChartData(source) {
  if (source?.version === 'editable-user-chart-source-v1') {
    need(exact(source,['version','identity','originalData','snapshotHash']), 'DRAFT_CHART_SOURCE_INVALID');
    need(exact(source.identity,['kind','id','documentId','commandId','changeIndex']) && source.identity.kind === 'user-input', 'DRAFT_CHART_SOURCE_INVALID');
    const {documentId,commandId,changeIndex,id}=source.identity;
    need(stableId(documentId) && stableId(commandId) && Number.isSafeInteger(changeIndex) && changeIndex >= 0 && changeIndex < 1000, 'DRAFT_CHART_SOURCE_INVALID');
    need(id === userSourceId(documentId,commandId,changeIndex), 'DRAFT_CHART_SOURCE_INVALID');
    const {snapshotHash,...body}=source;
    need(snapshotHash === digest(body), 'DRAFT_CHART_SOURCE_CHANGED');
    validateEditableChartData(source.originalData);
    return source.originalData;
  }
  const data=sourceData(parsedSource(source));
  const identity=source.identity;
  need((exact(identity,['kind','id']) && identity.kind === 'supplied-draft-source' && typeof identity.id === 'string' && identity.id.length > 0) ||
    (exact(identity,['kind','reference','admissionHash']) && identity.kind === 'research-admission' && identity.reference && typeof identity.reference === 'object' && !Array.isArray(identity.reference) && identity.admissionHash === identity.reference.admissionHash), 'DRAFT_CHART_SOURCE_INVALID');
  return data;
}
const stableId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
const userSourceId = (documentId,commandId,changeIndex) => 'user-' + digest({documentId,commandId,changeIndex});
export function createUserChart(change,{documentId,commandId,changeIndex}) {
  need(exact(change,['kind','slideId','elementId','geometry','data']) && change.kind === 'add-chart' && stableId(change.elementId) && typeof change.slideId === 'string' && change.slideId.length > 0, 'DRAFT_CHANGE_INVALID');
  need(exact(change.geometry,['x','y','w','h']), 'DRAFT_GEOMETRY_INVALID');
  validateEditableChartData(change.data);
  const id=userSourceId(documentId,commandId,changeIndex);
  const body={version:'editable-user-chart-source-v1',identity:{kind:'user-input',id,documentId,commandId,changeIndex},originalData:structuredClone(change.data)};
  const element={id:change.elementId,type:'chart',...structuredClone(change.geometry),chartSourceId:id,chartSource:{...body,snapshotHash:digest(body)},chartData:structuredClone(change.data),chartDataState:'user-input-unverified'};
  validateEditableChart(element);
  return element;
}
function chartState(element,original) {
  return isDeepStrictEqual(element.chartData,original) ? (element.chartSource.version === 'editable-user-chart-source-v1' ? 'user-input-unverified' : 'source-derived-unverified') : 'user-edited-unverified';
}
export function hydrateEditableCharts(plan,input) {
  for (const slide of plan.slides ?? []) for (const e of slide.elements ?? []) {
    if (e.type !== 'chart') continue;
    need(e.chartSource === undefined && e.chartData === undefined && e.chartDataState === undefined, 'DRAFT_CHART_IMPORT_DERIVED_FIELDS');
    let raw,sources,chartId,identity;
    if (e.chartRef) {
      const admissions=input.semantic?.source?.researchChartAdmissions;
      validateContentAdmissions(admissions);
      const a=admissions.find(a=>a.artifactId===e.chartRef.artifactId && a.admissionHash===e.chartRef.admissionHash);
      need(a && a.charts.some(c=>c.chartId===e.chartRef.chartId && c.dataHash===e.chartRef.dataHash), 'DRAFT_CHART_REFERENCE_CHANGED');
      ({raw}=a);sources=a.sourceBinding.sources;chartId=e.chartRef.chartId;identity={kind:'research-admission',reference:structuredClone(e.chartRef),admissionHash:a.admissionHash};
    } else {
      need(typeof e.chartSourceId === 'string' && Array.isArray(input.draftChartSources), 'DRAFT_CHART_SOURCE_REQUIRED');
      const matches=input.draftChartSources.filter(s=>s.id===e.chartSourceId);
      need(matches.length===1 && exact(matches[0],['id','raw','sources','chartId']), 'DRAFT_CHART_SOURCE_INVALID');
      ({raw,sources,chartId}=matches[0]);identity={kind:'supplied-draft-source',id:e.chartSourceId};
    }
    const body={version:'editable-chart-source-v1',identity,raw:structuredClone(raw),sources:structuredClone(sources),chartId};
    e.chartSource={...body,snapshotHash:digest(body)};
    e.chartData=sourceData(parsedSource(e.chartSource));e.chartDataState='source-derived-unverified';
  }
}
export function validateEditableChart(element) {
  validateEditableChartData(element.chartData);
  const original=originalChartData(element.chartSource);
  if(element.chartSource.identity.kind === 'research-admission') need(isDeepStrictEqual(element.chartRef,element.chartSource.identity.reference),'DRAFT_CHART_REFERENCE_CHANGED');
  else need(element.chartRef === undefined && element.chartSourceId===element.chartSource.identity.id,'DRAFT_CHART_REFERENCE_CHANGED');
  const state=chartState(element,original);
  need(element.chartDataState===state,'DRAFT_CHART_STATE_INVALID');
  need(element.minimumLabelSize===undefined || (Number.isFinite(element.minimumLabelSize)&&element.minimumLabelSize>=12&&element.minimumLabelSize<=64),'DRAFT_CHART_LABEL_SIZE');
}
export function refreshEditableChartState(element) {
  if(element.type!=='chart')return;
  element.chartDataState=chartState(element,originalChartData(element.chartSource));
}
export function writeEditableChart(slide,element,fontFamily) {
  validateEditableChart(element);
  const d=element.chartData, size=element.minimumLabelSize??16, textStyle={typeface:fontFamily,fontSize:size};
  const chart=slide.charts.add(d.type,{position:{left:element.x,top:element.y,width:element.w,height:element.h},title:d.type==='pie'?`${d.title} (${d.unit})`:d.title,titleTextStyle:textStyle,
    categories:d.categories,series:d.series.map(s=>({name:s.name,values:s.values,valuesFormatCode:d.numberFormat})),
    ...(d.type==='bar'?{barOptions:{direction:d.direction,grouping:'clustered'}}:d.type==='line'?{lineOptions:{grouping:'standard',smooth:false}}:{}),
    hasLegend:true,legend:{position:'bottom',overlay:false,textStyle},
    ...(d.type==='pie'?{}:{xAxis:{visible:true,textStyle},yAxis:{visible:true,title:{text:d.unit,textStyle},numberFormatCode:d.numberFormat,textStyle}}),
    dataLabels:{showValue:true,position:d.type==='pie'?'bestFit':d.type==='bar'?'outEnd':'top',numberFormatCode:d.numberFormat,numberFormatSourceLinked:false,textStyle},
  });chart.name=element.id;
}
export async function materializeEditableChartWorkbooks(candidate,output,plan) {
  const elements=plan.slides.flatMap(s=>s.elements.filter(e=>e.type==='chart'));
  if(!elements.length)return {deckPath:candidate,charts:[]};
  const snapshotPath=path.join(output,'draft-with-chart-data.pptx'),receiptPath=path.join(output,'chart-workbooks.json');
  const result=await run(python,[path.join(skill,'materialize_literal_chart_workbooks.py'),candidate,snapshotPath,'--workspace',output,'--receipt',receiptPath],{encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  const report=JSON.parse(result.stdout);
  need(report.schema_version==='experimental.literal-chart-workbook-snapshot.v1' && report.conversion==='chart_data_snapshot' && report.portable_chart_validation_passed===true && report.source_formulas_preserved===false && report.source_workbook_preserved===false && report.new_formulas_describe_snapshot_only===true,'DRAFT_CHART_WORKBOOK_INVALID');
  need(report.input_sha256===sha(await fs.readFile(candidate)) && report.output_sha256===sha(await fs.readFile(snapshotPath)) && report.converted_chart_count+report.preserved_existing_workbook_chart_count===elements.length,'DRAFT_CHART_WORKBOOK_CHANGED');
  const deckPath=path.join(output,'draft-editable.pptx');
  const linked=await run(python,[fileURLToPath(new URL('./editable-chart-workbooks.py',import.meta.url)),snapshotPath,deckPath],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  const headerLinks=JSON.parse(linked.stdout);need(headerLinks.version==='draft-series-header-links-v1' && headerLinks.inputSha256===report.output_sha256 && headerLinks.outputSha256===sha(await fs.readFile(deckPath)),'DRAFT_CHART_HEADER_LINK_INVALID');
  const checked=await run(python,[fileURLToPath(new URL('./editable-chart-inspect.py',import.meta.url)),deckPath,path.join(output,'document.json')],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  const chartProof=JSON.parse(checked.stdout);need(chartProof.charts===elements.length && chartProof.nativeChartDataMatchesSavedVersion===true && chartProof.embeddedWorkbookDataMatches===true && chartProof.deckSha256===sha(await fs.readFile(deckPath)),'DRAFT_CHART_EXPORT_MISMATCH');
  return {deckPath,chartProof,headerLinks,charts:elements.map(e=>({id:e.id,state:e.chartDataState,sourceSnapshotHash:e.chartSource.snapshotHash,dataHash:digest(e.chartData)})),chartWorkbookSnapshot:report};
}
