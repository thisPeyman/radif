#!/bin/sh
set -eu

kind=${1:-manual}
case "$kind" in
	*[!a-zA-Z0-9_-]*)
		echo "invalid backup kind: $kind" >&2
		exit 2
		;;
esac

umask 077
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
database_dir=/backups/database
receipt_dir=/backups/receipts
mkdir -p "$database_dir" "$receipt_dir"

rm -f "$receipt_dir"/.*.tmp.*
for source in /data/receipts/*; do
	[ -f "$source" ] || continue
	name=${source##*/}
	target="$receipt_dir/$name"
	if [ ! -e "$target" ]; then
		temporary="$receipt_dir/.$name.tmp.$$"
		cp -p "$source" "$temporary"
		mv "$temporary" "$target"
	fi
done

dump="$timestamp-$kind.dump"
temporary="$database_dir/.$dump.tmp.$$"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-privileges > "$temporary"
mv "$temporary" "$database_dir/$dump"
(
	cd "$database_dir"
	sha256sum "$dump" > "$dump.sha256"
)
find "$database_dir" -type f \( -name '*.dump' -o -name '*.dump.sha256' \) -mtime +13 -exec rm -f {} +
trap - EXIT HUP INT TERM

echo "backup created: $database_dir/$dump"
