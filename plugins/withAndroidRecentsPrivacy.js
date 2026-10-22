const { withMainActivity } = require('expo/config-plugins');

const BEGIN_MARKER = '// @generated begin canto-recents-privacy';
const END_MARKER = '// @generated end canto-recents-privacy';
const ON_CREATE_SUPER = 'super.onCreate(null)';
const BUILD_IMPORT = 'import android.os.Build';
const WINDOW_MANAGER_IMPORT = 'import android.view.WindowManager';
const CLASS_ANCHOR = 'class MainActivity : ReactActivity() {';
const LEGACY_BEGIN = '// @generated begin canto-legacy-recents-guard';
const LEGACY_END = '// @generated end canto-legacy-recents-guard';

// Android 12 and below have no setRecentsScreenshotEnabled, and the in-app
// cover renders too late for the recents snapshot. Hold FLAG_SECURE while
// paused instead, leaving it alone when the user's "Block screenshots"
// setting already set it.
const LEGACY_BLOCK = `  ${LEGACY_BEGIN}
  private var cantoRecentsSecureAdded = false

  override fun onPause() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU &&
        (window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE) == 0) {
      window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      cantoRecentsSecureAdded = true
    }
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    if (cantoRecentsSecureAdded) {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      cantoRecentsSecureAdded = false
    }
  }
  ${LEGACY_END}
`;

// Android 13+ (API 33) can withhold the recents thumbnail without blocking
// screenshots. Older versions rely on the in-app privacy cover, or on
// FLAG_SECURE when the user enables "Block screenshots".
const RECENTS_PRIVACY_BLOCK = `    ${BEGIN_MARKER}
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      setRecentsScreenshotEnabled(false)
    }
    ${END_MARKER}`;

function addImport(contents, line) {
  if (contents.includes(line)) return contents;
  const packageLine = contents.match(/^package [^\n]+\n/);
  if (!packageLine) {
    throw new Error(
      'Unable to configure Android recents privacy: MainActivity has no package line.',
    );
  }
  return contents.replace(packageLine[0], `${packageLine[0]}${line}\n`);
}

function applyLegacyRecentsPrivacy(contents) {
  const count = contents.split(LEGACY_BEGIN).length - 1;
  if (count === 1 && contents.includes(LEGACY_END)) return contents;
  if (count > 1) {
    throw new Error(
      `Unable to configure Android recents privacy: expected at most one legacy block, found ${count}.`,
    );
  }
  if (/override fun on(Pause|Resume)\(/.test(contents)) {
    throw new Error(
      'Unable to configure Android recents privacy: MainActivity already overrides onPause/onResume.',
    );
  }
  const anchors = contents.split(CLASS_ANCHOR).length - 1;
  if (anchors !== 1) {
    throw new Error(
      `Unable to configure Android recents privacy: expected one MainActivity class declaration, found ${anchors}.`,
    );
  }
  const next = contents.replace(CLASS_ANCHOR, `${CLASS_ANCHOR}\n${LEGACY_BLOCK}`);
  return addImport(next, WINDOW_MANAGER_IMPORT);
}

function applyRecentsPrivacy(contents) {
  return applyLegacyRecentsPrivacy(applyModernRecentsPrivacy(contents));
}

function applyModernRecentsPrivacy(contents) {
  const beginCount = contents.split(BEGIN_MARKER).length - 1;
  if (beginCount === 1 && contents.includes(END_MARKER)) return contents;
  if (beginCount > 1) {
    throw new Error(
      `Unable to configure Android recents privacy: expected at most one generated block, found ${beginCount}.`,
    );
  }
  const superCalls = contents.split(ON_CREATE_SUPER).length - 1;
  if (superCalls !== 1) {
    throw new Error(
      `Unable to configure Android recents privacy: expected one MainActivity ${ON_CREATE_SUPER} call, found ${superCalls}.`,
    );
  }

  const next = contents.replace(ON_CREATE_SUPER, `${ON_CREATE_SUPER}\n${RECENTS_PRIVACY_BLOCK}`);
  return addImport(next, BUILD_IMPORT);
}

function withAndroidRecentsPrivacy(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('Unable to configure Android recents privacy: MainActivity must be Kotlin.');
    }
    mod.modResults.contents = applyRecentsPrivacy(mod.modResults.contents);
    return mod;
  });
}

module.exports = withAndroidRecentsPrivacy;
module.exports.applyRecentsPrivacy = applyRecentsPrivacy;
