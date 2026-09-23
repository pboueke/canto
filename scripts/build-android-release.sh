#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ANDROID_BUILD_ENV_FILE:-$REPO_ROOT/android_build.env}"
if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$REPO_ROOT/$ENV_FILE"
fi

fail() {
  printf 'Android release build error: %s\n' "$1" >&2
  exit 1
}

[[ -f "$ENV_FILE" ]] || fail "environment file not found: $ENV_FILE (copy android_build.env.example first)"
# Export sourced values because Gradle reads signing credentials through System.getenv.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ -n "${KEYSTORE_PASSWORD:-}" ]] || fail 'KEYSTORE_PASSWORD is required'
[[ -n "${KEY_PASSWORD:-}" ]] || fail 'KEY_PASSWORD is required'

KEYSTORE_PATH="${ANDROID_KEYSTORE_PATH:-$REPO_ROOT/upload-keystore.jks}"
if [[ "$KEYSTORE_PATH" != /* ]]; then
  KEYSTORE_PATH="$REPO_ROOT/$KEYSTORE_PATH"
fi
[[ -f "$KEYSTORE_PATH" ]] || fail "keystore not found: $KEYSTORE_PATH"

# Expo config evaluation requires an explicit mode; release builds default to production.
export NODE_ENV="${NODE_ENV:-production}"

cd "$REPO_ROOT"
printf 'Generating a clean Android project from tracked Expo configuration...\n'
npx expo prebuild --clean --platform android --no-install

GENERATED_KEYSTORE="$REPO_ROOT/android/app/upload-keystore.jks"
cp "$KEYSTORE_PATH" "$GENERATED_KEYSTORE"
trap 'rm -f "$GENERATED_KEYSTORE"' EXIT

MAIN_APPLICATION="$REPO_ROOT/android/app/src/main/java/com/boueke/canto/MainApplication.kt"
BUILD_GRADLE="$REPO_ROOT/android/app/build.gradle"
GRADLE_PROPERTIES="$REPO_ROOT/android/gradle.properties"
PROGUARD_RULES="$REPO_ROOT/android/app/proguard-rules.pro"
ARCHIVE_DIRECTORY="$REPO_ROOT/android/app/src/main/java/com/boueke/canto"

[[ -f "$ARCHIVE_DIRECTORY/CantoArchiveModule.kt" ]] || fail 'generated CantoArchiveModule.kt is missing'
[[ -f "$ARCHIVE_DIRECTORY/CantoArchivePackage.kt" ]] || fail 'generated CantoArchivePackage.kt is missing'
[[ -f "$MAIN_APPLICATION" ]] || fail 'generated MainApplication.kt is missing'
[[ "$(grep -Fc 'add(CantoArchivePackage())' "$MAIN_APPLICATION")" -eq 1 ]] ||
  fail 'MainApplication.kt must register CantoArchivePackage() exactly once'

BUILD_GRADLE_PATH="$BUILD_GRADLE" PROGUARD_RULES_PATH="$PROGUARD_RULES" node <<'NODE'
const fs = require('node:fs');
const { applyReleaseSigningConfig } = require('./plugins/withReleaseSigningConfig');
const {
  applyOptimizingProguardConfig,
  upsertExpoRecordConverterKeepRule,
} = require('./plugins/withAndroidReleaseOptimization');

const buildGradle = fs.readFileSync(process.env.BUILD_GRADLE_PATH, 'utf8');
if (applyReleaseSigningConfig(buildGradle) !== buildGradle) {
  throw new Error('generated release signing configuration is not structurally idempotent');
}
if (applyOptimizingProguardConfig(buildGradle) !== buildGradle) {
  throw new Error('generated release R8 configuration is not structurally idempotent');
}
const rules = fs.readFileSync(process.env.PROGUARD_RULES_PATH, 'utf8');
if (upsertExpoRecordConverterKeepRule(rules) !== rules) {
  throw new Error('generated ProGuard rules are missing the Expo Record converter rule');
}
NODE

grep -Fq 'signingConfig signingConfigs.release' "$BUILD_GRADLE" ||
  fail 'release buildType does not use the release signing config'
grep -Fq 'storePassword System.getenv("KEYSTORE_PASSWORD")' "$BUILD_GRADLE" ||
  fail 'release signing does not read KEYSTORE_PASSWORD from the environment'
grep -Fq 'keyPassword System.getenv("KEY_PASSWORD")' "$BUILD_GRADLE" ||
  fail 'release signing does not read KEY_PASSWORD from the environment'
# The narrow Expo Record converter rule passed the isolated R8 probe.
# Resource shrinking remains a separate change pending Play-installed validation.
grep -Fq 'android.enableMinifyInReleaseBuilds=true' "$GRADLE_PROPERTIES" ||
  fail 'release R8 minification must be enabled'
grep -Fq 'android.enableShrinkResourcesInReleaseBuilds=false' "$GRADLE_PROPERTIES" ||
  fail 'release resource shrinking must remain disabled for this candidate'
grep -Fq -- '-keep class expo.modules.kotlin.records.RecordTypeConverter* { *; }' "$PROGUARD_RULES" ||
  fail 'release Expo Record converter rule is missing'
grep -Fq 'minifyEnabled enableMinifyInReleaseBuilds' "$BUILD_GRADLE" ||
  fail 'release buildType does not consume the minification property'
grep -Fq 'shrinkResources enableShrinkResources.toBoolean()' "$BUILD_GRADLE" ||
  fail 'release buildType does not consume the resource-shrinking property'
grep -Fq 'getDefaultProguardFile("proguard-android-optimize.txt")' "$BUILD_GRADLE" ||
  fail 'release buildType does not use the optimizing ProGuard baseline'
EXPECTED_VERSION_NAME="$(node -p "require('./app.json').expo.version")"
EXPECTED_VERSION_CODE="$(node -p "require('./app.json').expo.android.versionCode")"
grep -Fq "versionName \"$EXPECTED_VERSION_NAME\"" "$BUILD_GRADLE" ||
  fail "generated Android versionName is not $EXPECTED_VERSION_NAME"
grep -Eq "versionCode[[:space:]]+$EXPECTED_VERSION_CODE([[:space:]]|$)" "$BUILD_GRADLE" ||
  fail "generated Android versionCode is not $EXPECTED_VERSION_CODE"

JAVA_NATIVE_ACCESS_OPTION='--enable-native-access=ALL-UNNAMED'
if [[ " ${JAVA_TOOL_OPTIONS:-} " != *" $JAVA_NATIVE_ACCESS_OPTION "* ]]; then
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }$JAVA_NATIVE_ACCESS_OPTION"
fi

printf 'Building R8-optimized release bundle with JDK 25 native access enabled...\n'
(
  cd "$REPO_ROOT/android"
  ./gradlew bundleRelease
)

AAB_PATH="$REPO_ROOT/android/app/build/outputs/bundle/release/app-release.aab"
MAPPING_PATH="$REPO_ROOT/android/app/build/outputs/mapping/release/mapping.txt"
[[ -s "$AAB_PATH" ]] || fail "release AAB was not produced at $AAB_PATH"
[[ -s "$MAPPING_PATH" ]] || fail "R8 mapping file was not produced at $MAPPING_PATH"
jarsigner -verify "$AAB_PATH" >/dev/null 2>&1 || fail "release AAB signature verification failed: $AAB_PATH"

printf '\nAndroid release build completed.\n'
printf 'AAB: %s\n' "$AAB_PATH"
