import fs from 'fs'
import httpClient from 'got'

/**
 * WARNING
 * Please backup your metadata prior to running the example script, `track_all.mjs`,
 * this example is destructive with respect to the Hasura metadata
 */

// the following 3 constant need to be set with your specific environment values
const HASURA_BASE_URI = 'http://localhost:8080'//'https://project-name.hasura.app'
const HASURA_ADMIN_SECRET = ''//'project-secret'
const HASURA_METADATA_SOURCE_NAME = 'default'//'database-display-name'

// https://hasura.io/docs/latest/graphql/core/api-reference/schema-api/index.html
const HASURA_QUERY_ENDPOINT_URI_PATH = '/v2/query'
// https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/index.html
const HASURA_METADATA_ENDPOINTURI_URI_PATH = '/v1/metadata'

const SQL_SELECT_TABLES = fs.readFileSync('tables.sql').toString()
const SQL_SELECT_FOREIGN_KEYS = fs.readFileSync('foreign-keys.sql').toString()
const SQL_SELECT_PRIMARY_KEYS = fs.readFileSync('primary-keys.sql').toString()


await clearMetadata(HASURA_METADATA_SOURCE_NAME)
await trackAllTables(HASURA_METADATA_SOURCE_NAME)
await trackAllForeignKeys(HASURA_METADATA_SOURCE_NAME)
await addPermissionAllTables(HASURA_METADATA_SOURCE_NAME, {
    "role" : "user",
    "permission" : {
        "columns" : "*",
        "filter": {},
        "allow_aggregations": true
    }
})

/*
* Convert the Hasura SQL Query results to JS objects
*/
function convertTuplesToObjects(tupleArray) {
    const rows = []
    const header = tupleArray[0]
    for (let i = 1; i < tupleArray.length; i++) {
        const tupple = tupleArray[i]
        const row = {}
        header.forEach((column, i) => {
            if (tupple.length > i)
                row[String(column)] = tupple[i]
        })
        rows.push(row)
    }
    return rows
}

/*
* Generate the singular & plural names, given a table name
*/
function singularPluralNames(tableName) {
    if (tableName.endsWith('ies'))
        return [
            tableName.substring(0, tableName.length-3) + 'y',
            tableName
        ]
    else if (tableName.endsWith('s'))
        return [
            tableName.substring(0, tableName.length-1),
            tableName
        ]
    else if (tableName.endsWith('y')) // singular table name
        return [
            tableName,
            tableName.substring(0, tableName.length-1) + 'ies'
        ]
    else // singular table name
        return [
            tableName,
            tableName + 's'
        ]
}

/*
* Fetch Hasura metadata via REST API metadata export
*/
async function fetchMetadata(sourceName) {
    // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/manage-metadata.html#export-metadata
    const json = await httpClient.post(HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH, {
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: {
            "type": "export_metadata",
            "version": 2,
            "args": {}
        }
    }).json()
    if (!sourceName)
        return json.metadata
 
    // return the source-specific metadata, if a source name is provided
    // in metadata.sources
    const sourceIndex = data.metadata.sources.findIndex((source) => {
        return (source.name == sourceName)
    })
    if (sourceIndex < 0) 
        return {}
    else
        return json.metadata.sources[sourceIndex]
}

/*
* Clear table metadata for the specified source name - this effectively removes tracked tables, table relationships & table permissions
*/
async function clearMetadata(sourceName) {
    console.log('clearMetadata:', sourceName)
    const metadata = await fetchMetadata()
    const sourceIndex = metadata.sources.findIndex((source) => {
        return (source.name == sourceName)
    })
    if (sourceIndex < 0)
        return

    // clear the table metadata for source name
    metadata.sources[sourceIndex].tables = []

    // replace the fetched & cleared metadata via REST API call
    // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/manage-metadata.html#replace-metadata
    const json = await httpClient.post(HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH, {
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: {
            "type": "replace_metadata",
            "version": 2,
            "args": {
                metadata: metadata
            }
        }
    }).json()
    //console.log(json)
    console.log('finished clearMetadata')
}

/*
* track all tables
* select all the tables, then track each table
* this function assumes no tables are being tracked
*/
async function trackAllTables(sourceName) {
    console.log('trackAllTables:', sourceName)
    // retrieve all db tables via Hasura pass-through SQL query
    let json = await httpClient.post(HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH, {
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: {
            "type": "run_sql",
            "version": 2,
            "args": {
                "source": sourceName,
                "sql": SQL_SELECT_TABLES
            }
        }
    }).json()
    const data = convertTuplesToObjects(json.result)
    //console.log(data)

    // create a bulk query (list of queries), each query tracks 1 table
    const bulkQuery = {
        "type": "bulk",
        "args": []
    }
    data.forEach(table => {
        bulkQuery.args.push({
            "type": "pg_track_table",
            "args": {
              "source": sourceName,
              "table": {
                "schema": table.table_schema,
                "name": table.table_name
              },
              "configuration": {
              }
            }
          })
    })
    //console.log('bulkQuery', bulkQuery)

    // execute the metadata queries via REST API call
    // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/table-view.html#pg-track-table
    json = await httpClient.post(HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: bulkQuery
    }).json()
    //console.log(json)
    console.log('finished trackAllTables')
}

/*
* track all foreign-keys/relationships
* select tables then track each table 
*/
async function trackAllForeignKeys(sourceName) {
    console.log('trackAllForeignKeys:', sourceName)
    // retrieve all db primary keys via Hasura pass-through SQL query
    let json = await httpClient.post(HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: {
            "type": "run_sql",
            "version": 2,
            "args": {
                "source": sourceName,
                "sql": SQL_SELECT_PRIMARY_KEYS
            }
        }
    }).json()

    const primaryKeys = {}
    json.result.forEach((primaryKey, index) => {
        // [table_schema, table_name, constraint_name, columns]
        if (index == 0) 
            return

        primaryKeys[primaryKey[0]+'.'+primaryKey[1]] = primaryKey[3]
    })
    //console.log(primaryKeys)

    // retrieve all db foreign keys via Hasura pass-through SQL query
    json = await httpClient.post(HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: {
            "type": "run_sql",
            "version": 2,
            "args": {
                "source": sourceName,
                "sql": SQL_SELECT_FOREIGN_KEYS
            }
        }
    }).json()
    const data = convertTuplesToObjects(json.result)
    //console.log(data)

    // create a bulk query (list of queries), each query creates 1 table relationship
    const bulkQuery = {
        "type": "bulk",
        "args": []
    }
    data.forEach(foreignKey => {
        const [singularTableName, pluralTableName] = singularPluralNames(foreignKey.table_name)
        const [singularRefTableName, pluralRefTableName] = singularPluralNames(foreignKey.ref_table)

        // create an array for the table & reference table columns in the foreign key
        const tableColumns = [] 
        const refTableColumns = [] 
        for (const [key, value] of Object.entries(JSON.parse(foreignKey.column_mapping))) {
            tableColumns.push(key)
            refTableColumns.push(value)
        }

        // create an object relationship (single instance) on the specified table for the reference table
        // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#pg-create-object-relationship
        bulkQuery.args.push({
            type: 'pg_create_object_relationship',
            args: {
                source: sourceName,
                table: {
                    schema: foreignKey.table_schema,
                    name: foreignKey.table_name
                },
                name: singularRefTableName,
                using: {
                    foreign_key_constraint_on: tableColumns
                }
            }
        })

        // create a relationship on the reference table for the specified table
        // reverse direction of the relation ship above
        // create an array relationship if the column(s) in the reference table is/are not the primary key
        // otherwise create an object relationship
        const refTableName = foreignKey.ref_table_table_schema+'.'+foreignKey.ref_table
        const refTablePrimaryKeyColumns = refTableName in primaryKeys ? primaryKeys[refTableName] : []
        const foreignKeyIsPrimaryKey = (JSON.stringify(refTableColumns) === JSON.stringify(refTablePrimaryKeyColumns))
        if (foreignKeyIsPrimaryKey)
            // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#pg-create-object-relationship
            bulkQuery.args.push({
                type: 'pg_create_object_relationship',
                args: {
                    source: sourceName,
                    table: {
                        schema: foreignKey.ref_table_table_schema,
                        name: foreignKey.ref_table
                    },
                    name: pluralTableName,
                    using: {
                        foreign_key_constraint_on: refTableColumns
                    }
                }
            })
        else
            // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#pg-create-array-relationship
            bulkQuery.args.push({
                type: 'pg_create_array_relationship',
                "args": {
                    "source": sourceName,
                    "table": {
                        "schema": foreignKey.ref_table_table_schema,
                        "name": foreignKey.ref_table
                    },
                    name: pluralTableName,
                    "using": {
                        foreign_key_constraint_on: {
                            table: {
                                schema: foreignKey.table_schema,
                                name: foreignKey.table_name
                            },
                            columns: tableColumns
                        }
                    }
                }
            })
    })
    //console.log('bulkQuery', bulkQuery)

    // execute the metadata queries via REST API call
    json = await httpClient.post(HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: bulkQuery,
        timeout: { request: 30000 }
    }).json()
    //console.log(json)
    console.log('finished trackAllForeignKeys')
}

/*
* add select permision to all tables
* select tables then add permission each table 
*/
async function addPermissionAllTables(sourceName, permissionArgs) {
    console.log('addPermissionAllTables:', sourceName)
    // retrieve all db tables via Hasura pass-through SQL query
    let json = await httpClient.post(HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: {
            "type": "run_sql",
            "version": 2,
            "args": {
                "source": sourceName,
                "sql": SQL_SELECT_TABLES
            }
        }
    }).json()
    const data = convertTuplesToObjects(json.result)
    //console.log(data)
    
    // create a bulk query (list of queries), each query creates 1 table select permission
    const bulkQuery = {
        "type": "bulk",
        "args": []
    }
    data.forEach(table => {
        const args = JSON.parse(JSON.stringify(permissionArgs))
        args.source = sourceName
        args.table = {
            "schema": table.table_schema,
            "name": table.table_name
          }
        bulkQuery.args.push({
            "type": "pg_create_select_permission",
            args
          })
    })
    //console.log('bulkQuery', bulkQuery)

    // execute the metadata queries via REST API call
    // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/permission.html#pg-create-select-permission
    json = await httpClient.post(HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: bulkQuery
    }).json()
    //console.log(json)
    console.log('finished addPermissionAllTables')
}
