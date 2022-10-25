# Simple Hasura Metadata API Example
## Overview
Demonstrates usage of the Hasura Metadata API to track tables, create table relationships and define table permissions. 

*** WARNING: Please backup your metadata prior to running the example script, `client.ts`, this example is destructive with respect to the Hasura metadata ***

## Dependencies
- Please use `chinook.sql` file to create the required PostgreSQL schema & associated data
- This example uses Deno or Bun, which must be installed to run the script file `client.ts`

## Configuration
The following constants in `client.ts` must be configured:  
- `HASURA_METADATA_API_URL` - the base URI of the Hasura API, this is also the base URI of the Hasura console e.g. `http://localhost:8080/v1/metadata`
- `HASURA_METADATA_API_HEADERS` - The value for the `x-hasura-admin-secret` HTTP header, which is needed to use the APIs of a Hasura Cloud Project
- `METADATA_DATA_SOURCE_NAME` - the `Database Display Name` in the `Data` tab, within Hasura Console
- `PG_DB_CONNECTION_STRING` - the `Database URL` in the `Data` tab, within Hasura Console

## Running the example
`deno run --allow-net=<hostname> client.ts` e.g. `deno run --allow-net=<project-name.hasura.app> client.ts`
`bun run client.ts`