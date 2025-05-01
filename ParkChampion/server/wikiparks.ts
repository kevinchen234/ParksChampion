import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WikiPark {
  name: string;
  description: string;
  image: string;
  location: string;
  region: string;
  established: string; // Now required
  area: string; // Now required
  icon: string;
  iconColor: string;
  rating: number;
  isPopular: boolean;
}

export function loadWikipediaParks(): WikiPark[] {
  try {
    const dataPath = path.join(__dirname, '../data/parks.json');
    
    if (fs.existsSync(dataPath)) {
      console.log("Loading parks data from Wikipedia extract...");
      const parksData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // Ensure all parks have the required fields
      const validParks = parksData.map((park: any): WikiPark => ({
        name: park.name || "Unknown Park",
        description: park.description || "No description available",
        image: park.image || "https://images.unsplash.com/photo-1506087712044-e3ab507abb43?w=600&auto=format&fit=crop",
        location: park.location || "Unknown Location",
        region: park.region || "unknown",
        established: park.established || "",
        area: park.area || "",
        icon: park.icon || "mountain",
        iconColor: park.iconColor || "primary",
        rating: typeof park.rating === 'number' ? park.rating : 1500,
        isPopular: typeof park.isPopular === 'boolean' ? park.isPopular : false
      }));
      
      console.log(`Loaded ${validParks.length} parks from Wikipedia data`);
      return validParks;
    } else {
      console.log("Parks data file not found");
      return [];
    }
  } catch (error) {
    console.error("Error loading parks from Wikipedia data:", error);
    return [];
  }
}