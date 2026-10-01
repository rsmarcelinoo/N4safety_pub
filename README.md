# N4Safety

> **Status: under active development.** Features, APIs and database schema may change without notice.

N4Safety is a personal safety system made of three parts:

- **Mobile app** (`safety-app/`): React Native + Expo. Users can trigger an SOS, manage their safety circles and view a risk heatmap.
- **Backend** (`backend/N4SafetyApi/`): ASP.NET Core 8 + PostgreSQL/PostGIS. It handles authentication and dispatches SOS alerts through push notifications, SMS and real-time location over SignalR.
- **Hardware dongle** (`backend/firmware/`): ESP32 BLE device whose physical button triggers an SOS from the paired phone.

## Running locally

```bash
# Database (PostgreSQL 16 + PostGIS)
PGUSER=postgres PGPASSWORD=postgres PGDATABASE=n4safety PGHOST=localhost ./backend/database/run_all.sh

# Backend (http://localhost:5000)
cd backend/N4SafetyApi && dotnet run

# Mobile app
cd safety-app
cp .env.example .env   # set EXPO_PUBLIC_API_URL to your machine's LAN IP
npm install
npx expo run:ios
```

The firmware is flashed from `backend/firmware/N4Safety_Dongle/N4Safety_Dongle.ino` with the Arduino IDE (board: ESP32 Dev Module).

See `backend/API_REFERENCE.md` for the API and `backend/N4SafetyApi.Tests/README.md` for the tests.

## License

Copyright © 2026 Rodrigo Marcelino. All rights reserved.

This software is the property of its author. The source code is published for viewing only. It may not be copied, modified, distributed or used for commercial purposes without the author's specific written authorisation.

## Contact

Questions or suggestions: **r.marcelino@campus.fct.unl.pt**
