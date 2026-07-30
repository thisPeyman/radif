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
mkdir -p "$database_dir"

for media in receipts product-images; do
	source_dir="/data/$media"
	target_dir="/backups/$media"
	mkdir -p "$target_dir"
	rm -f "$target_dir"/.*.tmp.*
	for source in "$source_dir"/*; do
		[ -f "$source" ] || continue
		name=${source##*/}
		target="$target_dir/$name"
		if [ ! -e "$target" ]; then
			temporary="$target_dir/.$name.tmp.$$"
			cp -p "$source" "$temporary"
			mv "$temporary" "$target"
		fi
	done
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
