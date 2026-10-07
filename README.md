# 🖥️ PC Remote — Local Network PC Control & File Transfer

Control your PC from your phone's browser and move files back and forth —
**over your own Wi-Fi or the PC's hotspot, with no cloud, no account, and no
permanent installation.**

```
Phone → same Wi-Fi / PC hotspot → browser → PC local server
```

Open the PC's address on your phone, scan the QR code (or enter the PIN),
and you get a file manager, a remote screen, a touchpad mouse, and a keyboard.

---

## ✨ Features

**Files**
- Browse only the folders you explicitly share (Pictures / Videos / Documents / Downloads by default)
- Download photos, videos, documents — streamed, with HTTP range support (resume-friendly)
- Download any folder as a streamed ZIP
- Upload from the phone: multiple files, progress bars, cancel, retry, duplicate renaming (`file (1).jpg`)
- Create / rename / delete files & folders (per-folder permissions: read · upload · delete)
- Search inside shared folders (`*.jpg`, `resume.pdf` — substring or `*`/`?` globs)
- Image preview, in-browser video/audio streaming (no full download first), file info
- PC storage overview (drive usage bars)

**Remote control**
- Live PC screen over WebSocket (JPEG, adaptive fps, quality presets: Low / Balanced / High / Ultra)
- Touchpad: move, tap = left click, two-finger tap = right click, double-tap = double click, two-finger slide = scroll, drag mode
- Virtual keyboard: text input, ESC/TAB/arrows/F1–F12, holdable CTRL/ALT/SHIFT/WIN, one-tap shortcuts (Ctrl+C, Alt+Tab, Win+D, Task Manager…), volume & media keys
- Tap directly on the screen view to click

**Connection**
- QR-code pairing (one-time token, 5-minute expiry), 6-digit PIN, or both
- Connection status 🟢🟡🔴, latency via heartbeat, auto-reconnect with backoff
- Live transfer-speed readout (measured during transfers)
- Multiple devices: see who's connected, revoke one, or disconnect all
- PWA: "Add to Home Screen" for an app-like experience (optional)
- mDNS advertisement (`pc-remote.local`) when the optional dependency is installed — IP address always works as fallback

**Security**
- PIN generated fresh on every start; never stored anywhere
- Sessions: random 256-bit tokens, 24 h expiry, revocable
- 5 wrong PINs → 15-minute lockout per address (brute-force protection)
- All filesystem access confined to shared folders; traversal (`../`, `..\`, absolute paths, drive letters, UNC, null bytes) rejected and tested
- No arbitrary command execution — the browser can only move the mouse, press keys, and touch shared files
- Binds to the LAN by default; never phones home; works with the internet off
- On-PC audit log of connections, downloads, uploads, renames, deletes, remote sessions

---

## 🚀 Quick start (Windows 10/11)

1. Install **Node.js LTS** from https://nodejs.org (needed once; the app itself installs nothing permanently).
2. Copy the `pc-remote` folder to the PC and **double-click `start.bat`**.
   - First run installs dependencies automatically.
   - For remote mouse/keyboard/screen on Windows, also run once:
     `npm install @nut-tree/nut-js screenshot-desktop` (optional but recommended).
3. The terminal shows everything you need:

```
==============================================
           PC REMOTE SERVER
==============================================
  PC Name:       SUNNY-PC

  Local address (open on your phone):
    http://192.168.1.105:8080

  PIN:           4 8 2 9 1 3

  [ QR CODE ]
  ...
```

### Connect your phone (Android & iPhone)

**Option A — automatic discovery (Android app)**
1. Connect your phone to the **same Wi-Fi** as the PC (or the PC's hotspot, USB tethering, or Bluetooth tethering — all of these are local IP networks).
2. Open the **PC Remote** app — the PC appears under "📡 PCs on this network". Tap it.
3. Enter the PIN shown on the PC. Done — no typing IP addresses.

**Option B — QR code**
1. Same network as the PC.
2. Scan the QR code in the PC terminal with your phone camera (or the in-app scanner).
3. Your browser/app opens already paired. Done.

**Option C — PIN / manual**
1. Same network as the PC.
2. Open `http://192.168.1.105:8080` (use the address from the terminal) and enter the 6-digit PIN.

### Using the PC's mobile hotspot (no router needed)

1. On the PC: **Settings → Network & internet → Mobile hotspot** → turn it **On**.
2. Connect your phone to that hotspot Wi-Fi network.
3. `start.bat` prints the hotspot address (usually `192.168.137.1:8080`) — scan the QR / enter the PIN as above.
4. Works with **no internet at all** — the hotspot is just a local network.

### iPhone notes
- Same steps as Android; everything runs in Safari.
- For the smoothest experience use **Add to Home Screen** from the Share menu.

---

## 📁 Sharing folders

Default shares are your `Pictures`, `Videos`, `Documents`, and `Downloads`
(only ones that exist). Change them in **Settings → Shared folders → ＋ Add**
by typing the folder path on the PC, or edit `~/.pc-remote/config.json`:

```json
{
  "port": 8080,
  "sharedFolders": [
    { "id": "pics", "name": "Pictures", "path": "C:\\Users\\Sunny\\Pictures",
      "perms": { "read": true, "upload": true, "del": false } }
  ]
}
```

Permissions per folder: `read` (browse/download), `upload` (upload/create/rename),
`del` (delete). The phone can never see anything outside these folders.

---

## 🖱️ Remote control guide

- **Screen tab** — pick a quality, press Start. Lower quality = smoother on weak Wi-Fi.
- **Mouse tab** — the touchpad. Adjust *Pointer speed* to taste. DRAG mode for drag-and-drop.
- **Keys tab** — type into the box and hit Send; tap modifiers (CTRL/ALT/SHIFT) to hold them, tap again to release.
- Rotate the phone to landscape for a bigger screen view.

### If remote control says "not available"
The file features always work. Mouse/keyboard/screen need the optional native
drivers on the PC (they talk to the real OS, which a browser alone cannot do):

```
npm install @nut-tree/nut-js screenshot-desktop
```

then restart `start.bat`. This is a documented limitation, not a bug —
see *Technical honesty* below.

---

## 🔒 Security precautions

- **Keep the PIN private.** Anyone on your Wi-Fi with the PIN (or a photo of the QR) can access your shared folders.
- **Regenerate the PIN** (Settings → Security) after guests leave; it disconnects everyone.
- The server listens on your **local network only** — do not port-forward it to the internet.
- Downloads from `<img>`/`<video>` tags carry the session token in the URL (browsers can't set headers there). On a trusted home LAN this is acceptable; don't use it on hostile public Wi-Fi.
- Review **Settings → Activity log** to see what connected devices did.

---

## 🧯 Troubleshooting

| Problem | Fix |
|---|---|
| Phone can't reach `http://…:8080` | Phone must be on the **same** Wi-Fi/hotspot. No VPN on either side. |
| "Could not reach the PC" | Server still running? Address changed? Re-check the terminal banner. |
| Windows Firewall blocks it | Run `scripts\allow-firewall.ps1` **as Administrator** (creates one inbound rule for the port, Private networks only — it does not disable the firewall). Or manually: Windows Security → Firewall & network protection → Allow an app through firewall. |
| PIN locked out | 5 wrong tries → 15-min lockout. Wait, or restart the server for a fresh PIN. |
| Remote says "not available" | Install the optional drivers (above) and restart. |
| Video won't play | Only browser-native formats stream in-page (mp4/webm/ogv); others download instead. |
| Port 8080 in use | `set PC_REMOTE_PORT=8090` before `start.bat`, or edit the config. |
| Big download stalls | Use the direct browser download (automatic for files > 200 MB) and keep the phone awake. |

---

## 🏗️ Project structure

```
pc-remote/
├── server/
│   ├── index.js          # startup, banner, QR, mDNS
│   ├── routes.js         # HTTP API
│   ├── ws.js             # WebSocket protocol v1
│   ├── static.js         # serves the built web client
│   ├── public/           # prebuilt client (built once, shipped as-is)
│   └── lib/
│       ├── auth.js       # PIN, sessions, pairing tokens, rate limiting
│       ├── paths.js      # traversal-proof path resolution
│       ├── files.js      # streaming file ops
│       ├── remote.js     # mouse/keyboard (optional nut-js)
│       ├── screen.js     # screenshots (optional screenshot-desktop)
│       ├── config.js     # ~/.pc-remote/config.json
│       ├── net.js        # LAN address detection
│       └── audit.js      # activity log
├── client/               # React + TypeScript + Vite + Tailwind (PWA)
├── shared/protocol/      # protocol v1 spec
├── scripts/allow-firewall.ps1
├── tests/run.js          # 52 automated tests (npm test)
├── start.bat / start.sh
└── package.json
```

### API (all `/api/*` except status/auth need `Authorization: Bearer <token>`)

```
GET  /api/status            POST /api/auth {pin, deviceName}
POST /api/auth/pair         GET  /api/shares
GET  /api/files?share=&path=            GET /api/files/info
GET  /api/files/download    (Range ✓)   GET /api/files/stream (inline, Range ✓)
GET  /api/files/zip         PUT  /api/files/upload?share=&dir=&name=
POST /api/files/mkdir       POST /api/files/rename   DELETE /api/files
GET  /api/files/search      GET  /api/storage
POST /api/control/mouse     POST /api/control/keyboard
GET  /api/screen/shot       GET  /api/devices
POST /api/devices/:id/revoke  POST /api/devices/disconnect-all
POST /api/security/regenerate-pin      GET /api/audit
GET/PUT /api/settings
WS   /ws  (protocol v1 — see shared/protocol/protocol.md)
```

### Rebuilding the web client (optional)

The client is prebuilt into `server/public/`, so the PC never builds anything.
To rebuild after editing `client/`:

```
cd client && npm install && npm run build
```

### Portable single-file build (optional)

```
npx pkg server/index.js --targets node18-win-x64 --output PCRemote.exe
```

Copy `PCRemote.exe` + `server/public/` to the PC and run. Closing it stops
everything — no services, drivers, or background processes are installed.

---

## 🧪 Testing

`npm test` runs **52 automated tests**, all passing:

- **Security:** 10 traversal payloads rejected (`../../`, `..\`, `/etc/passwd`, drive letters, UNC, null bytes…); unauthenticated → 401; 5 bad PINs → 429 lockout; pairing tokens single-use; expired sessions rejected; audit log never contains tokens
- **Files:** list ordering, byte-identical download, `Range` → 206 with correct `Content-Range`, 20 MB streamed end-to-end, upload bytes on disk, duplicate renaming, mkdir/rename/delete, glob + substring search, ZIP magic bytes
- **WebSocket:** non-JSON / wrong-version / unknown-type messages get error replies and the socket survives; unauthenticated sockets are closed; keyboard without the driver returns an honest `EUNSUPPORTED`

**What was NOT tested yet (needs real hardware):**
screen capture, mouse/keyboard injection, and the phone UX were implemented
against documented driver APIs but **not verified on a real Windows PC or
Android phone** in this build environment. Before calling it done, run the
checklist: same-Wi-Fi connect, hotspot connect, internet-off transfer,
large-file transfer, video streaming, image preview, mouse, keyboard,
remote screen, reconnect after Wi-Fi drop, multi-device, and Windows Firewall.

## Technical honesty

Per the project rules: nothing here is faked. If the optional drivers are
missing, remote features report "not available" instead of pretending.
The screen shows real captures or nothing at all. Every file listed comes
from the real filesystem.
