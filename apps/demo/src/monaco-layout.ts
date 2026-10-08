import type { editor } from 'monaco-editor';

/** Resize outside ResizeObserver delivery, avoiding synchronous Monaco layout loops. */
export function deferMonacoLayout(instance: editor.IStandaloneCodeEditor | editor.IStandaloneDiffEditor) {
  const container = instance.getContainerDomNode();
  // DiffEditor returns its inner canvas, whose height is set by layout itself.
  // Measure the external wrapper to avoid feeding its initial 5px height back in.
  const host = 'getOriginalEditor' in instance ? container.parentElement ?? container : container;
  let frame = 0;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => instance.layout({ width: host.clientWidth, height: host.clientHeight })); };
  const observer = new ResizeObserver(schedule);
  observer.observe(host); schedule();
  instance.onDidDispose(() => { observer.disconnect(); cancelAnimationFrame(frame); });
}
