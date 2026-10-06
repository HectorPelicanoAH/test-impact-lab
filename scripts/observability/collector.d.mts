export const image: string;
export function startCollector(directory: string): Promise<{ name: string; endpoint: string; path: string; close(): Promise<void>; stop(): Promise<void>; restart(): Promise<void> }>;
