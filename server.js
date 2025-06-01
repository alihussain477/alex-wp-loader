import express from "express";
import multer from "multer";
import fs from "fs";
import { Boom } from "@hapi/boom";
import pino from "pino";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

const app = express();
const PORT = 3000;
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let sock;
let qrHTML = "<p>Waiting for QR Code...</p>";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrHTML = `<pre style="color:#00ff00">${qr}</pre>`;
    }
    if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    } else if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log("🔁 Reconnecting...");
        startSock();
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

await startSock();

app.get("/qr", (req, res) => {
  res.send(qrHTML);
});

app.post("/send", upload.single("messageFile"), async (req, res) => {
  const number = req.body.number;
  const header = req.body.header || "";
  const delayTime = parseInt(req.body.delay || "1") * 1000;

  if (!req.file || !fs.existsSync(req.file.path)) {
    return res.send("❌ Message file missing.");
  }

  const messages = fs.readFileSync(req.file.path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  try {
    for (const msg of messages) {
      const fullMsg = `${header} ${msg}`.trim();
      await sock.sendMessage(`${number}@s.whatsapp.net`, { text: fullMsg });
      console.log(`[✔] Sent: ${fullMsg}`);
      await delay(delayTime);
    }
    res.send("✅ All messages sent successfully.");
  } catch (err) {
    console.error("❌ Error while sending:", err);
    res.send("❌ Failed to send messages.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
