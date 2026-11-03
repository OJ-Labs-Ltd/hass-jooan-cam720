# Brand assets and HACS-default submission

Installs today via HACS as a **custom repository** (add this repo's URL in
HACS). For HACS *default* (searchable by name), two public PRs are needed.

- `custom_integrations/jooan_cam720/icon.png` (256x256) and `icon@2x.png`
  (512x512) are the OJ Labs logo.

## 1. home-assistant/brands — SUBMITTED

PR: https://github.com/home-assistant/brands/pull/11402  (awaiting maintainer
review/merge).

## 2. hacs/default — ready, submit after brands merges

HACS validation on the PR checks the brands repo, so this must wait until the
brands PR above is merged. Then:

```sh
gh repo fork hacs/default --clone
cd default
grep -q OJ-Labs-Ltd/hass-jooan-cam720 integration || \
  { printf 'OJ-Labs-Ltd/hass-jooan-cam720\n' >> integration; sort -o integration integration; }
git checkout -b add-jooan-cam720
git commit -am "Add OJ-Labs-Ltd/hass-jooan-cam720"
git push -u origin add-jooan-cam720
gh pr create --repo hacs/default --fill
```
