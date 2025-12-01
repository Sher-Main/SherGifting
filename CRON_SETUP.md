# Cron Job Setup Guide

This guide explains how to set up the cron job that runs daily to clean up expired onramp credits.

## Architecture

```
Vercel Cron (midnight UTC)
  ↓
/api/cron/cleanup-expired-credits (Vercel serverless function)
  ↓
Render Backend: /api/cron/cleanup-expired-credits
  ↓
cleanupExpiredCredits() function
  ↓
Database: Mark expired credits as inactive
```

## Setup Steps

### 1. Generate CRON_SECRET

Generate a random secret string:

**PowerShell (Windows):**
```powershell
-join ((48..57) + (65..70) | Get-Random -Count 32 | % {[char]$_})
```

**Or use an online generator:**
- https://randomkeygen.com/
- Use "CodeIgniter Encryption Keys" or generate a random 32+ character string

**Example:** `a3f8d9e2b1c4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0`

### 2. Set Environment Variables in Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add these two variables:

#### A. RENDER_BACKEND_URL
- **Key:** `RENDER_BACKEND_URL`
- **Value:** Your Render backend URL (e.g., `https://your-backend-name.onrender.com`)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

**How to find your Render backend URL:**
1. Go to https://dashboard.render.com/
2. Click on your backend service
3. Copy the URL from the top (e.g., `https://sher-gifting-api.onrender.com`)

#### B. CRON_SECRET
- **Key:** `CRON_SECRET`
- **Value:** (The random secret you generated in step 1)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

### 3. Set Environment Variable in Render

Go to: **Render Dashboard → Your Backend Service → Environment**

Add this variable:

#### CRON_SECRET
- **Key:** `CRON_SECRET`
- **Value:** (Same value as you set in Vercel - must match!)

**Important:** The `CRON_SECRET` must be the **same value** in both Vercel and Render.

### 4. Deploy

1. Commit and push your changes to GitHub
2. Vercel will automatically deploy
3. The cron job will be automatically configured from `vercel.json`

### 5. Verify Setup

#### Check Vercel Cron Job:
1. Go to **Vercel Dashboard → Your Project → Settings → Cron Jobs**
2. You should see:
   - **Path:** `/api/cron/cleanup-expired-credits`
   - **Schedule:** `0 0 * * *` (daily at midnight UTC)
   - **Status:** Active

#### Test Manually:

**Test Vercel endpoint:**
```bash
curl -X POST https://your-vercel-app.vercel.app/api/cron/cleanup-expired-credits
```

**Test Render backend directly:**
```bash
curl -X POST https://your-render-backend.onrender.com/api/cron/cleanup-expired-credits \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "expiredCreditsCount": 0,
  "timestamp": "2025-11-27T23:45:00.000Z"
}
```

### 6. Monitor Execution

After deployment, check logs:

**Vercel Logs:**
- Go to **Vercel Dashboard → Your Project → Logs**
- Filter by "cron" or search for "cleanup-expired-credits"
- After midnight UTC, you should see execution logs

**Render Logs:**
- Go to **Render Dashboard → Your Backend Service → Logs**
- You should see logs from the cleanup function

## Troubleshooting

### Cron job not running?
1. ✅ Check Vercel Dashboard → Settings → Cron Jobs (should be listed)
2. ✅ Verify `RENDER_BACKEND_URL` is set correctly in Vercel
3. ✅ Verify `CRON_SECRET` matches in both Vercel and Render
4. ✅ Check Vercel logs for errors

### Getting 401 Unauthorized?
- ❌ `CRON_SECRET` doesn't match between Vercel and Render
- ❌ `CRON_SECRET` not set in Render environment variables
- ✅ Fix: Make sure `CRON_SECRET` is identical in both places

### Getting 500 Backend URL not configured?
- ❌ `RENDER_BACKEND_URL` not set in Vercel
- ✅ Fix: Add `RENDER_BACKEND_URL` in Vercel environment variables

### Getting timeout errors?
- ⚠️ Render backend might be sleeping (free tier)
- ⚠️ First request after sleep takes longer
- ✅ This is normal - the cron job will still complete

## Schedule

- **Frequency:** Daily
- **Time:** Midnight UTC (00:00 UTC)
- **Format:** `0 0 * * *` (cron format)

To change the schedule, edit `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-expired-credits",
      "schedule": "0 0 * * *"  // Change this
    }
  ]
}
```

Common schedules:
- `0 0 * * *` - Daily at midnight UTC
- `0 2 * * *` - Daily at 2 AM UTC
- `0 0 * * 0` - Weekly on Sunday at midnight UTC

## What It Does

The cron job:
1. Finds all credits where `expires_at <= NOW()` and `is_active = TRUE`
2. Sets `is_active = FALSE` for those credits
3. Returns count of expired credits

This prevents expired credits from being used for free card transfers.


