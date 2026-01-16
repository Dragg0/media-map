# TODO - Bluesky Setup

Code is deployed. Complete these steps to enable Bluesky posting:

## 1. Create Bluesky Account
- Go to bsky.app and sign up
- Pick handle like `texturewatch.bsky.social`

## 2. Create App Password
- Settings → App Passwords → Add App Password
- Name it "Texture Bot"
- Copy the password

## 3. Add Vercel Env Vars
```
BLUESKY_HANDLE=texturewatch.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

## 4. Run Supabase SQL
```sql
ALTER TABLE cards ADD COLUMN IF NOT EXISTS last_posted_bluesky TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'twitter';
```

## 5. Redeploy Vercel
Push any change or manually redeploy

## 6. Test
GitHub → Actions → "Post to Bluesky" → Run workflow → Select "afternoon"

---

*Delete this file after completing setup.*
