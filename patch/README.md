# patch/

Work that nobody has applied yet. A session cannot push a change under
`.github/workflows/`, so the change arrives here as a `git format-patch`
file, for a maintainer to apply.

| patch | touches | why |
| --- | --- | --- |
| `0001-W10.2-CI-runs-make-test-on-Node-22-and-24-and-the-co.patch` | adds `.github/workflows/test.yml` and `.github/workflows/comments.yml` | CI runs `make test` on Node 22 and 24, and the comment gate's own tests (W10.2 in voxgig/station's plan) |

Apply it on `main`, then delete this folder: once applied, the patch only
duplicates the history it created.

```sh
git am < patch/0001-W10.2-CI-runs-make-test-on-Node-22-and-24-and-the-co.patch
git rm -r patch
git commit -m "Remove the applied CI patch"
git push origin main
```

`git apply --check patch/0001-W10.2-CI-runs-make-test-on-Node-22-and-24-and-the-co.patch` says first whether it still applies.
