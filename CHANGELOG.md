# Changelog

Notable changes to this project, newest first. Dates are Australia/Sydney. Changes before
17 November 2026 are in the Git log only.

## [Unreleased]

### Raouf: 2026-11-17 (Australia/Sydney): note paths confined to the vault; private config removed; README rewritten from the code

- **Scope:** `src/`, `test/`, `README.md`, `INSTALLATION.md`, packaging metadata.
- **Summary (security):** The four tools that take a note path (`get_note_content`,
  `get_note_links`, `create_note`, `update_note`) checked it with `fullPath.startsWith(vaultRoot)`.
  That accepted a sibling directory whose name starts like the vault's, and an absolute path that
  starts in the vault and climbs out with `..`, so the two write tools could write a `.md` file
  outside the vault. `resolveInVault` (`src/vault-path.ts`) now resolves the path first and
  compares it with `path.relative`. Symbolic links inside the vault are still followed.
- **Summary (private data):** `.obsidian-mcp-config.json` and `SETUP_COMPLETE.md` held the owner's
  home directory and vault path. Both are removed and the config file is ignored. They remain in
  the Git history.
- **Summary (accuracy):** The README is rewritten from the code: nine tools, two of which write to
  the vault. It previously cloned a repository that does not exist and listed read features only.
  Three generated status reports with unsupported claims are removed. A `LICENSE` file carries the
  MIT text that `package.json` and `manifest.json` already declared.
- **Files:** `src/index.ts`, `src/vault-path.ts`, `test/vault-path.test.js`, `README.md`,
  `INSTALLATION.md`, `LICENSE`, `.gitignore`, `manifest.json`, `package.json`, `scripts/`.
- **Verification:** No CI in this repository. Run locally on Node 24: `npm run test:unit`, 4 of 4
  pass; `npm test` against a throwaway two-note vault, 3 of 3 pass.
- **Follow-ups:** `npm run build-extension` fails (it installs a packaging tool under a name that
  does not exist on npm, and its ZIP fallback then crashes). The README says so; the script is not
  fixed.
