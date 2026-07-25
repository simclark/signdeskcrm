# TLS and database certificates for production.
#
# HTTPS certificates are issued automatically by Traefik + Let's Encrypt
# (DNS-01 via DigitalOcean). You do NOT need fullchain.pem / privkey.pem
# when using the Traefik stack.
#
# Still place here (do not commit):
# - mysql-ca.crt — DigitalOcean Managed MySQL CA
#   (Databases → cluster → Download CA certificate)
#
# See docs/ops/PRODUCTION.md for Traefik / ACME / DO DNS setup.
