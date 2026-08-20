# Production Deployment

This runbook deploys one source-free Docker Compose stack to an Ubuntu x86_64 VPS. Caddy is the only public service. PostgreSQL listens on VPS loopback for SSH tunnels, and the application runs embedded Goose migrations before serving traffic.

## Accepted limits

- Temporary HTTP-by-IP is for disposable test data and a temporary admin password only.
- Deployments and coordinated backups briefly stop the application. Caddy may return `502` during that interval.
- Backups remain on the same VPS. They do not protect against total VPS or disk loss.
- Backup failure detection depends on the weekly manual checklist below.
- The restore procedure is unverified until it has been exercised successfully.
- Receipts and customer records are retained indefinitely.
- Migrations run forward only. Every migration must remain compatible with the previous application image.

## Server requirements

- Ubuntu on x86_64 with Docker Engine and Docker Compose already installed
- SSH key access through a non-root sudo user
- Free ports `80`, `443`, and VPS loopback port `5432`
- At least 2 GB RAM and 40 GB disk for the initial low-volume deployment

Do not add the deployment user to the `docker` group just to avoid `sudo`; Docker access is effectively root access.

## Build a release locally

The release target starts the development database, runs every check, builds a Linux x86_64 image, saves it, compresses it, and creates a checksum.

```sh
make release
```

The tag defaults to `git describe --always --dirty`. Inspect the generated names:

```sh
ls -lh dist/
```

A normal release produces two files such as:

```text
dist/insta-helper-551696f.tar.gz
dist/insta-helper-551696f.tar.gz.sha256
```

## Install operations files

Set these examples for your server:

```sh
export SERVER=2.144.23.168
export SERVER_USER=deploy
```

Upload the operations directory:

```sh
scp -r deploy "$SERVER_USER@$SERVER:/tmp/insta-helper"
ssh "$SERVER_USER@$SERVER"
sudo mkdir -p /opt/insta-helper
sudo cp -a /tmp/insta-helper/. /opt/insta-helper/
sudo chown -R "$USER:$(id -gn)" /opt/insta-helper
cd /opt/insta-helper
cp .env.example .env
chmod 600 .env
mkdir -p data/receipts data/product-images backups/database backups/receipts backups/product-images
chmod 700 data backups backups/database backups/receipts backups/product-images
```

Generate the database password and inspect your numeric user IDs:

```sh
openssl rand -hex 32
id -u
id -g
```

Edit `/opt/insta-helper/.env`. For disposable HTTP testing, use:

```dotenv
SITE_ADDRESS=http://203.0.113.10
APP_ORIGIN=http://203.0.113.10
COOKIE_SECURE=false
POSTGRES_PASSWORD=generated-hex-value
POSTGRES_BIND=127.0.0.1:5432
APP_UID=1000
APP_GID=1000
SESSION_LIFETIME=720h
MAX_RECEIPT_BYTES=5242880
MELIPAYAMAK_USERNAME=your-panel-username
MELIPAYAMAK_PASSWORD=your-panel-password
MELIPAYAMAK_BODY_ID=your-template-body-id
HCAPTCHA_SITE_KEY=your-public-site-key
HCAPTCHA_SECRET=your-secret-key
```

Use the actual server IP and the values returned by `id`. Keep `.env` mode `0600` and never commit or upload it elsewhere.
Create the hCaptcha site key with this server's hostname in its domain allowlist, then keep only `HCAPTCHA_SECRET` private.

## Activate a paid shop

After confirming payment in WhatsApp, set an inclusive Tehran-calendar date directly in PostgreSQL (for example, through `docker compose exec db psql`):

```sql
UPDATE shops SET paid_through = DATE '2026-09-20', subscription_mode = 'paid' WHERE id = 123;
```

## First deployment

On the local computer, get the tag and upload both release files:

```sh
TAG=$(git describe --always --dirty)
rsync -avP "dist/insta-helper-$TAG.tar.gz" "dist/insta-helper-$TAG.tar.gz.sha256" "insta-helper:/tmp/"
```

On the VPS:

```sh
TAG=58d9144
cd /opt/insta-helper
sudo ./deploy-image "/tmp/insta-helper-$TAG.tar.gz" "$TAG"
curl --fail http://203.0.113.10/api/health
sudo docker compose ps
```

The first application start creates the schema through Goose. Caddy then proxies the application on the configured IP.

## Create or reset the admin

The `seed` command creates or updates only one admin account. It does not create shops or products. Read the password without storing it in shell history:

```sh
cd /opt/insta-helper
read -r -p 'Admin login: ' SEED_ADMIN_LOGIN
read -r -p 'Admin name: ' SEED_ADMIN_NAME
read -r -s -p 'Admin password: ' SEED_ADMIN_PASSWORD
printf '\n'
export SEED_ADMIN_LOGIN SEED_ADMIN_NAME SEED_ADMIN_PASSWORD
sudo --preserve-env=SEED_ADMIN_LOGIN,SEED_ADMIN_NAME,SEED_ADMIN_PASSWORD \
  docker compose run --rm \
  -e SEED_ADMIN_LOGIN -e SEED_ADMIN_NAME -e SEED_ADMIN_PASSWORD app seed
unset SEED_ADMIN_LOGIN SEED_ADMIN_NAME SEED_ADMIN_PASSWORD
```

Use a temporary password during HTTP testing. Do not enter real customer details or upload real receipts before HTTPS is active.

## Configure a domain and HTTPS

Buy a domain and point its `A` record to the VPS. Point `www` to the domain with a `CNAME` record. Add an `AAAA` record only if IPv6 actually reaches this server. Wait until public DNS resolves correctly:

```sh
dig +short example.com A
dig +short www.example.com A
```

Change `.env`:

```dotenv
SITE_ADDRESS="example.com, www.example.com"
APP_ORIGIN=https://example.com
COOKIE_SECURE=true
```

Recreate only the services whose environment changed:

```sh
cd /opt/insta-helper
sudo docker compose up -d --force-recreate --no-deps --wait app
sudo docker compose up -d --force-recreate --no-deps caddy
curl --fail https://example.com/api/health
curl --fail --head https://www.example.com/api/health
sudo docker compose logs --since=10m caddy
```

Caddy obtains and renews the certificate automatically. After HTTPS works, reset the admin with the final strong password and discard all HTTP test data before real use.

## Deploy an application update

Build and upload the two release files as before, then run:

```sh
TAG=551696f
cd /opt/insta-helper
sudo ./deploy-image "/tmp/insta-helper-$TAG.tar.gz" "$TAG"
curl --fail https://app.example.com/api/health
```

The deployment command performs these steps:

1. Verify the archive checksum.
2. Stop the app and create a coordinated pre-deploy backup.
3. Retag `insta-helper:current` as `insta-helper:previous`.
4. Load and activate the commit-tagged image.
5. Restart the app, run Goose migrations, and wait for its health check.

Delete uploaded archives from `/tmp` after successful verification.

## Roll back the application image

Rollback is manual so you see the failure before changing anything else:

```sh
cd /opt/insta-helper
sudo docker tag insta-helper:previous insta-helper:current
sudo docker compose up -d --force-recreate --no-deps --wait app
```

This is safe only when newly applied migrations are backward-compatible with the previous image. Never remove or rename a column in the same release that stops using it.

The image before payment-card snapshots reads the shop's currently active card for every order. If rolling back to that image after switching cards, restore the intended active shop payment fields or redeploy the current image before customers use existing order links.

## Update operations files

Normal releases upload only the app image. If `deploy/` changes, upload it separately and inspect the Compose result before applying it:

```sh
scp -r deploy "$SERVER_USER@$SERVER:/tmp/insta-helper-new"
ssh "$SERVER_USER@$SERVER"
sudo cp -a /tmp/insta-helper-new/. /opt/insta-helper/
cd /opt/insta-helper
sudo docker compose config --quiet
```

This does not replace `/opt/insta-helper/.env`, data, or backups because those files are not part of `deploy/`.

## Nightly backups

Install the systemd units once:

```sh
sudo install -m 0644 /opt/insta-helper/insta-helper-backup.service /etc/systemd/system/
sudo install -m 0644 /opt/insta-helper/insta-helper-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now insta-helper-backup.timer
systemctl list-timers insta-helper-backup.timer
```

The timer runs at 03:00 Iran time and catches a missed run after the VPS starts again. A backup:

- gracefully stops the app while preventing overlapping backup jobs;
- atomically copies only receipts and product images not already in their append-only backup directories;
- creates a PostgreSQL custom-format dump and checksum;
- removes database dumps older than 14 days;
- restarts the app even when the backup command fails.

Run an extra backup manually:

```sh
sudo /opt/insta-helper/backup manual
```

Inspect recent runs:

```sh
systemctl status insta-helper-backup.timer
sudo journalctl -u insta-helper-backup.service --since '7 days ago'
ls -lht /opt/insta-helper/backups/database
```

Verify a selected dump from its directory:

```sh
cd /opt/insta-helper/backups/database
sha256sum -c 20260729T193000Z-nightly.dump.sha256
```

## Download backups

Database dumps expire after 14 days. Uploaded media is cumulative, so use `rsync` to transfer only files not already downloaded:

```sh
mkdir -p backups/database backups/receipts backups/product-images
scp "$SERVER_USER@$SERVER:/opt/insta-helper/backups/database/20260729T193000Z-nightly.dump*" backups/database/
rsync -av "$SERVER_USER@$SERVER:/opt/insta-helper/backups/receipts/" backups/receipts/
rsync -av "$SERVER_USER@$SERVER:/opt/insta-helper/backups/product-images/" backups/product-images/
cd backups/database
sha256sum -c 20260729T193000Z-nightly.dump.sha256
```

These local copies are the only protection against complete VPS loss. The current chosen policy does not automate them.

## Restore from a backup

This procedure replaces the entire production database and live uploaded-media directories. It has not been validated by a restore drill. Take a fresh backup first if the current state may still be useful.

Choose and verify the dump:

```sh
cd /opt/insta-helper
cd backups/database
sha256sum -c 20260729T193000Z-nightly.dump.sha256
cd ../..
sudo docker compose stop -t 15 app
```

Replace PostgreSQL:

```sh
sudo docker compose exec -T db dropdb -U insta_helper --force insta_helper
sudo docker compose exec -T db createdb -U insta_helper -O insta_helper insta_helper
sudo docker compose exec -T db pg_restore \
  -U insta_helper -d insta_helper --no-owner --no-privileges \
  < backups/database/20260729T193000Z-nightly.dump
```

Replace uploaded media while keeping the previous directories temporarily:

```sh
mv data/receipts "data/receipts.before-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir data/receipts
cp -a backups/receipts/. data/receipts/
mv data/product-images "data/product-images.before-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir data/product-images
cp -a backups/product-images/. data/product-images/
chown -R "$(id -u):$(id -g)" data/receipts data/product-images
chmod 700 data/receipts data/product-images
sudo docker compose start app
curl --fail https://app.example.com/api/health
```

The cumulative media backups may contain files newer than the selected database dump. They are harmless because no database row references them.

## DBeaver through SSH

PostgreSQL is published only on VPS `127.0.0.1:5432`. It must not be opened in the firewall.

In DBeaver, configure PostgreSQL with database `insta_helper`, user `insta_helper`, and the password from `.env`. Enable its SSH tunnel with the VPS host and SSH key. Set the database host visible through that tunnel to `127.0.0.1` and port `5432`.

Alternatively, open the tunnel yourself:

```sh
ssh -N -L 5434:127.0.0.1:5432 "$SERVER_USER@$SERVER"
```

Then connect DBeaver to local host `127.0.0.1`, port `5434`, database `insta_helper`.

## Create a shop

Products are created, edited, archived, and restored by the shop owner from the «محصول‌ها» section. Uploaded product images are stored in `data/product-images` and included in the nightly media backup.

Shop management is still manual. Run a backup first, then use a transaction in DBeaver and verify the affected row before committing:

```sql
BEGIN;

WITH owner AS (
    SELECT id FROM admins WHERE login = 'admin'
), new_shop AS (
    INSERT INTO shops (
        name, logo_path, short_description,
        payment_card_number, payment_instructions, active,
        created_at, updated_at
    )
    SELECT
        'Shop name', '/images/shop.svg', 'Description',
        '6037990000000000', 'Card holder and payment instructions', true,
        now(), now()
    FROM owner
    RETURNING id, payment_card_number, payment_instructions
), shop_access AS (
    INSERT INTO admin_shops (admin_id, shop_id, created_at)
    SELECT owner.id, new_shop.id, now() FROM owner CROSS JOIN new_shop
)
INSERT INTO shop_payment_cards (shop_id, card_number, payment_instructions)
SELECT id, payment_card_number, payment_instructions FROM new_shop;

SELECT shops.id, shops.name, admin_shops.admin_id
FROM shops
JOIN admin_shops ON admin_shops.shop_id = shops.id
ORDER BY shops.id DESC;

COMMIT;
```

Every manually assigned `logo_path` must exist under `web/public/images` in the locally built app image. Product images uploaded through the application do not require a rebuild or deployment.

## Disk usage and cleanup

Inspect filesystem, application, Docker, and journal usage:

```sh
df -h
df -ih
sudo du -xhd1 /opt/insta-helper | sort -h
sudo du -xhd1 /var/lib/docker | sort -h
sudo docker system df -v
sudo docker ps --size
sudo journalctl --disk-usage
cd /opt/insta-helper
sudo du -sh data/* backups/*
sudo docker image ls insta-helper
```

After a successful deployment, remove uploaded release archives and other safe-to-recreate data:

```sh
sudo rm -f /tmp/insta-helper-*.tar.gz /tmp/insta-helper-*.tar.gz.sha256
sudo docker image prune
sudo docker container prune
sudo apt clean
sudo journalctl --vacuum-time=14d
```

Inspect application image tags and remove only obsolete commit-tagged releases:

```sh
sudo docker image ls insta-helper
sudo docker image rm insta-helper:OLD_TAG
```

Keep `insta-helper:current` and `insta-helper:previous` for deployment and rollback. Do not run `docker system prune --volumes`; PostgreSQL data is stored in a Docker volume. Do not delete `data/` or cumulative media backups unless verified copies exist elsewhere.

## Weekly checklist

Run this once each week because no automated alerting is configured:

```sh
systemctl list-timers insta-helper-backup.timer
sudo journalctl -u insta-helper-backup.service --since '8 days ago'
ls -lht /opt/insta-helper/backups/database
df -h /opt/insta-helper
cd /opt/insta-helper && sudo docker compose ps
curl --fail https://app.example.com/api/health
sudo docker compose logs --since=7d --tail=200 app db caddy
```

Verify the newest dump checksum manually. Investigate any missing nightly run, unhealthy container, repeated restart, migration error, certificate error, or unexpected disk growth.

## Caddy and PostgreSQL maintenance

Updates are deliberate, not automatic. Change the pinned image version in `deploy/compose.yaml`, upload the changed operations files, and create a manual backup first.

For a PostgreSQL 17 patch update:

```sh
cd /opt/insta-helper
sudo ./backup before-postgres-update
sudo docker compose pull db
sudo docker compose up -d --wait db
```

For Caddy:

```sh
sudo docker compose pull caddy
sudo docker compose up -d caddy
curl --fail https://app.example.com/api/health
```

Do not upgrade to a new PostgreSQL major version using these commands. Major upgrades require a documented dump-and-restore migration.
