# FastAPI backend

This API uses Groq's `qwen/qwen3.8-27b` model by default. Override it with `GROQ_MODEL` if your account has access to another model. Set `GROQ_API_KEY` in `.env` before making AI requests. The run steps copy `.env.example` only if `.env` does not already exist.

## Run in PowerShell

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Set GROQ_API_KEY in .env, then:
python main.py
```

The API documentation is at `http://localhost:8000/docs` and the health check is at `http://localhost:8000/health`.

## API

`POST /api/interview/start` accepts `topic` and `difficulty` (`Easy`, `Medium`, or `Hard`) and returns the first question.

`POST /api/interview/answer` accepts the topic, difficulty, and the full conversation, with the latest turn from the candidate. It returns the interviewer's next `message`, `ended`, and `end_reason`; stop when `ended` is true. The legacy `POST /api/interview/next` route is also available.

`POST /api/report` takes the same request and requires at least one candidate answer. It returns the score, performance band, evidence-backed strengths and weaknesses, topics to revise, overall verdict, and Pass/Fail. A score of 55 or higher is a Pass.

CORS allows localhost and 127.0.0.1 frontend origins on any port, as well as origins listed in `CORS_ORIGINS`.

## Render settings

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python main.py`
- Environment Variables: `GROQ_API_KEY` (secret), `GROQ_MODEL=qwen/qwen3.8-27b`, and `CORS_ORIGINS` (set to the exact deployed Vercel origin once available)

The app binds to `0.0.0.0` and uses the host-provided `PORT` value, falling back to `8000` locally. Startup logs include the selected port and model.