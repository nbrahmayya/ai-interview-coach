# AI Interview Coach

Responsive Next.js frontend and FastAPI backend powered by Groq's `llama-3.3-70b-versatile` model.

## Local setup

The frontend reads `NEXT_PUBLIC_API_URL` from `.env.local`; the backend reads `GROQ_API_KEY` and `CORS_ORIGINS` from `backend/.env`. Both real env files are ignored by Git. The frontend example is in `.env.example`, and the backend example is in `backend/.env.example`.

### Start the backend

In PowerShell, from the project root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Set GROQ_API_KEY in .env, then:
python main.py
```

The API listens on `PORT` when provided, or `8000` locally. API docs: `http://localhost:8000/docs`; health check: `http://localhost:8000/health`.

### Start the frontend

In a second PowerShell terminal from the project root:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`. Frontend: `http://localhost:3000`.

### Run checks

From the project root:

```powershell
npm run lint
npm run build
backend\.venv\Scripts\python.exe -m unittest backend.test_main -v
```

## Deploy

### Render backend

Create a **Web Service** from this GitHub repository:

- Root Directory: `backend`
- Runtime: Python
- Build Command: `pip install -r requirements.txt`
- Start Command: `python main.py`
- Health Check Path: `/health`
- Environment Variables: `GROQ_API_KEY` (your rotated Groq key) and `CORS_ORIGINS` (the exact Vercel origin, for example `https://ai-interview-coach.vercel.app`)

Render supplies `PORT`; the backend binds to `0.0.0.0` and uses that value. Copy the deployed service URL, for example `https://ai-interview-coach-api.onrender.com`.

### Vercel frontend

Import the same repository as a Vercel project. Keep the Root Directory at `./` and use the detected Next.js framework settings. Add this environment variable to Production (and Preview if desired):

- `NEXT_PUBLIC_API_URL`: the Render service URL, with no trailing slash

Deploy or redeploy after setting the variable. If the frontend's Vercel domain changes, update `CORS_ORIGINS` on Render to that exact origin and redeploy/restart the backend.

## Push to GitHub

After creating the empty public repository `ai-interview-coach` under your GitHub account, connect and push the local `main` branch:

```powershell
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/ai-interview-coach.git
git branch -M main
git push -u origin main
```
