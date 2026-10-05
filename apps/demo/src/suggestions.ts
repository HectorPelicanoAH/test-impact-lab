export interface SuggestedChange {
  id: string;
  title: string;
  description: string;
  path: string;
  before: string;
  after: string;
}

export const suggestions: SuggestedChange[] = [
  {
    id: 'ui',
    title: 'Change LoginButton',
    description: 'Rename the primary action in the UI.',
    path: 'apps/frontend/src/components/LoginButton.tsx',
    before: "'Sign in'",
    after: "'Continue'",
  },
  {
    id: 'frontend',
    title: 'Change login normalization',
    description: 'Preserve email casing before the API request.',
    path: 'apps/frontend/src/auth/normalizeEmail.ts',
    before: 'value.trim().toLowerCase()',
    after: 'value.trim()',
  },
  {
    id: 'domain',
    title: 'Change User.authenticate()',
    description: 'Alter the aggregate outcome for locked users.',
    path: 'apps/backend/src/auth/domain/User.ts',
    before: "if (this.locked) return 'locked';",
    after: "if (this.locked) return 'invalid-credentials';",
  },
  {
    id: 'contract',
    title: 'Change POST /login contract',
    description: 'Move the login endpoint to a new route.',
    path: 'packages/api-contract/src/login.ts',
    before: "export const LOGIN_PATH = '/login';",
    after: "export const LOGIN_PATH = '/session';",
  },
];

export function applySuggestion(content: string, suggestion: SuggestedChange): string {
  if (!content.includes(suggestion.before)) throw new Error(`Baseline text for ${suggestion.title} was not found.`);
  return content.replace(suggestion.before, suggestion.after);
}
