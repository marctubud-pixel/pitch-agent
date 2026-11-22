import assert from 'node:assert/strict';
import test from 'node:test';
import {generateVisualWithDesktopModels,oppositePosterOrientation,paperAspect,posterFraming,readPosterReferenceMask} from './visual-references.mjs';

test('the borrowed framing of a real public poster retains geometry without copying its subjects',()=>{
  const actual='画面展现较小环境比例，主体近景为主，背景含简单月亮和飞蝙蝠。';
  assert.equal(posterFraming(actual),'近景，环境范围小');
  assert.equal(posterFraming('画面主体占画面70%，环境范围较窄。'),'主体约占画面 70%，环境范围窄');
  assert.match(posterFraming('不具名的背景图形'),/主体占画面的大小/u);
});

test('paper aspect is bound only to a known client paper format and explicit orientation',()=>{
  assert.deepEqual(paperAspect('便利店冷柜旁的 A3 竖版海报'),{name:'A3竖版',width:297,height:420});
  assert.deepEqual(paperAspect('A4 横幅'),{name:'A4横版',width:297,height:210});
  const poster=paperAspect('A3 竖版海报');
  assert.equal(oppositePosterOrientation({width:1620,height:1080},poster),true);
  assert.equal(oppositePosterOrientation({width:1080,height:1439},poster),false);
  assert.equal(oppositePosterOrientation({},poster),false);
  assert.equal(paperAspect('便利店冷柜旁的竖版海报'),null);
  assert.equal(paperAspect('A3 海报'),null);
});

test('poster prompt keeps the reference geometry and contextual colors while dropping named source subjects',async()=>{
  const image={sha256:'a'.repeat(64)};
  const observations={配色:'主要黄底配蓝字及橙褐色食材，主体白色和浅橙色乳制品形成明暗对比',
    布局:'整体纵向分为三层：上层是五位厨师头像横向排列及产品图，标题区在中层占较大面积突出表现，底层是横向蓝色条带带文字；留白主要分布在头像与标题区间隙。',
    景别:'厨师占画面70%，环境范围窄。',笔法:'摄影肖像，标题区笔触状刷痕风格。',
    字体:'标题及厨师名为手写风格字体，字重中等偏粗。'};
  const original=structuredClone(observations);
  const context={brief:'给午晴做一张 A3 竖版海报。',hasBrandArtwork:false,
    transfer:{borrow:['配色','布局','字体'],change:['景别','笔法']},
    mainReferenceUse:{avoid:'不照搬五位厨师、蓝莓瓶身、安慕希品牌字及原海报“世界主厨的选择”等文案。',
      apply:'借安慕希的上中下层面积关系，用本案产品重画。'}};
  const {promptWriting:{prompt}}=await generateVisualWithDesktopModels({images:[image],context,posterSlogan:'你的下班酸奶',
    posterReference:{image,observations},call:async (_prompt,attachments,schema,task)=>{
      if (!schema) return {requestId:'image'};
      assert.deepEqual(attachments,[]);
      const input=JSON.parse(task.context);
      assert.doesNotMatch(JSON.stringify(input.mainReference.observations),/厨师|蓝莓|安慕希/u);
      assert.doesNotMatch(input.mainReferenceUse.apply,/安慕希/u);
      return {model:'deepseek-flash',threadId:'writer',parsedOutput:{format:'A3竖版',subject:'一杯午晴原味酸奶',
        background:'便利店灯光',lettering:['午晴'],changes:{景别:'特写，主体紧贴画幅边缘。',笔法:'扁平插画。'}}};
    }});
  assert.match(prompt,/沿用主参考的配色。黄（背景）、蓝（文字）、橙褐色/u);
  assert.match(prompt,/沿用主参考的布局。整体纵向分为三层：上层是主体区横向排列及物件区.*标题区在中层.*底层是横向条带带文字/u);
  assert.doesNotMatch(prompt.split('\n').filter(line=>line.startsWith('沿用主参考的')).join('\n'),/厨师|蓝莓|安慕希/u);
  assert.deepEqual(observations,original);
});

test('poster mask boxes remain a separate receipt bound to the original reference',async()=>{
  const image={sha256:'a'.repeat(64)};
  const boxes=[{left:0,top:15,right:145,bottom:50}];
  const locate=parsedOutput=>readPosterReferenceMask({image,call:async (prompt,images,schema,task)=>{
    assert.match(prompt,/品牌名、标志、包装印字、联名角色/u);
    assert.deepEqual(images,[image]);
    assert.equal(schema.properties.boxes.items.properties.left.maximum,1000);
    assert.equal(task.assignment,'海报主参考遮标定位');
    return {parsedOutput,model:'vision',threadId:'mask-read',inputPacketHash:'input'};
  }});
  assert.deepEqual(await locate({boxes}),{imageSha256:image.sha256,boxes,model:'vision',threadId:'mask-read',inputPacketHash:'input'});
  assert.deepEqual((await locate({boxes:[]})).boxes,[]);
  await assert.rejects(locate({boxes:[{...boxes[0],right:0}]}),/有效框/u);
  await assert.rejects(locate({boxes:[{...boxes[0],bottom:1001}]}),/有效框/u);
  await assert.rejects(locate({boxes:[{...boxes[0],top:15.5}]}),/有效框/u);
});

test('poster prompt binds the masked attachment to the same original and retains approved brand artwork',async()=>{
  const image={sha256:'a'.repeat(64)};
  const brand={sha256:'b'.repeat(64)};
  const mask={sha256:'c'.repeat(64),originalSha256:image.sha256};
  const observations={配色:'黄底配蓝字',布局:'主体在左，标题在右',景别:'中景',笔法:'清晰摄影边缘',字体:'手写粗体'};
  const context={brief:'午晴 A3 竖版海报。',hasBrandArtwork:true,
    transfer:{borrow:['布局','景别','笔法'],change:['配色','字体']}};
  const generate=(images,maskedImage=mask)=>generateVisualWithDesktopModels({images,context,posterSlogan:'午晴来一杯',
    posterReference:{image,observations,maskedImage},call:async (prompt,attached,schema,task)=>{
      if (!schema) {
        assert.deepEqual(attached,images);
        assert.match(prompt,/实际第 2 张附件是本方向主参考的遮标版/u);
        return {requestId:'image'};
      }
      const source=JSON.parse(task.context).mainReference;
      assert.equal(source.masked,true);
      assert.equal(source.imageNumber,2);
      return {model:'deepseek-flash',threadId:'writer',parsedOutput:{format:'A3竖版',subject:'画一杯午晴',background:'柔和室内',
        lettering:[],changes:{配色:'用浅绿和米白',字体:'用细宋体'}}};
    }});
  assert.equal((await generate([brand,mask])).result.requestId,'image');
  await assert.rejects(generate([image,brand,mask]),/不可与原图同时发送/u);
  await assert.rejects(generate([brand,mask],{...mask,originalSha256:brand.sha256}),/绑定同一主参考/u);
});
