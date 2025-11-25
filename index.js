/* eslint-env node */
/* global require, process, __dirname */

const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

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
} = process.env;

if (!DB_USER || !DB_PASS || !DB_CLUSTER) {
  console.warn(
    "Missing one or more MongoDB env variables (DB_USER, DB_PASS, DB_CLUSTER). Ensure they are set before starting the server."
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
    "SMTP email is disabled. Set SMTP_HOST/PORT/USER/PASS to enable invoice emails."
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
        `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">${label}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;">${value}</td></tr>`
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

const providerIds = {
  electricity: new ObjectId(),
  gas: new ObjectId(),
  water: new ObjectId(),
  internet: new ObjectId(),
};

const providerSeed = [
  {
    _id: providerIds.electricity,
    name: "Dhaka Electric Supply Co.",
    type: "Electricity",
    description:
      "Reliable residential and commercial electricity service across Dhaka.",
    pricing: "৳8.25 per KWh (residential average)",
    coverage: "Dhaka North & East zones",
    website: "https://www.desco.org.bd",
    logo: "https://i.ibb.co/M6RJF8N/electric.png",
    billingType: "Monthly",
    paymentMethod: "Card, Mobile Wallet, Bank",
    zone: "Gulshan, Banani, Uttara",
    lateFeePolicy: "2% after due date",
    hotline: "+880-9666-222-555",
    supportEmail: "support@desco.org.bd",
    address: "House 22/B, Road 12, Nikunja-2, Dhaka",
    createdAt: new Date(),
  },
  {
    _id: providerIds.gas,
    name: "Titas Gas Transmission",
    type: "Gas",
    description: "Natural gas distribution for households and industries.",
    pricing: "৳975 per double-burner connection",
    coverage: "Dhaka, Gazipur, Narayanganj",
    website: "https://www.titasgas.org.bd",
    logo: "https://i.ibb.co/mcb3Y7x/gas.png",
    billingType: "Bi-monthly",
    paymentMethod: "Bank, Mobile Wallet",
    zone: "City-wide",
    lateFeePolicy: "৳50 fixed surcharge",
    hotline: "+880-9666-777-888",
    supportEmail: "care@titasgas.com",
    address: "105 Kazi Nazrul Islam Ave, Dhaka",
    createdAt: new Date(),
  },
  {
    _id: providerIds.water,
    name: "DWASA",
    type: "Water",
    description: "Dhaka Water Supply & Sewerage Authority services.",
    pricing: "৳15 per 1000 liters (residential)",
    coverage: "Dhaka Metro",
    website: "https://www.dwasa.org.bd",
    logo: "https://i.ibb.co/Z1fgnYt/water.png",
    billingType: "Monthly",
    paymentMethod: "Bank, Mobile Wallet",
    zone: "All zones",
    lateFeePolicy: "1.5% monthly",
    hotline: "+880-9611-666-777",
    supportEmail: "info@dwasa.org.bd",
    address: "98 Kazi Nazrul Islam Ave, Dhaka",
    createdAt: new Date(),
  },
  {
    _id: providerIds.internet,
    name: "AmberNet Broadband",
    type: "Internet",
    description: "High-speed internet for home and SME.",
    pricing: "৳1,200 for 80 Mbps",
    coverage: "Dhaka city",
    website: "https://www.ambernet.com.bd",
    logo: "https://i.ibb.co/HHzttFJ/internet.png",
    billingType: "Monthly",
    paymentMethod: "Card, Mobile Wallet",
    zone: "Uttara, Mirpur, Dhanmondi",
    lateFeePolicy: "৳100 reconnect fee",
    hotline: "+880-9666-888-444",
    supportEmail: "hello@ambernet.com.bd",
    address: "32 Lake Circus, Kalabagan, Dhaka",
    createdAt: new Date(),
  },
];

const billSeed = [
  {
    title: "DESCO Residential Bill",
    category: "Electricity",
    amount: 1450,
    location: "Banani, Dhaka",
    date: "2025-11-05",
    dueDate: "2025-11-15",
    description: "Monthly electricity usage for 4-person household.",
    image: "https://i.ibb.co/bNWc5Rf/electric-bill.jpg",
    providerId: providerIds.electricity,
    createdAt: new Date(),
  },
  {
    title: "Titas Gas Usage",
    category: "Gas",
    amount: 975,
    location: "Dhanmondi, Dhaka",
    date: "2025-10-30",
    dueDate: "2025-11-10",
    description: "Flat-rate gas bill for residential double burner.",
    image: "https://i.ibb.co/hmrxW2y/gas-bill.jpg",
    providerId: providerIds.gas,
    createdAt: new Date(),
  },
  {
    title: "DWASA Monthly Water Bill",
    category: "Water",
    amount: 620,
    location: "Uttara, Dhaka",
    date: "2025-11-01",
    dueDate: "2025-11-12",
    description: "Water and sewerage usage for apartment block.",
    image: "https://i.ibb.co/L5rvsHQ/water-bill.jpg",
    providerId: providerIds.water,
    createdAt: new Date(),
  },
  {
    title: "AmberNet Broadband Bill",
    category: "Internet",
    amount: 1200,
    location: "Mirpur, Dhaka",
    date: "2025-11-02",
    dueDate: "2025-11-07",
    description: "Monthly broadband subscription (80 Mbps).",
    image: "https://i.ibb.co/3CF4DzG/internet-bill.jpg",
    providerId: providerIds.internet,
    createdAt: new Date(),
  },
];

const collections = {};
let mongoClient;

async function seedCollection(collection, data) {
  if (!collection) return;
  const count = await collection.estimatedDocumentCount();
  if (count === 0 && data.length) {
    await collection.insertMany(data);
    console.log(`Seeded ${collection.collectionName} with ${data.length} docs`);
  }
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

  await Promise.all([
    seedCollection(collections.providers, providerSeed),
    seedCollection(collections.bills, billSeed),
  ]);

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
        }`
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

app.get("/providers", async (req, res) => {
  try {
    const { type } = req.query;
    const filter = type && type !== "All" ? { type } : {};
    const providers = await collections.providers.find(filter).toArray();
    res.json(providers);
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

app.get("/bills", async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category } : {};
    const bills = await collections.bills
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    res.json(bills);
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

app.get("/mybills", async (req, res) => {
  try {
    const email = req.query.email || req.headers["x-user-email"];
    const filter = email ? { email } : {};
    const bills = await collections.myBills
      .find(filter)
      .sort({ date: -1 })
      .toArray();
    res.json(bills);
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

app.post("/mybills", async (req, res) => {
  try {
    const payload = req.body || {};
    const email = req.headers["x-user-email"] || payload.email;
    if (!email) {
      return res
        .status(400)
        .json({ error: "Missing email (header x-user-email or body.email)." });
    }

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

app.put("/mybills/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const email = req.headers["x-user-email"] || updates.email;
    if (!email) {
      return res
        .status(400)
        .json({ error: "Missing email (header x-user-email or body.email)." });
    }

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
      { $set: updateDoc }
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

app.delete("/mybills/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.headers["x-user-email"] || (req.body && req.body.email);
    if (!email) {
      return res
        .status(400)
        .json({ error: "Missing email (header x-user-email or body.email)." });
    }

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

app.post("/ai/insights", async (req, res) => {
  try {
    const { email, timeframe = "90" } = req.body || {};
    const filter = email ? { email } : {};
    const bills = await collections.myBills.find(filter).toArray();
    const scoped = filterByTimeframe(bills, timeframe);

    const totalSpent = scoped.reduce(
      (sum, bill) => sum + (Number(bill.amount) || 0),
      0
    );
    const grouped = scoped.reduce((acc, bill) => {
      const key = bill.category || bill.title || "General";
      acc[key] = (acc[key] || 0) + (Number(bill.amount) || 0);
      return acc;
    }, {});

    const recentPayments = [...scoped]
      .sort(
        (a, b) =>
          new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
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
                2
              )}, categories ${JSON.stringify(
                grouped
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
