# Bookvia Backend

## Railway Deployment

### 1. Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Create new project → Deploy from GitHub repo
3. Select your repository and the `/backend` folder

### 2. Environment Variables (Required)
Add these in Railway dashboard → Variables:

```bash
# Database (MongoDB Atlas recommended)
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/
DB_NAME=bookvia_prod

# Security
JWT_SECRET=your-secure-random-string-min-32-chars
ENV=production

# Admin Account
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_INITIAL_PASSWORD=secure-password

# Optional: SMS (Twilio)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890

# Optional: Email (Resend)
RESEND_API_KEY=re_...
FROM_EMAIL=Bookvia <noreply@yourdomain.com>

# Optional: Payments (Stripe)
STRIPE_API_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Base URL (your Railway URL)
BASE_URL=https://your-app.railway.app
```

### 3. Build Settings
Railway auto-detects Python. If needed, set:
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`

### 4. Post-Deployment
Run these to seed initial data:
```bash
curl -X POST https://your-app.railway.app/api/seed
curl -X POST https://your-app.railway.app/api/seed/countries
```

### 5. Health Check
Verify deployment:
```bash
curl https://your-app.railway.app/api/health
```

---

## Vercel Frontend Connection

Once Railway is deployed, update Vercel:

1. Go to Vercel → Project Settings → Environment Variables
2. Add: `REACT_APP_BACKEND_URL = https://your-app.railway.app`
3. Redeploy the frontend

---

## MongoDB Atlas Setup (Recommended)

1. Create free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create database user
3. Whitelist IP: `0.0.0.0/0` (allow all for Railway)
4. Get connection string and add to Railway variables
