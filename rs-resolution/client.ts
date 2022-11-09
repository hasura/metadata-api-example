const HASURA_METADATA_API_URL = 'http://localhost:8020/v1/metadata'
const HASURA_METADATA_API_HEADERS = {
  'content-type': 'application/json',
  'X-Hasura-Role': 'admin',
}
const METADATA_JSON_REMOTE_SCHEMA = `{
  "name": "remote 1",
  "definition": {
    "url": "",
    "forward_client_headers": false,
    "customization": {}
  }
}`


await clearMetadata()
await addGraphQLAPIviaAPI("remote 1", "http://hge-rs1:8080/v1/graphql")
await addGraphQLAPIviaJSON("remote 2", "http://hge-rs2:8080/v1/graphql", "rs2", "rs2_", "")


async function clearMetadata(): Promise<void> {
  console.log('Clearing HGE metadata')
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
}

async function addGraphQLAPIviaAPI(schemaName: string, schemaUrl: string): Promise<void> {
  console.log(`Adding GraphQL Schema (AKA Remote Schema) ${schemaName}`)
  let hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
    method: 'POST',
    headers: HASURA_METADATA_API_HEADERS,
    body: `{
      "type": "add_remote_schema",
      "args": {
        "name": "${schemaName}",
        "definition": {
          "url": "${schemaUrl}",
          "forward_client_headers": false,
          "customization": {}
        }
      }
    }`
  })

  const response = await fetch(hgeMetadataRequest)
  await handleMetadataResponse(response)
}

async function addGraphQLAPIviaJSON(schemaName: string, schemaUrl: string, conflictNamespace: string, conflictPrefix: string, conflictSuffix: string): Promise<void> {
  console.log(`Exporting HGE metadata`)
  let hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
    method: 'POST',
    headers: HASURA_METADATA_API_HEADERS,
    body: `{
      "type": "export_metadata",
      "version": 1,
      "args": {}
    }`
  })

  let response = await fetch(hgeMetadataRequest)
  let exportedMetadata = await response.json()
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}\n${exportedMetadata}`)
  }
  console.log(exportedMetadata)

  console.log(`Adding GraphQL Schema (AKA Remote Schema) ${schemaName} to exported metadata`)
  let newRemoteSchema = JSON.parse(METADATA_JSON_REMOTE_SCHEMA)
  newRemoteSchema.name = schemaName
  newRemoteSchema.definition.url = schemaUrl
  exportedMetadata.remote_schemas.push(newRemoteSchema)

  console.log(`Importing/replacing updated HGE metadata`)
  hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
    method: 'POST',
    headers: HASURA_METADATA_API_HEADERS,
    body: `{
      "type": "replace_metadata",
      "version": 2,
      "args": {
        "allow_inconsistent_metadata": true,
        "metadata": ${JSON.stringify(exportedMetadata)}
      }
    }`
  })

  response = await fetch(hgeMetadataRequest)
  let metadataResponse = await response.json()
  if (!response.ok) {
    console.log(JSON.stringify(metadataResponse, null, 2))
    return
  }

  if (metadataResponse.is_consistent === false) {
    namespacePrefixSuffixConflictingRemoteFields(newRemoteSchema, conflictNamespace, conflictPrefix, conflictSuffix)
    exportedMetadata.remote_schemas[exportedMetadata.remote_schemas.length-1] = newRemoteSchema

    console.log(`Importing/replacing updated HGE metadata with remote schema conflict resolution`)
    hgeMetadataRequest = new Request(HASURA_METADATA_API_URL, {
      method: 'POST',
      headers: HASURA_METADATA_API_HEADERS,
      body: `{
        "type": "replace_metadata",
        "version": 2,
        "args": {
          "allow_inconsistent_metadata": true,
          "metadata": ${JSON.stringify(exportedMetadata)}
        }
      }`
    })
  
    response = await fetch(hgeMetadataRequest)
    await handleMetadataResponse(response)
  }
}

function namespacePrefixSuffixConflictingRemoteFields(remoteSchemaMetadata: any, namespace: string, prefix: string, suffix: string) {
  if (namespace) {
    remoteSchemaMetadata.definition.customization.root_fields_namespace = namespace
  }
  if (prefix) {
    remoteSchemaMetadata.definition.customization.type_names = { prefix }
  }
  if (suffix) {
    remoteSchemaMetadata.definition.customization.type_names = { suffix }
  }
}

async function handleMetadataResponse(response: Response): Promise<void> {
  let metadataResponse = await response.json()
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}\n${JSON.stringify(metadataResponse, null, 2)}`)
  }
  console.log(JSON.stringify(metadataResponse, null, 2))
}

export {}