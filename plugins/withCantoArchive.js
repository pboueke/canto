const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const ARCHIVE_SOURCE_FILES = ['CantoArchiveModule.kt', 'CantoArchivePackage.kt'];
const PACKAGE_REGISTRATION = 'add(CantoArchivePackage())';
const PACKAGE_LIST_ANCHOR = 'PackageList(this).packages.apply {';
const PACKAGE_REGISTRATION_ANCHOR = `${PACKAGE_LIST_ANCHOR}\n          ${PACKAGE_REGISTRATION}`;

function registerCantoArchivePackage(contents) {
  const registrationCount = contents.split(PACKAGE_REGISTRATION).length - 1;
  if (registrationCount === 1 && contents.includes(PACKAGE_REGISTRATION_ANCHOR)) return contents;
  if (registrationCount === 1) {
    throw new Error(
      'Unable to register CantoArchive: package registration exists outside the expected PackageList block.',
    );
  }
  if (registrationCount > 1) {
    throw new Error(
      `Unable to register CantoArchive: expected at most one package registration, found ${registrationCount}.`,
    );
  }
  if (!contents.includes(PACKAGE_LIST_ANCHOR)) {
    throw new Error(
      'Unable to register CantoArchive: expected Expo PackageList application anchor was not found.',
    );
  }

  return contents.replace(
    PACKAGE_LIST_ANCHOR,
    `${PACKAGE_LIST_ANCHOR}\n          ${PACKAGE_REGISTRATION}`,
  );
}

function syncCantoArchiveSources({ projectRoot, platformProjectRoot, packageName }) {
  if (!packageName) {
    throw new Error('Unable to install CantoArchive: expo.android.package is required.');
  }

  const canonicalDirectory = path.join(projectRoot, 'native', 'canto-archive');
  const packageDirectory = path.join(
    platformProjectRoot,
    'app',
    'src',
    'main',
    'java',
    ...packageName.split('.'),
  );
  const mainApplicationPath = path.join(packageDirectory, 'MainApplication.kt');

  if (!fs.existsSync(mainApplicationPath)) {
    throw new Error(
      `Unable to install CantoArchive: generated MainApplication.kt was not found at ${mainApplicationPath}.`,
    );
  }

  fs.mkdirSync(packageDirectory, { recursive: true });
  for (const filename of ARCHIVE_SOURCE_FILES) {
    const sourcePath = path.join(canonicalDirectory, filename);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        `Unable to install CantoArchive: canonical source is missing at ${sourcePath}.`,
      );
    }
    fs.copyFileSync(sourcePath, path.join(packageDirectory, filename));
  }

  const mainApplication = fs.readFileSync(mainApplicationPath, 'utf8');
  fs.writeFileSync(mainApplicationPath, registerCantoArchivePackage(mainApplication));
}

function withCantoArchive(config) {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      syncCantoArchiveSources({
        projectRoot: mod.modRequest.projectRoot,
        platformProjectRoot: mod.modRequest.platformProjectRoot,
        packageName: mod.android?.package,
      });
      return mod;
    },
  ]);
}

module.exports = withCantoArchive;
module.exports.registerCantoArchivePackage = registerCantoArchivePackage;
module.exports.syncCantoArchiveSources = syncCantoArchiveSources;
