# Hasura Metadata/Query API Example
## Overview
Demonstrates usage of the Hasura Query API to execute pass-through SQL queries and the Hasura Metadata API to track tables, create table relationships and define table permissions. 

*** WARNING: Please backup your metadata prior to running the example script, `track_all.mjs`, this example is destructive with respect to the Hasura metadata ***

The example script has an `.mjs` extension to enable async/await at the top level.

## Dependencies
This example uses NodeJS, which must be installed to run the script file `track_all.mjs`.
Please use `npm install` or `yarn install` the project dependencies.

## Configuration
The following constants in `track_all.mjs` must be configured:  
- `HASURA_BASE_URI` - the base URI of the Hasura API, this is also the base URI of the Hasura console e.g. `https://project-name.hasura.app`
- `HASURA_ADMIN_SECRET` - the value for the `x-hasura-admin-secret` HTTP header, which is needed to use the APIs of a Hasura Cloud Project
- `HASURA_METADATA_SOURCE_NAME` - the `Database Display Name` in the `Data` tab, within Hasura Console

## Running the example
`node track_all.mjs`