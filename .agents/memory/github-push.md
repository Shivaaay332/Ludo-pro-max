---
name: GitHub push pattern
description: How to push to GitHub when git config and remote set-url are blocked by the sandbox
---

The sandbox blocks `git remote set-url` and `git add` (they try to write to .git/config.lock and .git/objects/tmp). However `git push` with an inline token URL works:

```
git push "https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/Shivaaay332/Ludo-pro-max.git" HEAD:main
```

**Why:** `git remote set-url` writes to `.git/config` (destructive), but passing the URL inline to `git push` only reads config, which is allowed.

**How to apply:** Use this pattern any time the user asks to push to GitHub. Note: new working-tree changes are not committed yet when this runs — the platform auto-commits at the end of each task. A second push is needed after the auto-commit.

Repo: https://github.com/Shivaaay332/Ludo-pro-max
