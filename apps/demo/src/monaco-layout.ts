import type { editor } from 'monaco-editor';

/** Resize outside ResizeObserver delivery, avoiding synchronous Monaco layout loops. */
export function deferMonacoLayout(instance: editor.IStandaloneCodeEditor | editor.IStandaloneDiffEditor) {
  const container = instance.getContainerDomNode();
  let frame = 0;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => instance.layout()); };
  const observer = new ResizeObserver(schedule);
  observer.observe(container); schedule();
  instance.onDidDispose(() => { observer.disconnect(); cancelAnimationFrame(frame); });
}
