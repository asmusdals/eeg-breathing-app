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

This repo is intended to deploy from the `master` branch.

If this is the first push from your machine:

```bash
git add .
git commit -m "Initial commit"
git push -u origin master
```

After that, every new change can be shared and deployed with:

```bash
git add .
git commit -m "Describe the change"
git push origin master
```

## Netlify deploy

1. Log in to Netlify.
2. Choose `Add new site` -> `Import an existing project`.
3. Select your GitHub account and pick this repository.
4. Use these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Set the production branch to `master`.
6. Deploy the site.

This repo already includes `netlify.toml`, so Netlify should detect the correct settings automatically.

## Updating the shared app

Once GitHub and Netlify are connected:

1. Change the code locally.
2. Test with `npm run dev`.
3. Push to the `master` branch on GitHub.
4. Netlify deploys the update automatically from `master`.
5. Colleagues keep using the same public URL.

## Important note for browser audio

Browsers block autoplay audio. A user must click `Start` before tones can play.
