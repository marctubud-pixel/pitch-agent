const allPackageUnitsVisible=/(?<count>\d{1,3}|[一二三四五六七八九十两]+)\s*(?:只|袋|包|瓶|罐|杯|支|份|盒|件)\s*(?:须|需|要|应)?\s*(?:全部|全数|都|均)\s*(?:清晰|清楚|完整)?\s*(?:可见|可数|能数清|看得见|展示|露出)/gu;

function packageCount(raw) {
  const digits='一二三四五六七八九';
  const countOf=char=>!char?0:char==='两'?2:digits.indexOf(char)+1;
  const [tens,ones]=raw.split('十');
  return Number(raw) || (ones!==undefined ? (countOf(tens) || 1)*10+countOf(ones) : countOf(raw));
}

export function promisedPackageUnits(value) {
  for (const match of value.matchAll(allPackageUnitsVisible)) {
    const clause=value.slice(0,match.index).split(/[。；;，,、！？!?\r\n]/u).at(-1);
    if (/(?:不(?:要|得|应|可|用|必|需要)?|无需|避免|勿|别|禁止)\s*(?:据此|因此|再)?\s*(?:要求|承诺|画出?|展示|呈现|让|把)?\s*(?:盒[内中](?:的)?)?\s*$/u.test(clause)) continue;
    const number=packageCount(match.groups.count);
    if (number>1) return number;
  }
  return 0;
}

// Instructions to lay out physical items differ from labels describing what a box contains.
const placedPackageUnits=/(?:摆(?:放|出)?|陈列|平铺|排放|排开|在画面摆|并排放|展示|呈现|露出|放|排)\s*(?:(?:全部|共计|共|总共)\s*)?(?<count>\d{1,3}|[一二三四五六七八九十两]+)\s*(?:只|袋|包|瓶|罐|杯|支|份|盒|件)\s*(?:同款(?:的)?)?(?:实物|内装|小袋|独立(?:小袋|包装|小包)|瓶装实物|罐装实物)(?!\s*(?:装量|规格|标注|字样|示意|结构|外盒|设计))/gu;

export function specifiedPackageArrangement(value) {
  const visible=promisedPackageUnits(value);
  if(visible) return visible;
  for(const match of value.matchAll(placedPackageUnits)) {
    const clause=value.slice(0,match.index).split(/[。；;，,、！？!?\r\n]/u).at(-1);
    if (/(?:不(?:要|得|应|可|用|必|需要)?|无需|避免|勿|别|禁止)\s*(?:再|刻意|额外)?\s*$/u.test(clause)) continue;
    const number=packageCount(match.groups.count);
    if(number>1) return number;
  }
  return 0;
}

export function fullPackageArrangement(value,brief) {
  const explicit=promisedPackageUnits(value);
  if(explicit) return explicit;
  const spec=brief.normalize('NFKC').match(/(?:盒内|每盒|一盒)(?:有|含|装有?|为)?\s*(\d{1,3}|[一二三四五六七八九十两]+)\s*(?:只|袋|包|瓶|罐|杯|支|份|盒|件)/u);
  const arranged=specifiedPackageArrangement(value.normalize('NFKC'));
  return spec && arranged===packageCount(spec[1]) ? arranged : 0;
}

const oneHandOpening=/(?:单手|一只手|一手)(?:就能|也能|即可|能|可|轻松|轻轻|直接)?(?:撕开|打开|拆开|开启|开袋)|(?:撕开|打开|拆开|开启|开袋).{0,5}(?:只需|只要|仅需)(?:单手|一只手|一手)/u;
const unopenedOuterBox=/(?:无须|无需|免于|不用|不必|不需要|不打开|不拆开)(?:(?:打开|拆开|开启)(?:整盒|外盒|盒盖)|(?:整盒|外盒|盒盖)(?:打开|拆开|开启|开封)|(?:整盒|外盒|盒盖)(?=[，。,；;！!？?\s]|$))|(?:整盒|外盒|盒盖)(?:保持|仍然|仍)?(?:不(?:用|必|需要)?|无须|无需)(?:打开|拆开|开启|开封)/u;
const unconfirmedOpening=/未(?:明确|确认|承诺|验证|核实|定)|没有证实|未经(?:核实|验证)|未知|待(?:核|确认)|无法|不能|不可/u;
const openingSentences=text=>text.normalize('NFKC').split(/[，,。；;！？!?\n]/u);

export function unsupportedOpeningClaims(line,brief) {
  const given=openingSentences(brief);
  return [oneHandOpening,unopenedOuterBox].some(claim=>
    openingSentences(line).some(sentence=>claim.test(sentence) && !unconfirmedOpening.test(sentence)) &&
    !given.some(sentence=>claim.test(sentence) && !unconfirmedOpening.test(sentence) && !/是否|能否/u.test(sentence)));
}
