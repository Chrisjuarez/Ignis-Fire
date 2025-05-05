//ignis-ai-backend/db.js
require('dotenv').config();
const mongoose = require('mongoose');


const mongoURI = process.env.MONGODB_URI; // Ensure this is in .env

const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI);
    console.log("✅ MongoDB Atlas connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

module.exports = connectDB;

