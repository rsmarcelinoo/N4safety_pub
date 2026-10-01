/**
 * N4Safety — Guardian Sphere Dongle Firmware
 *
 * Hardware:  ESP32 DevKit V1 + Makerfabs LoRa Shield (post-pitch)
 * BLE UUIDs match safety-app/services/bleService.ts exactly.
 *
 * Protocol:
 *   App → Device  0x02  SOS triggered  → red LED on, green off
 *   App → Device  0x03  SOS cancelled  → green LED on, red off
 *   Device → App  0x01  Button held 3s → notify (triggers SOS in app)
 *
 * Wiring (Rodrigo soldered):
 *   BOOT button (GPIO0) — built-in on ESP32 DevKit, pulls LOW when pressed
 *   Red LED    anode → GPIO 25 (cathode → GND via 220Ω resistor)
 *   Green LED  anode → GPIO 26 (cathode → GND via 220Ω resistor)
 *   Common ground for both LEDs
 *
 * LoRa shield pins (set LORA_ENABLE=1 after wiring):
 *   SS=GPIO5, SCK=GPIO18, MOSI=GPIO23, MISO=GPIO19, RST=GPIO14, DIO0=GPIO4
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>

// ─── Pin Configuration ─────────────────────────────────────────────────────────
// Red LED on GPIO 25, Green LED on GPIO 26.
// BOOT button (GPIO0) is built-in on ESP32 DevKit V1.
#define PIN_RED_LED    25
#define PIN_GREEN_LED  26
#define PIN_BUTTON     0       // BOOT button — LOW when pressed
#define PIN_BTN_LED    2       // Built-in LED (blinks during pairing)

// ─── LoRa — set to 1 after wiring the shield ───────────────────────────────────
#define LORA_ENABLE    1

#if LORA_ENABLE
#include <SPI.h>
#include <LoRa.h>
#define LORA_SS   5
#define LORA_SCK  18
#define LORA_MOSI 23
#define LORA_MISO 19
#define LORA_RST  14
#define LORA_DIO0 4    // GPIO4 — matches physical wiring (IO4 → LoRa DI00)
#endif

// ─── BLE UUIDs (match bleService.ts exactly) ───────────────────────────────────
#define SERVICE_UUID        "A0B40000-0000-0000-0000-000000000001"
#define CHAR_SOS_UUID       "A0B40001-0000-0000-0000-000000000001"
#define DEVICE_NAME         "N4Safety-Shield"

// ─── Protocol constants ────────────────────────────────────────────────────────
#define CMD_SOS_BUTTON      0x01   // Device → App: hardware button triggered
#define CMD_SOS_TRIGGERED   0x02   // App → Device: SOS activated → red LED
#define CMD_SOS_CANCELLED   0x03   // App → Device: SOS cancelled → green LED

// ─── Button timing ─────────────────────────────────────────────────────────────
#define HOLD_MS             3000   // 3-second hold to trigger
#define DEBOUNCE_MS         50
#define LED_BLINK_INTERVAL  500    // ms for pairing indication

// ─── State ─────────────────────────────────────────────────────────────────────
static BLECharacteristic *pSosChar = nullptr;
static bool deviceConnected = false;
static bool sosActive       = false;   // tracks whether red LED should be on
static unsigned long btnPressStart = 0;
static int lastBtnState = HIGH;        // BOOT button pulls LOW
static bool btnNotified  = false;      // prevent duplicate 0x01 sends

// ─── Forward declarations ──────────────────────────────────────────────────────
void setLed(bool redOn, bool greenOn);
void handleButton();
void initLoRa();

// ─── BLE Callbacks ─────────────────────────────────────────────────────────────

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    deviceConnected = true;
    // Fast blink during connection, then solid green
    for (int i = 0; i < 4; i++) {
      digitalWrite(PIN_BTN_LED, HIGH);
      delay(80);
      digitalWrite(PIN_BTN_LED, LOW);
      delay(80);
    }
    setLed(false, true);  // green = connected and safe
  }

  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    digitalWrite(PIN_BTN_LED, LOW);
    // Keep red LED on if SOS was active — user must know the emergency is still live
    if (!sosActive) {
      setLed(false, false);
    }
    BLEDevice::startAdvertising();
  }
};

class SosCharCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    auto value = characteristic->getValue();
    if (value.length() == 0) return;

    uint8_t cmd = static_cast<uint8_t>(value[0]);
    switch (cmd) {
      case CMD_SOS_TRIGGERED:
        sosActive = true;
        setLed(true, false);    // red on, green off
        Serial.println("[SOS] Triggered via app — red LED on");
        break;

      case CMD_SOS_CANCELLED:
        sosActive = false;
        setLed(false, true);    // green on, red off
        Serial.println("[SOS] Cancelled via app — green LED on");
        break;

      default:
        Serial.printf("[BLE] Unknown command: 0x%02X\n", cmd);
        break;
    }
  }
};

// ─── LED control ───────────────────────────────────────────────────────────────
void setLed(bool redOn, bool greenOn) {
  digitalWrite(PIN_RED_LED,   redOn   ? HIGH : LOW);
  digitalWrite(PIN_GREEN_LED, greenOn ? HIGH : LOW);
}

// ─── Button handler ────────────────────────────────────────────────────────────
void handleButton() {
  int reading = digitalRead(PIN_BUTTON);
  unsigned long now = millis();

  if (reading == LOW && lastBtnState == HIGH) {
    // Press started
    btnPressStart = now;
    btnNotified   = false;
    delay(DEBOUNCE_MS);
  }

  if (reading == LOW && (now - btnPressStart >= HOLD_MS) && !btnNotified) {
    // 3-second hold completed — activate SOS unconditionally
    btnNotified = true;
    sosActive   = true;
    setLed(true, false);

    Serial.println("[SOS] Hardware button held 3s — SOS active");

    // Notify phone only if connected
    if (deviceConnected && pSosChar != nullptr) {
      uint8_t data[1] = { CMD_SOS_BUTTON };
      pSosChar->setValue(data, 1);
      pSosChar->notify();
      Serial.println("[SOS] BLE 0x01 sent to app");
    }

#if LORA_ENABLE
    LoRa.beginPacket();
    LoRa.print("SOS");
    LoRa.endPacket();
    Serial.println("[SOS] LoRa packet sent");
#endif
  }

  if (reading == HIGH && lastBtnState == LOW) {
    // Released before 3s — reset
    btnPressStart = 0;
    // Don't change LED state here; let app control it
    // But if no SOS is active, ensure green is on if connected
    if (!sosActive && deviceConnected) {
      setLed(false, true);
    }
    delay(DEBOUNCE_MS);
  }

  lastBtnState = reading;
}

// ─── LoRa init (stub until wired) ──────────────────────────────────────────────
void initLoRa() {
#if LORA_ENABLE
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(868E6)) {  // 868 MHz (EU)
    Serial.println("[LoRa] Init failed — check wiring");
  } else {
    Serial.println("[LoRa] Ready");
  }
#else
  Serial.println("[LoRa] Disabled — set LORA_ENABLE=1 after wiring");
#endif
}

// ─── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== N4Safety Dongle v1.0 ===");

  // Pins
  pinMode(PIN_RED_LED,   OUTPUT);
  pinMode(PIN_GREEN_LED, OUTPUT);
  pinMode(PIN_BUTTON,    INPUT_PULLUP);  // BOOT button
  pinMode(PIN_BTN_LED,   OUTPUT);

  setLed(false, false);
  digitalWrite(PIN_BTN_LED, LOW);

  // BLE
  BLEDevice::init(DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *svc = server->createService(SERVICE_UUID);

  pSosChar = svc->createCharacteristic(
    CHAR_SOS_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pSosChar->setCallbacks(new SosCharCallbacks());
  pSosChar->addDescriptor(new BLE2902());  // required for iOS notify

  svc->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);   // helps iOS connect faster
  adv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] Advertising as \"%s\"\n", DEVICE_NAME);
  Serial.printf("[BLE] Service  UUID: %s\n", SERVICE_UUID);
  Serial.printf("[BLE] Char SOS UUID: %s\n", CHAR_SOS_UUID);
  Serial.println("[BLE] Pair in app → Dongle Status → Scan & Connect");

  // Blink built-in LED slowly during advertising
  for (int i = 0; i < 6; i++) {
    digitalWrite(PIN_BTN_LED, HIGH);
    delay(200);
    digitalWrite(PIN_BTN_LED, LOW);
    delay(200);
  }

  initLoRa();
  Serial.println("=== Ready ===");
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  handleButton();
  delay(10);  // small yield for watchdog / BLE stack
}
