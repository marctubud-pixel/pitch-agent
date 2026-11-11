const need=(value,code='INVALID_FINAL_INTENT')=>{if(!value)throw Object.assign(Error(code),{code,status:422});};
const exact=(body,allowed)=>need(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(k=>allowed.includes(k)));
const identity=body=>need(body&&typeof body==='object'&&!Array.isArray(body)&&typeof body.commandId==='string'&&body.commandId.trim()&&body.commandId.length<=200&&body.commandId!=='__proto__'&&!body.commandId.includes('\0')&&Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=0);
export async function handleFinalReviewHttp({req,res,url,executor,scheduleFinal,jsonBody,response,humanContext}){
 const match=/^\/api\/v1\/projects\/([A-Za-z0-9-]+)\/(final-review-status|final-review-continuations|final-review-decisions|final-deliveries)(?:\/([a-f0-9]{64})\/(editorial|stage|evidence)\.pptx)?$/.exec(url.pathname);
 if(!match)return false;
 need(!url.search);const [,id,resource,deliveryId,style]=match;
 if(deliveryId){need(resource==='final-deliveries'&&req.method==='GET');const bytes=await executor.downloadFinalDelivery(id,deliveryId,style);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="proposal-${style}.pptx"`});res.end(bytes);return true;}
 if(req.method==='GET'&&resource==='final-review-status'){response(res,200,executor.finalReviewStatus(id));return true;}
 if(req.method==='GET'&&resource==='final-deliveries'){response(res,200,await executor.finalDelivery(id));return true;}
 need(req.method==='POST');const body=await jsonBody(req);identity(body);
 if(resource==='final-review-continuations'){exact(body,['commandId','expectedRevision','layoutRootJobId']);const result=executor.continueFinalReview(id,body);scheduleFinal(id);response(res,202,result);return true;}
 if(resource==='final-review-decisions'){
  exact(body,['kind','commandId','expectedRevision','setupId','reservationId','binding','reason','displayedDecision','rulings','targetIds']);need(['adopt-final-review','return-final-review'].includes(body.kind));
  const result=await executor.decideFinalReview(id,body,humanContext());scheduleFinal(id);response(res,200,result);return true;
 }
 need(resource==='final-deliveries');exact(body,['commandId','expectedRevision']);response(res,200,await executor.releaseFinalDelivery(id,body));return true;
}
