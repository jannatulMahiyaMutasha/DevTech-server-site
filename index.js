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

    app.delete("/api/tasks/:id", verifyToken, async (req, res) => {
      const taskId = req.params.id;
      const userEmail = req.user.email;

      try {
        const task = await tasks.findOne({ _id: new ObjectId(taskId) });
        if (!task) {
          return res.status(404).json({ message: "Task not found" });
        }

        // Ensure the user can only delete their own tasks
        if (task.email !== userEmail) {
          return res
            .status(403)
            .json({ message: "You can only delete your own tasks" });
        }

        await tasks.deleteOne({ _id: new ObjectId(taskId) });

        res.status(200).json({ message: "Task deleted successfully" });
      } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ message: "Error deleting task" });
      }
    });


    app.get("/api/bids/:taskId", verifyToken, async (req, res) => {
      const { taskId } = req.params;
      try {
        const bids = await db
          .collection("bids")
          .aggregate([
            {
              $match: { taskId: new ObjectId(taskId) },
            },
            {
              $lookup: {
                from: "users",
                localField: "userEmail",
                foreignField: "email",
                as: "userDetails",
              },
            },
            {
              $unwind: "$userDetails",
            },
            {
              $project: {
                _id: 1,
                userEmail: 1,
                bidderName: "$userDetails.name",
                amount: 1,
                message: 1,
              },
            },
          ])
          .toArray();

        // Count the number of bids for the task
        const bidCount = bids.length;

        if (bids.length === 0) {
          return res
            .status(404)
            .json({ message: "No bids found for this task" });
        }

        res.status(200).json({
          bids,
          bidCount, // Include the bid count in the response
        }); // Send the bids with bidder info and count in the response
      } catch (error) {
        console.error("Error fetching bids:", error);
        res.status(500).json({ message: "Error fetching bids" });
      }
    });

    app.post("/api/add-task", verifyToken, async (req, res) => {
      const { title, category, description, deadline, budget } = req.body;
      const user = req.user;

      try {
        const task = await tasks.insertOne({
          title,
          category,
          description,
          deadline,
          budget,
          email: user.email,
          createdBy: user.name,
        });
        res.status(201).json({ message: "Task added successfully", task });
      } catch (err) {
        res.status(500).json({ message: "Error adding task" });
      }
    });


     // GET all bids for a task
     app.get("/api/bids/:taskId", async (req, res) => {
      const { taskId } = req.params;

      try {
        const bids = await db
          .collection("bids")
          .find({ taskId: new ObjectId(taskId) })
          .toArray();

        res.status(200).json(bids); // Return the list of bids
      } catch (err) {
        console.error("Error fetching bids:", err);
        res.status(500).json({ message: "Error fetching bids" });
      }
    });

    app.post("/api/register", async (req, res) => {
      const { name, email, password, photoURL } = req.body;

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message:
            "Password must have an uppercase letter, a lowercase letter, and be at least 6 characters long.",
        });
      }

      try {
        const existingUser = await users.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await users.insertOne({
          name,
          email,
          password: hashedPassword,
          photoURL: photoURL || "",
          createdAt: new Date(),
        });

        const token = jwt.sign({ id: result.insertedId, email }, JWT_SECRET, {
          expiresIn: "7d",
        });

        res
          .status(201)
          .json({ message: "User registered successfully", token });
      } catch (err) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post("/api/login", async (req, res) => {
      const { email, password } = req.body;

      try {
        const user = await users.findOne({ email });
        if (!user) {
          return res.status(400).send("User not found");
        }

        // Verify password (assumes bcrypt is used)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).send("Invalid credentials");
        }
