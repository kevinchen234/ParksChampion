import { 
  parks, type Park, type InsertPark,
  votes, type Vote, type InsertVote,
  users, type User, type InsertUser
} from "@shared/schema";
import { calculateEloRating } from "./elo";
import { loadWikipediaParks } from "./wikiparks";
import { db } from "./db";
import { eq, desc, asc, sql, and, or } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need
export interface IStorage {
  // User methods kept from template
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Park methods
  getAllParks(): Promise<Park[]>;
  getParkById(id: number): Promise<Park | undefined>;
  createPark(park: InsertPark): Promise<Park>;
  updateParkRating(parkId: number, newRating: number): Promise<Park>;
  updateParkRank(parkId: number, newRank: number, previousRank: number): Promise<Park>;
  getRandomParkPair(): Promise<[Park, Park]>;
  filterParksByRegion(region: string): Promise<Park[]>;
  filterPopularParks(): Promise<Park[]>;
  
  // Vote methods
  createVote(vote: InsertVote): Promise<Vote>;
  getRecentVotes(limit: number): Promise<Array<Vote & { winner: Park, loser: Park }>>;
  
  // Voting logic
  processVote(winnerId: number, loserId: number, userId: string): Promise<{
    updatedWinner: Park, 
    updatedLoser: Park, 
    vote: Vote
  }>;
}

/**
 * DatabaseStorage implementation that uses PostgreSQL database
 * for persistent storage across sessions and users
 */
export class DatabaseStorage implements IStorage {
  constructor() {
    // Check if database has been initialized
    this.initializeParksIfNeeded();
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Park methods
  async getAllParks(): Promise<Park[]> {
    return await db.select().from(parks).orderBy(asc(parks.rank));
  }

  async getParkById(id: number): Promise<Park | undefined> {
    const [park] = await db.select().from(parks).where(eq(parks.id, id));
    return park;
  }

  async createPark(insertPark: InsertPark): Promise<Park> {
    // Calculate new park's rank
    const allParks = await this.getAllParks();
    const rank = allParks.length + 1;
    
    // Make sure we have all required fields
    const parkData = {
      ...insertPark,
      rank,
      previousRank: rank,
      established: insertPark.established || '',
      area: insertPark.area || ''
    };
    
    const [park] = await db.insert(parks).values(parkData).returning();
    return park;
  }

  async updateParkRating(parkId: number, newRating: number): Promise<Park> {
    // Update the park's rating
    const [updatedPark] = await db
      .update(parks)
      .set({ rating: newRating })
      .where(eq(parks.id, parkId))
      .returning();
    
    if (!updatedPark) {
      throw new Error(`Park with ID ${parkId} not found`);
    }
    
    // Update rankings after rating change
    await this.updateAllRankings();
    
    // Get the freshly ranked park
    const [park] = await db.select().from(parks).where(eq(parks.id, parkId));
    return park;
  }

  async updateParkRank(parkId: number, newRank: number, previousRank: number): Promise<Park> {
    const [updatedPark] = await db
      .update(parks)
      .set({
        rank: newRank,
        previousRank: previousRank
      })
      .where(eq(parks.id, parkId))
      .returning();
    
    if (!updatedPark) {
      throw new Error(`Park with ID ${parkId} not found`);
    }
    
    return updatedPark;
  }

  async getRandomParkPair(): Promise<[Park, Park]> {
    // Get all parks
    const allParks = await this.getAllParks();
    
    if (allParks.length < 2) {
      throw new Error("Not enough parks to create a pair");
    }
    
    // Using SQL's random() function to get two random parks
    const randomParks = await db
      .select()
      .from(parks)
      .orderBy(sql`RANDOM()`)
      .limit(2);
    
    // If we couldn't get exactly 2 parks, fallback to JS shuffle
    if (randomParks.length !== 2) {
      const shuffled = [...allParks].sort(() => 0.5 - Math.random());
      return [shuffled[0], shuffled[1]];
    }
    
    return [randomParks[0], randomParks[1]];
  }

  async filterParksByRegion(region: string): Promise<Park[]> {
    if (region === 'all') {
      return this.getAllParks();
    }
    
    return await db
      .select()
      .from(parks)
      .where(eq(parks.region, region))
      .orderBy(asc(parks.rank));
  }

  async filterPopularParks(): Promise<Park[]> {
    return await db
      .select()
      .from(parks)
      .where(eq(parks.isPopular, true))
      .orderBy(asc(parks.rank));
  }

  // Vote methods
  async createVote(insertVote: InsertVote): Promise<Vote> {
    const [vote] = await db
      .insert(votes)
      .values(insertVote)
      .returning();
    
    return vote;
  }

  async getRecentVotes(limit: number): Promise<Array<Vote & { winner: Park, loser: Park }>> {
    // Query all recent votes
    const recentVotes = await db
      .select()
      .from(votes)
      .orderBy(desc(votes.timestamp))
      .limit(limit);
    
    // For each vote, get the winner and loser parks
    const enhancedVotes = await Promise.all(
      recentVotes.map(async (vote) => {
        const [winner] = await db
          .select()
          .from(parks)
          .where(eq(parks.id, vote.winnerParkId));
        
        const [loser] = await db
          .select()
          .from(parks)
          .where(eq(parks.id, vote.loserParkId));
        
        return {
          ...vote,
          winner,
          loser
        };
      })
    );
    
    return enhancedVotes;
  }

  // Voting logic
  async processVote(winnerId: number, loserId: number, userId: string): Promise<{
    updatedWinner: Park, 
    updatedLoser: Park, 
    vote: Vote
  }> {
    // Get the parks
    const [winner] = await db.select().from(parks).where(eq(parks.id, winnerId));
    const [loser] = await db.select().from(parks).where(eq(parks.id, loserId));
    
    if (!winner || !loser) {
      throw new Error("One or both parks not found");
    }
    
    // Calculate new ELO ratings
    const { winnerNewRating, loserNewRating } = calculateEloRating(
      winner.rating,
      loser.rating
    );
    
    // Update ratings
    const updatedWinner = await this.updateParkRating(winnerId, winnerNewRating);
    const updatedLoser = await this.updateParkRating(loserId, loserNewRating);
    
    // Record vote
    const vote = await this.createVote({
      winnerParkId: winnerId,
      loserParkId: loserId,
      userId
    });
    
    return {
      updatedWinner,
      updatedLoser,
      vote
    };
  }

  // Private helper methods
  
  private async updateAllRankings(): Promise<void> {
    // Get all parks and sort by rating
    const allParks = await db.select().from(parks).orderBy(desc(parks.rating));
    
    // Prepare a single transaction for bulk updates
    const promises = allParks.map((park, index) => {
      return db
        .update(parks)
        .set({
          rank: index + 1,
          previousRank: park.rank
        })
        .where(eq(parks.id, park.id));
    });
    
    // Execute all updates in parallel
    await Promise.all(promises);
  }

  private async initializeParksIfNeeded(): Promise<void> {
    try {
      // Check if we have any parks in the database
      const existingParks = await db.select({ count: sql<number>`count(*)` }).from(parks);
      const count = Number(existingParks[0]?.count) || 0;
      
      console.log(`Database parks check: found ${count} parks`);
      
      if (count === 0) {
        console.log("No parks found in database. Initializing with park data...");
        
        // Try to load Wikipedia parks
        const wikiParks = loadWikipediaParks();
        
        if (wikiParks.length > 0) {
          console.log(`Initializing database with ${wikiParks.length} parks from Wikipedia`);
          
          // Insert parks with ranks
          for (let i = 0; i < wikiParks.length; i++) {
            const park = wikiParks[i];
            const rank = i + 1;
            
            await db.insert(parks).values({
              name: park.name,
              description: park.description,
              location: park.location,
              region: park.region,
              image: park.image,
              icon: park.icon,
              iconColor: park.iconColor,
              rating: park.rating || 1500,
              isPopular: park.isPopular || false,
              rank,
              previousRank: rank,
              established: park.established || '',
              area: park.area || ''
            });
          }
          
          console.log("Database initialization complete!");
        } else {
          console.log("No Wikipedia parks data found. Using default parks data.");
          
          // Use default parks data
          const defaultParks = [
            {
              name: "Grand Canyon",
              description: "Steep-sided canyon carved by the Colorado River in Arizona, United States.",
              location: "Arizona",
              region: "west",
              image: "https://images.unsplash.com/photo-1615551043360-33de8b5f410c?w=600&auto=format&fit=crop",
              icon: "mountain",
              iconColor: "secondary",
              rating: 1605,
              isPopular: true,
              rank: 1,
              previousRank: 1,
              established: "1919",
              area: "4,926 km²"
            },
            {
              name: "Joshua Tree",
              description: "Characterized by rugged rock formations and stark desert landscapes with the unusual Joshua trees.",
              location: "California",
              region: "west",
              image: "https://images.unsplash.com/photo-1564108356352-b57a080d5174?w=600&auto=format&fit=crop",
              icon: "tree",
              iconColor: "primary",
              rating: 1538,
              isPopular: false,
              rank: 2,
              previousRank: 2,
              established: "1994",
              area: "3,199 km²"
            },
            {
              name: "Great Smoky Mountains",
              description: "Enjoy scenic views of forest-covered mountains stretched across North Carolina and Tennessee at Great Smoky Mountains National Park.",
              location: "NC/TN",
              region: "east",
              image: "https://images.unsplash.com/photo-1578509557315-37a1963921a3?w=600&auto=format&fit=crop",
              icon: "leaf",
              iconColor: "primary",
              rating: 1531,
              isPopular: true,
              rank: 3,
              previousRank: 3,
              established: "1934",
              area: "2,114 km²"
            },
            {
              name: "Yosemite",
              description: "Known for its waterfalls, deep valleys, grand meadows, and ancient giant sequoias.",
              location: "California",
              region: "west",
              image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?w=600&auto=format&fit=crop",
              icon: "tree",
              iconColor: "primary",
              rating: 1520,
              isPopular: true,
              rank: 4,
              previousRank: 4,
              established: "1890",
              area: "3,082 km²"
            },
            {
              name: "Olympic",
              description: "Encompasses several different ecosystems including glacier-capped mountains, old-growth temperate rain forests, and Pacific coastline.",
              location: "Washington",
              region: "west",
              image: "https://images.unsplash.com/photo-1506087712044-e3ab507abb43?w=600&auto=format&fit=crop",
              icon: "leaf",
              iconColor: "primary",
              rating: 1510,
              isPopular: false,
              rank: 5,
              previousRank: 5,
              established: "1938",
              area: "3,734 km²"
            }
          ];
          
          // Insert default parks
          for (const park of defaultParks) {
            await db.insert(parks).values(park);
          }
          
          console.log("Database initialized with default parks data!");
        }
        
        // Verify parks were added
        const verifyParks = await db.select({ count: sql<number>`count(*)` }).from(parks);
        console.log(`After initialization: found ${verifyParks[0]?.count} parks in database`);
      } else {
        console.log(`Database already contains ${count} parks. Skipping initialization.`);
      }
    } catch (error) {
      console.error("Error initializing parks database:", error);
      
      // Try to diagnose the issue
      try {
        const tableExists = await db.execute(sql`SELECT to_regclass('public.parks')`);
        console.log('Parks table exists check:', tableExists);
      } catch (tableCheckError) {
        console.error('Could not check if parks table exists:', tableCheckError);
      }
    }
  }
}

// Use the database storage for persistence
export const storage = new DatabaseStorage();
