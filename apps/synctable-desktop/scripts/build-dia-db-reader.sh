#!/bin/sh
set -eu

mkdir -p src/native/bin

if [ ! -x src/native/bin/dia-db-reader ] || [ src/native/dia-db-reader.c -nt src/native/bin/dia-db-reader ]; then
  clang -O2 \
    src/native/dia-db-reader.c \
    -framework Security \
    -framework CoreFoundation \
    -o src/native/bin/dia-db-reader
  codesign --force --sign - --identifier com.synctable.dia-db-reader src/native/bin/dia-db-reader
fi

if [ ! -x src/native/bin/sync-lifecycle-monitor ] || [ src/native/sync-lifecycle-monitor.swift -nt src/native/bin/sync-lifecycle-monitor ]; then
  swiftc -O \
    src/native/sync-lifecycle-monitor.swift \
    -framework AppKit \
    -o src/native/bin/sync-lifecycle-monitor
  codesign --force --sign - --identifier com.synctable.sync-lifecycle-monitor src/native/bin/sync-lifecycle-monitor
fi
