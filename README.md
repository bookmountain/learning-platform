# learning-platform

Private, lightweight learning platform for locally owned video courses and text tutorials.

The app is intentionally a small skeleton: it scans a local `resources/` folder, builds a course/tutorial index, serves videos with captions, renders Markdown/tutorial documents, and tracks progress in the browser.

## Stack

- Runtime: Node.js 18+.
- Server: built-in Node `http`, `fs`, `crypto`, and path utilities. No Express and no runtime npm dependencies.
- Frontend: vanilla HTML, CSS, and ES modules in `public/`.
- Video: native HTML `<video>` with local media and subtitle tracks.
- Text tutorials: Markdown/HTML rendered in the browser.
- Progress and notes: browser `localStorage`.
- Auth: username/password from environment variables, with in-memory HTTP-only cookie sessions.
- Conversion tooling: optional Python script using Microsoft MarkItDown for one-time HTML-to-Markdown conversion.

## Content Layout

Put downloaded material here:

```text
resources/
  courses/
    your-video-course/
  tutorials/
    your-text-tutorial/
```

`resources/` is ignored by Git on purpose. Keep course videos, captions, PDFs, zips, and paid/downloaded material out of the repository.

## Local Run

```sh
npm start
```

Open:

```text
http://127.0.0.1:5177
```

Default local login:

```text
username: bookm
password: learn-local
```

Before exposing the app, set your own credentials:

```sh
LEARN_USERNAME="your-user" LEARN_PASSWORD="your-strong-password" HOST=0.0.0.0 npm start
```

If HTTPS is terminated by Cloudflare or a reverse proxy, also set:

```sh
COOKIE_SECURE=true
```

## How Login Works Without a Database

There is no user table yet. The server compares the submitted username/password against `LEARN_USERNAME` and `LEARN_PASSWORD`.

On successful login, it creates a random session ID, stores that session in memory, and sends the browser an HTTP-only cookie. This is fine for a private single-user app, but it means:

- sessions are cleared when the Node process/container restarts;
- progress and notes live in each browser's `localStorage`;
- there is no multi-user account management.

If this becomes multi-user, the next step is to use Postgres for hashed passwords, server-side progress, and notes.

## Convert ByteByteGo HTML to Markdown

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/convert_bytebytego_to_markdown.py
```

This conversion is optional tooling. Python is not needed to run the web app.

## Docker Hosting On vm100

Recommended shape for your Proxmox VM:

1. Keep the Git repo small: code only.
2. Keep `resources/` on the VM disk as a bind mount.
3. Run the app in Docker.
4. Put Cloudflare Tunnel or your reverse proxy in front of `127.0.0.1:5177`.
5. Store credentials in environment variables or an uncommitted `.env` file.

Example:

```sh
git clone https://github.com/bookmountain/learning-platform.git
cd learning-platform
mkdir -p resources/courses resources/tutorials
```

Copy your course/tutorial folders into `resources/`, then create an uncommitted `.env`:

```sh
LEARN_USERNAME=bookm
LEARN_PASSWORD=change-this-to-a-long-random-password
COOKIE_SECURE=true
SESSION_TTL_HOURS=168
```

Start it:

```sh
docker compose -f docker-compose.example.yml --env-file .env up -d --build
```

The compose file binds the app to `127.0.0.1:5177`, which is safer when Cloudflare Tunnel or a local reverse proxy is the public entry point.

Cloudflare Tunnel public hostname target:

```text
http://127.0.0.1:5177
```

For extra protection, put Cloudflare Access in front of the hostname too.

## Git

Initial repository setup:

```sh
git init
git branch -M main
git remote add origin https://github.com/bookmountain/learning-platform.git
git add .
git commit -m "first commit"
git push -u origin main
```
