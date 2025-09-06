# Turf Overlay

An OBS overlay for displaying live Turf game statistics filtered to a single user. This project provides a real-time stream of user stats, feed updates (takeovers, medals, chats), and optional location/map data for streaming purposes.

## Features

- **Live Statistics**: Displays rank, points per hour, zones taken, leaderboard position, and more.
- **Filtered Feed**: Shows only relevant events (takeovers, medals, chats) for the tracked user.
- **Real-time Updates**: Uses Server-Sent Events (SSE) for instant updates without polling from the client.
- **Optional Map**: Integrates Leaflet map to show user location and nearby zones.
- **OBS Compatible**: Transparent background designed for overlay use in streaming software.
- **Configurable**: Environment variables for customization (username, polling intervals, map settings, etc.).

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/JuggleWithTim/TurfStream.git
   cd TurfStream
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your desired settings (see Configuration section below).

4. Start the server:
   ```bash
   npm start
   ```
   For development with auto-restart:
   ```bash
   npm run dev
   ```

The server will run on `http://localhost:3000` by default.

## Configuration

Create a `.env` file based on `.env.example`. Key variables:

- `TURF_USERNAME`: The Turf username to track (default: jugglewithtim)
- `PORT`: Server port (default: 3000)
- `SHOW_COORDS`: Show latitude/longitude in the overlay (default: false)
- `SHOW_MAP`: Enable map display (default: false)
- `FEED_POLL_MS`, `STATS_POLL_MS`, `LOCATION_POLL_MS`: Polling intervals in milliseconds
- `API_BASE`: Turf API base URL (default: https://api.turfgame.com/v5)
- Map settings: `MAP_TILE_URL`, `MAP_ATTRIBUTION`, `MAP_ZOOM`, `ZONES_HALFSPAN`

## Usage

1. Start the server as described above.
2. Open `http://localhost:3000` in your browser to see the overlay.
3. In OBS, add a "Browser Source" and point it to `http://localhost:3000`.
4. Configure the source to be transparent and position it as desired.

The overlay will automatically connect via SSE and display live data for the configured user.

## API Rate Limiting

The server includes a request queue to respect Turf API rate limits, with a minimum 1-second delay between requests. Polling intervals are configurable to balance real-time updates with API kindness.

## Dependencies

- [Express](https://expressjs.com/): Web server framework
- [dotenv](https://www.npmjs.com/package/dotenv): Environment variable management
- [Leaflet](https://leafletjs.com/): Map library (client-side)

## License

This project is open-source. See LICENSE file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.
