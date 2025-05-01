import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertVoteSchema } from "@shared/schema";
import { randomUUID } from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all parks
  app.get("/api/parks", async (req, res) => {
    try {
      const region = req.query.region as string;
      const popular = req.query.popular as string;
      
      let parks;
      
      if (popular === "true") {
        parks = await storage.filterPopularParks();
      } else if (region && region !== "all") {
        parks = await storage.filterParksByRegion(region);
      } else {
        parks = await storage.getAllParks();
      }
      
      res.json(parks);
    } catch (error) {
      console.error("Error fetching parks:", error);
      res.status(500).json({ message: "Failed to fetch parks" });
    }
  });

  // Get a specific park by ID
  app.get("/api/parks/:id", async (req, res) => {
    try {
      const parkId = parseInt(req.params.id);
      
      if (isNaN(parkId)) {
        return res.status(400).json({ message: "Invalid park ID" });
      }
      
      const park = await storage.getParkById(parkId);
      
      if (!park) {
        return res.status(404).json({ message: "Park not found" });
      }
      
      res.json(park);
    } catch (error) {
      console.error("Error fetching park:", error);
      res.status(500).json({ message: "Failed to fetch park" });
    }
  });

  // Get a random pair of parks for voting
  app.get("/api/matchup", async (req, res) => {
    try {
      const [park1, park2] = await storage.getRandomParkPair();
      res.json({ park1, park2 });
    } catch (error) {
      console.error("Error creating matchup:", error);
      res.status(500).json({ message: "Failed to create matchup" });
    }
  });

  // Submit a vote
  app.post("/api/vote", async (req, res) => {
    try {
      // Validate request body
      const voteSchema = z.object({
        winnerId: z.number(),
        loserId: z.number(),
        userId: z.string().optional(),
      });
      
      const result = voteSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid vote data", 
          errors: result.error.errors 
        });
      }
      
      const { winnerId, loserId } = result.data;
      
      // Generate a random user ID if not provided
      const userId = result.data.userId || randomUUID();
      
      // Process the vote
      const { updatedWinner, updatedLoser, vote } = await storage.processVote(
        winnerId,
        loserId,
        userId
      );
      
      // Generate a new random matchup
      const [nextPark1, nextPark2] = await storage.getRandomParkPair();
      
      res.json({
        winner: updatedWinner,
        loser: updatedLoser,
        vote,
        nextMatchup: { park1: nextPark1, park2: nextPark2 }
      });
    } catch (error) {
      console.error("Error processing vote:", error);
      res.status(500).json({ message: "Failed to process vote" });
    }
  });

  // Get recent votes
  app.get("/api/votes/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const recentVotes = await storage.getRecentVotes(limit);
      res.json(recentVotes);
    } catch (error) {
      console.error("Error fetching recent votes:", error);
      res.status(500).json({ message: "Failed to fetch recent votes" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
