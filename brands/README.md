# Brand assets and HACS-default submission

The integration already installs via HACS as a **custom repository** (add this
repo's URL in HACS). To also get it into HACS *default* (searchable by name),
two public PRs are needed. Everything is staged here and ready to submit.

## Icon

`custom_integrations/jooan_cam720/icon.png` (256x256) and `icon@2x.png`
(512x512) are a neutral placeholder camera mark, not a Jooan trademark. Swap
them for your preferred artwork before submitting if you like.

## 1. home-assistant/brands PR (do first; must merge before step 2)

```sh
gh repo fork home-assistant/brands --clone
cd brands
mkdir -p custom_integrations/jooan_cam720
cp /path/to/hass-jooan-cam720/brands/custom_integrations/jooan_cam720/*.png \
   custom_integrations/jooan_cam720/
git checkout -b jooan_cam720
git add custom_integrations/jooan_cam720
git commit -m "Add jooan_cam720"
git push -u origin jooan_cam720
gh pr create --repo home-assistant/brands --fill
```

## 2. hacs/default PR (after step 1 merges)

```sh
gh repo fork hacs/default --clone
cd default
# add the repo to the "integration" list, keeping the file sorted:
grep -q OJ-Labs-Ltd/hass-jooan-cam720 integration || \
  printf 'OJ-Labs-Ltd/hass-jooan-cam720\n' >> integration && sort -o integration integration
git checkout -b add-jooan-cam720
git commit -am "Add OJ-Labs-Ltd/hass-jooan-cam720"
git push -u origin add-jooan-cam720
gh pr create --repo hacs/default --fill
```

HACS runs its validation on the PR; this repo already passes everything except
the brands check, which step 1 clears.
