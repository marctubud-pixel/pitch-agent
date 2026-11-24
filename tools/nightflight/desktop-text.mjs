import {pythonBinary} from './runtime-dependencies.mjs';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectImage} from '../workbench/image-evidence.mjs';

const nativeRetryCodes=new Map([
  ['tls-before-send','TLS_BEFORE_SEND'],['read-timeout','READ_TIMEOUT'],['read-connection-lost','READ_CONNECTION_LOST'],
]);
const legacyRetryCodes=new Map([
  ['The request timed out.','READ_TIMEOUT'],['请求超时。','READ_TIMEOUT'],
  ['An SSL error has occurred and a secure connection to the server cannot be made.','READ_SSL'],
  ['The network connection was lost.','READ_CONNECTION_LOST'],
]);
const readRetryReasons=new Map([
  ['TLS_BEFORE_SEND','握手失败，尚未发送请求'],['READ_TIMEOUT','在等待回复时超时'],
  ['READ_SSL','旧版组件返回安全连接失败'],['READ_CONNECTION_LOST','在等待回复时连接中断'],
]);

export function isReadTransportFailure(error) {
  return readRetryReasons.has(error?.code) || readRetryReasons.has(error?.cause?.code);
}

function invoke(executable, action, input, signal, mode = '--text-model') {
  return new Promise((resolve,reject) => {
    const child=execFile(executable,[mode,action],{signal,timeout:300000,maxBuffer:32*1024*1024},(error,data)=>{
      if(error) {
        if ((error.killed && error.signal==='SIGTERM' && !signal?.aborted) || error.code==='ETIMEDOUT') {
          return reject(new Error('模型请求超时（5 分钟未返回；若桌面弹出 macOS 钥匙串授权窗口，请先允许访问后再重试）'));
        }
        return reject(new Error('模型请求未完成：'+(error.code || error.name)));
      }
      try {
        const response=JSON.parse(data);
        if(response.failure) {
          const failure=Error(response.failure);
          if(response.nativeTransport==='typed') failure.code=nativeRetryCodes.get(response.retryCause);
          else if(!response.nativeTransport) failure.code=legacyRetryCodes.get(response.failure);
          throw failure;
        }
        resolve(response);
      } catch(e){reject(e)}
    });
    child.stdin.on('error',()=>{}); child.stdin.end(input);
  });
}

export function modelProfile(executable, signal, mode) {
  return invoke(executable,'profile',null,signal,mode);
}

export function jsonModelRequest(profile, content, outputSchema) {
  const system='公开检索、原文抓取由工作台执行。仅使用输入提供的材料，不虚构联网、引用或已读来源。请按照给定的 JSON Schema 输出一个 JSON 对象，仅含结果。所有必填字段、数组项类型与枚举值都须符合结构。\n'+JSON.stringify(outputSchema);
  return {base:profile.base,body:{model:profile.model,messages:[{role:'system',content:system},{role:'user',content}],response_format:{type:'json_object'}}};
}

export async function desktopTextProvider(executable,signal,onEvent) {
  const textProfile=await invoke(executable,'profile',null,signal);
  return {profile:textProfile,async execute({runId,prompt,images,outputSchema}) {
    const mode = images.length ? '--vision-model' : '--text-model';
    const capability = images.length ? '视觉理解' : '文字';
    const profile = images.length ? await invoke(executable,'profile',null,signal,mode) : textProfile;
    let content=prompt;
    if(images.length) {
      content=[{type:'text',text:prompt}];
      for(const image of images) {
        const data=await readFile(image.path);
        content.push({type:'image_url',image_url:{url:'data:'+image.mediaType+';base64,'+data.toString('base64')}});
      }
    }
    const packet=JSON.stringify(jsonModelRequest(profile,content,outputSchema));
    await onEvent?.(capability+' API 请求 · '+profile.host+' · '+profile.model);
    const result=await invoke(executable,'completion',packet,signal,mode).catch(async error=>{
      const reason=readRetryReasons.get(error.code);
      if (!reason) throw error;
      await onEvent?.(capability+' API '+reason+'。原样自动重试一次 · '+profile.host);
      await delay(750,undefined,{signal});
      await onEvent?.(capability+' API 请求 · '+profile.host+' · '+profile.model);
      return invoke(executable,'completion',packet,signal,mode);
    });
    if(!result.id || !result.model) throw Error('文字服务未返回模型身份或请求编号');
    await onEvent?.(capability+' API 回执 · '+profile.host+' · 实际模型 '+result.model+' · '+result.id);
    const responseText=result.choices?.[0]?.message?.content;
    const receipt = {threadId:result.id,model:result.model,inputPacketHash:createHash('sha256').update(packet).digest('hex')};
    if(result.choices?.[0]?.finish_reason==='length') {
      throw Object.assign(Error('模型回复超过长度限制，未收到完整结果'),{code:'MODEL_OUTPUT_LENGTH',receipt});
    }
    let parsedOutput;
    try {parsedOutput=JSON.parse(responseText)} catch {throw Error('文字模型未返回有效 JSON')}
    return {parsedOutput,responseText,runId,...receipt};
  }};
}

export function desktopImageProvider(executable,dir,signal,onEvent) {
  return {async execute({runId,prompt,images}) {
    const mode = '--image-model';
    const profile = await invoke(executable,'profile',null,signal,mode);
    const inputs = [];
    for(const image of images) {
      const bytes = await readFile(image.path);
      inputs.push({mime:image.mediaType,data:bytes.toString('base64')});
    }
    const body = {model:profile.model,prompt,n:1,output_format:'png'};
    const packet = JSON.stringify({base:profile.base,body,images:inputs});
    const request = async () => {
      await onEvent?.('生图 API 请求 · '+profile.host+' · '+profile.model+' · '+inputs.length+' 张参考图');
      return invoke(executable,'completion',packet,signal,mode);
    };
    const result = await request().catch(async error => {
      if(error.code!=='TLS_BEFORE_SEND') throw error;
      await onEvent?.('生图 API 握手失败，确认尚未发送。原样自动重试一次 · '+profile.host);
      await delay(750,undefined,{signal});
      return request();
    });
    const item = result.data?.[0];
    if(!item?.b64_json) throw Error('生图接口未返回图像原件');
    const bytes = Buffer.from(item.b64_json,'base64');
    const inspection = await inspectImage(bytes,{pythonBinary:await pythonBinary()});
    if(inspection.mediaType!=='image/png') throw Error('生图接口未返回有效 PNG');
    const runDir = join(dir,'.image-api-runs',runId);
    await mkdir(runDir,{recursive:true,mode:0o700});
    await onEvent?.('生图 API 返回 PNG · 请求模型 '+profile.model+(result.requestId?' · '+result.requestId:''));
    return {original:{bytes,inspection,originalName:runId+'.png'},paths:{runDir},runId,
      requestId:result.requestId,requestedModel:profile.model,threadId:result.requestId ?? runId,responseText:item.revised_prompt ?? ''};
  }};
}
