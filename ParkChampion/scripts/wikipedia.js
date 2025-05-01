const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

async function fetchNationalParks() {
  try {
    console.log('Fetching National Parks data from Wikipedia...');
    
    // Fetch the Wikipedia page
    const wikiUrl = 'https://en.wikipedia.org/wiki/List_of_national_parks_of_the_United_States';
    const response = await axios.get(wikiUrl);
    const html = response.data;
    
    // Load the HTML into cheerio
    const $ = cheerio.load(html);
    
    // Find the main table with the parks data - looking for the one with the caption "List of U.S. national parks"
    const parksTable = $('table.wikitable.sortable.plainrowheaders');
    
    // Check if we found the table
    if (parksTable.length === 0) {
      console.error('Error: Could not find the national parks table on the Wikipedia page.');
      return [];
    }
    
    console.log(`Found the national parks table.`);
    
    const parks = [];
    let parksCount = 0;
    
    // Process each row of the table (skip the header row)
    parksTable.find('tr').each((index, element) => {
      // Skip the header row
      if (index === 0) return;
      
      const columns = $(element).find('td');
      // If this row doesn't have enough columns, skip it
      if (columns.length < 5) return;
      
      // Name is in the first column with scope="row"
      const nameElement = $(element).find('td[scope="row"] a').first();
      if (!nameElement.length) return; // Skip if no name link found
      const name = nameElement.text().trim().replace(/\s*\*\s*$/, '').replace(/\s*†\s*$/, '');
      
      // Image is in the second column
      const imageElement = $(columns.get(1)).find('img');
      let imageUrl = '';
      
      if (imageElement.length > 0) {
        // Get the src attribute
        const srcAttr = imageElement.attr('src');
        if (srcAttr) {
          // Convert to full URL if it's a relative URL
          imageUrl = srcAttr.startsWith('//') 
            ? 'https:' + srcAttr 
            : srcAttr;
          
          // Get the larger version if available by modifying the URL
          if (imageUrl.includes('/thumb/')) {
            // This is a thumbnail - get a larger version
            imageUrl = imageUrl.replace(/\/\d+px-/, '/800px-');
          }
        }
      }
      
      // Location (state) is in the third column
      const locationElement = $(columns.get(2));
      // Extract just the state name, not the coordinates
      const locationText = locationElement.text().trim();
      const location = locationText.split('\n')[0].trim();
      
      // Determine region (East/West)
      const westernStates = ['Alaska', 'Arizona', 'California', 'Colorado', 'Hawaii', 'Idaho', 'Montana', 
                           'Nevada', 'New Mexico', 'Oregon', 'Utah', 'Washington', 'Wyoming'];
      const region = westernStates.some(state => location.includes(state)) ? 'west' : 'east';
      
      // Established date is in the fourth column
      const establishedElement = $(columns.get(3));
      const established = establishedElement.text().trim();
      
      // Area is in the fifth column
      const areaElement = $(columns.get(4));
      const area = areaElement.text().trim();
      
      // Description is in the seventh column (if available)
      let description = '';
      if (columns.length >= 7) {
        const descriptionElement = $(columns.get(6));
        description = descriptionElement.text().trim();
        
        // Truncate the description if it's too long
        if (description.length > 200) {
          description = description.substring(0, 197) + '...';
        }
      } else {
        // Fallback description
        description = `Located in ${location}, established in ${established}.`;
      }
      
      // Add to our parks array
      if (name && imageUrl) {
        parks.push({
          name,
          description,
          image: imageUrl,
          location,
          region,
          established,
          area
        });
        parksCount++;
        
        console.log(`Found park: ${name}`);
      }
    });
    
    console.log(`Found ${parksCount} National Parks.`);
    
    // Format for our storage system
    const formattedParks = parks.map((park, index) => {
      // Assign icons based on region
      const iconOptions = ['mountain', 'tree', 'leaf'];
      const colorOptions = ['primary', 'secondary', 'accent'];
      
      return {
        name: park.name,
        description: park.description,
        image: park.image,
        location: park.location,
        region: park.region,
        established: park.established,
        area: park.area,
        icon: iconOptions[index % iconOptions.length],
        iconColor: colorOptions[index % colorOptions.length],
        isPopular: index < 10 // Top 10 parks are marked as popular
      };
    });
    
    // Save to a JSON file
    const outputDir = path.join(__dirname, '../data');
    
    // Make sure the directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, 'parks.json');
    fs.writeFileSync(outputFile, JSON.stringify(formattedParks, null, 2));
    
    console.log(`National Parks data saved to ${outputFile}`);
    
    return formattedParks;
  } catch (error) {
    console.error('Error fetching National Parks data:', error);
    return [];
  }
}

// Run the function
fetchNationalParks();