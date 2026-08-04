# Backup and restore runbook

Pair with [PRODUCTION.md](./PRODUCTION.md). Test a restore **before** relying on backups for paid traffic.

## What to back up

| Asset | How |
|-------|-----|
| MySQL | `./deploy/backup.sh` (Compose mysql **or** managed DB via api + `mysqldump`) |
| Local media volume | Included in `backup.sh` when `media_data` exists |
| DigitalOcean Spaces | Enable bucket versioning; optional nightly `rclone sync` / `s3cmd sync` to a second bucket or cold storage |
| Traefik ACME | Persist Traefik volume / let DNS-01 re-issue |

## Daily schedule (example)

```bash
# crontab — store off-host (Spaces, another droplet, or laptop rsync)
0 3 * * * cd /opt/signdeskcrm && ./deploy/backup.sh /var/backups/signdesk >> /var/log/signdesk-backup.log 2>&1
```

Also enable **DigitalOcean Managed Database automated backups** when not using Compose MySQL.

## Restore — MySQL (managed or Compose)

1. Pick a dump: `backups/<stamp>/mysql.sql.gz`
2. Prefer restoring into a **new** database first, then cut over.

```bash
# Example: restore into a scratch DB from the api container
gunzip -c backups/<stamp>/mysql.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T api \
    sh -c 'mysql -h"$MYSQL_HOST" -P"${MYSQL_PORT:-3306}" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD"'
```

For Compose builtin MySQL:

```bash
gunzip -c backups/<stamp>/mysql.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T mysql \
    sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
```

3. Run `docker compose -f docker-compose.prod.yml exec api python manage.py migrate --check`
4. Hit `/api/health/` and Platform → Health.

## Restore — local media volume

```bash
MEDIA_VOL=$(docker volume ls -q | grep media_data | head -n1)
docker run --rm -v "$MEDIA_VOL:/media" -v "$PWD/backups/<stamp>:/backup" alpine \
  sh -c 'rm -rf /media/* && tar xzf /backup/media.tar.gz -C /media'
```

## Restore drill checklist

- [ ] Take a fresh backup
- [ ] Restore MySQL to a non-production name or staging host
- [ ] Confirm a known tenant, envelope, and signed PDF load
- [ ] Confirm Spaces objects still resolve (or restore from versioning)
- [ ] Record date of last successful drill in ops notes

## Spaces note

`backup.sh` does not dump Spaces. If `DO_SPACES_BUCKET` is set, documents live in object storage — protect that bucket independently (versioning + cross-region copy).
