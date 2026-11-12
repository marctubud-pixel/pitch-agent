import {expect,it} from 'vitest';
import {parseVisualRequirements} from './visualRequirements';
import {readBrief} from '../services/http/briefEnvelope';
it('optional requirements are bounded and explicit, with Chinese views retained',()=>{
 expect(parseVisualRequirements(undefined)).toBeUndefined();expect(parseVisualRequirements([])).toEqual([]);expect(parseVisualRequirements([{kind:'kv',views:[' 客户指定场景 ','']}])).toEqual([{kind:'kv',views:['客户指定场景']}]);
 for(const value of [null,[{kind:'unknown',views:['x']}],[{kind:'kv',views:[]}],[{kind:'kv',views:['x',' x ']}],[{kind:'kv',views:['x'.repeat(121)]}],[{kind:'kv',views:['x']},{kind:'kv',views:['y']}]])expect(()=>parseVisualRequirements(value)).toThrow();
 const raw=JSON.stringify({format:'proposal-workbench-brief-v1',metadata:{},fields:{visualRequirements:[{kind:'kv',views:['客户指定场景']}]}});expect(readBrief(raw).fields.visualRequirements?.[0].views).toEqual(['客户指定场景']);
});
