# snapsync

`medium` · `web`

## Brief

SnapSync is a small internal tool staff use to upload and share work
photos. Every employee gets an account, can upload photos, and can pull
back the ones they own. One route in the app sits outside the normal
employee reach.

## Setup

Run this from the lab directory:

```bash
docker compose up -d --build
```

Open `http://localhost:3000`. Give it a few seconds after startup, then
confirm it is ready:

```bash
curl http://localhost:3000/api/health
```

To return to a clean state:

```bash
./reset.sh
```

## Goal

Starting from a normal account, reach the restricted route and extract
its flag. Verify the solve from the lab directory:

```bash
python3 ../../../scripts/check.py .
```
