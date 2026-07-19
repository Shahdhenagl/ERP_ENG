#!/bin/bash
#
# Deploy script for Hostinger shared hosting.
# Run it over SSH from the project root after `git pull`:
#
#   cd ~/cityeng && bash deploy.sh
#
# It deliberately does NOT run npm — shared hosting has no Node. The frontend
# is built locally and committed, so `git pull` already delivered the assets.

set -e

echo "▸ City Engineering — deploy"
echo

# Composer lives at a different path on some Hostinger nodes.
if command -v composer >/dev/null 2>&1; then
    COMPOSER="composer"
elif [ -f "$HOME/composer.phar" ]; then
    COMPOSER="php $HOME/composer.phar"
else
    echo "  composer not found — download it once with:"
    echo "  curl -sS https://getcomposer.org/installer | php -- --install-dir=\$HOME"
    exit 1
fi

echo "▸ installing PHP dependencies"
$COMPOSER install --optimize-autoloader --no-dev --no-interaction

echo "▸ running migrations"
php artisan migrate --force

echo "▸ linking storage"
php artisan storage:link || true   # already linked on repeat deploys

echo "▸ rebuilding caches"
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "▸ fixing permissions"
chmod -R 775 storage bootstrap/cache

echo
echo "✓ deploy complete"
echo
echo "  Verify:"
echo "   · the site loads over https"
echo "   · /sw.js and /manifest.webmanifest return 200"
echo "   · the queue cron has run (jobs table drains within a minute)"
