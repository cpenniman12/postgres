# Postgres NL2SQL MCP

A Model Context Protocol (MCP) server that enables AI assistants like Claude to perform semantic search and natural language to SQL conversion against PostgreSQL databases.

## What Is This Project?

This project implements a Model Context Protocol (MCP) server that connects AI assistants like Claude to PostgreSQL databases with semantic search capabilities. It enables natural language querying of databases by combining vector embeddings with SQL execution.

## How It Works

This MCP server creates a semantic bridge between natural language and your database structure:

1. **Semantic Understanding**: When a user asks a question in plain English, the server converts it to vector embeddings and finds the most semantically similar tables and columns in your database.

2. **Query Generation**: Based on the semantically similar tables and columns, the server uses Claude 3.5 Sonnet to generate an appropriate SQL query.

3. **SQL Execution**: The generated SQL is executed against your PostgreSQL database.

4. **Result Processing**: The results, along with the generated SQL and metadata about the matched tables/columns, are returned to the AI assistant.

5. **User Presentation**: The AI assistant presents the information to the user in a helpful, context-aware manner.

## Key Components

### 1. Metadata Tables with Vector Embeddings

The system stores detailed metadata about your database structure:

- **table_metadata**: Information about tables with vector embeddings
- **column_metadata**: Information about columns with vector embeddings
- **semantic_relations**: Relationships between database entities

These tables store rich descriptions that are converted to vector embeddings (using OpenAI's embedding API) enabling semantic search.

### 2. Semantic Search Functions

The MCP server includes functions for finding semantically similar database entities:

- `findSimilarTables(query)`: Finds tables that semantically match the user's query
- `findSimilarColumns(query)`: Finds columns that semantically match the user's query

### 3. Claude 3.5 Sonnet for SQL Generation

The server leverages Claude 3.5 Sonnet's language understanding capabilities to:

- Generate sophisticated SQL queries based on semantic matches
- Understand complex natural language queries
- Handle JOIN relationships, aggregations, and filters appropriately

### 4. SQL Execution and Result Processing

The server:

- Executes the Claude-generated SQL against your PostgreSQL database
- Returns query results along with metadata
- Provides error handling and query diagnostics

### 5. MCP Integration

As a Model Context Protocol server, it implements:

- **Resources**: Provides information about database schemas, tables, and columns
- **Tools**: Offers tools for executing queries and finding similar entities

## Use Cases

- **Natural Language Querying**: "Show me customers who spent over $1000" → SQL generation and execution
- **Database Exploration**: "What information do we store about products?" → Semantic table/column discovery
- **Data Analysis**: "Find the most popular product categories" → Contextual query execution

## Technical Flow

1. User asks a question to Claude
2. Claude sends the natural language query to the MCP server
3. MCP server converts query to embeddings
4. Embeddings are compared against table and column metadata embeddings
5. Semantically relevant tables and columns are identified
6. Claude 3.5 Sonnet generates SQL query based on the relevant tables/columns and original query
7. Query is executed against PostgreSQL
8. Results, SQL, and metadata are returned to Claude
9. Claude presents the information to the user

## Detailed MCP Implementation

### Vector Embedding Process

The MCP server uses a two-phase approach for vector embeddings:

1. **Initialization Phase**:
   - When the server starts, it checks for any table or column metadata that doesn't have embeddings
   - For each missing embedding, it generates a rich contextual description (e.g., "Table: customers, Description: Contains customer personal information...")
   - This description is sent to the OpenAI embeddings API to generate a 1536-dimension vector
   - The vector is stored in the corresponding metadata table

2. **Query Phase**:
   - When a user query arrives, it's converted to the same vector space using the same embedding model
   - Cosine similarity (`1 - (embedding <=> query_embedding)`) is used to find the most semantically similar database entities

### SQL Generation with Claude

The MCP includes a multi-step SQL generation process:

1. **Context Collection**:
   - Identifies the most semantically relevant tables based on the query embedding
   - Identifies relevant columns across those tables
   - Retrieves relationship information between tables

2. **Claude Prompt Construction**:
   - Creates a detailed prompt with the user's query
   - Includes structured information about relevant tables, columns, and relationships
   - Guides Claude to generate valid PostgreSQL syntax

3. **SQL Generation**:
   - Claude 3.5 Sonnet analyzes the database context and user query
   - Generates appropriate SQL query with proper JOIN, WHERE, and other clauses
   - Returns clean, executable SQL statement

4. **Validation and Execution**:
   - The generated SQL is validated for safety
   - Executed against the PostgreSQL database
   - Results and query information are returned to the client

### MCP Protocol Integration

This implementation follows Anthropic's Model Context Protocol specification:

1. **MCP Server Definition**:
   - Defines capabilities (resources and tools)
   - Sets up request handlers for listing resources, reading resources, and executing tools
   - Uses stdio transport for communication with Claude

2. **Resources Exposed**:
   - **schemas**: Database schema information
   - **tables**: Available database tables with descriptions
   - **columns**: Column information with semantic descriptions

3. **Tools Implemented**:
   - **execute_query**: Executes SQL with semantic understanding
   - **find_similar_columns**: Finds columns similar to a description
   - **find_similar_tables**: Finds tables similar to a description

4. **Response Structure**:
   - For resource requests: Returns structured information about database entities
   - For tool executions: Returns results, metadata, and diagnostic information

## Benefits

- **No Schema Memorization**: Users don't need to know table or column names
- **Semantic Understanding**: System understands the meaning, not just keywords
- **Database Abstraction**: Hides complex database structure from end users
- **Contextual Awareness**: Understands relationships between tables
- **Advanced SQL Generation**: Claude 3.5 Sonnet generates appropriate SQL for complex queries
- **Hybrid Search**: Combines vector similarity with traditional database querying

## Setup Instructions

1. **Prerequisites**:
   - PostgreSQL database with pgvector extension installed
   - Node.js environment

2. **Installation**:
   ```bash
   # Clone this repository
   git clone https://github.com/cpenniman12/postgres.git
   cd postgres
   
   # Install dependencies
   npm install
   ```

3. **Configuration**:
   ```bash
   # Copy the sample .env file
   cp .env.sample .env
   
   # Edit the .env file with your credentials
   # - PostgreSQL connection details
   # - OpenAI API key (for embeddings)
   # - Anthropic API key (for Claude)
   ```

4. **Database Setup**:
   ```bash
   # Run the database setup script in PostgreSQL
   psql -U postgres < DummyDBSchema
   ```

5. **Running the MCP Server**:
   ```bash
   npm start
   ```

6. **Connecting to Claude**:
   - Configure Claude Desktop to connect to your MCP server
   - Start asking natural language questions about your database

## Future Enhancements

- **Query Explanation**: Generating natural language explanations of SQL queries
- **Query Optimization**: Suggesting index improvements based on query patterns
- **Incremental Learning**: Improving semantic matching based on user feedback
- **Multi-Database Support**: Extending beyond PostgreSQL to other database systems
- **Guardrails & Safety**: Enhanced validation and protection against SQL injection

## See Also

[Semantic Postgres MCP Repository](https://github.com/cpenniman12/semantic-postgres-mcp) for additional implementation details.
