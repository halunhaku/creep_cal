import React from 'react';
import { langRuns } from './langRuns';

/**
 * Render a possibly-bilingual string with its Chinese runs marked `lang="zh-CN"`.
 *
 * Used where the string arrives as data — an issue message, a notice, a
 * parameter's Chinese description — because those cannot be wrapped at the call
 * site. Static JSX is wrapped directly instead, so the markup is visible where it
 * is written.
 *
 * @param {{ text: unknown }} props
 */
export default function Lang({ text }) {
  return (
    <>
      {langRuns(text).map((run, index) => (
        run.zh
          ? <span key={index} lang="zh-CN">{run.text}</span>
          : <React.Fragment key={index}>{run.text}</React.Fragment>
      ))}
    </>
  );
}
