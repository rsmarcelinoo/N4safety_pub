const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Native-only packages that crash Expo Go at import time.
// resolveRequest overrides installed packages (extraNodeModules only works as fallback).
// Only apply stubs in Expo Go mode (EXPO_GO_MODE=true).
// In dev builds (npx expo run:ios), stubs are disabled so real native modules load.
const EXPO_GO_MODE = process.env.EXPO_GO_MODE === 'true';

const EXPO_GO_STUBS = {
  'react-native-ble-plx':                      path.resolve(__dirname, 'stubs/react-native-ble-plx.js'),
  '@maplibre/maplibre-react-native':           path.resolve(__dirname, 'stubs/maplibre-react-native.js'),
};

if (EXPO_GO_MODE) {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (EXPO_GO_STUBS[moduleName]) {
      return { filePath: EXPO_GO_STUBS[moduleName], type: 'sourceFile' };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
