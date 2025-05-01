import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table from the template, kept for reference
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Parks table
export const parks = pgTable("parks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  region: text("region").notNull(), // east, west, etc.
  image: text("image").notNull(),
  icon: text("icon").notNull(), // icon for the park (tree, mountain, etc.)
  iconColor: text("iconColor").notNull(), // color for the icon
  rating: integer("rating").notNull().default(1500), // ELO rating
  rank: integer("rank").notNull(), // Current rank
  previousRank: integer("previousRank").notNull(), // Previous rank for change calculation
  isPopular: boolean("isPopular").notNull().default(false),
  // Optional Wikipedia data
  established: text("established").notNull().default(''),
  area: text("area").notNull().default(''),
});

export const insertParkSchema = createInsertSchema(parks).omit({
  id: true,
  rank: true,
  previousRank: true,
});

export type InsertPark = z.infer<typeof insertParkSchema>;
export type Park = typeof parks.$inferSelect;

// Votes table for tracking voting history
export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  winnerParkId: integer("winnerParkId").notNull().references(() => parks.id),
  loserParkId: integer("loserParkId").notNull().references(() => parks.id),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  userId: text("userId").notNull(), // Anonymous user ID
});

export const insertVoteSchema = createInsertSchema(votes).omit({
  id: true,
  timestamp: true,
});

export type InsertVote = z.infer<typeof insertVoteSchema>;
export type Vote = typeof votes.$inferSelect;

// Relations between tables
export const parksRelations = relations(parks, ({ many }) => ({
  winnerVotes: many(votes, { relationName: "winner_votes" }),
  loserVotes: many(votes, { relationName: "loser_votes" }),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  winner: one(parks, {
    fields: [votes.winnerParkId],
    references: [parks.id],
    relationName: "winner_votes",
  }),
  loser: one(parks, {
    fields: [votes.loserParkId],
    references: [parks.id],
    relationName: "loser_votes",
  }),
}));
