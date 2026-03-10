# Bookvia Frontend - Vercel Deployment

## Setup

### 1. Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Set root directory to `frontend`

### 2. Environment Variables
Add in Vercel → Project Settings → Environment Variables:

```
REACT_APP_BACKEND_URL=https://your-backend.railway.app
```

**Important**: No trailing slash!

### 3. Build Settings
Vercel auto-detects Create React App. Default settings work:
- **Framework**: Create React App
- **Build Command**: `yarn build`
- **Output Directory**: `build`

### 4. Redeploy
After adding environment variables, trigger a new deployment.

---

## Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS as instructed by Vercel

---

## Troubleshooting

### API calls fail
- Verify `REACT_APP_BACKEND_URL` is set correctly
- Check Railway backend is running
- Ensure CORS is configured on backend

### "0 negocios encontrados"
- Seed the database: `POST /api/seed`
- Seed countries: `POST /api/seed/countries`

### Auth issues
- Clear localStorage in browser
- Verify JWT_SECRET matches between deploys
