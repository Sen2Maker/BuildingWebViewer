#!/usr/bin/env bash
# Proposal. Discovery/validation only: no SDK/JDK install, license acceptance,
# Gradle execution, device connection, credentials, or external writes.
set -euo pipefail
fail() { printf 'NATIVE PREFLIGHT BLOCKED: %s\n' "$1" >&2; exit 3; }
project="${1:?pass the isolated native project root}"
[[ -n "${JAVA_HOME_21_X64:-}" ]] || fail 'JAVA_HOME_21_X64 is missing; do not install a JDK automatically.'
java_home="$JAVA_HOME_21_X64"
[[ -x "$java_home/bin/java" && -x "$java_home/bin/javac" && -r "$java_home/lib/ct.sym" ]] || fail 'A full preinstalled JDK 21 is required.'
[[ -n "${ANDROID_HOME:-}" ]] || fail 'ANDROID_HOME is missing; do not install an SDK automatically.'
sdk_home="$ANDROID_HOME"
[[ -r "$sdk_home/platforms/android-36/android.jar" ]] || fail 'Preinstalled android-36/android.jar is missing.'
[[ -r "$sdk_home/platforms/android-36/source.properties" ]] || fail 'Platform provenance is missing.'
[[ -x "$sdk_home/build-tools/36.0.0/aapt2" && -r "$sdk_home/build-tools/36.0.0/source.properties" ]] || fail 'Preinstalled build-tools 36.0.0 is missing.'
[[ "$($java_home/bin/javac -version 2>&1)" == 'javac 21.'* ]] || fail 'javac is not Java 21.'
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)' || fail 'Preinstalled Node >=22 is required; do not auto-install a replacement.'
python3 - "$project" "$sdk_home" <<'PY'
from pathlib import Path
import hashlib,sys
root=Path(sys.argv[1]);sdk=Path(sys.argv[2]);p=root/'mobile/android/gradle/wrapper/gradle-wrapper.properties'
def props(p):
 return dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
w=props(p)
assert w.get('distributionUrl')==r'https\://services.gradle.org/distributions/gradle-8.14.3-bin.zip','Unexpected Gradle distribution'
assert w.get('distributionSha256Sum')=='bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531','Missing/wrong Gradle distribution SHA256'
assert hashlib.sha256((p.parent/'gradle-wrapper.jar').read_bytes()).hexdigest()=='7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172','Wrapper JAR mismatch'
g=props(root/'mobile/android/gradle.properties')
assert g.get('android.builder.sdkDownload')=='false','SDK auto-download must be disabled in project properties'
assert g.get('org.gradle.java.installations.auto-download')=='false','JDK auto-download must be disabled in project properties'
assert props(sdk/'platforms/android-36/source.properties').get('AndroidVersion.ApiLevel')=='36','SDK platform mismatch'
assert props(sdk/'build-tools/36.0.0/source.properties').get('Pkg.Revision')=='36.0.0','Build-tools revision mismatch'
PY
printf '%s\n' "ImageOS=${ImageOS:-unknown}" "ImageVersion=${ImageVersion:-unknown}"
"$java_home/bin/java" -version
"$java_home/bin/javac" -version
"$sdk_home/build-tools/36.0.0/aapt2" version
node --version
npm --version
printf '%s\n' 'PREFLIGHT PASS only; Android compile/tests have NOT run.'
# Only the future hosted workflow writes these ephemeral environment files.
if [[ -n "${GITHUB_ENV:-}" && -n "${GITHUB_PATH:-}" ]]; then
  printf 'JAVA_HOME=%s\n' "$java_home" >> "$GITHUB_ENV"
  printf '%s/bin\n' "$java_home" >> "$GITHUB_PATH"
fi
