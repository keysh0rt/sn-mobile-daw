# SN Studio — Mobile DAW

A mobile-first progressive web app foundation for a sample-based DAW. This starter includes a browser sampler preview, automatic local naming, sound metadata display, catalog JSON export, and PWA shell.

## Deploy to GitHub Pages
1. In repository Settings → Pages, choose **GitHub Actions** as the deployment source.
2. Commit the files from this starter ZIP to the repository's `main` branch.
3. The workflow at `.github/workflows/deploy.yml` deploys the app.
4. After the workflow succeeds, open `https://keysh0rt.github.io/sn-mobile-daw/` in Safari.

## Use
- Tap **Enable Audio**.
- Tap **Import audio** and choose supported audio files.
- Select a sound and play it with the sampler keyboard.
- Export the current catalog as JSON.

## Current limitations
This is a starter foundation, not yet a full multitrack DAW. Imported audio is decoded locally in the browser for the current session; it is not uploaded to GitHub. The initial automatic names are deterministic suggestions, not AI sound recognition. The keyboard transposes the selected sample, and this does not create a standard VST/VST3 plugin.

## Suggested repository folders
- `incoming/` — sound files you commit to the repository (do not commit copyrighted or private packs unless permitted).
- `generated/` — generated catalog and instrument metadata.
- `app/` — app source as the project grows.

GitHub Pages serves static files. For large sound libraries, use object storage rather than committing every audio asset into Git.
