# Codex Pocket trusted web

Static frontend only. Relay: https://47-111-86-38.sslip.io. Expected Pages path: /codex-pocket-trusted-web/. No credentials, chat history, Mac private keys, or backend source are included.

Publish GitHub Pages from the main branch and root directory. Configure the Pages URL on the Mac local trusted-device panel and add its exact origin to the relay's trustedOrigins. Sign in on the phone or iPad first, then choose "Pair this device", enter a fresh Mac-generated code or scan its QR within the pairing dialog, name the device, and approve the matching fingerprint locally on the Mac. Each new access device needs its own pairing; existing devices remain registered. Enable signature-only access on the Mac after checking the connection.

Pairing codes expire in five minutes and have 160 bits of randomness. The relay stores only an encrypted ticket and a domain-separated lookup digest; the code decrypts and pins the Mac identity locally.

The frontend hosting account and its publishing credentials must remain independent of the relay. Do not mirror this frontend onto the relay and treat it as the same protection.
