const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Support both MONGODB_URI (full string) and separate variables
    let uri = process.env.MONGODB_URI;

    if (!uri && process.env.MONGODB_USER) {
      // Build URI from separate env vars to avoid @ encoding issues
      const user = encodeURIComponent(process.env.MONGODB_USER);
      const pass = encodeURIComponent(process.env.MONGODB_PASS || "");
      const host = process.env.MONGODB_HOST || "qurux.yz0c3ld.mongodb.net";
      const dbname = process.env.MONGODB_DB || "qurux";
      uri = `mongodb+srv://${user}:${pass}@${host}/${dbname}?appName=qurux`;
      console.log("Built MongoDB URI from separate env vars");
    }

    if (!uri) {
      console.error("❌ No MONGODB_URI or MONGODB_USER found in env");
      process.exit(1);
    }

    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
