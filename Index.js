import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  ListResourcesRequestSchema, 
  ReadResourceRequestSchema,
  ExecuteToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "pg";
import { Configuration, OpenAIApi } from "openai";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure PostgreSQL client
const pgClient = new Client({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
});

// Configure OpenAI for embeddings
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// Connect to PostgreSQL
async function initDatabase() {
  try {
    await pgClient.connect();
    console.error("Connected to PostgreSQL");
  } catch (err) {
    console.error("Failed to connect to PostgreSQL:", err);
    process.exit(1);
  }
}

// Function to generate embeddings
async function generateEmbedding(text) {
  try {
    const response = await openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data.data[0].embedding;
  } catch (err) {
    console.error("Error generating embedding:", err);
    return null;
  }
}

// Function to find semantically similar columns
async function findSimilarColumns(query) {
  try {
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];
    
    // Use cosine similarity to find similar columns
    const result = await pgClient.query(`
      SELECT table_name, column_name, description, 
             1 - (embedding <=> $1::vector) as similarity
      FROM column_metadata
      ORDER BY similarity DESC
      LIMIT 5;
    `, [queryEmbedding]);
    
    return result.rows;
  } catch (err) {
    console.error("Error finding similar columns:", err);
    return [];
  }
}

// Function to execute SQL with semantic understanding
async function semanticSQLExecute(query, sqlStatement) {
  try {
    // First, check if the user is asking about specific columns
    const similarColumns = await findSimilarColumns(query);
    
    // If the SQL statement is provided, use it directly
    if (sqlStatement && sqlStatement.trim()) {
      const result = await pgClient.query(sqlStatement);
      return {
        results: result.rows,
        similarColumns,
        executedQuery: sqlStatement
      };
    }
    
    // Otherwise, try to generate a reasonable SQL query based on semantic similarity
    if (similarColumns.length > 0) {
      const topColumn = similarColumns[0];
      const generatedSQL = `SELECT * FROM ${topColumn.table_name} LIMIT 10;`;
      const result = await pgClient.query(generatedSQL);
      
      return {
        results: result.rows,
        similarColumns,
        executedQuery: generatedSQL
      };
    }
    
    return {
      results: [],
      similarColumns: [],
      error: "Could not determine which data to query."
    };
  } catch (err) {
    console.error("Error executing SQL:", err);
    return {
      results: [],
      error: err.message
    };
  }
}

// Create and configure the MCP server
const server = new Server(
  {
    name: "semantic-postgres-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {
        schemas: {
          description: "Database schema information",
        },
        tables: {
          description: "Available database tables",
        },
        columns: {
          description: "Database column information with semantic descriptions",
        }
      },
      tools: {
        execute_query: {
          description: "Execute an SQL query with semantic understanding",
          parameters: {
            type: "object",
            properties: {
              natural_language_query: {
                type: "string",
                description: "Natural language description of what data you want to retrieve",
              },
              sql_statement: {
                type: "string",
                description: "Optional: Direct SQL statement to execute",
              }
            },
            required: ["natural_language_query"],
          },
        },
        find_similar_columns: {
          description: "Find columns semantically similar to a description",
          parameters: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Natural language description of the column you're looking for",
              }
            },
            required: ["description"],
          },
        }
      },
    },
  }
);

// Handler implementations (same as in previous response)
server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  /* Implementation from previous response */
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  /* Implementation from previous response */
});

server.setRequestHandler(ExecuteToolRequestSchema, async (request) => {
  /* Implementation from previous response */
});

// Start the server
(async () => {
  try {
    await initDatabase();
    
    // Update column embeddings if needed
    const metadataResult = await pgClient.query(
      "SELECT id, table_name, column_name, description FROM column_metadata WHERE embedding IS NULL;"
    );
    
    for (const row of metadataResult.rows) {
      const embedding = await generateEmbedding(
        `Table: ${row.table_name}, Column: ${row.column_name}, Description: ${row.description}`
      );
      
      if (embedding) {
        await pgClient.query(
          "UPDATE column_metadata SET embedding = $1 WHERE id = $2;",
          [embedding, row.id]
        );
        console.error(`Updated embedding for ${row.table_name}.${row.column_name}`);
      }
    }
    
    // Start MCP server
    const transport = new StdioServerTransport();
    server.listen(transport);
    console.error("MCP Server started");
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
