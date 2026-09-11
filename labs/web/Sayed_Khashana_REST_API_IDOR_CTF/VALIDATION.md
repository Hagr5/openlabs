# Validation Record

## Commands I Tested

I tested these commands:

```text
npm test
npm run audit
```

Both passed on 2026-09-10.

Node.js version: `22.17.0`

`npm test` tested the application, login, normal document access, the IDOR/BOLA, the receipt step, and the flag.

`npm run audit` checked that the flag is not inside the website files, Docker files, or server code.

## Docker

I could not test Docker because Docker was not installed on my machine.

So I did not run:

```text
docker compose build
docker compose up --build
```

I also did not test the Docker volume reset.

The Dockerfile and Docker Compose files are included in the project.

## What Passed

* Login → PASS
* Normal application behavior → PASS
* API behavior → PASS
* IDOR/BOLA → PASS
* Receipt step → PASS
* Flag condition → PASS
* Flag audit → PASS
* Health check → PASS
* Fresh SQLite test → PASS
* Clean ZIP extraction → PASS
* Documentation files → PASS
* Final ZIP → PASS

## What I Could Not Test

* `docker compose build` → NOT EXECUTED
* `docker compose up --build` → NOT EXECUTED
* Docker volume reset → NOT EXECUTED

The reason for all three is that Docker was not available in the environment.

## Final Check

I extracted the ZIP into a separate folder and ran:

```text
npm test
npm run audit
```

Both passed.

The final ZIP is:

```text
outputs/Sayed_Khashana_REST_API_IDOR_CTF.zip
```

Docker testing is the only part I could not do because Docker was not available.
