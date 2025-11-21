// ---------------------------------------------------
// SMARTBILLS – FULL PRODUCTION SERVER
// ---------------------------------------------------

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

// ---------------------------------------------------
// SMTP CONFIG (Gmail / Resend / Mailjet)
// ---------------------------------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ---------------------------------------------------
// SIMPLE AUTH MIDDLEWARE
// ---------------------------------------------------
const verifyFireBaseToken = (req, res, next) => {
  req.token_email =
    req.body?.email ||
    req.query?.email ||
    req.params?.email ||
    null;

  next();
};

// ---------------------------------------------------
// MONGODB CONNECTION
// ---------------------------------------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@bill-mnagement-cluster.qlgquoh.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1 },
});

// ---------------------------------------------------
// MAIN SERVER FUNCTION
// ---------------------------------------------------
async function run() {
  try {
    await client.connect();
    console.log("MongoDB Connected ✔");

    const db = client.db("BillManagementDB");

    // Collections
    const bills = db.collection("bills");
    const myBills = db.collection("myBills");
    const notifications = db.collection("notifications");
    const scheduledPayments = db.collection("scheduledPayments");
    const providers = db.collection("providers");
    const subscriptions = db.collection("subscriptions");

    // ---------------------------------------------------
    // ROOT
    // ---------------------------------------------------
    app.get("/", (req, res) => {
      res.send("SmartBills Server Running...");
    });

    // ---------------------------------------------------
    // PROVIDERS
    // ---------------------------------------------------
    app.get("/providers", async (req, res) => {
      res.send(await providers.find().toArray());
    });

    // ---------------------------------------------------
    // SUBSCRIPTIONS
    // ---------------------------------------------------
    app.post("/subscriptions", verifyFireBaseToken, async (req, res) => {
      const { email, providerId } = req.body;

      if (email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      const provider = await providers.findOne({ _id: new ObjectId(providerId) });

      if (!provider)
        return res.status(404).send({ message: "Provider not found" });

      const exists = await subscriptions.findOne({ email, providerId });
      if (exists)
        return res.send({ message: "Already subscribed", subscribed: true });

      const result = await subscriptions.insertOne({
        email,
        providerId,
        providerName: provider.name,
        type: provider.type,
        subscribedAt: new Date(),
      });

      res.send(result);
    });

    app.get("/subscriptions", verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      res.send(await subscriptions.find({ email }).toArray());
    });

    // ---------------------------------------------------
    // BILLS
    // ---------------------------------------------------
    app.get("/bills", async (req, res) => {
      const category = req.query.category;
      const filter = category ? { category } : {};
      res.send(await bills.find(filter).toArray());
    });

    app.get("/bills/:id", async (req, res) => {
      const id = req.params.id;
      res.send(await bills.findOne({ _id: new ObjectId(id) }));
    });

    // ---------------------------------------------------
    // MY BILLS
    // ---------------------------------------------------
    app.post("/mybills", verifyFireBaseToken, async (req, res) => {
      const bill = req.body;

      if (bill.email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      res.send(await myBills.insertOne({ ...bill, createdAt: new Date() }));
    });

    app.get("/mybills", verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      res.send(await myBills.find({ email }).toArray());
    });

    // ---------------------------------------------------
    // AI INSIGHTS (Placeholder)
    // ---------------------------------------------------
    app.post("/ai/insights", verifyFireBaseToken, async (req, res) => {
      const { email } = req.body;

      if (email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      const userBills = await myBills.find({ email }).toArray();

      const total = userBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);

      res.send({
        summary: { totalSpent: total, billCount: userBills.length },
        ai: "AI integration pending.",
      });
    });

    // ---------------------------------------------------
    // SMART REMINDERS + EMAIL SEND
    // ---------------------------------------------------
    app.post("/notifications", verifyFireBaseToken, async (req, res) => {
      const data = req.body;

      if (data.email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      const result = await notifications.insertOne({
        ...data,
        status: "pending",
        createdAt: new Date(),
      });

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
        return res.status(403).send({ message: "Forbidden access" });

      res.send(await notifications.find({ email }).toArray());
    });

    // ---------------------------------------------------
    // CUSTOM EMAIL (Manual)
    // ---------------------------------------------------
    app.post("/send-email", verifyFireBaseToken, async (req, res) => {
      try {
        const { email, subject, message } = req.body;

        if (email !== req.token_email)
          return res.status(403).send({ message: "Forbidden access" });

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

    // ---------------------------------------------------
    // PAYMENT SCHEDULE
    // ---------------------------------------------------
    app.post("/payments/schedule", verifyFireBaseToken, async (req, res) => {
      const data = req.body;

      if (data.email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      res.send(
        await scheduledPayments.insertOne({
          ...data,
          status: "scheduled",
          createdAt: new Date(),
        })
      );
    });

    // ---------------------------------------------------
    // OCR IMPORT
    // ---------------------------------------------------
    app.post("/bills/import", verifyFireBaseToken, async (req, res) => {
      const bill = req.body;

      if (bill.email !== req.token_email)
        return res.status(403).send({ message: "Forbidden access" });

      res.send(
        await bills.insertOne({
          ...bill,
          status: "pending_review",
          createdAt: new Date(),
        })
      );
    });

    // ---------------------------------------------------
    // SEND INVOICE AFTER PAYMENT
    // ---------------------------------------------------
    app.post("/send-invoice", async (req, res) => {
      const {
        email,
        username,
        billTitle,
        billCategory,
        amount,
        paymentDate,
        billId,
        transactionId,
        providerName,
        address,
        phone,
        cardLast4,
      } = req.body;

      try {
        const html = `
        <div style="max-width:600px;margin:auto;background:#fff;padding:20px;border-radius:12px;font-family:Arial;">
          <h2 style="color:#10b981;text-align:center">SmartBills Invoice</h2>
          <p style="text-align:center;color:#666">Payment Receipt</p>

          <h3>Customer Info</h3>
          <p><b>Name:</b> ${username}</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Address:</b> ${address}</p>

          <h3>Billing Details</h3>
          <p><b>Provider:</b> ${providerName}</p>
          <p><b>Title:</b> ${billTitle}</p>
          <p><b>Category:</b> ${billCategory}</p>
          <p><b>Bill ID:</b> ${billId}</p>
          <p><b>Transaction ID:</b> ${transactionId}</p>

          <h2 style="color:#10b981">Total: ৳${amount}</h2>
          <p>Paid on: ${paymentDate}</p>
          <p>Card ending in: ****${cardLast4}</p>

          <hr />
          <p style="color:#999;font-size:12px;text-align:center">Thank you for using SmartBills</p>
        </div>
      `;

        await transporter.sendMail({
          from: `"SmartBills" <${process.env.SMTP_USER}>`,
          to: email,
          subject: `Invoice for ${billTitle} – ৳${amount}`,
          html,
        });

        res.send({ success: true });
      } catch (err) {
        console.error("Invoice Error:", err);
        res.status(500).send({ error: "Failed to send invoice" });
      }
    });

    // ---------------------------------------------------
    // HEALTH CHECK
    // ---------------------------------------------------
    app.get("/health", (req, res) => {
      res.send({ status: "ok", time: new Date() });
    });

    // ---------------------------------------------------
    // START SERVER
    // ---------------------------------------------------
    app.listen(port, () => {
      console.log(`SmartBills Server Running on Port: ${port}`);
    });
  } catch (err) {
    console.error("MongoDB Error:", err);
  }
}

run().catch(console.dir);
