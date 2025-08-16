# Ice Lagoon Monitor - Cloud Deployment with Telegram

## Setup Instructions

### 1. Create Telegram Bot (2 minutes)

1. **Message @BotFather on Telegram**
2. **Send `/newbot`**
3. **Choose a name** (e.g., "Ice Lagoon Monitor")
4. **Choose a username** (e.g., "icelagoon_monitor_bot")
5. **Copy the bot token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your Chat ID

1. **Start a chat with your new bot** (click the link BotFather gives you)
2. **Send any message** to your bot
3. **Visit this URL** (replace YOUR_BOT_TOKEN):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. **Find your chat ID** in the response (look for `"chat":{"id":123456789`)

### 3. Railway.app Deployment

1. **Sign up at [Railway.app](https://railway.app)**
2. **Connect your GitHub account**
3. **Create new project from GitHub repo**
4. **Set environment variables** in Railway dashboard:
   - `TELEGRAM_BOT_TOKEN`: Your bot token from step 1
   - `TELEGRAM_CHAT_ID`: Your chat ID from step 2
   - `NODE_ENV`: `production`

### 4. Cron Schedule

The app runs every 3 minutes via Railway's cron feature (configured in `railway.toml`).

### 5. Telegram Notifications

- **Only sends messages when date "20" is found**
- **Message includes**: All available dates, site info, direct booking link
- **Instant push notifications** to your phone
- **Works worldwide** while traveling

### 6. Cost

- **Railway**: ~$5/month
- **Telegram**: **FREE**
- **Total**: ~$5/month

## Local Testing

```bash
# Set up environment variables
cp .env.example .env
# Edit .env with your Telegram bot token and chat ID

# Install dependencies
npm install

# Test cloud version locally
npm start

# Run desktop version
npm run dev
```

## Sample Telegram Message

When date 20 is found, you'll receive:

```
🎉 Ice Lagoon Date 20 Available!

📍 Site: www.icelagoon.com
🎯 FOUND DATE 20 AVAILABLE!

📅 All Available Dates:
• Date: 19 (Available)
• Date: 20 (Available)
• Date: 21 (SellingOut)

🔗 Book Now
⏰ 12/16/2024, 3:45:30 PM
```

## Monitoring

Check Railway dashboard for:
- **Deployment logs**
- **Cron execution history**
- **Error notifications**

## Files

- `monitor.js` - Desktop version (with notifications/sound)
- `monitor-cloud.js` - Cloud version (Telegram notifications)
- `railway.toml` - Railway deployment config
- `package.json` - Dependencies and scripts