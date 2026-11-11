import path from 'node:path';
import {engineeringFixture} from '../auto-layout/native-charts/chart-fixture.mjs';

// This fixture exercises editor controls, never project or review completion.
export function editorFixture(id='editor-engineering') {
  const {raw,sources}=engineeringFixture();
  return {id,sourceBinding:{kind:'synthetic-editor-fixture',finalAuthority:false,notPipelineDelivery:true},input:{brand:{font:{family:'PingFang SC',files:[path.resolve('output/ppt/m6-integrated-v5/build/PingFangSC-Regular.ttf')]}},assets:{historicalConcept:{file:path.resolve('output/ppt/m6-integrated-v5/assets/A.png'),source:'Historical concept draft; editor engineering test only.'}},draftChartSources:[{id:'local-chart',raw,sources,chartId:raw.charts[0].chartId}]},plan:{width:1280,height:720,slides:[
    {id:'cover',background:'#0B2948',notes:'本地编辑器功能测试，不是已完成提案。',elements:[{id:'eyebrow',type:'text',text:'LOCAL EDITOR / ENGINEERING FIXTURE',size:18,color:'#D8B978',x:80,y:70,w:1100,h:50},{id:'title',type:'text',text:'在线提案编辑\n保存、恢复与导出',size:60,color:'#FFFFFF',bold:true,x:80,y:200,w:1100,h:220},{id:'caption',type:'text',text:'本页只验证编辑能力，不代表整案流程已完成。',size:22,color:'#D3DFEA',x:80,y:580,w:1100,h:60}]},
    {id:'visual',background:'#F5F2EA',elements:[{id:'image',type:'image',assetId:'historicalConcept',fit:'contain',alt:'历史概念稿，仅用于编辑器测试',x:60,y:60,w:760,h:600},{id:'title',type:'text',text:'图片与文字\n独立编辑',size:46,bold:true,color:'#17334B',x:860,y:130,w:340,h:200},{id:'caption',type:'text',text:'图片是历史草稿。\n不继承任何视觉批准。',size:22,color:'#536470',x:860,y:420,w:340,h:120}]},
    {id:'chart',background:'#FFFFFF',elements:[{id:'title',type:'text',text:'原生图表编辑测试',size:36,bold:true,color:'#17334B',x:70,y:40,w:1100,h:70},{id:'chart',type:'chart',chartSourceId:'local-chart',x:70,y:140,w:1140,h:490},{id:'caption',type:'text',text:'全部数值为虚构工程数据，不得用于研究结论。',size:18,color:'#667680',x:70,y:650,w:1100,h:40}]},
  ]}};
}
