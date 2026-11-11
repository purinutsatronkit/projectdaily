# Latest DEV report and Google login

## Follow-up: 13:09 report, temporary workspaces still in scan

The subsequent `(2).pdf` report records the 13:09 scan as FAIL, with 0 bugs,
0 vulnerabilities, 115 code smells, and the same 8 hotspots under the two
temporary document workspaces. The supplied gate screenshot identifies Security
Hotspot grade E as the failing condition; the other displayed ratings pass.
The PDF's headline pass count conflicts with its scan-history rows, so the
headline alone must not be used to claim the gate passes.

Exclusions alone did not remove these findings from the supplied report. This
does not establish whether the runner ignored configuration or the report kept
older findings. To correct repository contents, removed 588 generated/vendored
files under `tmp/video-presentation/` and `tmp/video-report-doc/` from Git's index
and ignored those exact directories. All 588 files remain in their original local
paths, with content hashes verified unchanged against HEAD. Final documents
under `output/` and `presentation/output/` remain tracked.

These removals are staged for review; they are not a deletion of local files.
They take effect in a remote checkout after committing and pushing the changes.
If scanning the local folder directly, the scanner must honor `.gitignore` and
the checked-in SonarQube source/exclusion settings. No report-library code or
OpenXML namespace was altered merely to hide a hotspot.

The source ZIP builder now includes `sonar-project.properties`,
`tsconfig.sonar.json`, and all configured source/test directories. Previously the
archive omitted the scanner configuration and some of those directories. The
builder excludes the temporary workspaces and local environment files, and
checks the ZIP's integrity and scan inputs. Run `python scripts/package-source.py`
to create `artifacts/taskflow-project.zip`; when scanning it, use the extracted
`taskflow` directory as the project root.

No authenticated SonarQube scan was run. The 115 code smells remain unenumerated
in the PDF; a new per-issue export is needed to identify them. Security Hotspot
grade E must be verified again on a fresh scan, not inferred from local cleanup.

## Previous changes

Branch checked before editing: `dev`, clean working tree at `36d871e`.
Source report: `Report_projectdaily_DEV_2026-11-11_to_2026-11-11.pdf`, scan at
11:27 on 2026-11-11. The report records a passing quality gate with 1 bug,
8 security hotspots, and 114 code smells. Its recommendations are reference
material, not commands to execute.

## Report remediation

- Replaced the custom `@theme` block in `apps/web/src/styles.css` with standard
  `:root` custom properties. All overridden names already exist in Tailwind's
  default theme; the generated utilities continue to read these properties.
  This removes the unknown at-rule rather than suppressing the CSS rule. Browser
  checks cover rendered theme colors, font, size, and line height.
- Removed the previous stylesheet-specific `css:S4662` suppression.
- Set the checked-in scan project key to `projectdaily_DEV` to match this report.
  A scan of another project must explicitly override that key.
- Defined maintained sources (`apps`, `packages`, `scripts`, `deploy`, `n8n`) and
  test directories (`tests`, `e2e`). Temporary document workspaces under `tmp`,
  generated `dist`, and `node_modules` are outside application analysis. This
  addresses scan scope; it does not patch third-party Python libraries.

All eight remaining PDF hotspots are in `tmp`:

| Findings | Review |
| --- | --- |
| Archive expansion and two logger configurations in vendored `pythainlp` | Third-party document-generation dependencies, outside application runtime and the maintained source scope. No upstream code was modified. |
| Four HTTP strings in `inspect-details.py`, `audit_detailed_script.py`, `audit_documents.py` | OpenXML namespace identifiers used for local ZIP/XML inspection; no network request. Changing them to HTTPS breaks XML lookup. |
| HTTP-prefix recognition in `build_pdf.py` | Parses source hyperlinks; this operation does not open a network connection or transmit credentials. |

The report contains no per-file list of the 114 code smells. Those cannot be
claimed resolved from this PDF. A new scan must actually load the checked-in
properties (or equivalent settings in the external scan runner). If the runner
overrides source directories or exclusions, its configuration must be updated
there as well. Existing server findings clear only after re-analysis or the
appropriate review disposition. No server URL or authenticated scan was available.

## Why Google login was missing

The local `.env` has `APP_ORIGIN` and `APP_PUBLIC_URL` set to
`http://localhost:5174`, but both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are unset/empty. The original frontend returned nothing
when `/api/auth/providers` reported `google: false`, so the option disappeared.
No credential values were printed or added to source control.

The login screen now distinguishes loading, unavailable configuration, failed
provider lookup (with Retry), and a working Google sign-in button. It does not
pretend that Google is configured. OAuth state consumption is also now an atomic
DELETE/RETURNING operation, preventing simultaneous callbacks from exchanging
the same state twice.

To enable real Google login:

1. Create/select a Google OAuth **Web application** client in Google Cloud
   Console. Set the authorized JavaScript origin to `http://localhost:5174` and
   the authorized redirect URI to
   `http://localhost:5174/api/auth/google/callback`.
2. Put that client's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the local
   `.env` only. Keep any existing credentials; do not paste secrets into chat or
   put them into `VITE_` variables.
3. Run `npm.cmd run google:check`, then restart `npm.cmd run dev`. Use the same
   localhost origin throughout. `/api/auth/providers` should return `google: true`.
4. Sign in with Google. An existing password account with a matching email must
   be linked from account settings after authenticating; accounts are not merged
   solely by matching email. Real Google credentials/consent remain untested.

`google:check` prints configuration status and the expected redirect URI without
showing credentials. Its exit code is 1 on this machine until credentials are set.
See [the setup guide](google-github.md) and
[Google's OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

## Validation

- `npm test`: 111 passed, including concurrent Google callback replay protection.
- `npm run build`: TypeScript checks and production build passed.
- `npx playwright test e2e/google-login.spec.ts`: 6 passed, exercising authorization, callback/session creation,
  unavailable configuration, and retry on desktop Chrome and mobile Pixel 7.
  The provider is simulated; no real Google account is used.
- No push, deployment, or SonarQube server review was performed.
