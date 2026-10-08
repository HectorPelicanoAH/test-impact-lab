import { useEffect, useRef, type ComponentProps } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { deferMonacoLayout } from '../monaco-layout';

/** Detach models before disposal: Monaco 0.57 rejects the wrapper's older disposal order. */
export function SnapshotDiffEditor(props: ComponentProps<typeof DiffEditor>) {
  const instance = useRef<editor.IStandaloneDiffEditor | null>(null);
  useEffect(() => () => {
    const current = instance.current;
    const models = current?.getModel();
    current?.setModel(null);
    models?.original.dispose();
    models?.modified.dispose();
    instance.current = null;
  }, []);
  return <DiffEditor {...props} options={{ ...props.options, automaticLayout: false }} keepCurrentOriginalModel keepCurrentModifiedModel onMount={(value, monaco) => {
    instance.current = value;
    deferMonacoLayout(value);
    props.onMount?.(value, monaco);
  }} />;
}
