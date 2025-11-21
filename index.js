const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ----------------------------------
// SMTP EMAIL SENDER (Nodemailer)
// ----------------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT == "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ----------------------------------
// MONGODB CONNECTION
// ----------------------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@bill-mnagement-cluster.qlgquoh.mongodb.net/?retryWrites=true&w=majority`;

// SIMPLE AUTH MIDDLEWARE
const verifyFireBaseToken = (req, res, next) => {
  req.token_email =
    req.body?.email || req.query?.email || req.params?.email || null;
  next();
};

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await client.connect();
    console.log("MongoDB Connected Successfully!");

    const db = client.db("BillManagementDB");

    // Existing Collections
    const billsCollection = db.collection("bills");
    const myBillsCollection = db.collection("myBills");

    // NEW COLLECTIONS (3.1 - 3.4)
    const notificationsCollection = db.collection("notifications");
    const scheduledPaymentsCollection = db.collection("scheduledPayments");

    // NEW COLLECTIONS (Providers & Subscriptions)
    const providersCollection = db.collection("providers");
    const subscriptionsCollection = db.collection("subscriptions");

    // -------------------------------------
    // ROOT
    // -------------------------------------
    app.get("/", (req, res) => {
      res.send("Bill Management Server Running...");
    });

    // -------------------------------------
    // PROVIDERS SYSTEM (STATIC REMOVED)
    // -------------------------------------

    // Fetch all providers from DB
    app.get("/providers", async (req, res) => {
      const providers = await providersCollection.find().toArray();
      res.send(providers);
    });

    // Subscribe to provider
    app.post("/subscriptions", verifyFireBaseToken, async (req, res) => {
      const { email, providerId } = req.body;

      if (email !== req.token_email)
        return res.status(403).send({ message: "forbidden access" });

      const provider = await providersCollection.findOne({
        _id: new ObjectId(providerId),
      });

      if (!provider)
        return res.status(404).send({ message: "Provider not found" });

      const already = await subscriptionsCollection.findOne({ email, providerId });
      if (already)
        return res.send({ message: "Already subscribed", subscribed: true });

      const result = await subscriptionsCollection.insertOne({
        email,
        providerId,
        providerName: provider.name,
        type: provider.type,
        subscribedAt: new Date(),
      });

      res.send(result);
    });

    // Get my subscriptions
    app.get("/subscriptions", verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.token_email)
        return res.status(403).send({ message: "forbidden access" });

      const subs = await subscriptionsCollection.find({ email }).toArray();
      res.send(subs);
    });

    // -------------------------------------
    // BILLS (Existing)
    // -------------------------------------
    app.get("/bills", async (req, res) => {
      try {
        const category = req.query.category;
        const filter = category ? { category } : {};
        const bills = await billsCollection.find(filter).toArray();
        res.send(bills);
      } catch (error) {
        res.status(500).send({
          error: "Failed to fetch bills",
          details: error.message,
        });
      }
    });

    app.get("/bills/recent", async (req, res) => {
      try {
        const recentBills = await billsCollection
          .find()
          .sort({ _id: -1 })
          .limit(6)
          .toArray();
        res.send(recentBills);
      } catch (error) {
        res.status(500).send({
          error: "Failed to fetch recent bills",
          details: error.message,
        });
      }
    });

    app.get("/bills/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await billsCollection.findOne(query);
      res.send(result);
    });

    // -------------------------------------
    // MYBILLS (Existing)
    // -------------------------------------
    app.post("/mybills", verifyFireBaseToken, async (req, res) => {
      try {
        const billData = req.body;

        if (req.token_email !== billData.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await myBillsCollection.insertOne(billData);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({
          error: "Failed to save user bill",
          details: error.message,
        });
      }
    });

    app.get("/mybills", verifyFireBaseToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) return res.status(400).send({ message: "Email required" });
        if (email !== req.token_email)
          return res.status(403).send({ message: "forbidden access" });

        const myBills = await myBillsCollection.find({ email }).toArray();
        res.send(myBills);
      } catch (error) {
        res.status(500).send({
          error: "Failed to fetch user bills",
          details: error.message,
        });
      }
    });

    app.put("/mybills/:id", verifyFireBaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await myBillsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({
          error: "Failed to update bill",
          details: error.message,
        });
      }
    });

    app.delete("/mybills/:id", verifyFireBaseToken, async (req, res) => {
      try {
        const id = req.params.id;

        const result = await myBillsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({
          error: "Failed to delete bill",
          details: error.message,
        });
      }
    });

    // -------------------------------------
    // 3.1 AI INSIGHTS
    // -------------------------------------
    app.post("/ai/insights", verifyFireBaseToken, async (req, res) => {
      try {
        const { email } = req.body;

        if (email !== req.token_email)
          return res.status(403).send({ message: "forbidden access" });

        const myBills = await myBillsCollection.find({ email }).toArray();
        const totalAmount = myBills.reduce(
          (sum, b) => sum + Number(b.amount),
          0
        );

        res.send({
          summary: {
            totalSpent: totalAmount,
            billCount: myBills.length,
          },
          ai: "AI integration pending.",
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // -------------------------------------
    // 3.2 SMART REMINDER + EMAIL
    // -------------------------------------
    app.post("/notifications", verifyFireBaseToken, async (req, res) => {
      const data = req.body;

      if (data.email !== req.token_email)
        return res.status(403).send({ message: "forbidden access" });

      const result = await notificationsCollection.insertOne({
        ...data,
        status: "pending",
        createdAt: new Date(),
      });

      // Send Email
      await transporter.sendMail({
        from: `"SmartBills" <${process.env.SMTP_USER}>`,
        to: data.email,
        subject: "Bill Reminder",
        html: `<p>Your bill <strong>${data.title}</strong> is due on <strong>${data.dueDate}</strong>.</p>`,
      });

      res.send(result);
    });

    app.get("/notifications", verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.token_email)
        return res.status(403).send({ message: "forbidden access" });

      const notifications = await notificationsCollection
        .find({ email })
        .toArray();

      res.send(notifications);
    });

    // Custom Email
    app.post("/send-email", verifyFireBaseToken, async (req, res) => {
      try {
        const { email, subject, message } = req.body;

        if (email !== req.token_email)
          return res.status(403).send({ message: "forbidden access" });

        const info = await transporter.sendMail({
          from: `"SmartBills" <${process.env.SMTP_USER}>`,
          to: email,
          subject,
          html: message,
        });

        res.send({ success: true, id: info.messageId });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // -------------------------------------
    // 3.3 SCHEDULED PAYMENTS
    // -------------------------------------
    app.post("/payments/schedule", verifyFireBaseToken, async (req, res) => {
      const data = req.body;

      if (data.email !== req.token_email)
        return res.status(403).send({ message: "forbidden access" });

      const result = await scheduledPaymentsCollection.insertOne({
        ...data,
        status: "scheduled",
        createdAt: new Date(),
      });

      res.send(result);
    });

    // -------------------------------------
    // 3.4 DOCUMENT UPLOAD (OCR)
    // -------------------------------------
    app.post("/bills/import", verifyFireBaseToken, async (req, res) => {
      const bill = req.body;

      if (bill.email !== req.token_email)
        return res.status(403).send({ message: "forbidden access" });

      const result = await billsCollection.insertOne({
        ...bill,
        status: "pending_review",
        createdAt: new Date(),
      });

      res.send(result);
    });

    // -------------------------------------
    // HEALTH CHECK
    // -------------------------------------
    app.get("/health", (req, res) => {
      res.send({ status: "ok", time: new Date() });
    });

    // START SERVER
    app.listen(port, () => {
      console.log(` Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
  }
}

run().catch(console.dir);
