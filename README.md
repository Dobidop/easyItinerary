# EasyItinerary

A single-page trip planner with an interactive map. Plan your days, track your budget, save resources, and see everything laid out on a map — all in one place.

Built with vanilla HTML, CSS, and JavaScript. No frameworks, no build tools, no API keys required.

## Features

- **Day-by-day itinerary** — Add activities with times, locations, and links. Drag-and-drop to reorder. Set lodging departure/return points per day.
- **Interactive map** — Leaflet + OpenStreetMap with search, click-to-place markers, animated route lines, and day filtering. Hover to highlight, click to pan.
- **Budget tracking** — Set a total budget, log expenses by category, and see a visual breakdown. Supports 12 currencies.
- **Resources** — Save links and places with coordinates. Mark them as "selected" or "potentials". Resources sync to linked activities and reservations.
- **Reservations & transport** — Track flights, hotels, and transport with confirmation codes, dates, and links.
- **Checklist** — Simple checklist for packing or to-dos.
- **Sharing** — Share trips via link. Recipients see a live-updating read-only view.
- **Import / Export** — Full JSON export and import for backups or transferring between devices.
- **Multiple themes** — Warm (default), Dark, Light, and Nord.
- **Mobile responsive** — Collapsible map, compact layout, touch-friendly controls.
- **Offline-first** — All data stored in localStorage. The server is only needed for sharing.

## Getting Started

```bash
node server.js
```

Opens on `http://localhost:3003`. No dependencies to install — the server uses only Node.js built-in modules.

To change the port:

```bash
PORT=8080 node server.js
```

Alternatively, just open `index.html` directly in a browser. Everything works except the sharing feature (which needs the server).

## File Structure

```
index.html        Main page
css/style.css     All styles and themes
js/
  app.js          Navigation, overview, reservations, checklist
  itinerary.js    Day planner, activities, lodging endpoints
  map.js          Leaflet map, markers, search, route lines
  budget.js       Expense tracking, category breakdown
  resources.js    Links/bookmarks, location sync, geocoding
  storage.js      localStorage CRUD, JSON import/export, sharing
  theme-init.js   Applies saved theme before page render
server.js         Static file server + sharing API
```

## Tech Stack

- Vanilla HTML5 / CSS3 / JavaScript (ES6+)
- [Leaflet.js](https://leafletjs.com/) with CARTO tiles
- [Font Awesome 6](https://fontawesome.com/) for icons
- [Nominatim](https://nominatim.openstreetmap.org/) + [Photon](https://photon.komoot.io/) for geocoding
- Node.js HTTP server (zero npm dependencies)

## License

MIT
