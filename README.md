# FinDex public site

Static marketing, privacy, terms, support, privacy-choice, and account-deletion pages for FinDex. This repository intentionally contains no mobile source, credentials, analytics, advertising, tracking pixels, cookies, login, or form backend.

## Validate

```powershell
npm run validate
npm run serve -- --port 4173
```

Then open `http://127.0.0.1:4173/`. The local server mirrors the custom-domain route structure.

## Deployment

GitHub Pages publishes `main` from the repository root at `https://findexaquarium.com/`. Update `public-legal-config.json`, canonical links, Open Graph URLs, and `sitemap.xml` together if the production origin changes.
