# Security Policy

## Supported Version

The `main` branch is the supported development branch.

## Secret Handling

Do not commit:

- API keys, OAuth tokens, access tokens, or bearer tokens.
- Cookies, browser session dumps, or platform login state.
- Private keys, certificates, service account JSON, or SSH keys.
- `.env` files or machine-specific credential/config files.
- Generated videos or review outputs that may contain private source material.

The repository ignores common secret file names and generated `outputs/` artifacts. Keep source-project credentials in the calling project or deployment environment, not in `video-maker`.

## Reporting A Vulnerability

Open a private security advisory on GitHub, or contact the maintainers through the ServAgent organization.

Include:

- Affected commit or release.
- File path and type of exposure.
- Whether the secret is active or already revoked.
- Suggested remediation if known.

## Maintainer Checklist

Before making the repository public or pushing a release:

```bash
npm run validate
npm test
npm run security:scan
```

If any real secret was committed, revoke it first, then remove it from git history before pushing or releasing.
