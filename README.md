## `README.md`

````md
# FuelGuard — Phase 0 Repo Skeleton

This repository contains the Phase 0 skeleton for FuelGuard (Django + React + Redis) and a development `docker-compose` setup so the system can be run locally with Docker Desktop.

## Quick start (developer machine with Docker Desktop)

1. Copy `.env.example` to `.env` and edit if needed.
2. From the `infrastructure/` folder run:

```bash
docker compose up --build
````

3. After services start, create migrations and seed data (examples):

```bash
docker compose exec backend python manage.py migrate
# optional seed
# docker compose exec backend python manage.py loaddata seed_demo.json
```

4. Open the apps:

* Backend API: [http://localhost:8000](http://localhost:8000)
* Frontend: [http://localhost:3000](http://localhost:3000)
* Mailhog (dev mail capture): [http://localhost:8025](http://localhost:8025)

## Branch strategy

* `main` — production-ready (protected)
* `develop` — integration branch
* Feature branches: `phase/01-auth`, `phase/02-events`, etc.

## Contributing

* Create issues and link them to feature branches.
* Open Pull Requests against `develop`. Once reviewed, merge to `main` via `develop`.

## Notes

* Default setup uses Postgres via Docker but can fall back to SQLite for zero-DB demo (see `.env.example`).








## How to initialize git & branches (copy these into your terminal)

```bash
# in project root
git init
git add .
git commit -m "chore: phase0 repo skeleton"
git branch -M main
git checkout -b develop
# push to remote (create repo on Git host first):
# git remote add origin git@github.com:yourorg/fuelguard.git
# git push -u origin main
# git push -u origin develop