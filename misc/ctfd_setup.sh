#!/bin/bash

# ctfd_setup.sh: Setup a fresh CTFd instance

BASE_URL="http://localhost:8000"
ADMIN_NAME="admin"
ADMIN_PASS="password"
USER_NAME="user"
USER_PASS="password"

echo -n "[+] Waiting for CTFd"
until curl -sf "$BASE_URL" > /dev/null; do
  echo -n "."
  sleep 2
done
echo " OK"

# Step 0: Get cookie + CSRF token
HTML=$(curl --no-progress-meter --show-headers --follow "$BASE_URL/setup")
COOKIE=$(echo "$HTML" | grep "^Set-Cookie: " | grep -oP 'session=\K[^;]+')
CSRF=$(echo "$HTML" | grep -oP "'csrfNonce':\s*\"\K[^\"]+")
COOKIE="session=$COOKIE"

echo "[+] Cookie: $COOKIE"
echo "[+]   CSRF: $CSRF"

# Step 1: Basic setup
output=$(curl --no-progress-meter --fail-with-body -b "$COOKIE" --follow "$BASE_URL/setup" \
  -F "ctf_name=Hackropole dump" \
  -F "ctf_description=" \
  -F "user_mode=users" \
  -F "challenge_visibility=private" \
  -F "account_visibility=public" \
  -F "score_visibility=public" \
  -F "registration_visibility=public" \
  -F "verify_emails=false" \
  -F "team_size=" \
  -F "name=$ADMIN_NAME" \
  -F "email=admin@admin.admin" \
  -F "password=$ADMIN_PASS" \
  -F "ctf_logo=@/dev/null;filename=" \
  -F "ctf_banner=@/dev/null;filename=" \
  -F "ctf_small_icon=@/dev/null;filename=" \
  -F "ctf_theme=core" \
  -F "theme_color=" \
  -F "start=" \
  -F "end=" \
  -F "social_shares=false" \
  -F "_submit=Fin" \
  -F "nonce=$CSRF")

if [ $? -ne 0 ]; then
    echo "[!] cannot setup CTFd: $output" > /dev/stderr
    exit 1
fi

# Step 1.5: Get renewed CSRF token
CSRF=$(echo "$output" | grep -oP "'csrfNonce':\s*\"\K[^\"]+")

echo "[+]   CSRF: $CSRF"

# Step 2: User creation
output=$(curl --no-progress-meter --fail-with-body -b "$COOKIE" "$BASE_URL/api/v1/users" \
  -H "CSRF-Token: $CSRF" \
  --json '{"name":"'"$USER_NAME"'","email":"user@user.user","password":"'"$USER_PASS"'","type":"user","verified":false,"hidden":false,"banned":false,"change_password":false,"fields":[]}')

echo "$output" | grep -q '"success": true'
if [ $? -ne 0 ]; then
    echo "[!] cannot create the username: $output" > /dev/stderr
    exit 1
fi

echo
echo "You should now be able to login to $BASE_URL with:"
echo "- $ADMIN_NAME / $ADMIN_PASS"
echo "- $USER_NAME / $USER_PASS"
