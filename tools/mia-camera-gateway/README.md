# MIA Windows built-in camera gateway (test only)

This is a loopback-only Node.js gateway for an explicitly user-triggered single still frame. It is not a continuous recorder, face-recognition service, or physical-world calibration system.

## Requirements

- Windows 10/11
- Node.js 20+ (Node 22 recommended)
- Chrome or Edge
- The isolated Supabase test project `zee-prediction`
- A test-project API secret key (never the production key)

## First run and source registration

From PowerShell in the repository root:

```powershell
node .\tools\mia-camera-gateway\server.mjs
```

On first run, the gateway creates `tools/mia-camera-gateway/device.local.json` with a local Ed25519 keypair and prints the source UUID, key ID, and public key. The private key stays on this computer. Never upload, paste, or commit `device.local.json`.

Before capture, register the printed public key in the **test** project's private `mia_test` schema. Use the SQL template in `docs/mia-windows-camera-enrollment.sql`, replacing only the three clearly marked values with the locally printed source ID, key ID, and public key. Register only this test device and allow only `windows-camera-image-plane-v1`. Do not add a coordinate-frame mapping: the first image is intentionally uncalibrated.

After registration, stop the gateway and restart it with these PowerShell session variables set:

```powershell
$secure = Read-Host "zee-prediction test API secret key" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:MIA_TEST_SUPABASE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
node .\tools\mia-camera-gateway\server.mjs
```

Open `http://127.0.0.1:8787` in Chrome. On the first run, the browser will ask for camera permission. Click **开启摄像头** to preview. Preview stays local. Click **采集并发送一帧** only when ready to upload one still frame.

## Limits and security

- Gateway binds only to `127.0.0.1`; it rejects non-loopback hosts.
- Browser never receives the Supabase API secret or the Ed25519 private key.
- A single JPEG is reduced to 320×240 and capped at 40 KiB; signed JSON is capped at 64 KiB.
- No audio, video recording, continuous upload, facial identity recognition, or automatic action.
- Frame coordinates are image-pixel coordinates, not world coordinates. No scene mapping or physical measurement is asserted.
- The ingress signature proves the registered gateway key signed the exact payload envelope; it does not prove camera hardware integrity or the truth of depicted content.
- The first test writes only to `zee-prediction.mia_test`. It must not target production `zee-extension`.
- Remove the local private-key file only after revoking the corresponding test source/key in the database.

## Verification

```powershell
node --test .\tools\mia-camera-gateway\server.test.mjs
```
