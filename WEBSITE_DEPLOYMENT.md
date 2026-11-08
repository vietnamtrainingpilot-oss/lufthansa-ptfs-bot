# Lufthansa PTFS Flight-Booking Website — Deployment Guide

The booking website is a **static single-page application** (HTML/CSS/JS) that integrates with the Lufthansa PTFS Discord bot's Express API. It can be deployed to any static hosting provider.

## Quick Deploy Options

### Option 1: Vercel (Recommended)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy from the website folder
cd D:\lufthansa\website
vercel --prod

# 3. Set environment variable in Vercel dashboard:
#    Project → Settings → Environment Variables
#    API_BASE_URL = https://your-bot-domain.com  (or ngrok URL for local testing)
```

### Option 2: Netlify

```bash
# 1. Drag & drop the `website/` folder to Netlify dashboard
# 2. Set environment variable:
#    Site settings → Build & deploy → Environment variables
#    API_BASE_URL = https://your-bot-domain.com
```

### Option 3: GitHub Pages / Static Hosting

```bash
# Push the website/ folder to a GitHub repo
# Enable GitHub Pages from main branch / website/ folder
# Add API_BASE_URL to Settings → Pages → Environment variables
```

### Option 4: Local Testing with ngrok (Development)

```bash
# 1. Start the bot (must be running)
pm2 start index.js --name lufthansa-ptfs-bot

# 2. Tunnel the bot's API port
ngrok http 3001

# 3. Copy the ngrok HTTPS URL (e.g., https://abc123.ngrok.io)

# 4. Edit website/js/main.js and change:
const CONFIG = {
  apiBaseUrl: 'https://abc123.ngrok.io',  // replace with your ngrok URL
  apiSecret: null,
};

# 5. Open website/index.html in browser to test
```

## Required Bot Configuration

The bot must expose these endpoints:

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/flights/active` | GET | `x-webhook-secret` header | Returns list of scheduled/check-in flights |
| `/webhook/booking` | POST | `x-webhook-secret` header | Receives booking from website; DMs user + posts to staff channel |

**Required bot `.env` variables:**

```env
BOOKING_API_PORT=3001              # Express API server port
BOOKING_WEBHOOK_SECRET=your-secret  # Shared secret between bot + website
WEBSITE_BASE_URL=https://your-site  # For reference only
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Website (static: HTML/CSS/JS)                              │
│  - Fetches flights from /api/flights/active                   │
│  - Submits bookings to /webhook/booking                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (x-webhook-secret)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Discord Bot (Node.js + Express)                            │
│  - Express server on BOOKING_API_PORT                       │
│  - Validates x-webhook-secret header                        │
│  - DMs user confirmation                                    │
│  - Posts booking to FLIGHT_BOOKING_STAFF_CHANNEL_ID         │
└─────────────────────────────────────────────────────────────┘
```

## Website Features

- **Responsive design**: Mobile-first, works on 320px–1440px
- **Flight listing**: Filterable by departure, arrival, class
- **Booking modal**: Select class, seat, Discord User ID
- **Toast notifications**: Success/error feedback
- **Dark mode support**: Respects `prefers-color-scheme`
- **Accessibility**: WCAG AA contrast, keyboard navigation, reduced-motion aware
- **No framework**: Vanilla JS + Tailwind v4 inspired CSS (zero build step)

## Customization

### Branding (Colors, Typography)

Edit `website/css/main.css`:

```css
:root {
  --color-primary: #E61E2D;    /* lufthansa Red */
  --color-secondary: #FFC72C;  /* Accent Yellow */
  --font-sans: 'Geist', sans-serif;
  --font-mono: 'Geist Mono', monospace;
}
```

### Adding New Fields to Booking

1. Add input to the modal in `website/index.html`
2. Update the form submission in `website/js/main.js` to include the field
3. Update the bot's `/webhook/booking` handler in `src/index.js` to accept/process the new field

### Brand Assets

- Replace `website/assets/logo.svg` with Lufthansa PTFS logo
- Update `website/index.html` hero section copy as needed

## Security Notes

- **Never expose `BOOKING_WEBHOOK_SECRET` in the website** — it's only used by the bot's server
- The website sends bookings to the bot; the bot validates the secret
- Use HTTPS everywhere (Vercel/Netlify/ngrok provide this automatically)
- The bot's Express server validates the secret on every request

## Testing Checklist

- [ ] Website loads on desktop and mobile
- [ ] Flight list renders from live API
- [ ] Filters (departure, arrival, class) work
- [ ] Booking modal opens with correct flight pre-filled
- [ ] Booking submission triggers DM + staff channel post
- [ ] Toast notifications appear for success/error
- [ ] Dark mode works (system preference)
- [ ] Reduced-motion respected (OS setting)
- [ ] All links work (Discord invite, about page, etc.)

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| "Failed to fetch" | CORS or wrong API URL | Check `API_BASE_URL` matches bot's public address; ensure bot allows requests from your site's origin |
| 401 Unauthorized | Wrong webhook secret | Verify `BOOKING_WEBHOOK_SECRET` matches in bot `.env` and website config |
| Booking not showing in Discord | Bot not receiving webhook | Check bot logs for `/webhook/booking` POST requests; ensure bot is online |
| Flight list empty | No active flights or API error | Create a test flight via `/createflight` in Discord; check bot logs for API errors |
| Dark mode not working | CSS variable issue | Verify CSS custom properties are loaded; check `prefers-color-scheme` support |

## Domain Setup (Production)

1. Point a subdomain (e.g., `book.lufthansa-ptfs.com`) to your hosting provider
2. Enable HTTPS (automatic on Vercel/Netlify)
3. Update Discord bot's `WEBSITE_BASE_URL` to the new domain
4. Update website's `API_BASE_URL` if using a custom API domain

## License

This website is for the Lufthansa PTFS Roblox virtual airline community. Not affiliated with lufthansa Air.
