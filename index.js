const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@bill-mnagement-cluster.qlgquoh.mongodb.net/?retryWrites=true&w=majority`;

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
        res.status(500).send({ error: "Failed to fetch bills", details: error.message });
      }
    });

     app.get("/bills/recent", async (req, res) => {
      try {
        const recentBills = await billsCollection.find().sort({ _id: -1 }).limit(6).toArray();
        res.send(recentBills);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch recent bills", details: error.message });
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
