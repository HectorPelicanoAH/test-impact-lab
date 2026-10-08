// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ExecutionPanel } from './ExecutionPanel';
import type { DemoExecution } from '../types';

test('a failed suite remains visible when all local tests pass; unavailable suites are not passes', () => {
  const execution: DemoExecution = { id: 'run', analysisId: 'analysis', snapshotId: 'snapshot', mode: 'selected', status: 'failed',
    results: [{ testId: 'BU1', name: 'Local domain test', kind: 'backend-unit', status: 'passed' }],
    suiteResults: [
      { id: 'inventory-contract', file: 'tests/contract/inventory.test.ts', availability: 'available', status: 'failed' },
      { id: 'inventory-provider', file: 'external/inventory/test/inventory.test.ts', availability: 'available', status: 'passed' },
      { id: 'messaging-runtime', file: 'tests/messaging/runtime.test.ts', availability: 'broker-required', status: 'unavailable' },
    ] };
  render(<ExecutionPanel selectedCount={4} totalCount={4} executions={{ selected: execution }} busy={false} disabled={false} onRun={() => {}} onInspect={() => {}} />);
  expect(screen.getByText('FAILED')).toBeTruthy();
  const local = within(screen.getByLabelText('Resumen de tests locales'));
  expect(local.getByText(/tests locales/).textContent).toBe('1 tests locales');
  expect(local.getByText(/failed/).textContent).toBe('0 failed');
  const suites = within(screen.getByLabelText('Resumen de suites distribuidas'));
  expect(suites.getByText(/failed/).textContent).toBe('1 failed');
  expect(suites.getByText(/passed/).textContent).toBe('1 passed');
  expect(suites.getByText(/unavailable/).textContent).toBe('1 unavailable');
});
