export const image: string;
export function startBroker(): Promise<{ name: string; url: string; close(): Promise<void>; stop(): Promise<void>; restart(): Promise<void> }>;
