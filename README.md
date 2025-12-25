# Hotel Agent - AI-Powered Hotel Search

A smart hotel search engine using **Hybrid Search** (Vector + SQL Filters) with Next.js App Router and Supabase.

## 🚀 Deploy to Vercel

### 📖 Hướng Dẫn Chi Tiết

- **[DEPLOY_GITHUB.md](./DEPLOY_GITHUB.md)** - Hướng dẫn deploy từ GitHub (Khuyến nghị)
- **[DEPLOY.md](./DEPLOY.md)** - Hướng dẫn deploy tổng quát
- **[SEO_GUIDE.md](./SEO_GUIDE.md)** - Hướng dẫn cấu hình SEO

### Quick Start: Deploy từ GitHub

1. **Push code lên GitHub:**
```bash
cd agent
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/hotel-agent.git
git push -u origin main
```

2. **Deploy trên Vercel:**
   - Truy cập [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import repository từ GitHub
   - Set environment variables (xem bên dưới)
   - Click "Deploy"

**✅ Sau đó mỗi lần push code → Tự động deploy!**

### Option 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

---

## 🔧 Environment Variables

Configure these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ Yes | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase publishable key | ✅ Yes | `sb_publishable_xxx` |
| `SUPABASE_ANON` | Supabase anon key | ✅ Yes | `eyJhbGc...` |
| `OPENAI_API_KEY` | OpenAI API key | ✅ Yes | `sk-proj-xxx` |
| `NEXT_PUBLIC_SITE_URL` | Your Vercel URL (for SEO) | ✅ Yes | `https://your-app.vercel.app` |
| `GOOGLE_SITE_VERIFICATION` | Google verification code | ⚪ Optional | `your-code` |

---

## 📋 Pre-Deployment Checklist

### Supabase Setup

1. **Create `hotels` table:**
   - Run `POC 100 FIXED HOTEL RECORDS.sql` in Supabase SQL Editor

2. **Create RPC function:**
   - Run `hotel_search_rpc.sql` in Supabase SQL Editor

3. **Generate embeddings:**
   - Run Python script or use the provided script

4. **Verify RLS policy:**
   ```sql
   CREATE POLICY "Public view active only" ON hotels
     FOR SELECT TO public
     USING (is_active = true);
   ```

### Environment Variables

1. Copy `.env.example` to `.env`
2. Fill in your Supabase and OpenAI credentials
3. Add same variables to Vercel

---

## 🏃 Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

Open [http://localhost:3000](http://localhost:3000)

---

## ✨ Features

- **Natural Language Search**: "I need a quiet place in Melbourne under $200"
- **Semantic Matching**: "peaceful" finds "quiet" hotels
- **Clarification Flow**: Asks for location if missing
- **Streaming Response**: Real-time search progress
- **Similarity Scores**: Hotels ranked by relevance

---

## 🔒 Security

- ✅ Inactive hotels never exposed
- ✅ Sensitive data (commission) never sent to client
- ✅ All filtering done in Supabase RPC
- ✅ RLS policies enforced

---

## 📁 Project Structure

```
agent/
├── app/
│   ├── api/hotel-search/route.ts  # API endpoint
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── chat/          # Chat UI
│   ├── hotel/         # Hotel cards
│   └── ui/            # Reusable components
├── lib/
│   ├── supabase.ts    # Supabase client
│   ├── hotel-query.ts # OpenAI logic
│   └── utils.ts
├── store/             # Zustand store
├── hooks/             # Custom hooks
├── .env.example       # Environment template
├── vercel.json        # Vercel config
└── package.json
```

---

## 🧪 Test Queries

```
1. I need a hotel under $200
2. I need a quiet place in Melbourne under $200
3. Find me a peaceful hotel in Sydney
4. Show me luxury hotels in Melbourne
5. I want a cheap hotel in Sydney under $100
```

---

## 📝 Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **Backend**: Supabase (Postgres + RPC)
- **AI**: OpenAI (text-embedding-3-small, gpt-4.1-mini)
- **State**: Zustand
- **Hosting**: Vercel

---

## 📞 Support

For issues or questions:
- Check Vercel deployment logs
- Verify environment variables
- Test Supabase connection

---

**Made with ❤️ using Next.js + Supabase + OpenAI**

