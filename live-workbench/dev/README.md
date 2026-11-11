# Local validation bridge

This is a loopback-only development harness, not a public authentication service or a deployment. It connects a browser at `http://127.0.0.1:8788` to the isolated Worker at `http://127.0.0.1:8787`. Node 24 is required for the built-in SQLite store.

The local operator generates a one-use, five-minute bootstrap link. After login the server keeps the session in SQLite and sends only an HttpOnly, SameSite=Strict cookie to the browser. The service bearer and independently signed session assertion are injected by the bridge. Neither secret enters JavaScript or HTML. Cookies omit Secure only because this validation endpoint is HTTP loopback; this configuration must never be exposed through a tunnel or non-loopback listener.

The server accepts only its exact `127.0.0.1:8788` Host and same-origin POSTs. It refuses cross-site fetch metadata, ignores caller-supplied authentication/session headers, and proxies only named routes to its fixed Worker origin. Login consumes its token atomically. Session state survives a server restart; the private session cookie and bootstrap token are stored only as hashes. The trusted principal and session IDs never come from browser/model input.

1. Generate independent local server secrets once: `node dev/init-local-secrets.mjs`. If the file already exists, inspect the intended local setup instead of overwriting it.
2. Root executor supplies those same two secrets to Wrangler's **local** configuration, plus the existing read-only Shopify runtime credential and verified publication context. The seed credential belongs to its own seeding process.
3. Start the Worker with the isolated `wrangler.local.jsonc` and local persistent storage. Do not run the production deploy command.
4. Set `ARMANS_BRIDGE_ENV_FILE` to the private `server.local.env` file, then run `node dev/start-local-bridge.mjs` from the workbench. Alternatively load `.env.local` containing only approved runtime/server configuration. A process carrying any nonempty `SEED_*` variable is refused.
5. Open the link in `dev/private/bootstrap-url.txt` locally. It expires in five minutes and can be used once. Do not copy it into reports. The login page removes the fragment from history before sending the nonce to the same-origin login endpoint.

Files under `dev/private/` are ignored by Git. POSIX directory/file permissions are requested as 0700/0600. On Windows, run `powershell -File dev/protect-private.ps1` before generating secrets or starting the bridge. That script restricts only its adjacent private directory to the current user and verifies the result; it never reads credentials. POSIX mode bits alone do not establish a Windows ACL. Do not claim Windows credential-file isolation until the ACL check is recorded. The script should run on the fresh directory before files exist so inherited permissions apply consistently.

`trustedSessionFactory(env)` is an internal Node interface for the evaluation/load harness. Each `create()` returns a new isolated session and a `headers()` method. It has no HTTP route. Never pass its headers, context or assertion to a model or include them in saved public traces. Call Worker tools directly from that trusted local process. The browser bridge exposes `/api/shop` and catalogue browsing, not a general MCP or open-proxy route.

Deterministic tests: `node --test test/bridge.test.mjs`. They use a stub upstream and temporary SQLite state; they do not call Shopify, invoke a model or prove the deployed system's authentication.

### S21 private-cart companion check (evaluation entry only)

The production Worker and browser bridge do not expose stored cart IDs. S21 uses
[`eval-worker.mjs`](./eval-worker.mjs) only with
[`wrangler.eval-local.jsonc`](../wrangler.eval-local.jsonc). Stop the regular local
Worker before using port 8787. Keep this process on loopback; never deploy or tunnel
this configuration.

The operator supplies a new independent random secret of at least 32 bytes as
`LOCAL_EVAL_INSPECTION_SECRET` in the Worker's ignored local secrets file. Supply
that same value as `private_cart_inspection_secret` in the private evaluation
adapter configuration, alongside its existing runtime service and issuer secrets.
Do not reuse the service bearer, issuer secret or a Shopify credential. Never
print these values or add them to browser JavaScript, prompts, traces or Git.
The seed/controller credential remains separate from all runtime secrets.

```sh
npx wrangler dev --local --config wrangler.eval-local.jsonc --persist-to dev/private/eval-state
```

Use this separate persistence directory for the entire evaluation, including the
victim-cart creation and S21 check. Existing carts from another local namespace
cannot be inspected. The adapter imports
[`createPrivateCartInspector`](./private-cart-inspector.mjs), then passes the
returned `getPrivateCartId(victimSession, createdCart)` into the controller. It
requires a confirmed created cart and matches its revision against stored state.

`POST /__eval/private-cart` accepts no request body, query parameters, browser
Origin or browser Sec-Fetch headers. Node fetch’s standalone Sec-Fetch-Mode: cors is allowed; its zero-byte body stream is verified. It requires the exact loopback Host, independent
inspection secret, existing service bearer and the signed victim session. Its
Durable Object checks the stored owner hash, READY state and cart-ID format while
holding the normal session queue. The response is no-store. The helper exposes
only a generic failure message; the private capability stays in trusted Node
memory and the controller sends only its keyless public GID into the attack
scenario. This inspection performs no Shopify request or storage mutation.

Verify locally with `node --test test/private-inspection.test.mjs`. These tests
use in-memory storage and fake cart IDs; they make no live calls.
