# Postgres NL2SQL MCP

A Model Context Protocol (MCP) server that enables AI assistants like Claude to perform semantic search and natural language to SQL conversion against PostgreSQL databases.

## What Is This Project?

This project implements a Model Context Protocol (MCP) server that connects AI assistants like Claude to PostgreSQL databases with semantic search capabilities. It enables natural language querying of databases by combining vector embeddings with SQL execution.

## How It Works

This MCP server creates a semantic bridge between natural language and your database structure:

1. **Semantic Understanding**: When a user asks a question in plain English, the server converts it to vector embeddings and finds the most semantically similar tables and columns in your database.

2. **Query Generation**: Based on the semantically similar tables and columns, the server generates an appropriate SQL query.

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

### 3. SQL Generation and Execution

The server can:

- Generate SQL based on semantic matches
- Execute provided SQL directly
- Return query results along with metadata

### 4. MCP Integration

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
6. SQL query is generated based on the relevant tables/columns
7. Query is executed against PostgreSQL
8. Results, SQL, and metadata are returned to Claude
9. Claude presents the information to the user

## Benefits

- **No Schema Memorization**: Users don't need to know table or column names
- **Semantic Understanding**: System understands the meaning, not just keywords
- **Database Abstraction**: Hides complex database structure from end users
- **Contextual Awareness**: Understands relationships between tables

## Getting Started

[See the semantic-postgres-mcp repository](https://github.com/cpenniman12/semantic-postgres-mcp) for implementation details and setup instructions.