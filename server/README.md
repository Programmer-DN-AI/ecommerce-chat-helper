# Ecommerce Chat Helper Server

This is the backend server for the ecommerce chat helper application, built with Node.js, TypeScript, Express, and MongoDB.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the server directory with the following variables:

```env
# MongoDB Atlas Connection String
MONGODB_ATLAS_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Google AI API Key
GOOGLE_API_KEY=your_google_api_key_here

# Optional: Node.js environment
NODE_ENV=development
```

#### Getting Your Credentials:

**MongoDB Atlas URI:**

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a new cluster or use an existing one
3. Click "Connect" on your cluster
4. Choose "Connect your application"
5. Copy the connection string and replace `username`, `password`, and `database` with your actual values

**Google API Key:**

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to your `.env` file

### 3. Run the Application

**Development mode:**

```bash
npm run dev
```

**Seed the database:**

```bash
npm run seed
```

**Seed with smaller memory allocation:**

```bash
npm run seed:small
```

## Project Structure

- `index.ts` - Main server entry point
- `agent.ts` - LangChain agent implementation
- `seed-database.ts` - Database seeding script
- `tsconfig.json` - TypeScript configuration

## Features

- Express server with CORS support
- MongoDB Atlas integration with vector search
- LangChain agent for AI-powered chat
- Google Gemini AI integration
- TypeScript for type safety
- Environment variable configuration
