const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
const port = 8800;

const JWT_SECRET = "123456";

app.use(express.json());
app.use(cors());

const uri =
  "mongodb+srv://freelance:SJ5HW66Mk5XOobot@cluster0.ahhvv5a.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(403).send("Unauthorized");
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send("Invalid token");
  }
}

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("freelance-marketplace");
    const users = db.collection("users");
    const tasks = db.collection("tasks");
    const bids = db.collection("bids");

    app.get("/api/my-tasks", verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;

        // Fetch tasks based on user's email
        const tasksList = await tasks.find({ email: userEmail }).toArray();

        // Fetch the user details for each task
        const tasksWithUserName = await Promise.all(
          tasksList.map(async (task) => {
            // Fetch user by email (or _id if using user ID)
            const user = await users.findOne({ email: task.email });
            return {
              ...task,
              name: user?.name || "", // Add the user name to the task data
            };
          })
        );

         // Send back the tasks with user names included
         res.status(200).json(tasksWithUserName);
        } catch (error) {
          console.error("Error fetching user's tasks:", error);
          res.status(500).json({ message: "Error fetching tasks" });
        }
      });
  
      app.put("/api/tasks/:id", verifyToken, async (req, res) => {
        const { title, category, description, deadline, budget } = req.body;
        const taskId = req.params.id;
        const userEmail = req.user.email; // Email from token
        const userName = req.user.name; // Name from token
  
        try {
          // Check if the task exists
          const task = await tasks.findOne({ _id: new ObjectId(taskId) });
          if (!task) {
            return res.status(404).json({ message: "Task not found" });
          }
  
          // Ensure the user is trying to update their own task
          if (task.email !== userEmail) {
            return res
              .status(403)
              .json({ message: "You can only update your own tasks" });
          }
  
          if (task.name !== userName) {
            return res
              .status(403)
              .json({ message: "You can only update your own tasks" });
          }

          // Update task data in the database
        await tasks.updateOne(
          { _id: new ObjectId(taskId) },
          {
            $set: {
              title,
              category,
              description,
              deadline,
              budget,
            },
          }
        );

        // Send a success response
        res.status(200).json({ message: "Task updated successfully" });
      } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ message: "Error updating task" });
      }
    });

    