/**
 * Split a bilingual string into runs, marking which of them are Chinese.
 *
 * The interface is bilingual on purpose and the document is `lang="en"`, so a
 * screen reader reads 中文 with English phonemes unless each Chinese run carries
 * its own language. Static JSX can be wrapped at the call site; a string that
 * arrives as data — an issue message, a notice, a parameter's Chinese
 * description — cannot, so it is split here instead and rendered by <Lang>.
 *
 * The split is by character class rather than by a separator convention, because
 * these strings take several shapes: `File is empty. 请上传…`, `Required column is
 * missing · 缺少必填列`, and `上传数据` on its own. The runs concatenate back to
 * the input character for character, so nothing that reads or asserts on the text
 * can tell the difference.
 *
 * The ranges are Han ideographs (including the extensions) plus CJK punctuation
 * and fullwidth forms, which is where ，。、（）： and fullwidth parentheses live.
 * Latin digits and the `·` separator are deliberately outside them: they are read
 * the same way in either language.
 */
const CHINESE = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/**
 * @param {unknown} text
 * @returns {Array<{ text: string, zh: boolean }>} runs, in order, covering the input
 */
export function langRuns(text) {
  const value = String(text ?? '');
  const runs = [];
  for (const character of value) {
    const zh = CHINESE.test(character);
    const last = runs[runs.length - 1];
    if (last && last.zh === zh) last.text += character;
    else runs.push({ text: character, zh });
  }
  return runs;
}
