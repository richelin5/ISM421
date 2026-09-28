/* FAU Owl Weather — vanilla JS, no build step, no API keys.
 * Data: Open-Meteo forecast, geocoding and air-quality APIs (https://open-meteo.com).
 */
(function () {
  "use strict";

  const FAU_BOCA = {
    name: "FAU Boca Raton",
    admin1: "Florida",
    country: "United States",
    latitude: 26.3727,
    longitude: -80.1018,
  };

  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
  const REMOTE_LOGO = "https://www.fau.edu/images/homepage/owlhead-logo.png";
  const FALLBACK_LOGO = "assets/fau-wordmark.svg";

  // WMO weather interpretation codes -> [description, day icon, night icon]
  const WMO = {
    0: ["Clear sky", "☀️", "🌙"],
    1: ["Mainly clear", "🌤️", "🌙"],
    2: ["Partly cloudy", "⛅", "☁️"],
    3: ["Overcast", "☁️", "☁️"],
    45: ["Fog", "🌫️", "🌫️"],
    48: ["Freezing fog", "🌫️", "🌫️"],
    51: ["Light drizzle", "🌦️", "🌧️"],
    53: ["Drizzle", "🌦️", "🌧️"],
    55: ["Heavy drizzle", "🌧️", "🌧️"],
    56: ["Freezing drizzle", "🌧️", "🌧️"],
    57: ["Heavy freezing drizzle", "🌧️", "🌧️"],
    61: ["Light rain", "🌦️", "🌧️"],
    63: ["Rain", "🌧️", "🌧️"],
    65: ["Heavy rain", "🌧️", "🌧️"],
    66: ["Freezing rain", "🌧️", "🌧️"],
    67: ["Heavy freezing rain", "🌧️", "🌧️"],
    71: ["Light snow", "🌨️", "🌨️"],
    73: ["Snow", "🌨️", "🌨️"],
    75: ["Heavy snow", "❄️", "❄️"],
    77: ["Snow grains", "🌨️", "🌨️"],
    80: ["Light showers", "🌦️", "🌧️"],
    81: ["Showers", "🌧️", "🌧️"],
    82: ["Violent showers", "⛈️", "⛈️"],
    85: ["Snow showers", "🌨️", "🌨️"],
    86: ["Heavy snow showers", "❄️", "❄️"],
    95: ["Thunderstorm", "⛈️", "⛈️"],
    96: ["Thunderstorm with hail", "⛈️", "⛈️"],
    99: ["Severe thunderstorm with hail", "⛈️", "⛈️"],
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    logo: $("fau-logo"),
    form: $("search-form"),
    input: $("search-input"),
    results: $("search-results"),
    geoBtn: $("geo-btn"),
    homeBtn: $("home-btn"),
    status: $("status"),
    current: $("current"),
    hourlySection: $("hourly-section"),
    dailySection: $("daily-section"),
    hourly: $("hourly"),
    daily: $("daily"),
    unitBtns: document.querySelectorAll(".unit-btn"),
  };

  const state = {
    place: FAU_BOCA,
    unit: "fahrenheit",
    requestId: 0,
  };

  /* ---------- Storage (best effort only) ---------- */
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
  }

  /* ---------- Logo fallback chain: local file -> fau.edu -> bundled wordmark ---------- */
  function setupLogo() {
    const img = els.logo;
    const onError = () => {
      if (img.dataset.stage === "remote") {
        img.dataset.stage = "fallback";
        img.src = FALLBACK_LOGO;
      } else if (!img.dataset.stage) {
        img.dataset.stage = "remote";
        img.src = REMOTE_LOGO;
      }
    };
    img.addEventListener("error", onError);
    // The error may already have fired before this script ran.
    if (img.complete && img.naturalWidth === 0) onError();
  }

  /* ---------- Formatting helpers ---------- */
  const isF = () => state.unit === "fahrenheit";
  const deg = (v) => (v == null ? "--" : `${Math.round(v)}°`);

  function describe(code, isDay = 1) {
    const entry = WMO[code] || ["Unknown", "🌡️", "🌡️"];
    return { text: entry[0], icon: isDay ? entry[1] : entry[2] };
  }

  function compass(degrees) {
    if (degrees == null) return "";
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return dirs[Math.round(degrees / 22.5) % 16];
  }

  // Open-Meteo returns local wall-clock times ("2026-09-28T14:00") when timezone=auto,
  // so parse them by hand instead of letting the browser apply its own time zone.
  function parseLocal(iso) {
    const [date, time = "00:00"] = iso.split("T");
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return { y, m, d, hh, mm };
  }
  function fmtHour(iso) {
    const { hh } = parseLocal(iso);
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12} ${hh < 12 ? "AM" : "PM"}`;
  }
  function fmtClock(iso) {
    const { hh, mm } = parseLocal(iso);
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  }
  function fmtDay(iso, index) {
    const { y, m, d } = parseLocal(iso);
    const date = new Date(Date.UTC(y, m - 1, d));
    const weekday = index === 0 ? "Today" : date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    const md = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return { weekday, md };
  }

  function uvLabel(uv) {
    if (uv == null) return "--";
    const r = Math.round(uv);
    const level = uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme";
    return `${r} · ${level}`;
  }
  function aqiLabel(aqi) {
    if (aqi == null) return "--";
    const level = aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy (sensitive)" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very unhealthy" : "Hazardous";
    return `${Math.round(aqi)} · ${level}`;
  }

  function placeLabel(p) {
    return [p.admin1, p.country].filter(Boolean).join(", ");
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle("error", isError);
    els.status.hidden = !message;
  }

  /* ---------- Data fetching ---------- */
  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.reason || "API error");
    return data;
  }

  function forecastUrl(p) {
    const params = new URLSearchParams({
      latitude: p.latitude,
      longitude: p.longitude,
      current: [
        "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
        "precipitation", "weather_code", "pressure_msl", "wind_speed_10m",
        "wind_direction_10m", "wind_gusts_10m",
      ].join(","),
      hourly: ["temperature_2m", "precipitation_probability", "weather_code", "is_day", "uv_index"].join(","),
      daily: [
        "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max",
        "sunrise", "sunset", "uv_index_max",
      ].join(","),
      temperature_unit: state.unit,
      wind_speed_unit: isF() ? "mph" : "kmh",
      precipitation_unit: isF() ? "inch" : "mm",
      timezone: "auto",
      forecast_days: "7",
    });
    return `${FORECAST_URL}?${params}`;
  }

  function airUrl(p) {
    const params = new URLSearchParams({
      latitude: p.latitude,
      longitude: p.longitude,
      current: "us_aqi",
      timezone: "auto",
    });
    return `${AIR_URL}?${params}`;
  }

  async function loadWeather(place) {
    state.place = place;
    save("owlweather.place", place);
    const id = ++state.requestId;
    setStatus(`Loading weather for ${place.name}…`);

    try {
      const [weather, air] = await Promise.all([
        getJSON(forecastUrl(place)),
        getJSON(airUrl(place)).catch(() => null), // AQI is a nice-to-have
      ]);
      if (id !== state.requestId) return; // a newer request superseded this one
      render(place, weather, air);
      setStatus("");
    } catch (err) {
      if (id !== state.requestId) return;
      console.error(err);
      setStatus(`Couldn't load weather: ${err.message}. Check your connection and try again.`, true);
    }
  }

  /* ---------- Rendering ---------- */
  function render(place, w, air) {
    const c = w.current;
    const speed = isF() ? "mph" : "km/h";
    const d = w.daily;
    const h = w.hourly;

    // Hourly index for "now": first hour at or after the current hour.
    const nowHour = c.time.slice(0, 13); // "YYYY-MM-DDTHH"
    let start = h.time.findIndex((t) => t.slice(0, 13) >= nowHour);
    if (start < 0) start = 0;

    const cond = describe(c.weather_code, c.is_day);
    $("place-name").textContent = place.name;
    $("place-meta").textContent = placeLabel(place);
    $("updated").textContent = `Updated ${fmtClock(c.time)} local time`;
    $("current-icon").textContent = cond.icon;
    $("current-temp").textContent = `${Math.round(c.temperature_2m)}°${isF() ? "F" : "C"}`;
    $("current-desc").textContent = cond.text;
    $("current-hilo").textContent = `H ${deg(d.temperature_2m_max[0])} · L ${deg(d.temperature_2m_min[0])}`;

    $("stat-feels").textContent = deg(c.apparent_temperature);
    $("stat-humidity").textContent = `${Math.round(c.relative_humidity_2m)}%`;
    $("stat-wind").textContent = `${Math.round(c.wind_speed_10m)} ${speed} ${compass(c.wind_direction_10m)}`;
    $("stat-gusts").textContent = `${Math.round(c.wind_gusts_10m)} ${speed}`;
    $("stat-uv").textContent = uvLabel(h.uv_index ? h.uv_index[start] : null);
    $("stat-aqi").textContent = aqiLabel(air && air.current ? air.current.us_aqi : null);
    $("stat-pressure").textContent = isF()
      ? `${(c.pressure_msl * 0.02953).toFixed(2)} inHg`
      : `${Math.round(c.pressure_msl)} hPa`;
    $("stat-sun").textContent = `${fmtClock(d.sunrise[0])} / ${fmtClock(d.sunset[0])}`;

    renderHourly(h, start);
    renderDaily(d);

    els.current.hidden = false;
    els.hourlySection.hidden = false;
    els.dailySection.hidden = false;
    document.title = `${Math.round(c.temperature_2m)}° ${place.name} · FAU Owl Weather`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderHourly(h, start) {
    els.hourly.replaceChildren();
    const end = Math.min(start + 24, h.time.length);
    for (let i = start; i < end; i++) {
      const cond = describe(h.weather_code[i], h.is_day[i]);
      const card = el("div", i === start ? "hour now" : "hour");
      card.title = cond.text;
      card.append(
        el("div", "hour-time", i === start ? "Now" : fmtHour(h.time[i])),
        el("div", "hour-icon", cond.icon),
        el("div", "hour-temp", deg(h.temperature_2m[i])),
        el("div", "hour-pop", h.precipitation_probability[i] ? `💧 ${h.precipitation_probability[i]}%` : "")
      );
      els.hourly.append(card);
    }
  }

  function renderDaily(d) {
    els.daily.replaceChildren();
    const weekLo = Math.min(...d.temperature_2m_min);
    const weekHi = Math.max(...d.temperature_2m_max);
    const span = Math.max(weekHi - weekLo, 1);

    d.time.forEach((t, i) => {
      const cond = describe(d.weather_code[i], 1);
      const { weekday, md } = fmtDay(t, i);
      const li = el("li", "day");

      const name = el("div", "day-name", weekday);
      name.append(el("small", null, md));

      const pop = d.precipitation_probability_max[i];
      const range = el("div", "day-range");
      const bar = el("div", "bar");
      const fill = el("div", "bar-fill");
      fill.style.left = `${((d.temperature_2m_min[i] - weekLo) / span) * 100}%`;
      fill.style.right = `${((weekHi - d.temperature_2m_max[i]) / span) * 100}%`;
      bar.append(fill);
      range.append(el("span", "lo", deg(d.temperature_2m_min[i])), bar, el("span", "hi", deg(d.temperature_2m_max[i])));

      li.append(
        name,
        el("div", "day-icon", cond.icon),
        el("div", "day-desc", cond.text),
        el("div", "day-pop", pop ? `💧 ${pop}%` : ""),
        range
      );
      li.title = cond.text;
      els.daily.append(li);
    });
  }

  /* ---------- Search ---------- */
  async function search(query) {
    const q = query.trim();
    if (!q) return;
    setStatus(`Searching for “${q}”…`);
    try {
      // Geocoding matches on place name only, so "Jupiter, FL" -> search "Jupiter"
      // and use the remainder to rank results.
      const [namePart, ...rest] = q.split(",");
      const hint = rest.join(",").trim().toLowerCase();
      const params = new URLSearchParams({ name: namePart.trim(), count: "10", language: "en", format: "json" });
      const data = await getJSON(`${GEOCODE_URL}?${params}`);
      let results = data.results || [];
      if (hint) {
        const matches = (r) => [r.admin1, r.country, r.country_code].some(
          (v) => v && (v.toLowerCase().includes(hint) || (hint.length === 2 && US_STATES[hint.toUpperCase()] === v))
        );
        results = results.filter(matches).concat(results.filter((r) => !matches(r)));
      }
      if (!results.length) {
        setStatus(`No places found for “${q}”.`, true);
        hideResults();
        return;
      }
      setStatus("");
      showResults(results);
    } catch (err) {
      setStatus(`Search failed: ${err.message}`, true);
    }
  }

  const US_STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
    ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
    UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
    WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
  };

  function showResults(results) {
    els.results.replaceChildren();
    results.forEach((r) => {
      const li = el("li");
      li.setAttribute("role", "option");
      const btn = el("button");
      btn.type = "button";
      btn.append(document.createTextNode(`${r.name} `), el("span", "muted", placeLabel(r)));
      btn.addEventListener("click", () => {
        hideResults();
        els.input.value = "";
        loadWeather({
          name: r.name,
          admin1: r.admin1,
          country: r.country,
          latitude: r.latitude,
          longitude: r.longitude,
        });
      });
      li.append(btn);
      els.results.append(li);
    });
    els.results.hidden = false;
    const first = els.results.querySelector("button");
    if (first) first.focus();
  }

  function hideResults() {
    els.results.hidden = true;
    els.results.replaceChildren();
  }

  /* ---------- Geolocation ---------- */
  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser doesn't support location lookup.", true);
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadWeather({
          name: "My location",
          admin1: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
          country: "",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => setStatus(`Couldn't get your location: ${err.message}`, true),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  /* ---------- Units ---------- */
  function setUnit(unit) {
    state.unit = unit;
    save("owlweather.unit", unit);
    els.unitBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unit === unit)));
  }

  /* ---------- Wire up ---------- */
  function init() {
    setupLogo();

    setUnit(load("owlweather.unit", "fahrenheit") === "celsius" ? "celsius" : "fahrenheit");

    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      search(els.input.value);
    });
    els.geoBtn.addEventListener("click", useMyLocation);
    els.homeBtn.addEventListener("click", () => loadWeather(FAU_BOCA));
    els.unitBtns.forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.unit === state.unit) return;
        setUnit(b.dataset.unit);
        loadWeather(state.place);
      })
    );
    document.addEventListener("click", (e) => {
      if (!els.form.contains(e.target)) hideResults();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideResults();
    });

    const saved = load("owlweather.place", null);
    const valid = saved && typeof saved.latitude === "number" && typeof saved.longitude === "number";
    loadWeather(valid ? saved : FAU_BOCA);
  }

  init();
})();
