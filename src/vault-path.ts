import path from "path";

/**
 * Resolves a note path a caller supplied to an absolute path inside the vault, or throws.
 *
 * The path is resolved first, so `..` segments are applied before the check, and the result is compared with the
 * vault root by `path.relative`, not by a string prefix. A prefix test accepts `/home/me/vault-private/x` for the
 * vault `/home/me/vault`, and accepts an absolute path such as `/home/me/vault/../.ssh/x` unchanged.
 *
 * This does not follow symbolic links: a link inside the vault that points outside it is still followed by the
 * file system when the note is read or written.
 */
export function resolveInVault(vaultPath: string, notePath: string): string {
  if (typeof notePath !== "string" || notePath.length === 0 || notePath.includes("\0")) {
    throw new Error("notePath must be a non-empty string");
  }
  const root = path.resolve(vaultPath);
  const full = path.resolve(root, notePath);
  const relative = path.relative(root, full);
  if (relative === "" || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Path traversal not allowed - path must be within vault");
  }
  return full;
}
