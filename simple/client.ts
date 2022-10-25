const HASURA_METADATA_API_URL = 'http://localhost:8080/v1/metadata'
const HASURA_METADATA_API_HEADERS = {
  'content-type': 'application/json',
  'x-hasura-admin-secret': 'myadminsecretkey',
  'X-Hasura-Role': 'admin',
}
const METADATA_DATA_SOURCE_NAME = 'test'
const PG_DB_CONNECTION_STRING = 'postgres://postgres:postgrespassword@postgres:5432/postgres'

console.log('Clearing metadata')
let hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
  method: 'POST',
  headers: HASURA_METADATA_API_HEADERS,
  body: JSON.stringify({
    "type": "clear_metadata",
    "args": {}
  })
})
let response = await fetch(hgeMetadataRequest)
await handleMetadataResponse(response)

console.log('Adding data source')
hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
  method: 'POST',
  headers: HASURA_METADATA_API_HEADERS,
  body: `{
    "type": "pg_add_source",
    "args": {
      "name": "${METADATA_DATA_SOURCE_NAME}",
      "kind": "postgres",
      "configuration": {
          "connection_info": {
            "database_url": "${PG_DB_CONNECTION_STRING}",
              "isolation_level": "read-committed",
              "use_prepared_statements": false
          }
      },
      "customization": {
          "naming_convention": "hasura-default"
      }
    }
  }`
})
response = await fetch(hgeMetadataRequest)
await handleMetadataResponse(response)

await trackTable(METADATA_DATA_SOURCE_NAME, 'public', 'artists')
await trackTable(METADATA_DATA_SOURCE_NAME, 'public', 'albums')
await trackTable(METADATA_DATA_SOURCE_NAME, 'public', 'tracks')

await trackArrayRelationship(METADATA_DATA_SOURCE_NAME, 'public', 'artists', 'albums', 'albums', ["artist_id"])
await trackObjectRelationship(METADATA_DATA_SOURCE_NAME, 'public', 'albums', 'artist', ["artist_id"])
await trackArrayRelationship(METADATA_DATA_SOURCE_NAME, 'public', 'albums', 'tracks', 'tracks', ["album_id"])
await trackObjectRelationship(METADATA_DATA_SOURCE_NAME, 'public', 'tracks', 'album', ["album_id"])

const HASURA_METADATA_TABLE_PERMISSION_ARGS = {
  "source": "",
  "table": {
    "schema": "",
    "name": "",
  },
  "role" : "user",
  "permission" : {
      "columns" : "*",
      "filter": {},
      "allow_aggregations": true
  }
}
await addSelectPermissionToTable(METADATA_DATA_SOURCE_NAME, 'public', 'artists', HASURA_METADATA_TABLE_PERMISSION_ARGS)
await addSelectPermissionToTable(METADATA_DATA_SOURCE_NAME, 'public', 'albums', HASURA_METADATA_TABLE_PERMISSION_ARGS)
await addSelectPermissionToTable(METADATA_DATA_SOURCE_NAME, 'public', 'tracks', HASURA_METADATA_TABLE_PERMISSION_ARGS)

async function handleMetadataResponse(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }
  let metadataResponse = await response.text()
  console.log(metadataResponse)
}

async function trackTable(dataSourceName: string, schemaName: string, tableName: string): Promise<void> {
  console.log(`Tracking table ${schemaName}.${tableName}`)
  hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
    method: 'POST',
    headers: HASURA_METADATA_API_HEADERS,
    body: `{
      "type": "pg_track_table",
      "args": {
        "source": "${dataSourceName}",
        "table": {
          "schema": "${schemaName}",
          "name": "${tableName}"
        },
        "configuration": {}
      }
    }`
  })

  const response = await fetch(hgeMetadataRequest)
  await handleMetadataResponse(response)
}

async function trackArrayRelationship(dataSourceName: string, schemaName: string, tableName: string, relationshipName: string, remoteTableName: string, remoteTableForeignKeyColumnNames: Array<string>): Promise<void> {
  console.log(`Tracking relationship ${schemaName}.${tableName} → [ ${relationshipName} ]`)
  hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
    method: 'POST',
    headers: HASURA_METADATA_API_HEADERS,
    body: `{
      "type": "pg_create_array_relationship",
      "args": {
          "table": {
            "schema": "${schemaName}",
            "name": "${tableName}"
          },
          "name": "${relationshipName}",
          "source": "${dataSourceName}",
          "using": {
              "foreign_key_constraint_on" : {
                  "table" : {
                    "schema": "${schemaName}",
                    "name": "${remoteTableName}"
                  },
                  "columns" : ${JSON.stringify(remoteTableForeignKeyColumnNames)}
              }
          }
      }
    }`
  })

  const response = await fetch(hgeMetadataRequest)
  await handleMetadataResponse(response)
}

async function trackObjectRelationship(dataSourceName: string, schemaName: string, tableName: string, relationshipName: string, foreignKeyColumnNames: Array<string>): Promise<void> {
  console.log(`Tracking relationship ${schemaName}.${tableName} → ${relationshipName}`)
  hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
    method: 'POST',
    headers: HASURA_METADATA_API_HEADERS,
    body: `{
      "type": "pg_create_object_relationship",
      "args": {
          "table": {
            "schema": "${schemaName}",
            "name": "${tableName}"
          },
          "name": "${relationshipName}",
          "source": "${dataSourceName}",
          "using": {
              "foreign_key_constraint_on" : ${JSON.stringify(foreignKeyColumnNames)}
          }
      }
    }`
  })

  const response = await fetch(hgeMetadataRequest)
  await handleMetadataResponse(response)
}

async function addSelectPermissionToTable(dataSourceName: string, schemaName: string, tableName: string, permissionArgs: object) {
  console.log(`Adding select permission to ${schemaName}.${tableName}`)
  const args = JSON.parse(JSON.stringify(permissionArgs))
  args.source = dataSourceName
  args.table.schema = schemaName
  args.table.name = tableName

  hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
    method: 'POST',
    headers: HASURA_METADATA_API_HEADERS,
    body: `{
      "type": "pg_create_select_permission",
      "args": ${JSON.stringify(args)}
    }`
  })

  const response = await fetch(hgeMetadataRequest)
  await handleMetadataResponse(response)
}
export {}