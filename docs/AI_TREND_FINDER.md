# AI Trend Finder

## Source and daily collection

The Trend Finder reads Google Trends' public Trending Now RSS feeds for `US`, `GB`, and `CA`. It does not call the Pinterest API. A GitHub Actions workflow requests one production snapshot per UTC day at `06:43` (`workflow_dispatch` is also available); the schedule is best-effort and may be delayed by GitHub. Collection fails closed if any region's feed cannot be validated, so the database never receives a partial three-region snapshot. A second run on the same UTC date leaves the saved snapshot unchanged.

The internal collector accepts only a short-lived GitHub OIDC identity from the exact public `main`-branch workflow and matching production deployment SHA. The workflow has no AI credentials, user data, Pinterest credentials, browser session, or publishing command. Daily collection begins only after this code is present on `main` and the matching production deployment is ready.

## “PinCraft estimate” methodology

Google's RSS item includes an `approx_traffic` bucket (for example `200+` or `2K+`), not Google's official growth percentage. For an exact trend match in two consecutive daily snapshots with usable numeric bucket floors, PinCraft computes:

```text
((current bucket floor / previous bucket floor) - 1) * 100
```

The result is rounded to a whole percent and labeled **PinCraft estimate**. The floors are coarse lower-bound proxies from approximate-traffic buckets, not exact searches or measured growth. Therefore the result is not Google's official percentage, Pinterest demand, or a prediction of reach. A same-bucket result can display `0%` even if actual searches changed within that bucket. No percentage is shown when there is no previous snapshot, a daily gap, no exact trend match, or an unusable bucket.

The interface shows the snapshot date and source bucket, and repeats these limitations beside the estimate.

## AI ideas and publishing

A signed-in user may request three draft Pin concepts for one current snapshot trend. Each contains a concept, a likely-audience hypothesis, a content strategy, and keyword suggestions. The browser sends only the selected trend ID/region/language; the server resolves the canonical trend from the latest snapshot and charges the request through the existing per-user/shared AI usage controls. Results are returned to the requesting user and are not public trend records.

Audience suggestions are hypotheses, not measured demographics. Search activity on Google does not establish Pinterest interest or guarantee reach. The Trend Finder has no Pinterest connection and never creates a publishing job or posts a Pin; users must review ideas and publish manually if they choose.
