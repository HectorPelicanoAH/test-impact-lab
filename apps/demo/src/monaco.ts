import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import jsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import tsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';

(globalThis as typeof globalThis & { MonacoEnvironment: { getWorker: (_: string, label: string) => Worker } }).MonacoEnvironment = {
  getWorker: (_moduleId, label) => label === 'json' ? new jsonWorker() : label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker(),
};

loader.config({ monaco });
