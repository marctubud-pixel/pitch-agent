export function flowDocument(flow){return flow?.editorDocumentId||flow?.documentId;}
export function humanWait(flow){return Boolean(flow?.awaitingHuman||flow?.waitingForHuman||flow?.checkpoint||['awaiting_user','awaiting_human','waiting_for_human','waiting_for_you','awaiting_confirmation'].includes(flow?.nextAction?.status));}
export function flowProgress(flow){return JSON.stringify({projectRevision:flow?.projectRevision,states:flow?.states,steps:flow?.steps,nextAction:flow?.nextAction,editorDocumentId:flowDocument(flow),complete:flow?.complete});}
export function buildHumanDecision(flow,{commandId,decision,comment='',directionId,themeText,intendedUse}){
 if(!humanWait(flow)||typeof flow.nextAction?.module!=='string'||!/^[a-f0-9]{64}$/.test(flow.nextAction?.evidenceHash??''))throw Error('请刷新并查看当前待确认的版本后再提交。');
 if(typeof commandId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(commandId)||typeof comment!=='string'||comment.length>10000)throw Error('意见或命令格式无效。');
 const action=decision==='request_revision'?'revise':decision;
 if(!['approve','revise'].includes(action))throw Error('当前不支持这种决定。');
 const request={commandId,module:flow.nextAction.module,expectedBasisHash:flow.nextAction.evidenceHash,decision:action,comment};
 if(action==='revise'){
  if(request.module==='strategy'){
   if(!comment.trim())throw Error('请先填写策略修改意见。');
   request.contribution={kind:'strategy_opinion',instructions:comment};
  }else if(request.module==='copy'){
   const input=flow.copyThemeInput;
   if(input?.kind!=='copy_theme'||input.expectedBasisHash!==request.expectedBasisHash||!Array.isArray(input.directions))throw Error('当前文案方向尚未接入或已过时，请刷新后再提交，原稿没有被修改。');
   if(typeof directionId!=='string'||!input.directions.some(d=>d.id===directionId))throw Error('请明确选择当前要修改的文案方向。');
   if(typeof themeText!=='string'||!themeText.trim()||themeText.length>20000||typeof intendedUse!=='string'||!intendedUse.trim()||intendedUse.length>20000)throw Error('请填写主题文案及希望如何展开，分别不超过两万字。');
   request.contribution={kind:'copy_theme',directionId,text:themeText,intendedUse};
  }else throw Error('这个环节的在线修改尚未接入，原稿没有被修改。');
 }
 return request;
}
export async function runAcceptanceFlow({readCurrent,advance,shouldStop=()=>false,maxActions=1024}){
 if(typeof readCurrent!=='function'||typeof advance!=='function'||typeof shouldStop!=='function'||!Number.isSafeInteger(maxActions)||maxActions<1||maxActions>1024)throw Error('LOCAL_FLOW_RUN_OPTIONS_INVALID');
 let actions=0;
 for(;;){
  const current=readCurrent();
  if(current?.complete)return {reason:'complete',actions};
  if(humanWait(current))return {reason:'human',actions};
  if(['blocked','failed','awaiting_reconciliation'].includes(current?.nextAction?.status))return {reason:current.nextAction.status,actions};
  if(!['pending','running'].includes(current?.nextAction?.status))return {reason:'unrecognized_state',actions};
  if(shouldStop())return {reason:'paused',actions};
  if(actions>=maxActions)return {reason:'action_limit',actions};
  const before=flowProgress(current),next=await advance();
  actions++;
  if(!next||flowProgress(next)===before)return {reason:'no_progress',actions};
 }
}
