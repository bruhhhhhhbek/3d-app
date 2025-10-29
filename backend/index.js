// server.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import multer from "multer";
import { customAlphabet } from "nanoid";
import fs from "fs/promises";
import { query } from "./db.js";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);
const app = express();

// --- Middleware ---
app.use(express.json());
app.use(cookieParser());
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3001",
  })
);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(morgan(":method :url :status :response-time ms"));

// --- Folders ---
const assetsDir = path.join(__dirname, "assets"); // модели
const uploadsDir = path.join(__dirname, "uploads");
const qrDir = path.join(uploadsDir, "qrcodes"); // QR

(async () => {
  for (const dir of [assetsDir, uploadsDir, qrDir]) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (e) {
      console.error("Dir create error:", e);
    }
  }
})();
// Отдаём QR-коды напрямую
app.use(
  "/qrcodes",
  express.static(path.join(__dirname, "uploads/qrcodes"), {
    setHeaders: (res) => {
      res.header(
        "Access-Control-Allow-Origin",
        process.env.FRONTEND_ORIGIN || "http://localhost:3001"
      );
      res.header("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

// --- Static files ---
app.use(
  "/assets",
  express.static(assetsDir, {
    setHeaders: (res) => {
      res.header(
        "Access-Control-Allow-Origin",
        process.env.FRONTEND_ORIGIN || "http://localhost:3001"
      );
      res.header("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res) => {
      res.header(
        "Access-Control-Allow-Origin",
        process.env.FRONTEND_ORIGIN || "http://localhost:3001"
      );
      res.header("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

// --- Auth middleware ---
function privateRoute(req, res, next) {
  const token = req.cookies?.session_id;
  if (!token) return res.status(401).send({ error: "Unauthorized" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).send({ error: "Unauthorized" });
  }
}

// --- Multer setup ---
function createResourceId(req, res, next) {
  req.resourceId = nanoid();
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, assetsDir),
  filename: (req, file, cb) => {
    const id = req.resourceId || nanoid();
    cb(null, id + path.extname(file.originalname).toLowerCase());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".glb", ".gltf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext))
      return cb(new Error("Only .glb/.gltf allowed"));
    cb(null, true);
  },
});

// --- Upload route ---
app.post("/upload", [privateRoute, createResourceId, upload.single("file")], async (req, res) => {
  try {
    if (!req.file) return res.status(400).send({ message: "No file uploaded" });

    const { name, description } = req.body;
    const resourcePath = req.resourceId;
    const userId = 1;

    // путь к модели
    const filePath = `assets/${req.file.filename}`;

    // генерим QR-код
    const qrData = `${process.env.FRONTEND_ORIGIN}/${resourcePath}`;
    const qrFileName = `${resourcePath}.png`;
    const qrRelPath = `uploads/qrcodes/${qrFileName}`;
    const qrFullPath = path.join(qrDir, qrFileName);

    await QRCode.toFile(qrFullPath, qrData, {
      color: { dark: "#000", light: "#FFF" },
    });

    await query( `INSERT INTO assets (file_path, user_id, resource_path, name, description, qr_path) VALUES ($1, $2, $3, $4, $5, $6)`, [filePath, userId, resourcePath, name || req.file.originalname, description || "", qrRelPath]);

    res.status(201).send({ message: "ok", resource_path: resourcePath });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send({ message: "Upload error" });
  }
});

// --- Get all assets ---
app.get("/assets", async (req, res) => {
  try {
    const rows = await query(
      `SELECT name, description, resource_path, qr_path FROM assets ORDER BY id DESC`
    );
    res.send(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

// --- View model ---
app.get("/view/:resource_path", async (req, res) => {
  const { resource_path } = req.params;
  try {
    const rows = await query(
      `SELECT * FROM assets WHERE resource_path = '${resource_path}'`
    );
    if (!rows.length) return res.status(404).send("Not found");

    const fileName = path.basename(rows[0].file_path);
    const filePath = path.join(assetsDir, fileName);
    console.log("Serving model:", filePath);

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("sendFile error:", err);
        res.status(500).send("Error sending file");
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// --- Auth ---
app.post("/auth/google", async (req, res) => {
  try {
    if (!req.body?.token) return res.status(400).end();
    const { token } = req.body;
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`
    );
    if (!response.ok) return res.status(401).end();
    const payload = await response.json();
    if (payload.aud !== GOOGLE_CLIENT_ID) return res.status(401).end();

    const JWT_TOKEN = jwt.sign({ email: payload.email }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.cookie("session_id", JWT_TOKEN, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(201).send({
      name: payload.name,
      email: payload.email,
      profile_picture: payload.picture,
    });
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.get("/auth/me", (req, res) => {
  const token = req.cookies?.session_id;
  if (!token) return res.status(401).send({ authorized: false });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    res.send({ authorized: true, email: data.email });
  } catch {
    res.status(401).send({ authorized: false });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("session_id", { httpOnly: true, sameSite: "lax" });
  res.status(200).send({ message: "Logged out" });
});

app.get("/health", (req, res) =>
  res.send({ status: "ok", time: new Date().toISOString() })
);

// --- Start server ---
app.listen(PORT, "0.0.0.0", () =>
  console.info(`✅ Server running on http://localhost:${PORT}`)
);
