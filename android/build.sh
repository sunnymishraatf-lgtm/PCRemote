#!/bin/bash
# PC Remote Android client — manual Gradle-free build pipeline.
# aapt2 -> kotlinc -> d8 -> zipalign -> apksigner
#
# NOTE: this is a snapshot of the pipeline script as used on the dev machine.
# Paths below (~/jdk-*, ~/android-sdk, ~/kotlin-*) are machine-specific examples;
# point them at your own JDK 17, Android SDK build-tools 34/36, platform
# android-34, kotlinc 1.9.x, and the ZXing core jar before running. The release
# keystore is intentionally NOT in this repo — keep yours outside version
# control and never commit it or its password.
set -e

export JAVA_HOME=~/jdk-17.0.20.1+1
export PATH=$JAVA_HOME/bin:$PATH

PROJ=~/workspace/pc-remote/android/app/src/main
BUILD=~/workspace/pcremote-build
BT=~/android-sdk/build-tools/34.0.0
BT_D8=~/android-sdk/build-tools/36.0.0
PLATFORM=~/android-sdk/platforms/android-34/android.jar
KOTLINC=~/kotlin-1.9.24/kotlinc/bin/kotlinc
STDLIB=~/kotlin-1.9.24/kotlinc/lib/kotlin-stdlib.jar
ZXING=$BUILD/deps/core-3.5.3.jar
KS=$BUILD/pcremote-release.keystore

STEP="$*"
[ -z "$STEP" ] && STEP="all"
should_run() { case " $STEP " in *" all "*|*" $1 "*) return 0;; *) return 1;; esac }

mkdir -p $BUILD/compiled-res $BUILD/classes $BUILD/gen $BUILD/dex

if should_run "res"; then
  echo "== aapt2 compile + link"
  rm -rf $BUILD/compiled-res && mkdir -p $BUILD/compiled-res
  $BT/aapt2 compile --dir $PROJ/res -o $BUILD/compiled-res/app.zip
  rm -rf $BUILD/gen && mkdir -p $BUILD/gen
  $BT/aapt2 link -o $BUILD/app-unsigned.apk \
    -I $PLATFORM \
    --manifest $PROJ/AndroidManifest.xml \
    --java $BUILD/gen \
    --min-sdk-version 26 --target-sdk-version 34 \
    $BUILD/compiled-res/app.zip
  echo "linked: $(du -h $BUILD/app-unsigned.apk | cut -f1)"
fi

if should_run "kotlinc"; then
  echo "== kotlinc"
  rm -rf $BUILD/classes && mkdir -p $BUILD/classes
  find $PROJ/java $BUILD/gen -name "*.kt" -o -name "*.java" > $BUILD/sources.txt
  echo "sources: $(wc -l < $BUILD/sources.txt)"
  $KOTLINC -cp "$PLATFORM:$ZXING" -d $BUILD/classes -jvm-target 17 @$BUILD/sources.txt
  echo "classes: $(find $BUILD/classes -name '*.class' | wc -l)"
fi

if should_run "d8"; then
  echo "== d8"
  rm -rf $BUILD/dex && mkdir -p $BUILD/dex
  jar cf $BUILD/app-classes.jar -C $BUILD/classes .
  $BT_D8/d8 --lib $PLATFORM --min-api 26 --release \
    --output $BUILD/dex \
    $BUILD/app-classes.jar $STDLIB $ZXING 2>&1 | head -5 || true
  echo "dex files: $(ls $BUILD/dex/*.dex 2>/dev/null | wc -l)"
fi

if should_run "apk"; then
  echo "== assemble + align + sign"
  [ -f "$KS" ] || { echo "ERROR: keystore missing at $KS"; exit 1; }
  KS_PASS=$(cat $BUILD/.ks-pass)
  cp $BUILD/app-unsigned.apk $BUILD/app-unaligned.apk
  (cd $BUILD/dex && zip -q -j ../app-unaligned.apk classes*.dex)
  $BT/zipalign -f 4 $BUILD/app-unaligned.apk $BUILD/app-aligned.apk
  $BT/apksigner sign --ks $KS --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
    --out $BUILD/PCRemote.apk $BUILD/app-aligned.apk
  $BT/apksigner verify --print-certs $BUILD/PCRemote.apk | head -4
  echo "APK: $(du -h $BUILD/PCRemote.apk | cut -f1)"
fi

echo "DONE: $STEP"
