// Stub for react-native-ble-plx — used in Expo Go where native BLE isn't available.
// The real package requires a dev build (npx expo run:ios).
// All methods are no-ops; the app works without the dongle.
const noop = () => {};
const noopAsync = () => Promise.resolve();

class BleManager {
  state() { return Promise.resolve('Unknown'); }
  startDeviceScan() {}
  stopDeviceScan() {}
  destroy() {}
}

module.exports = {
  BleManager,
  State: { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff', Unknown: 'Unknown' },
};
