# Hasura Remote Schema Metadata API Example
## Overview
Demonstrates usage of the Hasura Metadata API to to add GraphQL APIs (AKA remote schemas), check for conflicts (AKA inconsistent metadata) and resolve those conflict (if they exist) with schema customization - e.g. namespacing & type prefixing. 

*** WARNING: Please backup your metadata prior to running the example script, `client.ts`, this example is destructive with respect to the Hasura metadata ***

## Dependencies
- This example uses Deno or Bun, which must be installed to run the script file `client.ts`

## Configuration
The example is fully self-contained in the included `docker-compose.yaml`.

## Running the example
`deno run --allow-net=<hostname> client.ts` e.g. `deno run --allow-net=<project-name.hasura.app> client.ts`
`bun run client.ts`