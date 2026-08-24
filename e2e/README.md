# E2E Tests

Two harnesses live here. They are **not** duplicates — they answer different
questions and cannot substitute for each other.

| | `run-tests.sh` | `k3s/` |
|---|---|---|
| **Question it answers** | Do the four integrations behave correctly? | Is data actually kept permanently? |
| **Needs** | A Home Assistant that is already running | A k3s cluster; creates its own HA |
| **HA lifecycle** | Not managed — you point it at one | Deployed, seeded, restarted, torn down |
| **Runner** | Playwright (TypeScript) | Plain Python + bash, no Playwright |
| **Runtime** | Minutes | Tens of minutes |

The retention harness needs an HA it can **restart against a real disk** (hence
the PVC), which the Playwright harness cannot provide. That is why
`k3s/retention_test.py` is Python and lives here rather than in `tests/` —
`tests/` is pure pytest and needs no running Home Assistant.

## Base URL

Everything defaults to `http://localhost:18125` and respects `HA_BASE_URL`:

```bash
HA_BASE_URL=http://localhost:8123 npm test
```

No script hardcodes a port.

---

## Harness 1 — Playwright, against an existing HA

345 tests across 9 spec files:

| Spec pattern | Tests | Surface exercised |
|---|---|---|
| `*-record.spec.ts` (4 files) | 104 | **WebSocket** — the commands the custom panels send |
| `*-services.spec.ts` (4 files) | 230 | **REST services** — `POST /api/services/<domain>/<service>`, the surface documented for automations and AI agents |
| `integration.spec.ts` | 11 | **Browser UI** — panel navigation, persistence across reload |

```bash
./run-tests.sh                 # everything; uses xvfb-run when DISPLAY is unset
./run-tests.sh tests/note-record.spec.ts
npm run test:finance-services  # one suite
npm run report                 # open the HTML report
```

Defaults to user `admin` / `admin123`; override with `HA_USERNAME` / `HA_PASSWORD`.
Tests run sequentially (`workers: 1`) and build on each other's data — do not
enable parallelism.

Shared helpers in `utils/`: `ha-auth.ts` (login flow → access token),
`ws-client.ts` (persistent WebSocket), `services-client.ts` (REST, handles the
`?return_response` that query services require), `test-data.ts` (fixtures).

---

## Harness 2 — k3s, disposable HA, retention only

Proves that `ha_finance` transactions and `ha_health_record` records survive
past the limits that used to trim them (1,000 and 10,000 respectively), and
survive a pod restart.

```bash
kubectl apply -f k3s/ha-test.yaml
kubectl -n ha-records-test rollout status deploy/homeassistant
kubectl -n ha-records-test port-forward svc/homeassistant 18125:8123 &

export HA_TOKEN=$(./k3s/onboard.sh)        # fresh instance: create owner, finish onboarding
HA_TOKEN=$HA_TOKEN ./k3s/bootstrap.sh      # create the fixed-ID account and member

HA_TOKEN=$HA_TOKEN ./k3s/retention_test.py seed     # insert 1,100 tx + 10,100 records, verify
kubectl -n ha-records-test rollout restart deploy/homeassistant
HA_TOKEN=$(./k3s/token.sh) ./k3s/retention_test.py verify   # re-verify after restart

kubectl delete namespace ha-records-test   # teardown
```

Notes:

- `ha-test.yaml` clones `custom_components/` from **`main`** in an initContainer.
  Point it at a feature branch to test one, but change it back — a stale branch
  here fails silently and validates the wrong code.
- Requires the `repo-credentials` secret (`GIT_USER`, `GIT_TOKEN`) in the namespace.
- `bootstrap.sh` exits 1 with `already_configured` on an already-bootstrapped
  instance. That is fine; do not tear the namespace down over it.
- `retention_test.py seed` is **not idempotent** — re-running doubles the data.
  To retry, delete the namespace and redeploy.
- `onboard.sh` writes a refresh token to `/tmp/ha-records-test.refresh`;
  `token.sh` exchanges it for a fresh access token.
