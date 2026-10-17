import { pick } from '../i18n/pick';
import { MODELS } from './batchModels';

// Kernel diagnostics are domain data, not translated calculation state. Keep the
// original message in the dataset (including Worker results) and resolve it only
// when rendering, just like model labels. Unknown third-party details stay intact.
const diagnostics = [
  ['ACI 209R-92 requires t0 ≥ 1 day.', 'ACI 209R-92 要求 t0 ≥ 1 天。'],
  ['ACI 209R-92 requires a non-negative finite concrete age t.', 'ACI 209R-92 要求混凝土龄期 t 为非负有限数。'],
  ['ACI 209R-92 requires 0 ≤ H ≤ 100%.', 'ACI 209R-92 要求 0 ≤ H ≤ 100%。'],
  ['ACI 209R-92 requires a positive volume-surface ratio V/S.', 'ACI 209R-92 要求体积表面积比 V/S 为正数。'],
  ['ACI 209R-92 requires a non-negative slump.', 'ACI 209R-92 要求坍落度为非负数。'],
  ['ACI 209R-92 requires 0 ≤ fine aggregate ≤ 100%.', 'ACI 209R-92 要求细骨料比例在 0% 至 100% 之间。'],
  ['ACI 209R-92 requires a non-negative air content.', 'ACI 209R-92 要求含气量为非负数。'],
  ['MC2010 requires 20 ≤ fcm ≤ 130 MPa.', 'MC2010 要求 20 ≤ fcm ≤ 130 MPa。'],
  ['MC2010 requires 40 ≤ RH ≤ 100%.', 'MC2010 要求 40 ≤ RH ≤ 100%。'],
  ['MC2010 requires t0 ≥ 1 day.', 'MC2010 要求 t0 ≥ 1 天。'],
  ['MC2010 requires positive Ac and u values.', 'MC2010 要求 Ac 和 u 为正数。'],
  ['MC2010 standard creep model requires 5 ≤ T ≤ 30°C.', 'MC2010 标准徐变模型要求 5 ≤ T ≤ 30°C。'],
  ['MC2010 requires |sigma| ≤ 0.6 fcm.', 'MC2010 要求 |sigma| ≤ 0.6 fcm。'],
  ['MC2010 requires a non-negative finite concrete age t.', 'MC2010 要求混凝土龄期 t 为非负有限数。'],
  ['MC2010 requires a finite notional size 2Ac/u greater than zero.', 'MC2010 要求名义尺寸 2Ac/u 为大于零的有限数。'],
  ['B4 requires relative humidity between 0 and 98.4% (the drying formulation is only usable up to 98.4%).', 'B4 要求相对湿度在 0% 至 98.4% 之间（干燥计算公式仅适用于不超过 98.4% 的湿度）。'],
  ['B4 is not intended for concrete younger than 1 day.', 'B4 不适用于龄期小于 1 天的混凝土。'],
  ['B4 requires a non-negative concrete age t.', 'B4 要求混凝土龄期 t 为非负数。'],
  ['B4 calibration range is 15 ≤ fc ≤ 70 MPa.', 'B4 的标定范围为 15 ≤ fc ≤ 70 MPa。'],
  ['B4 calibration range is 12 ≤ V/S ≤ 120 mm.', 'B4 的标定范围为 12 ≤ V/S ≤ 120 mm。'],
  ['B4 curing-temperature range is 20 ≤ Tcur ≤ 30°C.', 'B4 的养护温度范围为 20 ≤ Tcur ≤ 30°C。'],
  ['B4 environmental-temperature range is -25 ≤ T ≤ 75°C.', 'B4 的环境温度范围为 -25 ≤ T ≤ 75°C。'],
  ['B4 calibration range is 200 ≤ c ≤ 1500 kg/m³.', 'B4 的标定范围为 200 ≤ c ≤ 1500 kg/m³。'],
  ['B4 calibration range is 0.22 ≤ w/c ≤ 0.87.', 'B4 的标定范围为 0.22 ≤ w/c ≤ 0.87。'],
  ['B4 calibration range is 1 ≤ a/c ≤ 13.2.', 'B4 的标定范围为 1 ≤ a/c ≤ 13.2。'],
  ['GL2000 requires 16 ≤ fcm28 ≤ 82 MPa.', 'GL2000 要求 16 ≤ fcm28 ≤ 82 MPa。'],
  ['GL2000 requires 20 ≤ h ≤ 100% (use 96% for sealed concrete).', 'GL2000 要求 20 ≤ h ≤ 100%（密封混凝土取 96%）。'],
  ['GL2000 requires a positive volume-surface ratio V/S.', 'GL2000 要求体积表面积比 V/S 为正数。'],
  ['GL2000 requires a non-negative drying-start age tc.', 'GL2000 要求干燥开始龄期 tc 为非负数。'],
  ['GL2000 requires a non-negative concrete age t.', 'GL2000 要求混凝土龄期 t 为非负数。'],
  ['GL2000 requires a loading age t0 ≥ 1 day.', 'GL2000 要求加载龄期 t0 ≥ 1 天。'],
  ['GL2000 requires loading at or after drying started (t0 ≥ tc).', 'GL2000 要求加载不早于干燥开始时刻（t0 ≥ tc）。'],
  ['AASHTO requires 2.4 ≤ fci ≤ 15 KSI.', 'AASHTO 要求 2.4 ≤ fci ≤ 15 KSI。'],
  ['AASHTO requires 0 ≤ H ≤ 100%.', 'AASHTO 要求 0 ≤ H ≤ 100%。'],
  ['AASHTO requires a positive volume-surface ratio V/S.', 'AASHTO 要求体积表面积比 V/S 为正数。'],
  ['AASHTO requires a loading age ti ≥ 1 day.', 'AASHTO 要求加载龄期 ti ≥ 1 天。'],
  ['AASHTO requires a non-negative curing-end age tc.', 'AASHTO 要求养护结束龄期 tc 为非负数。'],
  ['AASHTO requires a non-negative concrete age t.', 'AASHTO 要求混凝土龄期 t 为非负数。'],
];
const byMessage = new Map(diagnostics.map(([en, zh]) => [en, { en, zh }]));
const unsupported = [
  ['ACI 209R-92 curing type', 'ACI 209R-92 养护方式'],
  ['MC2010 cement class', 'MC2010 水泥等级'],
  ['B4 cement type', 'B4 水泥类型'],
  ['B4 aggregate type', 'B4 骨料类型'],
  ['B4 specimen shape', 'B4 试件形状'],
  ['GL2000 cement type', 'GL2000 水泥类型'],
];

export function localizeValidation(message, locale) {
  if (byMessage.has(message)) return pick(byMessage.get(message), locale);
  for (const [en, zh] of unsupported) {
    const prefix = `Unsupported ${en}: `;
    if (message?.startsWith(prefix)) {
      return pick({ en: message, zh: `不支持的${zh}：${message.slice(prefix.length)}` }, locale);
    }
  }
  const admixture = message?.match(/^B4 admixture percentage (.+) must be a non-negative number\.$/);
  if (admixture) return pick({ en: message, zh: `B4 外加剂 ${admixture[1]} 的百分比必须为非负数。` }, locale);
  const result = message?.match(/^(.+) could not be evaluated from these inputs · 输入无法产生有效结果$/);
  if (result) {
    const label = MODELS.flatMap((model) => model.labels).find((item) => item.en === result[1]);
    return pick({ en: `${result[1]} could not be evaluated from these inputs`, zh: `这些输入无法产生有效的 ${pick(label, 'zh') || result[1]} 结果` }, locale);
  }
  return message;
}
