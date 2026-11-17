# Cosmica — public VK playlist feed

Automatically reads https://vkvideo.ru/playlist/-172786855_2 in an anonymous browser and publishes public metadata as `public/playlist.json`.

- No VK login, personal session cookie or user API token.
- No video-file download; videos remain in VK's embedded player.
- The owner requested retaining the separate Venus testimonial already present on the website. `additional-videos.json` contains its public ID and existing caption. Its public player link is refreshed with the open `video.getOembed` method; if it later enters the playlist it is deduplicated automatically.
- Only public titles, thumbnails, durations, video IDs and player links are saved.
- Secrets, original site source, Tilda credentials and user documents are not part of this repository.
- Standard public Ubuntu runners are used; no paid hosting or larger runners.

The workflow requests an update every 10 minutes, at minutes 7, 17, 27, 37, 47 and 57 each hour. GitHub can delay or skip scheduled runs, so this is a requested cadence rather than a maximum delivery delay. Manual workflow_dispatch can request an immediate refresh when needed. Failed refreshes preserve the last committed feed. A successful refresh commits its actual verification time and complete result.

`npm ci`, `npx playwright install --with-deps chromium`, `npm test`, then `npm run scrape` to run locally. Node 22+.

Before using the feed in production, verify one successful GitHub Actions run and anonymous cross-origin access to the resulting JSON. A local browser test does not establish access to VK from GitHub's hosting region.

Official references:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
