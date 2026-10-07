import { useEffect, useRef, type ComponentProps } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

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
  return <DiffEditor {...props} keepCurrentOriginalModel keepCurrentModifiedModel onMount={(value, monaco) => {
    instance.current = value;
    props.onMount?.(value, monaco);
  }} />;
}