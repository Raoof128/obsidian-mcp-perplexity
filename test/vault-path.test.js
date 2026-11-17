import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { resolveInVault } from "../dist/vault-path.js";

const VAULT = path.resolve("/home/me/vault");

test("a relative note path resolves inside the vault", () => {
  assert.equal(resolveInVault(VAULT, "notes/a"), path.join(VAULT, "notes", "a"));
  assert.equal(resolveInVault(VAULT, "a/../b.md"), path.join(VAULT, "b.md"));
});

test("an absolute path inside the vault is accepted", () => {
  assert.equal(resolveInVault(VAULT, path.join(VAULT, "x.md")), path.join(VAULT, "x.md"));
});

test("paths that leave the vault are refused", () => {
  for (const escape of [
    "../outside",
    "notes/../../outside",
    "/etc/passwd",
    // An absolute path that starts with the vault and then climbs out of it.
    VAULT + "/../.ssh/authorized_keys",
    // A sibling directory whose name merely starts with the vault's name.
    VAULT + "-private/secret",
    "../vault-private/secret",
    // The vault root itself is not a note.
    ".",
    VAULT,
  ]) {
    assert.throws(() => resolveInVault(VAULT, escape), /within vault/, escape);
  }
});

test("empty and malformed paths are refused", () => {
  for (const bad of ["", "a\0b", undefined, 42]) {
    assert.throws(() => resolveInVault(VAULT, bad), /non-empty string/);
  }
});
