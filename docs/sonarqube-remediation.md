# SonarQube review — 2026-11-11

Source: the supplied `Report_projectdaily_2026-11-11_to_2026-11-11.pdf`, scan at 10:44.
The report records a passing quality gate, 1 bug, 12 security hotspots, and 114
code smells. A hotspot is a request for security review, not a confirmed
vulnerability. No authenticated server connection is available in this session;
the changes below have not been re-analyzed by SonarQube.

## Findings and disposition

| Report location | Review and local action |
| --- | --- |
| `apps/web/src/App.tsx:134` | Removed the shared password from the browser. The development shortcut fills only the demo email; the user enters their locally configured password. |
| `scripts/check-gemini.ts:20` | Generate a new random password and signing key for each in-memory synthetic check. No fixed credentials remain in this check. |
| `scripts/setup-email.mjs:8–9` | Parse assignments one line at a time using string operations. Existing values and the first APP_ORIGIN are preserved; whitespace cannot trigger repeated multiline regex backtracking. Regression tests cover quoted origins, idempotency, and long malformed input. |
| `apps/web/src/styles.css:3` | `@theme` is used by the Tailwind v4 build. The existing `sonar-project.properties` already ignores only `css:S4662` for this exact stylesheet. Keep the directive to preserve the generated theme. Re-scan with this configuration to verify the finding clears. |
| `tmp/video-report-doc/deps/pythainlp/corpus/core.py:909` | Third-party dependency, already excluded by `sonar.exclusions=tmp/video-report-doc/deps/**`. No upstream library code was modified. This is a scope correction, not a security fix for archive extraction. |
| `tmp/video-report-doc/deps/pythainlp/augment/word2vec/core.py:16` and `word_vector/core.py:29` | Third-party logging configuration under the same existing dependency exclusion. No application runtime logging uses these modules. No upstream library code was modified. |
| `tmp/video-presentation/v2/slides/inspect-details.py:4` (two findings) | The two HTTP strings identify DrawingML and PresentationML XML namespaces for local ZIP/XML inspection. They do not open a network connection. Safe in this context; retain the exact namespace identifiers. |
| `tmp/video-presentation/word-render/audit_detailed_script.py:14` and `audit_documents.py:12` | The HTTP string is a WordprocessingML XML namespace used for local document inspection. No network operation is performed. Safe in this context; retain the namespace identifier. |
| `tmp/video-report-doc/build_pdf.py:75` | Tests the prefix of a parsed link to recognize it; it does not download that URL. The parser deliberately supports existing HTTP and HTTPS source links. This line does not transmit credentials or establish an insecure connection. Review as safe for this specific operation. |

The five HTTP hotspots need a review disposition on the server when access is
available. Their code was not rewritten to disguise namespace strings or bypass
the analyzer. The report's recommendations were treated as reference material.

## Demo account setup

The seed script also used the same fixed password as the browser. It now requires
`DEMO_PASSWORD` in the local `.env`, validated against the registration schema,
and does not log the password. The example environment leaves this value blank.
The README explains setup and signing in. Production continues to reject demo
accounts.

Existing demo accounts are preserved by the seed script. If an account was
created with the previously published password, change its password through
account settings. Setting DEMO_PASSWORD and re-running the seed does not rotate
an existing account's password.

## Remaining verification

- The PDF gives the code smell count but does not enumerate the 114 findings.
  Fetch the full issue list from the original project before claiming these are
  resolved; do not infer rules or locations from the total alone.
- Connect to the original server using `sonar auth login -s <server-url>` in a
  user terminal, then verify authentication. No tokens should be pasted into chat.
- Query `sonar list issues -p projectdaily --format json` and
  `sonar quality-gate status -p projectdaily --format json`.
- Run a new project analysis with the checked-in configuration, inspect any new
  findings, and record security reviews for the safe operations above.

The CLI was installed, but authentication and MCP/hook integration remain
incomplete because no server URL was available. Installation alone does not
confirm a passing post-change quality gate.

## Dependency remediation and validation

The installation audit also identified dependency advisories outside the PDF.
Updated `@hono/node-server` to 2.1.3, `nodemailer` to 10.5.0, and `smtp-server`
to 3.21.4, including manifest minimums and the lockfile. The adapter update
crosses a major version; typechecking and browser smoke tests confirm the current
`serve`, `serveStatic`, and connection-info imports remain compatible.
The upstream [adapter advisory](https://github.com/honojs/node-server/security/advisories/GHSA-rmxm-3fg6-px4f)
identifies 2.1.3 as the patched version for static-path double decoding.

Validation after the dependency updates:

- `npm test`: 110 tests passed, including two email-setup regression tests.
- `npm run build`: TypeScript checks and production build passed. Existing bundle
  size and third-party comment annotation warnings remain.
- `npx playwright test -g 'สมัครบัญชีและเปิดรายการงานได้'`: 2 passed, desktop Chrome
  and mobile Pixel 7, exercising registration and static frontend serving.
- `npm audit --json`: 0 known vulnerabilities reported at the time of this check.
- `git diff --check`: passed.

The initial sandboxed test run failed before loading tests because tsx could not
read OS user information. Re-running outside that sandbox passed; it was not a
test assertion failure. No external AI or real email delivery was tested.
