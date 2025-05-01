import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure for serverless environment
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Set up the database pool and connection
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Log successful connection
console.log("Database connection established");

// Function to check database connection
export async function checkDatabaseConnection() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("Database connection successful:", result.rows[0].now);
    return true;
  } catch (error) {
    console.error("Database connection error:", error);
    return false;
  }
}