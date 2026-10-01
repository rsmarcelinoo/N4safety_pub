/**
 * BLE SERVICE
 *
 * Connects the mobile app to the N4Safety-Shield ESP32 dongle over Bluetooth.
 *
 * Protocol (confirmed working with Rodrigo's hardware):
 *   App   → Device  0x02  SOS triggered  → red LED on
 *   App   → Device  0x03  SOS cancelled  → green LED on
 *   Device → App   0x01  Hardware button held 3s (future — FW-1)
 *
 * UUIDs must match the firmware exactly:
 *   SERVICE_UUID  = A0B40000-0000-0000-0000-000000000001
 *   CHAR_SOS_UUID = A0B40001-0000-0000-0000-000000000001
 *
 * Usage:
 *   bleService.scanAndConnect()          — call on dongle status screen
 *   bleService.writeSosState('triggered') — call on SOS trigger
 *   bleService.subscribeToDongleState(cb) — wire to home screen widget
 *
 * Requires: react-native-ble-plx (expo dev build only, not Expo Go)
 */

// react-native-ble-plx: install before building — npx expo install react-native-ble-plx
// Types are stubbed as any until the package is installed.
 
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
let _ble: any = null;
function getBle() {
  if (!_ble) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _ble = require('react-native-ble-plx');
  }
   
  return _ble;
}
 
type Device = any;

export const BLE_SERVICE_UUID  = 'A0B40000-0000-0000-0000-000000000001';
export const BLE_CHAR_SOS_UUID = 'A0B40001-0000-0000-0000-000000000001';
export const BLE_DEVICE_NAME   = 'N4Safety-Shield';
const DONGLE_ID_KEY = 'n4safety_dongle_id_v1';
const RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000] as const;

export type DongleState = {
  connected:    boolean;
  batteryLevel: number | null;
  lastSeenAt:   number | null;    // Unix ms
  deviceId:     string | null;
};

// ─── Module-level singletons ──────────────────────────────────────────────────

 
let _manager: any = null;
 
function getManager() { return _manager ??= new (getBle().BleManager)(); }

let _device:         Device | null = null;
let _reconnecting                  = false;
let _state: DongleState = { connected: false, batteryLevel: null, lastSeenAt: null, deviceId: null };

const _stateListeners = new Set<(s: DongleState) => void>();
const _sosListeners   = new Set<() => void>();

// ─── Internal helpers ─────────────────────────────────────────────────────────

function emit(patch: Partial<DongleState>): void {
  _state = { ..._state, ...patch };
  _stateListeners.forEach((cb) => cb(_state));
}

async function saveLastDongleId(id: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DONGLE_ID_KEY, id);
  } catch {}
}

async function readLastDongleId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DONGLE_ID_KEY);
  } catch {
    return null;
  }
}

async function clearLastDongleId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DONGLE_ID_KEY);
  } catch { /* ignore */ }
}

async function connectToDevice(device: Device): Promise<void> {
    try {
      _device = await device.connect({ timeout: 8_000, refreshGatt: 'always' });
      _device = await _device.discoverAllServicesAndCharacteristics();

      emit({ connected: true, lastSeenAt: Date.now(), deviceId: _device.id ?? null });
      if (_device.id) await saveLastDongleId(_device.id);

      // Ensure we don't leak listeners
      _device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_SOS_UUID,
        (err: Error | null, char: any) => {
          if (err) {
              console.error('[BLE] Monitoring error:', err);
              return;
          }
          if (char?.value) {
              const byte = Buffer.from(char.value, 'base64')[0];
              if (byte === 0x01) _sosListeners.forEach((cb) => cb());
          }
        },
      );

      _device.onDisconnected((err: any, dev: any) => {
        console.log('[BLE] Disconnected', err);
        _device = null;
        emit({ connected: false });
        void autoReconnectToStoredDongle();
      });
    } catch (error) {
      console.error('[BLE] Connection failed:', error);
      _device = null;
      throw error;
    }
  }

async function reconnectWithBackoff(connect: () => Promise<void>): Promise<boolean> {
  for (const delayMs of RECONNECT_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      await connect();
      return true;
    } catch {}
  }
  return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans for N4Safety-Shield and connects. Resolves when connected and
 * characteristic subscription is established. Rejects after 12 seconds
 * if the device isn't found.
 *
 * Automatically reconnects on disconnection.
 */
export async function scanAndConnect(preferredDeviceId?: string): Promise<void> {
   
  const btState = await getManager().state();
   
  if (btState !== getBle().State.PoweredOn) {
    throw new Error('Bluetooth is not enabled. Enable it in Settings and try again.');
  }

  // Android requires location permissions for BLE scan
  if (Platform.OS === 'android') {
    // expo-location handles this — caller must have already requested it
    // react-native-ble-plx handles the BLUETOOTH_SCAN/CONNECT permissions itself
  }

  if (preferredDeviceId) {
    const known = await getManager().connectToDevice(preferredDeviceId, { timeout: 8_000 });
    await connectToDevice(known);
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const scanTimeout = setTimeout(() => {
      getManager().stopDeviceScan();
      reject(new Error('N4Safety-Shield not found. Make sure the dongle is powered on.'));
    }, 12_000);

    getManager().startDeviceScan(null, { allowDuplicates: false }, async (error: Error | null, device: Device | null) => {
      if (error) {
        clearTimeout(scanTimeout);
        reject(error);
        return;
      }
      if (!device || device.name !== BLE_DEVICE_NAME) return;

      clearTimeout(scanTimeout);
      getManager().stopDeviceScan();

      try {
        await connectToDevice(device);
        resolve();
      } catch (e) {
        _device = null;
        reject(e);
      }
    });
  });
}

/**
 * Writes the SOS state to the ESP32.
 * 0x02 → red LED on  (SOS active)
 * 0x03 → green LED on (idle/cancelled)
 *
 * Fails silently if not connected — app works without dongle.
 */
export async function writeSosState(state: 'triggered' | 'cancelled'): Promise<void> {
  if (!_device) return;

  try {
    const byte = state === 'triggered' ? 0x02 : 0x03;
    const data = Buffer.from([byte]).toString('base64');
    await _device.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      BLE_CHAR_SOS_UUID,
      data,
    );
  } catch {
    // Device might have disconnected mid-write — reconnect will handle it
    emit({ connected: false });
    _device = null;
    void autoReconnectToStoredDongle();
  }
}

/**
 * Subscribe to hardware SOS button events (0x01 notification from device).
 * This will trigger when Rodrigo wires the physical button in FW-1.
 */
export function subscribeToHardwareSOS(cb: () => void): () => void {
  _sosListeners.add(cb);
  return () => { _sosListeners.delete(cb); };
}

/**
 * Subscribe to dongle connection state changes.
 * The callback is called immediately with the current state.
 */
export function subscribeToDongleState(cb: (state: DongleState) => void): () => void {
  _stateListeners.add(cb);
  cb(_state);   // emit current state immediately
  return () => { _stateListeners.delete(cb); };
}

export function getState(): DongleState { return _state; }
export function getBleStatus(): DongleState { return _state; }

export async function autoReconnectToStoredDongle(): Promise<boolean> {
  if (_device) return true;
  if (_reconnecting) return false;

  const knownId = await readLastDongleId();
  if (!knownId) return false;

  _reconnecting = true;
  try {
    try {
      await scanAndConnect(knownId);
      return true;
    } catch {}
    return reconnectWithBackoff(() => scanAndConnect(knownId));
  } finally {
    _reconnecting = false;
  }
}

export async function disconnect(forget = false): Promise<void> {
  if (_device) {
    await _device.cancelConnection().catch(() => {});
    _device = null;
  }
  emit({ connected: false, deviceId: null });
  if (forget) await clearLastDongleId();
}
