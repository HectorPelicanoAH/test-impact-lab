import { build as bundle } from 'esbuild';
import { build as viteBuild } from 'vite';

// Bundle workspace and AMQP code together; pnpm does not hoist messaging's dependency into each application.
const serviceOptions = { bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: true,
	banner: { js: "import { createRequire as createBundleRequire } from 'node:module'; const require = createBundleRequire(import.meta.url);" } };
for (const service of ['backend', 'notifications', 'preparation']) await bundle({ ...serviceOptions, entryPoints: [`apps/${service}/src/main.ts`], outfile: `apps/${service}/dist/main.js` });
await bundle({ entryPoints: ['packages/impact-engine/src/index.ts'], outfile: 'packages/impact-engine/dist/index.js', bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', sourcemap: true });
await bundle({ entryPoints: ['packages/api-contract/src/login.ts'], outfile: 'packages/api-contract/dist/index.js', bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', sourcemap: true });
await viteBuild({ root: 'apps/frontend', configFile: 'apps/frontend/vite.config.ts' });
await bundle({ entryPoints: ['apps/demo/server.ts'], outfile: 'apps/demo/dist-server/server.js', bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: true });
await viteBuild({ root: 'apps/demo', configFile: 'apps/demo/vite.config.ts' });
