/* eslint-env node */
/* global require, process, __dirname */

const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Load env vars from repo root (default) and ensure server/.env also applies
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { MongoClient, ObjectId } = require("mongodb");
const Groq = require("groq-sdk");

const {
  PORT = 3001,
  DB_USER,
  DB_PASS,
  DB_CLUSTER,
  DB_NAME = "BillManagementDB",
  GROQ_API_KEY,
  GROQ_MODEL = "llama-3.3-70b-versatile",
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  JWT_SECRET = "your-secret-key-change-in-production",
  JWT_EXPIRES_IN = "7d",
} = process.env;

if (!DB_USER || !DB_PASS || !DB_CLUSTER) {
  console.warn(
    "Missing one or more MongoDB env variables (DB_USER, DB_PASS, DB_CLUSTER). Ensure they are set before starting the server.",
  );
}

const encodedPassword = encodeURIComponent(DB_PASS || "");
const MONGO_URI =
  process.env.MONGO_URI ||
  `mongodb+srv://${DB_USER}:${encodedPassword}@${DB_CLUSTER}/${DB_NAME}?retryWrites=true&w=majority`;
const safeMongoUri = MONGO_URI.replace(encodedPassword, "<hidden>");
console.log("MongoDB URI:", safeMongoUri);

const groqClient =
  GROQ_API_KEY && GROQ_API_KEY.trim().length > 0
    ? new Groq({ apiKey: GROQ_API_KEY })
    : null;

const emailEnabled = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS;
const mailFrom =
  SMTP_FROM || `SmartBills <${SMTP_USER || "no-reply@smartbills.com"}>`;
const mailTransporter = emailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      requireTLS: Number(SMTP_PORT) === 587,
    })
  : null;

if (!emailEnabled) {
  console.warn(
    "SMTP email is disabled. Set SMTP_HOST/PORT/USER/PASS to enable invoice emails.",
  );
}

async function sendInvoiceEmail(payload) {
  if (!mailTransporter) {
    return { sent: false, reason: "SMTP not configured" };
  }

  const {
    email,
    username,
    billTitle,
    billCategory,
    providerName,
    amount,
    paymentDate,
    paymentMethod,
    transactionId,
    cardLast4,
    address,
  } = payload;

  const formattedAmount = `৳${Number(amount || 0).toFixed(2)}`;
  const invoiceId = transactionId || `TXN-${Date.now()}`;
  const paymentSummary = {
    Bill: billTitle || "N/A",
    Category: billCategory || "N/A",
    Provider: providerName || "N/A",
    Amount: formattedAmount,
    Method: paymentMethod || "N/A",
    "Card Last 4": cardLast4 ? `**** ${cardLast4}` : "N/A",
    Date: paymentDate || new Date().toISOString().split("T")[0],
    "Transaction ID": invoiceId,
  };

  const summaryRows = Object.entries(paymentSummary)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">${label}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;">${value}</td></tr>`,
    )
    .join("");

  const mailOptions = {
    from: mailFrom,
    to: email,
    subject: `Payment Receipt - ${billTitle || "SmartBills Invoice"}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:auto;color:#111827;">
        <h2 style="color:#059669;">SmartBills Payment Receipt</h2>
        <p>Hello ${username || "Customer"},</p>
        <p>We received your payment successfully. Here are the invoice details:</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">${summaryRows}</table>
        ${address ? `<p><strong>Billing Address:</strong> ${address}</p>` : ""}
        <p>If you have questions, reply to this email or contact support@smartbills.com.</p>
        <p style="margin-top:24px;">— SmartBills Team</p>
      </div>
    `,
  };

  await mailTransporter.sendMail(mailOptions);
  return { sent: true };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const SYSTEM_PROMPT = `You are SmartBills AI, a proactive bill-management assistant. Keep answers concise (under 120 words) and actionable. Always reference the user's data when available. Offer 3 follow-up suggestions separated by new lines when asked.`;

const collections = {};
let mongoClient;

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
}

// Middleware to check admin role
function authorizeAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

async function initDatabase() {
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);

  collections.providers = db.collection("providers");
  collections.bills = db.collection("bills");
  collections.subscriptions = db.collection("subscriptions");
  collections.myBills = db.collection("myBills");
  collections.payments = db.collection("payments");
  collections.chatLogs = db.collection("chatLogs");
  collections.users = db.collection("users");
  collections.reviews = db.collection("reviews");

  console.log(`Connected to MongoDB database: ${DB_NAME}`);
}

function sanitizeHistory(history = []) {
  return history
    .filter((item) => item && item.role && item.content)
    .map((item) => ({
      role: item.role,
      content: String(item.content).slice(0, 500),
    }))
    .slice(-5);
}

async function buildUserContext(email) {
  if (!email || !collections.myBills) return null;
  const [recentBills, subscriptions] = await Promise.all([
    collections.myBills
      .find({ email })
      .sort({ date: -1 })
      .limit(5)
      .project({ username: 1, amount: 1, date: 1, title: 1 })
      .toArray(),
    collections.subscriptions.find({ email }).limit(5).toArray(),
  ]);

  if (recentBills.length === 0 && subscriptions.length === 0) return null;

  return `User email: ${email}\nRecent bills: ${recentBills
    .map(
      (bill) =>
        `${bill.title || bill.username || "Bill"} - ৳${bill.amount} on ${
          bill.date
        }`,
    )
    .join("; ")}\nSubscriptions: ${subscriptions
    .map((sub) => `${sub.providerName || sub.providerId}`)
    .join(", ")}`;
}

function generateSuggestions() {
  return [
    "Show my upcoming bills",
    "Summarize my spending this month",
    "Remind me before due dates",
  ];
}

function filterByTimeframe(items, timeframe) {
  if (timeframe === "all") return items;
  const days = Number(timeframe);
  if (!Number.isFinite(days) || days <= 0) return items;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return items.filter((item) => {
    const date = item.date ? new Date(item.date) : null;
    return date && !Number.isNaN(date.getTime()) && date >= cutoff;
  });
}

app.get("/", (req, res) => {
  res.json({ message: "SmartBills API is running", docs: "/health" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ========== AUTHENTICATION ROUTES ==========

app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, photoURL, role = "user" } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });
    }

    // Check if user already exists
    const existingUser = await collections.users.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User already exists with this email" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      name,
      email,
      password: hashedPassword,
      photoURL: photoURL || null,
      role: role === "admin" ? "user" : role, // Prevent self-assignment of admin
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await collections.users.insertOne(user);

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertedId, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: result.insertedId,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("POST /auth/register error", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await collections.users.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("POST /auth/login error", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// ========== USER PROFILE ROUTES ==========

app.get("/users/profile", authenticateToken, async (req, res) => {
  try {
    const user = await collections.users.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } },
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("GET /users/profile error", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put("/users/profile", authenticateToken, async (req, res) => {
  try {
    const { name, photoURL, phone, address, bio } = req.body || {};

    const updates = {
      updatedAt: new Date().toISOString(),
    };

    if (name) updates.name = name;
    if (photoURL !== undefined) updates.photoURL = photoURL;
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (bio !== undefined) updates.bio = bio;

    await collections.users.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: updates },
    );

    const updatedUser = await collections.users.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } },
    );

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("PUT /users/profile error", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.get("/providers", async (req, res) => {
  try {
    const {
      type,
      search,
      sort = "name",
      order = "asc",
      page = "1",
      limit = "12",
    } = req.query;

    const filter = {};
    if (type && type !== "All") filter.type = type;

    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { zone: { $regex: search, $options: "i" } },
      ];
    }

    const sortOrder = order === "desc" ? -1 : 1;
    const sortOptions = { [sort]: sortOrder };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [providers, total] = await Promise.all([
      collections.providers
        .find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      collections.providers.countDocuments(filter),
    ]);

    res.json({
      providers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /providers error", error);
    res.status(500).json({ error: "Failed to load providers" });
  }
});

app.get("/providers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const provider = await collections.providers.findOne({
      _id: new ObjectId(id),
    });
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    res.json(provider);
  } catch (error) {
    console.error("GET /providers/:id error", error);
    res.status(500).json({ error: "Failed to load provider details" });
  }
});

app.post("/providers", authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const {
      name,
      type,
      description,
      pricing,
      coverage,
      website,
      logo,
      billingType,
      paymentMethod,
      zone,
      lateFeePolicy,
      hotline,
      supportEmail,
      address,
    } = req.body || {};

    if (!name || !type) {
      return res.status(400).json({ error: "Name and type are required" });
    }

    const provider = {
      name,
      type,
      description: description || "",
      pricing: pricing || "",
      coverage: coverage || "",
      website: website || "",
      logo: logo || "",
      billingType: billingType || "Monthly",
      paymentMethod: paymentMethod || "",
      zone: zone || "",
      lateFeePolicy: lateFeePolicy || "",
      hotline: hotline || "",
      supportEmail: supportEmail || "",
      address: address || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await collections.providers.insertOne(provider);
    res.status(201).json({
      success: true,
      provider: { ...provider, _id: result.insertedId },
    });
  } catch (error) {
    console.error("POST /providers error", error);
    res.status(500).json({ error: "Failed to create provider" });
  }
});

app.put(
  "/providers/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};

      const existing = await collections.providers.findOne({
        _id: new ObjectId(id),
      });

      if (!existing) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const updateDoc = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await collections.providers.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateDoc },
      );

      const updated = await collections.providers.findOne({
        _id: new ObjectId(id),
      });

      res.json({ success: true, provider: updated });
    } catch (error) {
      console.error("PUT /providers/:id error", error);
      res.status(500).json({ error: "Failed to update provider" });
    }
  },
);

app.delete(
  "/providers/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await collections.providers.findOne({
        _id: new ObjectId(id),
      });

      if (!existing) {
        return res.status(404).json({ error: "Provider not found" });
      }

      await collections.providers.deleteOne({ _id: new ObjectId(id) });
      res.json({ success: true, deletedId: id });
    } catch (error) {
      console.error("DELETE /providers/:id error", error);
      res.status(500).json({ error: "Failed to delete provider" });
    }
  },
);

app.get("/bills", async (req, res) => {
  try {
    const {
      category,
      search,
      minAmount,
      maxAmount,
      location,
      sort = "date",
      order = "desc",
      page = "1",
      limit = "12",
    } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (location) filter.location = { $regex: location, $options: "i" };

    // Search functionality
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Price range filter
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = Number(minAmount);
      if (maxAmount) filter.amount.$lte = Number(maxAmount);
    }

    const sortOrder = order === "desc" ? -1 : 1;
    const sortOptions = { [sort]: sortOrder };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [bills, total] = await Promise.all([
      collections.bills
        .find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      collections.bills.countDocuments(filter),
    ]);

    res.json({
      bills,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /bills error", error);
    res.status(500).json({ error: "Failed to load bills" });
  }
});

app.get("/bills/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const bill = await collections.bills.findOne({ _id: new ObjectId(id) });
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch (error) {
    console.error("GET /bills/:id error", error);
    res.status(500).json({ error: "Failed to load bill details" });
  }
});

app.post("/bills", authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const {
      title,
      category,
      amount,
      location,
      date,
      dueDate,
      description,
      image,
      providerId,
    } = req.body || {};

    if (!title || !category || !amount) {
      return res
        .status(400)
        .json({ error: "Title, category, and amount are required" });
    }

    const bill = {
      title,
      category,
      amount: Number(amount),
      location: location || "",
      date: date || new Date().toISOString().split("T")[0],
      dueDate: dueDate || "",
      description: description || "",
      image: image || "",
      providerId: providerId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await collections.bills.insertOne(bill);
    res.status(201).json({
      success: true,
      bill: { ...bill, _id: result.insertedId },
    });
  } catch (error) {
    console.error("POST /bills error", error);
    res.status(500).json({ error: "Failed to create bill" });
  }
});

app.put("/bills/:id", authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    const existing = await collections.bills.findOne({
      _id: new ObjectId(id),
    });

    if (!existing) {
      return res.status(404).json({ error: "Bill not found" });
    }

    if (updates.amount) {
      updates.amount = Number(updates.amount);
    }

    const updateDoc = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await collections.bills.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc },
    );

    const updated = await collections.bills.findOne({
      _id: new ObjectId(id),
    });

    res.json({ success: true, bill: updated });
  } catch (error) {
    console.error("PUT /bills/:id error", error);
    res.status(500).json({ error: "Failed to update bill" });
  }
});

app.delete(
  "/bills/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await collections.bills.findOne({
        _id: new ObjectId(id),
      });

      if (!existing) {
        return res.status(404).json({ error: "Bill not found" });
      }

      await collections.bills.deleteOne({ _id: new ObjectId(id) });
      res.json({ success: true, deletedId: id });
    } catch (error) {
      console.error("DELETE /bills/:id error", error);
      res.status(500).json({ error: "Failed to delete bill" });
    }
  },
);

app.get("/bills/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "6", 10);
    const bills = await collections.bills
      .find({})
      .sort({ date: -1 })
      .limit(limit)
      .toArray();
    res.json(bills);
  } catch (error) {
    console.error("GET /bills/recent error", error);
    res.status(500).json({ error: "Failed to load recent bills" });
  }
});

app.get("/recent-bills", async (req, res) => {
  try {
    const bills = await collections.bills
      .find({})
      .sort({ date: -1, createdAt: -1 })
      .limit(6)
      .toArray();
    res.json(bills);
  } catch (error) {
    console.error("GET /recent-bills error", error);
    res.status(500).json({ error: "Failed to load recent bills" });
  }
});

app.get("/subscriptions", async (req, res) => {
  try {
    const { email } = req.query;
    const filter = email ? { email } : {};
    const subs = await collections.subscriptions.find(filter).toArray();
    res.json(subs);
  } catch (error) {
    console.error("GET /subscriptions error", error);
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

app.post("/subscriptions", async (req, res) => {
  try {
    const { email, providerId } = req.body || {};
    if (!email || !providerId) {
      return res
        .status(400)
        .json({ error: "email and providerId are required" });
    }

    const provider = await collections.providers.findOne({
      _id: new ObjectId(providerId),
    });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const existing = await collections.subscriptions.findOne({
      email,
      providerId,
    });
    if (existing) {
      return res
        .status(200)
        .json({ message: "Already subscribed", insertedId: existing._id });
    }

    const doc = {
      email,
      providerId,
      providerName: provider.name,
      type: provider.type,
      status: "active",
      subscribedAt: new Date().toISOString(),
    };

    const result = await collections.subscriptions.insertOne(doc);
    res.status(201).json({ success: true, insertedId: result.insertedId });
  } catch (error) {
    console.error("POST /subscriptions error", error);
    res.status(500).json({ error: "Failed to create subscription" });
  }
});

app.get("/mybills", authenticateToken, async (req, res) => {
  try {
    const {
      search,
      category,
      minAmount,
      maxAmount,
      sort = "date",
      order = "desc",
      page = "1",
      limit = "10",
    } = req.query;

    const filter = { email: req.user.email };

    if (category) filter.category = category;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = Number(minAmount);
      if (maxAmount) filter.amount.$lte = Number(maxAmount);
    }

    const sortOrder = order === "desc" ? -1 : 1;
    const sortOptions = { [sort]: sortOrder };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [bills, total] = await Promise.all([
      collections.myBills
        .find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      collections.myBills.countDocuments(filter),
    ]);

    res.json({
      bills,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /mybills error", error);
    res.status(500).json({ error: "Failed to load bills" });
  }
});

app.get("/payments", async (req, res) => {
  try {
    const { email, status, limit = 50 } = req.query;
    const filter = {};

    if (email) filter.email = email;
    if (status) filter.status = status;

    const payments = await collections.payments
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .toArray();

    res.json(payments);
  } catch (error) {
    console.error("GET /payments error", error);
    res.status(500).json({ error: "Failed to load payments" });
  }
});

app.post("/mybills", authenticateToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const email = req.user.email;

    const doc = {
      ...payload,
      email,
      amount: Number(payload.amount) || 0,
      date: payload.date || new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await collections.myBills.insertOne(doc);
    res
      .status(201)
      .json({ success: true, item: { ...doc, _id: result.insertedId } });
  } catch (error) {
    console.error("POST /mybills error", error);
    res.status(500).json({ error: "Failed to create bill" });
  }
});

app.put("/mybills/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const email = req.user.email;

    const existing = await collections.myBills.findOne({
      _id: new ObjectId(id),
    });
    if (!existing) return res.status(404).json({ error: "Bill not found" });
    if (existing.email !== email)
      return res.status(403).json({ error: "Not authorized for this bill" });

    const updateDoc = {
      ...updates,
      email: existing.email,
      amount: Number(updates.amount ?? existing.amount) || existing.amount,
      updatedAt: new Date().toISOString(),
    };

    await collections.myBills.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc },
    );
    const refreshed = await collections.myBills.findOne({
      _id: new ObjectId(id),
    });
    res.json({ success: true, item: refreshed });
  } catch (error) {
    console.error("PUT /mybills/:id error", error);
    res.status(500).json({ error: "Failed to update bill" });
  }
});

app.delete("/mybills/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    const existing = await collections.myBills.findOne({
      _id: new ObjectId(id),
    });
    if (!existing) return res.status(404).json({ error: "Bill not found" });
    if (existing.email !== email)
      return res.status(403).json({ error: "Not authorized for this bill" });

    await collections.myBills.deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("DELETE /mybills/:id error", error);
    res.status(500).json({ error: "Failed to delete bill" });
  }
});

app.post("/payments/complete", async (req, res) => {
  try {
    const payload = req.body || {};
    const requiredFields = [
      "email",
      "username",
      "billTitle",
      "amount",
      "paymentMethod",
    ];
    const missing = requiredFields.filter((field) => !payload[field]);
    if (missing.length) {
      return res
        .status(400)
        .json({ error: `Missing fields: ${missing.join(", ")}` });
    }

    const amountValue = Number(payload.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res
        .status(400)
        .json({ error: "amount must be a positive number" });
    }

    const nowIso = new Date().toISOString();
    const doc = {
      ...payload,
      amount: amountValue,
      status: payload.status || "completed",
      paymentDate: payload.paymentDate || nowIso.split("T")[0],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await collections.payments.insertOne(doc);

    let emailStatus = { sent: false, reason: "SMTP not configured" };
    if (mailTransporter) {
      try {
        await sendInvoiceEmail(doc);
        emailStatus = { sent: true };
      } catch (mailError) {
        console.error("Invoice email error:", mailError);
        emailStatus = { sent: false, reason: mailError.message };
      }
    }

    res.json({
      success: true,
      message: emailStatus.sent
        ? "Payment recorded and invoice emailed."
        : "Payment recorded. Failed to send invoice email.",
      emailStatus,
    });
  } catch (error) {
    console.error("POST /payments/complete error", error);
    res.status(500).json({ error: "Failed to log payment" });
  }
});

app.post("/ai/chat", async (req, res) => {
  try {
    const { message, email, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    if (!groqClient) {
      return res.json({
        response:
          "AI assistant is offline because GROQ_API_KEY is not set on the server. Please ask the admin to configure it.",
        suggestions: generateSuggestions(),
      });
    }

    const messages = [{ role: "system", content: SYSTEM_PROMPT }];
    const context = await buildUserContext(email);
    if (context) {
      messages.push({ role: "system", content: context });
    }
    messages.push(...sanitizeHistory(history));
    messages.push({ role: "user", content: message });

    const completion = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.4,
      messages,
      max_tokens: 300,
    });

    const reply =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "I'm here to help with your bills.";

    await collections.chatLogs.insertOne({
      email: email || "anonymous",
      userMessage: message,
      aiResponse: reply,
      createdAt: new Date(),
    });

    res.json({ response: reply, suggestions: generateSuggestions() });
  } catch (error) {
    console.error("POST /ai/chat error", error);
    res
      .status(500)
      .json({ error: "Failed to process chat", details: error.message });
  }
});

// ========== DASHBOARD ANALYTICS ROUTES ==========

app.get("/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;

    const [totalBills, totalPayments, totalSubscriptions, recentBills] =
      await Promise.all([
        collections.myBills.countDocuments({ email }),
        collections.payments.countDocuments({ email }),
        collections.subscriptions.countDocuments({ email }),
        collections.myBills
          .find({ email })
          .sort({ date: -1 })
          .limit(5)
          .toArray(),
      ]);

    const totalSpent = await collections.myBills
      .aggregate([
        { $match: { email } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray();

    const categoryStats = await collections.myBills
      .aggregate([
        { $match: { email } },
        {
          $group: {
            _id: "$category",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ])
      .toArray();

    const monthlyStats = await collections.myBills
      .aggregate([
        { $match: { email } },
        {
          $group: {
            _id: { $substr: ["$date", 0, 7] },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ])
      .toArray();

    res.json({
      overview: {
        totalBills,
        totalPayments,
        totalSubscriptions,
        totalSpent: totalSpent[0]?.total || 0,
      },
      categoryStats,
      monthlyStats: monthlyStats.reverse(),
      recentBills,
    });
  } catch (error) {
    console.error("GET /dashboard/stats error", error);
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

app.get(
  "/dashboard/admin/stats",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    try {
      const [totalUsers, totalBills, totalPayments, totalProviders] =
        await Promise.all([
          collections.users.countDocuments(),
          collections.myBills.countDocuments(),
          collections.payments.countDocuments(),
          collections.providers.countDocuments(),
        ]);

      const totalRevenue = await collections.payments
        .aggregate([
          { $match: { status: "completed" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      const recentUsers = await collections.users
        .find()
        .sort({ createdAt: -1 })
        .limit(10)
        .project({ password: 0 })
        .toArray();

      const categoryDistribution = await collections.myBills
        .aggregate([
          {
            $group: {
              _id: "$category",
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
        ])
        .toArray();

      const monthlyRevenue = await collections.payments
        .aggregate([
          { $match: { status: "completed" } },
          {
            $group: {
              _id: { $substr: ["$paymentDate", 0, 7] },
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 12 },
        ])
        .toArray();

      res.json({
        overview: {
          totalUsers,
          totalBills,
          totalPayments,
          totalProviders,
          totalRevenue: totalRevenue[0]?.total || 0,
        },
        categoryDistribution,
        monthlyRevenue: monthlyRevenue.reverse(),
        recentUsers,
      });
    } catch (error) {
      console.error("GET /dashboard/admin/stats error", error);
      res.status(500).json({ error: "Failed to load admin stats" });
    }
  },
);

// ========== REVIEWS AND RATINGS ROUTES ==========

app.get("/reviews", async (req, res) => {
  try {
    const { providerId } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: "providerId is required" });
    }

    const reviews = await collections.reviews
      .find({ providerId })
      .sort({ createdAt: -1 })
      .toArray();

    const avgRating = reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    res.json({
      reviews,
      summary: {
        totalReviews: reviews.length,
        averageRating: avgRating.toFixed(1),
      },
    });
  } catch (error) {
    console.error("GET /reviews error", error);
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

app.post("/reviews", authenticateToken, async (req, res) => {
  try {
    const { providerId, rating, comment } = req.body || {};

    if (!providerId || !rating) {
      return res
        .status(400)
        .json({ error: "providerId and rating are required" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const user = await collections.users.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { name: 1, photoURL: 1 } },
    );

    const review = {
      providerId,
      userId: req.user.userId,
      userName: user?.name || "Anonymous",
      userPhoto: user?.photoURL || null,
      rating: Number(rating),
      comment: comment || "",
      createdAt: new Date().toISOString(),
    };

    const result = await collections.reviews.insertOne(review);

    res.status(201).json({
      success: true,
      review: { ...review, _id: result.insertedId },
    });
  } catch (error) {
    console.error("POST /reviews error", error);
    res.status(500).json({ error: "Failed to create review" });
  }
});

app.delete("/reviews/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const review = await collections.reviews.findOne({
      _id: new ObjectId(id),
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (review.userId !== req.user.userId && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this review" });
    }

    await collections.reviews.deleteOne({ _id: new ObjectId(id) });

    res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("DELETE /reviews/:id error", error);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

app.post("/ai/insights", async (req, res) => {
  try {
    const { email, timeframe = "90" } = req.body || {};
    const filter = email ? { email } : {};
    const bills = await collections.myBills.find(filter).toArray();
    const scoped = filterByTimeframe(bills, timeframe);

    const totalSpent = scoped.reduce(
      (sum, bill) => sum + (Number(bill.amount) || 0),
      0,
    );
    const grouped = scoped.reduce((acc, bill) => {
      const key = bill.category || bill.title || "General";
      acc[key] = (acc[key] || 0) + (Number(bill.amount) || 0);
      return acc;
    }, {});

    const recentPayments = [...scoped]
      .sort(
        (a, b) =>
          new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt),
      )
      .slice(0, 5);

    let aiSummary = null;
    if (groqClient && scoped.length > 0) {
      try {
        const completion = await groqClient.chat.completions.create({
          model: GROQ_MODEL,
          temperature: 0.4,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Provide a bullet summary (max 3 bullets) of this spending data: total ৳${totalSpent.toFixed(
                2,
              )}, categories ${JSON.stringify(
                grouped,
              )}, timeframe ${timeframe} days.`,
            },
          ],
        });
        aiSummary = completion?.choices?.[0]?.message?.content?.trim() || null;
      } catch (aiError) {
        console.warn("AI insights summary failed:", aiError.message);
      }
    }

    res.json({
      timeframe,
      summary: {
        billCount: scoped.length,
        totalSpent,
        byCategory: grouped,
        recentPayments,
      },
      ai:
        aiSummary ||
        (!groqClient
          ? "AI summary is unavailable because GROQ_API_KEY is not configured on the server."
          : null),
    });
  } catch (error) {
    console.error("POST /ai/insights error", error);
    res.status(500).json({ error: "Failed to generate insights" });
  }
});

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`SmartBills API listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

start();
