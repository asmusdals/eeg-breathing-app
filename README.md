# EEG Breathing App

Small React/Vite web app for EEG hyperventilation exercises with browser-generated audio cues.

## Local development

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Build the production version:

```bash
npm run build
```

## How sharing works

`localhost` only works on the computer that started the app. Colleagues cannot use your `localhost` link.

To share the app with colleagues, publish it to a hosted URL. This project is prepared for Netlify, which can deploy the static `dist` output for free.

## GitHub setup

Initialize git locally if needed:

```bash
git init
git add .
git commit -m "Initial commit"
```

Create a new empty GitHub repository, then connect this folder to it:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git branch -M main
git push -u origin main
```

After that, every new change can be shared with:

```bash
git add .
git commit -m "Describe the change"
git push
```

## Netlify deploy

1. Log in to Netlify.
2. Choose `Add new site` -> `Import an existing project`.
3. Select your GitHub account and pick this repository.
4. Use these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Deploy the site.

This repo already includes `netlify.toml`, so Netlify should detect the correct settings automatically.

## Updating the shared app

Once GitHub and Netlify are connected:

1. Change the code locally.
2. Test with `npm run dev`.
3. Push to GitHub.
4. Netlify deploys the update automatically.
5. Colleagues keep using the same public URL.

## Important note for browser audio

Browsers block autoplay audio. A user must click `Start` before tones can play.
