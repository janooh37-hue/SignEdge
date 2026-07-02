# Submitting SignEdge to the Microsoft Edge Add-ons store

## 0. One-time prerequisites
- A Microsoft account.
- Register as an Edge extension developer (free) at the Microsoft Partner Center:
  https://partner.microsoft.com/dashboard/microsoftedge/  → "Register".
- Host the privacy policy somewhere public and copy its URL. Easiest options:
  - Create a public GitHub Gist with the contents of `store/privacy-policy.md`, or
  - Enable GitHub Pages on your repo and link the rendered file.

## 1. Build the upload package
From the project root, run:

    pwsh scripts/package.ps1

This creates `dist/signedge-<version>.zip` containing only the files the store needs.

## 2. Create the submission in Partner Center
1. Go to the Edge developer dashboard → **Create new extension**.
2. **Package:** upload `dist/signedge-<version>.zip`.
3. **Store listing:** copy the fields from `store/listing.md` (name, summary,
   description, category, search terms). Upload at least one screenshot
   (1280×800 recommended) — see `store/TEST-CHECKLIST.md` step for capturing one.
4. **Privacy:**
   - Privacy policy URL: paste the public URL from step 0.
   - Data collection: declare **no data collected**.
   - Permission justification for `storage`: "Stores the user's signatures locally on
     their device. No data is transmitted."
5. **Availability:** choose markets (all) and visibility (public).
6. Submit for certification. Review typically takes a few days.

## 3. After approval
- Note your published extension ID.
- To publish updates: bump `version` in `manifest.json`, re-run the package script,
  and upload the new zip in the dashboard.
