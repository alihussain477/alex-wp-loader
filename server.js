import express from "express";
import multer from "multer";
import fs from "fs";
import { Boom } from "@hapi/boom";
import baileys from '@whiskeysockets/baileys'
const { makeWASocket } = baileys
import pino from "pino";

const app = express();
const PORT = 3000;
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

let sock;
let qrHTML = "<p>Waiting for QR Code...</p>";

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  sock = makeWASocket({
    version: await fetchLatestBaileysVersion().then(v => v.version),
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrHTML = `<pre style="color:#0f0">${qr}</pre>`;
    }
    if (connection === "open") console.log("✅ Connected to WhatsApp");
    if (connection === "close" && lastDisconnect?.error instanceof Boom) {
      const shouldReconnect = lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startSock();
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

await startSock();

app.get("/qr", (req, res) => res.send(qrHTML));

app.post("/send", upload.single("messageFile"), async (req, res) => {
  const number = req.body.number;
  const header = req.body.header;
  const delayTime = parseInt(req.body.delay) * 1000;
  const messages = fs.readFileSync(req.file.path, "utf-8").split("\n").filter(Boolean);

  try {
    for (let msg of messages) {
      const fullMsg = `${header} ${msg}`;
      await sock.sendMessage(`${number}@s.whatsapp.net`, { text: fullMsg });
      console.log(`[✔] Sent: ${fullMsg}`);
      await delay(delayTime);
    }
    res.send("✅ Messages Sent Successfully.");
  } catch (err) {
    console.log("❌ Error:", err);
    res.send("❌ Failed to send messages.");
  }
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
