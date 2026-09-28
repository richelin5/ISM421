# FAU Owl Weather 🦉

A weather app in Florida Atlantic University colors. It opens on **FAU's Boca Raton campus** by default.

- Current conditions: temperature, feels-like, humidity, wind and gusts, UV, US AQI, pressure, sunrise/sunset
- Hourly forecast for the next 24 hours and a 7-day forecast
- City search, "My location", and a one-click **FAU Boca** button
- °F / °C toggle; the app remembers your last city and unit
- Works on phones and desktops, with light and dark modes

The data comes from the free [Open-Meteo](https://open-meteo.com/) APIs (forecast, geocoding and air quality). You don't need an API key, an account, or a backend.

## Project layout

```
netlify.toml          Netlify build + headers config
public/               The site (this folder is what gets deployed)
  index.html
  styles.css
  app.js
  assets/
    favicon.svg
    fau-wordmark.svg  Fallback logo
    fau-logo.png      Official FAU owl logo (downloaded at deploy time)
```

## Deploy to Netlify

**Option A: from GitHub (recommended)**
1. In Netlify, choose **Add new site → Import an existing project** and pick this repository/branch.
2. Leave the settings blank. `netlify.toml` already sets the publish directory (`public`) and build command.
3. Click **Deploy**.

**Option B: drag and drop**
Drag the `public/` folder onto https://app.netlify.com/drop.
(With this option the build step doesn't run. To get the official logo, save it as `public/assets/fau-logo.png` before you drag the folder in.)

## The FAU logo

During a Netlify build, the official owl-head logo is downloaded from `fau.edu` into `public/assets/fau-logo.png`. If the logo file is missing, the page tries to load it from fau.edu. If that also fails, it shows the bundled FAU wordmark. To use a different logo, replace `public/assets/fau-logo.png`.

## Run locally

```bash
cd public
python3 -m http.server 8000
# open http://localhost:8000
```

Weather data by Open-Meteo.com (CC BY 4.0). This is a student project, not an official FAU service.
