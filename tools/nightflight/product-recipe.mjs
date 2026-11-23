const nutTypes=/([\d０-９]+|[一二两三四五六七八九十])(种|类|款|样)坚果/gu;
const excluded=/(?:并非|不是|并不是|不写成|不得写成|避免说成)$/u;
const nuts=/^(?:巴旦木|杏仁|扁桃仁|腰果|核桃(?:仁)?|榛子|开心果|碧根果|夏威夷果|松子|花生|板栗|栗子)$/u;
const fruits=/^(?:冻干)?(?:草莓|蓝莓|蔓越莓|苹果|芒果|香蕉|葡萄|桑葚|桃|菠萝)(?:干|片|粒)?$/u;

const compact=value=>value.normalize('NFKC').replace(/\s/gu,'');
export const recipeCount=value=>Number(value) || (value==='两'?2:'一二三四五六七八九十'.indexOf(value)+1);
const isExcluded=(text,offset)=>excluded.test(text.slice(Math.max(0,offset-6),offset));
const groupCounts=text=>[...text.matchAll(nutTypes)].filter(match=>!isExcluded(text,match.index)).map(match=>recipeCount(match[1]));

export function ownRecipe(source) {
  const brief=compact(source);
  const description=brief.match(/(?:配料[：:]|配料为|包含|内含|含有)([^。；;！？!?]{2,90})/u)?.[1] ?? '';
  const list=description.split(/[，,](?=(?:面向|适合|用于|主要|每袋|每盒|售价|价格|包装|电商|品牌))/u)[0];
  const ingredients=[...new Set(list.split(/[、，,和及与]/u).filter(Boolean))];
  const fruitIngredients=ingredients.filter(item=>fruits.test(item));
  const nutCount=ingredients.filter(item=>nuts.test(item)).length;
  const mixed=nutCount>0 && fruitIngredients.length>0 && nutCount+fruitIngredients.length===ingredients.length;
  return {brief,ingredients,fruitIngredients,nutCount,mixed,namedNutCounts:groupCounts(brief)};
}

const wrong=(count,recipe)=>count!==recipe.nutCount && !recipe.namedNutCounts.includes(count);

export function hasWrongOwnNutGroup(text,recipe) {
  return recipe.mixed && groupCounts(compact(text)).some(count=>wrong(count,recipe));
}

export function repairOwnRecipeMention(text,recipe) {
  if (!recipe.mixed) return text;
  return text.replace(nutTypes,(match,digits,unit,offset)=>{
    const count=recipeCount(digits.normalize('NFKC'));
    if (!wrong(count,recipe) || count!==recipe.ingredients.length || excluded.test(compact(text.slice(0,offset)).slice(-6))) return match;
    const next=text.slice(offset+match.length).trimStart();
    if (recipe.fruitIngredients.some(item=>/^[与和及加、]/u.test(next) && next.slice(1).startsWith(item))) return '坚果';
    return digits+unit+'配料';
  });
}

export function repairResearchRecipeMention(text,recipe,owned=false) {
  if (!recipe.mixed) return text;
  return text.split(/(?<=[，,。；;！？!?])/u).map(clause=>{
    if (/竞品|同类|对手|他牌|其他品牌|调查|报告|受访者|来源|市售|消费者|市场|行业/u.test(clause)) return clause;
    const ownInput=/本品|本案|本项目|我方|客户(?:给定|提供)|原始简报|Brief/iu.test(clause);
    const ownGap= /^(?:尚)?未提供/u.test(clause.trimStart()) && /含量|配比|比例/u.test(clause) &&
      recipe.fruitIngredients.some(item=>clause.includes(item));
    return owned || ownInput || ownGap ? repairOwnRecipeMention(clause,recipe) : clause;
  }).join('');
}
