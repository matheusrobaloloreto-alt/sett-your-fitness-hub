#!/usr/bin/env bash
# Local preparation only. Root must review before running on the new host.
# Usage: sudo bash bootstrap-host.sh <operatorIPv4>
# Sources: https://docs.docker.com/engine/install/ubuntu/
#          https://caddyserver.com/docs/install#debian-ubuntu-raspbian
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C
umask 077

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
[[ $# == 1 ]] || fail 'usage: bash bootstrap-host.sh <operatorIPv4>'
operator_ipv4=$1
[[ $operator_ipv4 =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'operatorIPv4 must be a single IPv4 address'
IFS=. read -r -a octets <<< "$operator_ipv4"
[[ ${#octets[@]} == 4 && $operator_ipv4 != *. ]] || fail 'operatorIPv4 must be a single IPv4 address, without CIDR'
for octet in "${octets[@]}"; do
  [[ $octet =~ ^(0|[1-9][0-9]{0,2})$ ]] || fail 'invalid IPv4 octet'
  (( 10#$octet <= 255 )) || fail 'IPv4 octet exceeds 255'
done
(( octets[0] > 0 && octets[0] < 224 && octets[0] != 127 )) || fail 'operatorIPv4 must be unicast, not loopback'
[[ $operator_ipv4 != 169.254.* ]] || fail 'operatorIPv4 cannot be link-local'
[[ $EUID == 0 ]] || fail 'root required'
[[ $(uname -s) == Linux && -f /etc/os-release ]] || fail 'Linux host required'
# shellcheck source=/dev/null
source /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 && ${VERSION_CODENAME:-} == noble ]] || fail 'Ubuntu 24.04 noble required'
[[ $(dpkg --print-architecture) == amd64 ]] || fail 'amd64 host required'
[[ -d /run/systemd/system ]] || fail 'systemd host required'
exec 9>/run/lock/sett-whatsapp-bootstrap.lock
flock --nonblock 9 || fail 'another bootstrap is already running'

if [[ -n ${SSH_CONNECTION:-} ]]; then
  read -r peer_ip peer_port local_ip local_port extra <<< "$SSH_CONNECTION"
  [[ $peer_ip == "$operator_ipv4" && $local_port == 22 && -z ${extra:-} ]] || fail 'SSH peer must match operatorIPv4 and server port 22; use console to resolve'
fi
[[ -x /usr/sbin/sshd ]] || fail 'existing OpenSSH server required'
sshd_config=$(/usr/sbin/sshd -T) || fail 'cannot validate existing sshd configuration'
[[ $(awk '$1 == "port" { print $2 }' <<< "$sshd_config") == 22 ]] || fail 'only existing SSH port 22 is supported; sshd will not be changed'

state_dir=/var/lib/sett-whatsapp-bootstrap
target_dir=/opt/sett-whatsapp
policy_file=/usr/sbin/policy-rc.d
installed() { [[ $(dpkg-query -W -f='${Status}' "$1" 2>/dev/null || true) == 'install ok installed' ]]; }

# Refuse an unrelated host. A marker permits only retries of this bootstrap,
# not execution after application files or workloads have been introduced.
for path in "$state_dir" "$target_dir" "$target_dir/private"; do
  [[ ! -L $path ]] || fail "symlink refused: $path"
  [[ ! -e $path || -d $path ]] || fail "not a directory: $path"
done
if [[ -d $state_dir ]]; then
  [[ $(stat -c '%u:%a' "$state_dir") == 0:700 ]] || fail 'bootstrap state must be root-owned mode 700'
  [[ -f $state_dir/operator-ipv4 && ! -L $state_dir/operator-ipv4 ]] || fail 'incomplete bootstrap identity; root review required'
  [[ $(cat "$state_dir/operator-ipv4") == "$operator_ipv4" ]] || fail 'operator changed; root must review firewall before retry'
else
  for package in docker-ce docker-ce-cli containerd.io caddy; do
    ! installed "$package" || fail "not a new host: $package already installed"
  done
  for path in /var/lib/docker /var/lib/containerd /etc/docker /etc/caddy; do
    [[ ! -e $path ]] || fail "not a new host: $path exists"
  done
fi
for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
  ! installed "$package" || fail "conflicting package $package; no automatic removal"
done
if [[ -d $target_dir ]]; then
  existing_data=$(find "$target_dir" -mindepth 1 ! -path "$target_dir/private" -print -quit) || fail 'cannot inspect application directory'
  [[ -z $existing_data ]] || fail '/opt/sett-whatsapp contains application data; refuse to bootstrap'
fi
if command -v docker >/dev/null && systemctl is-active --quiet docker; then
  containers=$(docker container ls --all --quiet) || fail 'cannot inspect Docker containers'
  volumes=$(docker volume ls --quiet) || fail 'cannot inspect Docker volumes'
  [[ -z $containers && -z $volumes ]] || fail 'existing Docker workloads/volumes; refuse to bootstrap'
fi
listeners=$(ss -H -ltn | awk '{print $4}') || fail 'cannot inspect TCP listeners'
while IFS= read -r address; do
  case "$address" in
    '') ;;
    127.*|\[::1\]:*|::1:*|*:22) ;;
    *) fail "unexpected TCP listener $address; new idle host required" ;;
  esac
done <<< "$listeners"

check_ufw_rules() {
  local line rules
  rules=$(ufw show added) || fail 'cannot read UFW rules'
  while IFS= read -r line; do
    case "$line" in
      ''|'#'*|'(None)'|"Added user rules (see 'ufw status' for running firewall):") ;;
      "ufw allow from $operator_ipv4 to any port 22 proto tcp"|"ufw allow proto tcp from $operator_ipv4 to any port 22"|'ufw allow 80/tcp'|'ufw allow 443/tcp')
        [[ -d $state_dir ]] || fail 'preexisting UFW rules on unclaimed host' ;;
      *) fail 'unrecognized UFW rule; no automatic reset or deletion' ;;
    esac
  done <<< "$rules"
}
if command -v ufw >/dev/null; then
  check_ufw_rules
  if [[ ! -d $state_dir ]]; then
    [[ $(ufw status) == 'Status: inactive' ]] || fail 'active firewall on unclaimed host'
  fi
fi

# Avoid overwriting any existing repository/key configuration on first run.
if [[ ! -d $state_dir ]]; then
  for path in /etc/apt/sources.list.d/docker.sources /etc/apt/sources.list.d/docker.list \
    /etc/apt/sources.list.d/caddy-stable.list /etc/apt/keyrings/docker.asc \
    /usr/share/keyrings/caddy-stable-archive-keyring.gpg; do
    [[ ! -e $path && ! -L $path ]] || fail "existing repository configuration: $path"
  done
fi
[[ ! -e $policy_file && ! -L $policy_file ]] || fail 'existing policy-rc.d; root review required'
install -d -o root -g root -m 700 "$state_dir"
printf '%s\n' "$operator_ipv4" > "$state_dir/operator-ipv4"
chmod 600 "$state_dir/operator-ipv4"

scratch=$(mktemp -d /run/sett-whatsapp-bootstrap.XXXXXX)
cleanup() {
  # Never remove a policy replaced by another process.
  if [[ -f $scratch/policy-rc.d && -f $policy_file ]] && cmp -s "$scratch/policy-rc.d" "$policy_file"; then
    rm -- "$policy_file"
  fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'printf "FAIL: bootstrap interrupted; review state and rerun with the same operatorIPv4. No rollback or reboot performed.\n" >&2' ERR

# Package post-install hooks must not start Caddy's default HTTP site or apps.
printf '#!/bin/sh\n# sett-whatsapp-bootstrap temporary service-start guard\nexit 101\n' > "$scratch/policy-rc.d"
install -o root -g root -m 755 "$scratch/policy-rc.d" "$policy_file"
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=l
apt-get update
apt-get install --yes --no-install-recommends --no-upgrade ca-certificates curl gnupg ufw nodejs

fetch() { curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 120 "$1" --output "$2"; }
fetch https://download.docker.com/linux/ubuntu/gpg "$scratch/docker.asc"
gpg --batch --show-keys "$scratch/docker.asc" >/dev/null
install -d -o root -g root -m 755 /etc/apt/keyrings
install -o root -g root -m 644 "$scratch/docker.asc" /etc/apt/keyrings/docker.asc
cat > "$scratch/docker.sources" <<'DOCKER_REPO'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
DOCKER_REPO
install -o root -g root -m 644 "$scratch/docker.sources" /etc/apt/sources.list.d/docker.sources

fetch https://dl.cloudsmith.io/public/caddy/stable/gpg.key "$scratch/caddy.asc"
gpg --batch --yes --dearmor --output "$scratch/caddy.gpg" "$scratch/caddy.asc"
install -o root -g root -m 644 "$scratch/caddy.gpg" /usr/share/keyrings/caddy-stable-archive-keyring.gpg
cat > "$scratch/caddy-stable.list" <<'CADDY_REPO'
deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main
CADDY_REPO
install -o root -g root -m 644 "$scratch/caddy-stable.list" /etc/apt/sources.list.d/caddy-stable.list

apt-get update
apt-get install --yes --no-install-recommends --no-upgrade docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin caddy
compose_version=$(docker compose version --short)
compose_version=${compose_version#v}
[[ $compose_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'unrecognized Compose version'
dpkg --compare-versions "$compose_version" ge 2.30.0 || fail 'Compose >=2.30.0 required; no automatic upgrade'
node --version
caddy version
printf 'Docker Compose %s\n' "$compose_version"
# Keep the default Caddy site from becoming public on a subsequent boot.
systemctl disable caddy.service
! systemctl is-active --quiet caddy.service || fail 'Caddy unexpectedly active; review before proceeding'

install -d -o root -g root -m 750 "$target_dir"
install -d -o root -g root -m 700 "$target_dir/private"
check_ufw_rules
grep -Eq '^IPV6=yes$' /etc/default/ufw || fail 'UFW IPv6 protection must be enabled; no implicit configuration change'
# Add the scoped SSH rule before enabling the firewall; never reset UFW.
ufw allow from "$operator_ipv4" to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose
printf 'PASS: bootstrap complete; application not deployed. Root must verify a second SSH session and review runtime gates.\n'
printf 'NOTE: Docker-published ports can bypass UFW; retain the loopback-only Compose binding.\n'
