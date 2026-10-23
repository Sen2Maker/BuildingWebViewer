#!/usr/bin/env node
import {startPreviewResourceServer} from '../tests/helpers/preview-resource-server.mjs';

const help = `Usage: node scripts/preview-fixtures.mjs [--port 0..65535]

Run a tiny synthetic resource center on 127.0.0.1 only (default: ephemeral port 0).
No real user files, external network calls, dependencies, or public publishing.
The production website still requires public HTTPS URLs. Local HTTP resources
are usable only through the test adapter, not as production preview URLs.
Node transport tests inspect CORS headers; they do not validate browser CORS.
Stop with Ctrl+C. Run integration checks: node --test tests/online-preview-http.test.mjs
`;
const args = process.argv.slice(2);
let port = 0;
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write(help);
} else if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]) || !Number.isSafeInteger(Number(args[1])) || Number(args[1]) > 65535)) {
  process.stderr.write(`Invalid arguments.\n${help}`);
  process.exitCode = 1;
} else {
  port = args.length ? Number(args[1]) : 0;
  try {
    const server = await startPreviewResourceServer({port});
    process.stdout.write(`Synthetic resource center: ${server.origin}
Logical HTTPS origin (test adapter only): ${server.logicalOrigin}
Explicit separate-origin CORS allowlist: ${server.allowedOrigin}
Manifest: ${server.origin}/manifest.json
XYZ chunks: ${server.origin}/chunk-manifest.json
Fixtures: /fixtures/points.xyz, /fixtures/triangle.obj
Failure cases: /errors/not-found.xyz, /errors/integrity-mismatch.xyz,
  /errors/retry.xyz, /errors/declared-limit.xyz, /errors/chunked-limit.xyz,
  /errors/redirect.xyz, /errors/delayed-headers.xyz, /errors/stalled-body.xyz,
  /errors/no-cors.xyz
Streaming cases: /slow/points.xyz, /cancel/points.xyz
This local HTTP server is NOT a valid production preview URL. Host synthetic
files on permitted public HTTPS storage for real browser validation; production
localhost restrictions are unchanged. Node tests do NOT enforce browser CORS.
Stop with Ctrl+C. No service is installed.\n`);
    const stop = async () => { await server.close(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    process.stderr.write(`Could not start synthetic fixture server: ${error.message}\n`);
    process.exitCode = 1;
  }
}
