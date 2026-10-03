const { getDefaultConfig } = require("expo/metro-config");
const defaultConfig = getDefaultConfig(__dirname);
defaultConfig.resolver.assetExts.push("cjs");
/* Fix: Enable package exports for Firebase v9+ modular support to correctly resolve sub-modules like /app and /auth */
defaultConfig.resolver.unstable_enablePackageExports = true;
module.exports = defaultConfig;
