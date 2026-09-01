#!/usr/bin/env bash

set -euo pipefail

source_dir=${1:-omarchy-plugin}
publish_dir=${2:?Usage: publish-omarchy-plugin.sh [source-dir] publish-dir}
repository_root=$(git rev-parse --show-toplevel)
license="$repository_root/LICENSE"
required=(BarWidget.qml FilterablePanel.qml MultilineTextField.qml Panel.qml README.md Service.qml manifest.json)

fail() {
  printf 'publish-omarchy-plugin: %s\n' "$*" >&2
  exit 1
}

[[ -d $source_dir ]] || fail "source directory does not exist: $source_dir"
[[ -d $publish_dir/.git || -f $publish_dir/.git ]] || fail "publish directory is not a Git checkout: $publish_dir"
[[ -f $license && ! -L $license ]] || fail "repository licence must be a regular file: $license"

while IFS= read -r path; do
  fail "source contains a symbolic link: $path"
done < <(find "$source_dir" -type l -print)

for file in "${required[@]}"; do
  [[ -f $source_dir/$file && ! -L $source_dir/$file ]] || fail "required source file is missing or not regular: $source_dir/$file"
done

mapfile -t source_entries < <(find "$source_dir" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
expected_source=(BarWidget.qml FilterablePanel.qml MultilineTextField.qml Panel.qml README.md Service.qml manifest.json)
[[ ${source_entries[*]} == "${expected_source[*]}" ]] || fail "source directory contains unexpected files"

find "$publish_dir" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf -- {} +
for file in "${required[@]}"; do
  cp -- "$source_dir/$file" "$publish_dir/$file"
done
cp -- "$license" "$publish_dir/LICENSE"

mapfile -t published_entries < <(find "$publish_dir" -mindepth 1 -maxdepth 1 ! -name .git -printf '%f\n' | LC_ALL=C sort)
expected_publish=(BarWidget.qml FilterablePanel.qml LICENSE MultilineTextField.qml Panel.qml README.md Service.qml manifest.json)
[[ ${published_entries[*]} == "${expected_publish[*]}" ]] || fail "published repository contains unexpected files"
