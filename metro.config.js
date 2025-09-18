const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// ✅ Add support for .cjs and .mjs extensions
config.resolver.sourceExts.push('cjs', 'mjs');

// ✅ Prevent Metro from misreading newer Firebase SDKs
config.resolver.unstable_enablePackageExports = false;

// ✅ Configure for Replit - allow all hosts for proxy
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    return (req, res, next) => {
      // Allow all origins for Replit proxy
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return middleware(req, res, next);
    };
  }
};

module.exports = config;
