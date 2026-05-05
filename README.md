# learning-platform

Private, lightweight learning platform for locally owned video courses and text tutorials.

The app is intentionally a small skeleton: it scans a local `resources/` folder, builds a course/tutorial index, serves videos with captions, renders Markdown/tutorial documents, and tracks progress/playback preferences in a local SQLite file.

## Stack

- Runtime: Node.js 22+.
- Server: built-in Node `http`, `fs`, `crypto`, `sqlite`, and path utilities. No Express and no runtime npm dependencies.
- Frontend: vanilla HTML, CSS, and ES modules in `public/`.
- Video: native HTML `<video>` with local media and subtitle tracks.
- Text tutorials: Markdown/HTML rendered in the browser.
- Progress and playback preferences: server-side SQLite, with browser `localStorage` as a fallback/cache.
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

`data/` is also ignored by Git. It stores `progress.sqlite3`, the single-user progress database.

The server scans `resources/` when the library API is loaded, so adding/removing course content does not require a database. If you change code, restart the Node/Docker process; if you only add files under `resources/`, refresh the page.

## Import A Raw Video Course

Copy the downloaded course folder into `resources/courses/`:

```text
resources/
  courses/
    database-course/
      01 - Getting Started/
        001 Lesson title.mp4
        001 Lesson title_en.srt
        001 lesson-resource.sql
      02 - Working With Data/
        ...
```

Expected shape:

- Course folders live directly under `resources/courses/`.
- Section folders should start with a number, usually `01 - Section title`.
- Lesson files should start with a lesson number, such as `001`, `002`, etc.
- Videos and captions with the same lesson number are grouped together.
- Extra files with the same lesson number become attached resources.
- Unnumbered files inside a section are still treated as downloadable section resources.

Supported video/caption types include `mp4`, `m4v`, `webm`, `mkv`, `mov`, `srt`, and `vtt`.

## Import Text Tutorials

Copy each tutorial into `resources/tutorials/`.

Flat Markdown or HTML works:

```text
resources/tutorials/text-tutorial/
  markdown/
    0. Foreword.md
    1. Join the Community.md
```

Sectioned Markdown also works:

```text
resources/tutorials/sectioned-text-tutorial/
  sections/
    01-introduction/
      000-overview.md
      001-course-structure.md
    02-core-concepts/
      002-first-topic.md
  images/
    overview-diagram.svg
```

The scanner supports these patterns:

- `tutorial/markdown/*.md`
- `tutorial/*.md`
- `tutorial/sections/<number-title>/*.md`
- `tutorial/markdown/<number-title>/*.md`

Large external image folders are fine. You do not need to embed images as base64 in Markdown. Keep images under the same tutorial folder, then reference them with relative Markdown paths:

```md
![Diagram](../../images/example.svg)
```

The app rewrites local Markdown image paths to authenticated `/media/...` URLs when rendering the article. That keeps image-heavy exports, such as tutorials with hundreds of MB of diagrams, outside Git while still loading them in the reader.

Common asset folders such as `images/`, `assets/`, `media/`, `static/`, `css/`, and `js/` are skipped as tutorial sections.

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

## Progress Sync

Progress is stored server-side in SQLite at:

```text
data/progress.sqlite3
```

SQLite is an embedded file database, so this does not require a separate database server or container. The Node app still needs to run because it serves the private files, login, and progress API.

This syncs completed lessons, playback positions, playback speed/volume, and the current course across your devices after login. The browser still keeps a local fallback copy; if the server database is empty, the first device migrates its local progress into SQLite.

For Docker, keep `data/` as a writable bind mount so progress survives image rebuilds and container replacement.

## How Login Works

There is no user table. The server compares the submitted username/password against `LEARN_USERNAME` and `LEARN_PASSWORD`.

On successful login, it creates a random session ID, stores that session in memory, and sends the browser an HTTP-only cookie. This is fine for a private single-user app, but it means:

- sessions are cleared when the Node process/container restarts;
- there is no multi-user account management.

If this becomes multi-user, the next step is to use hashed passwords and per-user progress rows.

## Convert HTML Tutorials to Markdown

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/convert_html_tutorial_to_markdown.py resources/tutorials/example-html-export
```

This conversion is optional tooling. Python is not needed to run the web app. Keep any conversion scripts generic and avoid committing source-specific names or downloaded content.

## Docker Hosting On VM

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
mkdir -p resources/courses resources/tutorials data
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
It also mounts `./data:/app/data` so `progress.sqlite3` survives rebuilds.

Cloudflare Tunnel public hostname target:

```text
http://127.0.0.1:5177
```

For extra protection, put Cloudflare Access in front of the hostname too.
