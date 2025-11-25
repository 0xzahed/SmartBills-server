const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@bill-mnagement-cluster.qlgquoh.mongodb.net/?retryWrites=true&w=majority`;

// Simple middleware placeholder (you can implement proper Firebase auth later)
const verifyFireBaseToken = (req, res, next) => {
  // For now, just pass through - implement proper Firebase verification later
  req.token_email = req.body?.email || req.query?.email || req.params?.email; // placeholder for all cases
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
    const billsCollection = db.collection("bills");
    const myBillsCollection = db.collection("myBills");

    app.get("/", (req, res) => {
      res.send("Bill Management Server Running...");
    });

    app.get("/bills", async (req, res) => {
      try {
        const category = req.query.category;
        const filter = category ? { category } : {};
        const bills = await billsCollection.find(filter).toArray();
        res.send(bills);
      } catch (error) {
        res
          .status(500)
          .send({ error: "Failed to fetch bills", details: error.message });
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
    app.post("/mybills", verifyFireBaseToken, async (req, res) => {
      try {
        const billData = req.body;
        if (req.token_email !== billData.email) {
          return res.status(403).send({ message: "forbidden access" });
        }
        const result = await myBillsCollection.insertOne(billData);
        res.status(201).send(result);
      } catch (error) {
        res
          .status(500)
          .send({ error: "Failed to save paid bill", details: error.message });
      }
    });

    app.get("/mybills", verifyFireBaseToken, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: "Email is required" });
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
        res
          .status(500)
          .send({ error: "Failed to update bill", details: error.message });
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
        res
          .status(500)
          .send({ error: "Failed to delete bill", details: error.message });
      }
    });

    app.listen(port, () => {
      console.log(` Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error(" MongoDB Connection Failed:", error.message);
  }
}

run().catch(console.dir);