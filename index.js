const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');
const { Groq } = require('groq-sdk');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ------------------
   TRANSPORTER (Nodemailer)
   ------------------ */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* ------------------
   GROQ AI SETUP
   ------------------ */
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SYSTEM_PROMPT = `You are SmartBills AI Assistant, a helpful and friendly chatbot for a bill management platform called SmartBills.

Your capabilities:
- Help users understand their bills and subscriptions
- Provide spending insights and tips
- Guide users through payment processes
- Answer questions about bill categories (Electricity, Gas, Water, Internet)
- Explain features like subscriptions, payment history, and profiles

Guidelines:
- Be concise and friendly (2-3 sentences typically)
- Use Bengali/English based on user's language
- Reference specific bill data when available
- Suggest actionable next steps
- Always prioritize security and privacy

Current platform features:
- View all bills by category
- Subscribe to providers
- Make secure payments with card
- Track payment history
- Download PDF reports
- Email invoice delivery after payment
- Set bill reminders with notifications
- AI spending insights`;

/* ------------------
   DB Helper
   ------------------ */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@bill-mnagement-cluster.qlgquoh.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1 } });

async function insertWithTimestamp(collection, doc) {
  const now = new Date();
  return collection.insertOne({ ...doc, createdAt: now, updatedAt: now });
}

/* ------------------
   Mail Helper
   ------------------ */
async function sendMailHelper({ to, subject, html }) {
  const from = process.env.SMTP_USER;
  const info = await transporter.sendMail({ from: `"SmartBills" <${from}>`, to, subject, html });
  return info;
}

function generateInvoiceHTML({ username, email, phone, address, providerName, billTitle, billCategory, billId, transactionId, amount, paymentDate, cardLast4 }) {
  return `
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
}

function generateReminderHTML({ title, providerName, amount, dueDate, message }) {
  return `
  <div style="max-width:600px;margin:auto;background:#fff;padding:22px;border-radius:12px;font-family:Arial, sans-serif;">
    <h2 style="color:#E5CBB8;text-align:center;margin:0 0 6px 0;">📢 SmartBills Reminder</h2>
    <p style="text-align:center;color:#666;margin:0 0 18px 0;">You have an upcoming bill due soon.</p>

    <div style="padding:12px;background:#f7f7f7;border-radius:8px;margin-bottom:12px;">
      <h3 style="margin:0 0 8px 0;font-size:16px;color:#333;">Bill Information</h3>
      <p style="margin:4px 0;"><strong>Title:</strong> ${title || 'N/A'}</p>
      <p style="margin:4px 0;"><strong>Provider:</strong> ${providerName || 'N/A'}</p>
      <p style="margin:4px 0;"><strong>Amount:</strong> ৳${amount ?? 'N/A'}</p>
      <p style="margin:4px 0;"><strong>Due Date:</strong> ${dueDate || 'N/A'}</p>
    </div>

    ${message ? `<p style="color:#444;margin-bottom:12px;">${message}</p>` : ''}

    <p style="color:#999;font-size:12px;text-align:center;margin-top:18px;">SmartBills — Your smart way to manage bills & payments</p>
  </div>
  `;
}

/* ------------------
   AI Helper Functions
   ------------------ */
async function getUserContext(email, db) {
  if (!email) return null;
  try {
    const myBillsCol = db.collection('myBills');
    const subscriptionsCol = db.collection('subscriptions');

    const recentBills = await myBillsCol.find({ email }).sort({ createdAt: -1 }).limit(5).toArray();
    const userSubs = await subscriptionsCol.find({ email }).toArray();
    const totalSpent = recentBills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

    return {
      totalBills: recentBills.length,
      totalSpent: `৳${totalSpent}`,
      subscriptions: userSubs.length,
      recentBills: recentBills.map(b => ({
        title: b.billTitle || b.username,
        amount: `৳${b.amount}`,
        date: b.paymentDate || b.createdAt,
      })),
      subscribedProviders: userSubs.map(s => s.providerName),
    };
  } catch (error) {
    console.error('getUserContext error:', error);
    return null;
  }
}

function generateSuggestions(message, context) {
  const suggestions = [];
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('bill') || lowerMessage.includes('payment') || lowerMessage.includes('বিল')) {
    suggestions.push('Show my recent bills');
    if (context?.totalSpent) {
      suggestions.push('How can I reduce my spending?');
    }
  }

  if (lowerMessage.includes('how') || lowerMessage.includes('help') || lowerMessage.includes('কিভাবে')) {
    suggestions.push('Guide me through payment');
    suggestions.push('How do subscriptions work?');
  }

  if (lowerMessage.includes('problem') || lowerMessage.includes('issue') || lowerMessage.includes('সমস্যা')) {
    suggestions.push('Contact support');
  }

  if (lowerMessage.includes('save') || lowerMessage.includes('reduce') || lowerMessage.includes('কমাতে')) {
    suggestions.push('Give me money-saving tips');
  }

  return suggestions.slice(0, 3);
}

/* ------------------
   Middleware
   ------------------ */
function requireEmailMatch(req, res, next) {
  const payloadEmail = req.body?.email || req.query?.email || req.params?.email || null;
  if (payloadEmail && payloadEmail !== req.token_email) return res.status(403).send({ message: 'Forbidden: email mismatch' });
  next();
}

/* simple auth placeholder: assigns req.token_email from body/query/params
   Replace with real Firebase token verification when ready */
function simpleAuth(req, res, next) {
  req.token_email = req.headers['x-user-email'] || req.body?.email || req.query?.email || null;
  next();
}

app.use(simpleAuth);

/* ------------------
   Rate Limiting for Chat
   ------------------ */
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ------------------
   Main: connect and routes
   ------------------ */
async function main() {
  await client.connect();
  console.log('MongoDB connected');
  const db = client.db('BillManagementDB');

  const billsCol = db.collection('bills');
  const myBillsCol = db.collection('myBills');
  const providersCol = db.collection('providers');
  const subscriptionsCol = db.collection('subscriptions');
  const notificationsCol = db.collection('notifications');
  const notificationLogsCol = db.collection('notificationLogs');
  const scheduledPaymentsCol = db.collection('scheduledPayments');
  const invoicesCol = db.collection('invoices');
  const chatLogsCol = db.collection('chatLogs'); // For AI chat analytics

  // Root
  app.get('/', (req, res) => res.send('SmartBills server running with AI Chat'));

  // Providers
  app.get('/providers', async (req, res) => {
    const list = await providersCol.find().toArray();
    res.send(list);
  });

  // Subscriptions
  app.post('/subscriptions', requireEmailMatch, async (req, res) => {
    const { email, providerId } = req.body;
    if (!email || !providerId) return res.status(400).send({ message: 'email & providerId required' });
    const provider = await providersCol.findOne({ _id: new ObjectId(providerId) });
    if (!provider) return res.status(404).send({ message: 'provider not found' });
    const exists = await subscriptionsCol.findOne({ email, providerId });
    if (exists) return res.send({ message: 'already subscribed' });
    const result = await insertWithTimestamp(subscriptionsCol, { email, providerId, providerName: provider.name, type: provider.type, subscribedAt: new Date() });
    res.status(201).send(result);
  });

  app.get('/subscriptions', requireEmailMatch, async (req, res) => {
    const email = req.query.email;
    const list = await subscriptionsCol.find({ email }).toArray();
    res.send(list);
  });

  // Bills
  app.get('/bills', async (req, res) => {
    const category = req.query.category; const filter = category ? { category } : {};
    const list = await billsCol.find(filter).toArray();
    res.send(list);
  });
  app.get('/bills/:id', async (req, res) => {
    const doc = await billsCol.findOne({ _id: new ObjectId(req.params.id) });
    res.send(doc);
  });

  // MyBills (payment record)
  app.post('/mybills', requireEmailMatch, async (req, res) => {
    const bill = req.body;
    const result = await insertWithTimestamp(myBillsCol, bill);
    res.status(201).send(result);
  });
  app.get('/mybills', requireEmailMatch, async (req, res) => {
    const email = req.query.email; const list = await myBillsCol.find({ email }).toArray(); res.send(list);
  });

  // Notifications (reminders) - create scheduled reminder
  app.post('/notifications', requireEmailMatch, async (req, res) => {
    try {
      const data = req.body;
      const sendAt = data.sendAt ? new Date(data.sendAt) : (data.dueDate ? new Date(new Date(data.dueDate).getTime() - 24*60*60*1000) : new Date());
      if (isNaN(sendAt.getTime())) return res.status(400).send({ message: 'Invalid sendAt' });
      const doc = {
        email: data.email,
        title: data.title || `Reminder for ${data.providerName || 'bill'}`,
        message: data.message || '',
        providerName: data.providerName || null,
        amount: data.amount ?? null,
        billId: data.billId || null,
        sendAt,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        channels: Array.isArray(data.channels) && data.channels.length ? data.channels : ['email'],
        status: 'pending', attempts: 0, createdAt: new Date(), updatedAt: new Date()
      };
      const result = await insertWithTimestamp(notificationsCol, doc);
      res.status(201).send({ insertedId: result.insertedId, scheduledFor: sendAt });
    } catch (err) { console.error(err); res.status(500).send({ error: 'create failed' }); }
  });

  // Preview (send immediate test) - does not save
  app.post('/notifications/preview', requireEmailMatch, async (req, res) => {
    const data = req.body; const html = generateReminderHTML(data);
    try { const info = await sendMailHelper({ to: data.email, subject: `Reminder Preview: ${data.title}`, html }); res.send({ success: true, id: info.messageId }); }
    catch (err) { console.error(err); res.status(500).send({ error: 'preview failed' }); }
  });

  app.get('/notifications', requireEmailMatch, async (req, res) => {
    const email = req.query.email; const list = await notificationsCol.find({ email }).sort({ sendAt: -1 }).toArray(); res.send(list);
  });

  app.delete('/notifications/:id', requireEmailMatch, async (req, res) => {
    const id = req.params.id; const doc = await notificationsCol.findOne({ _id: new ObjectId(id) }); if (!doc) return res.status(404).send({ message: 'not found' }); if (doc.email !== req.token_email) return res.status(403).send({ message: 'forbidden' }); await notificationsCol.updateOne({ _id: doc._id }, { $set: { status: 'cancelled', updatedAt: new Date() } }); res.send({ success: true });
  });

  // Send invoice after payment (creates invoice record + emails)
  app.post('/payments/complete', requireEmailMatch, async (req, res) => {
    const body = req.body;
    if (!body.email) return res.status(400).send({ message: 'email required' });
    const paymentDoc = { ...body, status: 'paid', createdAt: new Date() };
    const pRes = await insertWithTimestamp(invoicesCol, paymentDoc);

    // send invoice email
    const html = generateInvoiceHTML({ username: body.username, email: body.email, phone: body.phone || '', address: body.address || '', providerName: body.providerName || '', billTitle: body.billTitle || '', billCategory: body.billCategory || '', billId: body.billId || '', transactionId: body.transactionId || '', amount: body.amount, paymentDate: body.paymentDate || new Date().toISOString().split('T')[0], cardLast4: body.cardLast4 || '' });
    try {
      await sendMailHelper({ to: body.email, subject: `Invoice for ${body.billTitle} – ৳${body.amount}`, html });
      await invoicesCol.updateOne({ _id: pRes.insertedId }, { $set: { invoiceSent: true, invoiceSentAt: new Date() } });
    } catch (err) {
      console.error('invoice send failed', err);
    }

    res.send({ success: true, paymentId: pRes.insertedId });
  });

  // AI Chat endpoint
  app.post('/ai/chat', chatLimiter, requireEmailMatch, async (req, res) => {
    try {
      const { message, email, history = [] } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).send({ error: 'Message is required' });
      }

      // Fetch user context (bills, subscriptions)
      const userContext = await getUserContext(email, db);

      // Build conversation
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      // Add user context if available
      if (userContext) {
        messages.push({
          role: 'system',
          content: `User Context:\n${JSON.stringify(userContext, null, 2)}`,
        });
      }

      // Add recent history (last 5 messages for context)
      history.slice(-5).forEach((msg) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });

      // Add current message
      messages.push({
        role: 'user',
        content: message,
      });

      // Call Groq AI
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 500,
        top_p: 1,
      });

      const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      // Generate contextual suggestions
      const suggestions = generateSuggestions(message, userContext);

      // Log chat for analytics (optional)
      try {
        await chatLogsCol.insertOne({
          email,
          message,
          response: aiResponse,
          timestamp: new Date(),
          contextUsed: !!userContext,
          tokenUsage: completion.usage || null,
        });
      } catch (logErr) {
        console.error('Chat log error:', logErr);
        // Don't fail the request if logging fails
      }

      res.send({
        response: aiResponse,
        suggestions,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).send({
        error: 'Failed to process chat',
        message: error.message || 'Unknown error',
      });
    }
  });

  // Health
  app.get('/health', (req, res) => res.send({ status: 'ok', time: new Date(), aiEnabled: !!process.env.GROQ_API_KEY }));

  // Cron worker: sends due reminders every minute
  const MAX_ATTEMPTS = 3;
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const due = await notificationsCol.find({ status: 'pending', sendAt: { $lte: now }, attempts: { $lt: MAX_ATTEMPTS } }).toArray();
      if (!due.length) return;
      for (const note of due) {
        if (note.status !== 'pending') continue;
        const html = generateReminderHTML({ title: note.title, providerName: note.providerName, amount: note.amount, dueDate: note.dueDate ? new Date(note.dueDate).toLocaleDateString() : null, message: note.message });
        try {
          const info = await sendMailHelper({ to: note.email, subject: `Reminder: ${note.title} is Due Soon`, html });
          await notificationsCol.updateOne({ _id: note._id }, { $set: { status: 'sent', updatedAt: new Date() }, $inc: { attempts: 1 } });
          await notificationLogsCol.insertOne({ notificationId: note._id, channel: 'email', status: 'sent', sentAt: new Date(), response: { messageId: info.messageId } });
        } catch (err) {
          console.error('send failed', err);
          await notificationsCol.updateOne({ _id: note._id }, { $inc: { attempts: 1 }, $set: { lastError: String(err.message || err), updatedAt: new Date() } });
          await notificationLogsCol.insertOne({ notificationId: note._id, channel: 'email', status: 'failed', sentAt: new Date(), response: { error: String(err.message || err) } });
          if ((note.attempts + 1) >= MAX_ATTEMPTS) {
            await notificationsCol.updateOne({ _id: note._id }, { $set: { status: 'failed', updatedAt: new Date() } });
          }
        }
      }
    } catch (err) { console.error('cron error', err); }
  });

  app.listen(PORT, () => console.log(`Server running on ${PORT} with AI Chat enabled`));
}

main().catch(err => { console.error('startup fail', err); process.exit(1); });