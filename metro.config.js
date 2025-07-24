const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// ✅ Add support for .cjs and .mjs extensions
config.resolver.sourceExts.push('cjs', 'mjs');

// ✅ Prevent Metro from misreading newer Firebase SDKs
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
