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
import Anthropic from '@anthropic-ai/sdk';

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

// Configure Anthropic client for SQL generation
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

// Function to find semantically similar tables
async function findSimilarTables(query) {
  try {
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];
    
    const result = await pgClient.query(`
      SELECT table_name, description, 
             1 - (embedding <=> $1::vector) as similarity
      FROM table_metadata
      ORDER BY similarity DESC
      LIMIT 5;
    `, [queryEmbedding]);
    
    return result.rows;
  } catch (err) {
    console.error("Error finding similar tables:", err);
    return [];
  }
}

// Function to find semantically similar columns
async function findSimilarColumns(query) {
  try {
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];
    
    // Use cosine similarity to find similar columns
    const result = await pgClient.query(`
      SELECT table_name, column_name, description, data_type,
             is_primary_key, is_foreign_key, references_table, references_column,
             1 - (embedding <=> $1::vector) as similarity
      FROM column_metadata
      ORDER BY similarity DESC
      LIMIT 10;
    `, [queryEmbedding]);
    
    return result.rows;
  } catch (err) {
    console.error("Error finding similar columns:", err);
    return [];
  }
}

// Function to get database schema information
async function getDatabaseSchema() {
  try {
    const tablesResult = await pgClient.query(`
      SELECT table_name, description, primary_key_column
      FROM table_metadata
    `);
    
    const columnsResult = await pgClient.query(`
      SELECT table_name, column_name, data_type, description, 
             is_primary_key, is_foreign_key, references_table, references_column
      FROM column_metadata
    `);
    
    return {
      tables: tablesResult.rows,
      columns: columnsResult.rows
    };
  } catch (err) {
    console.error("Error fetching database schema:", err);
    return { tables: [], columns: [] };
  }
}

// Function to generate SQL query using Claude 3.5 Sonnet
async function generateSQLWithClaude(userQuery, similarTables, similarColumns, databaseSchema) {
  try {
    console.error("Generating SQL with Claude for query:", userQuery);
    
    // Organize tables by relevance for the prompt
    const relevantTables = {};
    for (const column of similarColumns) {
      if (!relevantTables[column.table_name]) {
        relevantTables[column.table_name] = {
          name: column.table_name,
          columns: [],
          description: databaseSchema.tables.find(t => t.table_name === column.table_name)?.description || ""
        };
      }
      
      relevantTables[column.table_name].columns.push({
        name: column.column_name,
        data_type: column.data_type,
        description: column.description,
        is_primary_key: column.is_primary_key,
        is_foreign_key: column.is_foreign_key,
        references_table: column.references_table,
        references_column: column.references_column
      });
    }
    
    // Construct prompt for Claude
    const prompt = `
You are an expert SQL query generator. Given a user's natural language question and information about relevant database tables and columns, generate a valid PostgreSQL query that answers the user's question.

USER QUESTION:
${userQuery}

DATABASE SCHEMA:
Tables and columns that are most semantically relevant to the user's question:
${Object.values(relevantTables).map(table => `
TABLE: ${table.name}
DESCRIPTION: ${table.description}
COLUMNS:
${table.columns.map(col => 
  `- ${col.name} (${col.data_type})${col.is_primary_key ? ' PRIMARY KEY' : ''}${col.is_foreign_key ? ` FOREIGN KEY -> ${col.references_table}.${col.references_column}` : ''} 
   Description: ${col.description}`
).join('\n')}`).join('\n\n')}

TASK:
Generate a valid PostgreSQL query that answers the user's question based on the available database schema.
Your query should:
1. Include only tables and columns that exist in the database
2. Use proper JOIN syntax where relationships between tables exist
3. Use appropriate conditions and filters based on the user's question
4. Be optimized and efficient
5. Return meaningful column names (use aliases where appropriate)

RESPONSE FORMAT:
Respond with ONLY the SQL query, nothing else - no explanations, no comments, just the raw SQL query.
`;

    // Call Claude API to generate SQL
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      messages: [{ 
        role: "user", 
        content: prompt 
      }],
      temperature: 0.2, // Low temperature for deterministic, precise SQL generation
    });
    
    // Extract SQL from Claude's response
    const generatedSQL = response.content[0].text.trim();
    console.error("Generated SQL:", generatedSQL);
    
    return generatedSQL;
  } catch (err) {
    console.error("Error generating SQL with Claude:", err);
    throw new Error(`Failed to generate SQL: ${err.message}`);
  }
}

// Function to execute SQL with semantic understanding
async function semanticSQLExecute(query, sqlStatement) {
  try {
    // Get database schema for context
    const databaseSchema = await getDatabaseSchema();
    
    // First, check if the user is asking about specific tables and columns
    const similarTables = await findSimilarTables(query);
    const similarColumns = await findSimilarColumns(query);
    
    // If the SQL statement is provided, use it directly
    if (sqlStatement && sqlStatement.trim()) {
      const result = await pgClient.query(sqlStatement);
      return {
        results: result.rows,
        similarTables,
        similarColumns,
        executedQuery: sqlStatement
      };
    }
    
    // Otherwise, generate SQL query using Claude 3.5 Sonnet
    if (similarColumns.length > 0) {
      // Generate SQL using Claude
      const generatedSQL = await generateSQLWithClaude(
        query, 
        similarTables,
        similarColumns, 
        databaseSchema
      );
      
      // Execute the generated SQL
      try {
        const result = await pgClient.query(generatedSQL);
        
        return {
          results: result.rows,
          similarTables,
          similarColumns,
          executedQuery: generatedSQL
        };
      } catch (sqlError) {
        console.error("Error executing generated SQL:", sqlError);
        return {
          results: [],
          similarTables,
          similarColumns,
          error: `Error executing generated SQL: ${sqlError.message}`,
          generatedQuery: generatedSQL
        };
      }
    }
    
    return {
      results: [],
      similarTables,
      similarColumns,
      error: "Could not determine which data to query."
    };
  } catch (err) {
    console.error("Error executing semantic SQL:", err);
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
        find_similar_tables: {
          description: "Find tables semantically similar to a description",
          parameters: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Natural language description of the table you're looking for",
              }
            },
            required: ["description"],
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

// Handler for listing resources
server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  if (request.resourceName === "schemas") {
    return {
      resources: ["main"],
    };
  } else if (request.resourceName === "tables") {
    try {
      const result = await pgClient.query("SELECT table_name FROM table_metadata");
      return {
        resources: result.rows.map(row => row.table_name),
      };
    } catch (err) {
      console.error("Error listing tables:", err);
      return { resources: [] };
    }
  } else if (request.resourceName === "columns") {
    try {
      const result = await pgClient.query("SELECT table_name, column_name FROM column_metadata");
      return {
        resources: result.rows.map(row => `${row.table_name}.${row.column_name}`),
      };
    } catch (err) {
      console.error("Error listing columns:", err);
      return { resources: [] };
    }
  }
  
  return { resources: [] };
});

// Handler for reading resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.resourceName === "schemas" && request.resourceId === "main") {
    try {
      const result = await pgClient.query(`
        SELECT table_name, column_name, data_type, description 
        FROM column_metadata
        ORDER BY table_name, column_name
      `);
      
      // Group by table
      const schema = {};
      for (const row of result.rows) {
        if (!schema[row.table_name]) {
          schema[row.table_name] = [];
        }
        schema[row.table_name].push({
          name: row.column_name,
          type: row.data_type,
          description: row.description
        });
      }
      
      return { content: schema };
    } catch (err) {
      console.error("Error reading schema:", err);
      return { content: {} };
    }
  } else if (request.resourceName === "tables") {
    try {
      const result = await pgClient.query(`
        SELECT table_name, description, primary_key_column
        FROM table_metadata
        WHERE table_name = $1
      `, [request.resourceId]);
      
      if (result.rows.length === 0) {
        return { error: "Table not found" };
      }
      
      return { content: result.rows[0] };
    } catch (err) {
      console.error(`Error reading table ${request.resourceId}:`, err);
      return { error: err.message };
    }
  } else if (request.resourceName === "columns") {
    try {
      const [tableName, columnName] = request.resourceId.split(".");
      
      const result = await pgClient.query(`
        SELECT table_name, column_name, data_type, description, 
               is_primary_key, is_foreign_key, references_table, references_column
        FROM column_metadata
        WHERE table_name = $1 AND column_name = $2
      `, [tableName, columnName]);
      
      if (result.rows.length === 0) {
        return { error: "Column not found" };
      }
      
      return { content: result.rows[0] };
    } catch (err) {
      console.error(`Error reading column ${request.resourceId}:`, err);
      return { error: err.message };
    }
  }
  
  return { error: "Resource not found" };
});

// Handler for executing tools
server.setRequestHandler(ExecuteToolRequestSchema, async (request) => {
  if (request.name === "execute_query") {
    const { natural_language_query, sql_statement } = request.parameters;
    
    try {
      const result = await semanticSQLExecute(natural_language_query, sql_statement);
      return { result };
    } catch (err) {
      console.error("Error executing query:", err);
      return { error: err.message };
    }
  } else if (request.name === "find_similar_tables") {
    const { description } = request.parameters;
    
    try {
      const similarTables = await findSimilarTables(description);
      return { result: similarTables };
    } catch (err) {
      console.error("Error finding similar tables:", err);
      return { error: err.message };
    }
  } else if (request.name === "find_similar_columns") {
    const { description } = request.parameters;
    
    try {
      const similarColumns = await findSimilarColumns(description);
      return { result: similarColumns };
    } catch (err) {
      console.error("Error finding similar columns:", err);
      return { error: err.message };
    }
  }
  
  return { error: "Tool not found" };
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
