// Import Google's Gemini chat model and embeddings for AI text generation and vector creation
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
// Import structured output parser to ensure AI returns data in specific format
import { StructuredOutputParser } from "@langchain/core/output_parsers"
// Import MongoDB client for database connection
import { MongoClient } from "mongodb"
// Import MongoDB Atlas vector search for storing and searching embeddings
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb"
// Import Zod for data schema validation and type safety
import { z } from "zod"
// Load environment variables from .env file (API keys, connection strings)
import "dotenv/config"

// Validate required environment variables
function validateEnvironmentVariables(): void {
  const requiredVars = ['MONGODB_ATLAS_URI', 'GOOGLE_API_KEY']
  const missingVars = requiredVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`)
    })
    console.error('\n📝 Please create a .env file in the server directory with the following variables:')
    console.error('   MONGODB_ATLAS_URI=your_mongodb_connection_string')
    console.error('   GOOGLE_API_KEY=your_google_api_key')
    console.error('\n🔗 Get your Google API key from: https://makersuite.google.com/app/apikey')
    process.exit(1)
  }
  
  console.log('✅ Environment variables validated successfully')
}

// Validate environment variables before proceeding
validateEnvironmentVariables()

// Create MongoDB client instance using connection string from environment variables
const client = new MongoClient(process.env.MONGODB_ATLAS_URI!)

// Initialize Google Gemini chat model for generating synthetic furniture data
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-flash",  // Use Gemini 1.5 Flash model
  temperature: 0.7,               // Set creativity level (0.7 = moderately creative)
  apiKey: process.env.GOOGLE_API_KEY, // Google API key from environment variables
})

// Define schema for furniture item structure using Zod validation
const itemSchema = z.object({
  item_id: z.string(),                    // Unique identifier for the item
  item_name: z.string(),                  // Name of the furniture item
  item_description: z.string(),           // Detailed description of the item
  brand: z.string(),                      // Brand/manufacturer name
  manufacturer_address: z.object({        // Nested object for manufacturer location
    street: z.string(),                   // Street address
    city: z.string(),                     // City name
    state: z.string(),                    // State/province
    postal_code: z.string(),              // ZIP/postal code
    country: z.string(),                  // Country name
  }),
  prices: z.object({                      // Nested object for pricing information
    full_price: z.number(),               // Regular price
    sale_price: z.number(),               // Discounted price
  }),
  categories: z.array(z.string()),        // Array of category tags
  user_reviews: z.array(                  // Array of customer reviews
    z.object({
      review_date: z.string(),            // Date of review
      rating: z.number(),                 // Numerical rating (1-5)
      comment: z.string(),                // Review text comment
    })
  ),
  notes: z.string(),                      // Additional notes about the item
})

// Create TypeScript type from Zod schema for type safety
type Item = z.infer<typeof itemSchema>

// Create parser that ensures AI output matches our item schema
const parser = StructuredOutputParser.fromZodSchema(z.array(itemSchema))

// Function to create database and collection before seeding
async function setupDatabaseAndCollection(): Promise<void> {
  console.log("Setting up database and collection...")
  
  // Get reference to the inventory_database database
  const db = client.db("inventory_database")
  
  // Create the items collection if it doesn't exist
  const collections = await db.listCollections({ name: "items" }).toArray()
  
  if (collections.length === 0) {
    await db.createCollection("items")
    console.log("Created 'items' collection in 'inventory_database' database")
  } else {
    console.log("'items' collection already exists in 'inventory_database' database")
  }
}

// Function to create vector search index
async function createVectorSearchIndex(): Promise<void> {
  try {
    const db = client.db("inventory_database")
    const collection = db.collection("items")
    await collection.dropIndexes()
    const vectorSearchIdx = {
      name: "vector_index",
      type: "vectorSearch",
      definition: {
        "fields": [
          {
            "type": "vector",
            "path": "embedding",
            "numDimensions": 768,
            "similarity": "cosine"
          }
        ]
      }
    }
    console.log("Creating vector search index...")
    await collection.createSearchIndex(vectorSearchIdx);

    console.log("Successfully created vector search index");
  } catch (e) {
    console.error('Failed to create vector search index:', e);
  }
}

async function generateSyntheticData(): Promise<Item[]> {
  // Create detailed prompt instructing AI to generate furniture store data
  const prompt = `You are a helpful assistant that generates furniture store item data. Generate 10 furniture store items. Each record should include the following fields: item_id, item_name, item_description, brand, manufacturer_address, prices, categories, user_reviews, notes. Ensure variety in the data and realistic values.

  ${parser.getFormatInstructions()}`  // Add format instructions from parser

  // Log progress to console
  console.log("Generating synthetic data...")

  // Send prompt to AI and get response
  const response = await llm.invoke(prompt)
  // Parse AI response into structured array of Item objects
  return parser.parse(response.content as string)
}

// Function to create a searchable text summary from furniture item data
async function createItemSummary(item: Item): Promise<string> {
  // Return Promise for async compatibility (though this function is synchronous)
  return new Promise((resolve) => {
    // Extract manufacturer country information
    const manufacturerDetails = `Made in ${item.manufacturer_address.country}`
    // Join all categories into comma-separated string
    const categories = item.categories.join(", ")
    // Convert user reviews array into readable text format
    const userReviews = item.user_reviews
      .map(
        (review) =>
          `Rated ${review.rating} on ${review.review_date}: ${review.comment}`
      )
      .join(" ")  // Join multiple reviews with spaces
    // Create basic item information string
    const basicInfo = `${item.item_name} ${item.item_description} from the brand ${item.brand}`
    // Format pricing information
    const price = `At full price it costs: ${item.prices.full_price} USD, On sale it costs: ${item.prices.sale_price} USD`
    // Get additional notes
    const notes = item.notes

    // Combine all information into comprehensive summary for vector search
    const summary = `${basicInfo}. Manufacturer: ${manufacturerDetails}. Categories: ${categories}. Reviews: ${userReviews}. Price: ${price}. Notes: ${notes}`

    // Resolve promise with complete summary
    resolve(summary)
  })
}

// Helper function to force garbage collection if available
function forceGC(): void {
  if (global.gc) {
    global.gc()
  }
}

// Process items in batches to reduce memory usage
async function processBatch(
  items: Item[], 
  collection: any, 
  batchSize: number = 3
): Promise<void> {
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    modelName: "text-embedding-004",
  })

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`)
    
    // Process each item in the batch
    for (const item of batch) {
      const summary = await createItemSummary(item)
      const record = {
        pageContent: summary,
        metadata: { ...item },
      }

      // Create vector embeddings and store in MongoDB Atlas
      await MongoDBAtlasVectorSearch.fromDocuments(
        [record],
        embeddings,
        {
          collection,
          indexName: "vector_index",
          textKey: "embedding_text",
          embeddingKey: "embedding",
        }
      )

      console.log("Successfully processed & saved record:", item.item_id)
    }

    // Force garbage collection after each batch
    forceGC()
    
    // Small delay to allow memory cleanup
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

// Main function to populate database with AI-generated furniture data
async function seedDatabase(): Promise<void> {
  try {
    console.log("🔌 Connecting to MongoDB...")
    
    // Establish connection to MongoDB Atlas
    await client.connect()
    
    // Ping database to verify connection works
    await client.db("admin").command({ ping: 1 })
    
    // Log successful connection
    console.log("✅ Successfully connected to MongoDB!")

    // Setup database and collection
    await setupDatabaseAndCollection()
    
    // Create vector search index
    await createVectorSearchIndex()

    // Get reference to specific database
    const db = client.db("inventory_database")
    // Get reference to items collection
    const collection = db.collection("items")

    // Clear existing data from collection (fresh start)
    await collection.deleteMany({})
    console.log("Cleared existing data from items collection")
    
    // Generate new synthetic furniture data using AI
    const syntheticData = await generateSyntheticData()
    console.log(`Generated ${syntheticData.length} items`)

    // Process items in batches to reduce memory usage
    await processBatch(syntheticData, collection, 3)

    // Log completion of entire seeding process
    console.log("Database seeding completed")

  } catch (error) {
    // Log any errors that occur during database seeding
    console.error("Error seeding database:", error)
  } finally {
    // Always close database connection when finished (cleanup)
    await client.close()
  }
}

// Execute the database seeding function and handle any errors
seedDatabase().catch(console.error)