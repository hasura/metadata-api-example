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


//await clearMetadata(HASURA_METADATA_SOURCE_NAME)
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
        for (let i = 0; i < header.length; i++) {
            if (tupple.length > i)
                row[String(header[i])] = tupple[i]
        }
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
* Generic function to call the Hasura API metadata via REST API metadata export
*/
async function callHasuraAPI(uri, jsonPayload, noop = false) {
    if (noop) {
        console.log(JSON.stringify(jsonPayload))
        return await new Promise((resolve, reject) => { reject("noop")})
    }

    return await httpClient.post(uri, {
        headers: {
            'content-type': 'application/json',
            'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
            "X-Hasura-Role": 'admin'
        },
        json: jsonPayload
    }).json()
}

/*
* Fetch Hasura metadata via REST API metadata export
*/
async function fetchMetadata(sourceName) {
    let json
    try {
        // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/manage-metadata.html#export-metadata
        json = await callHasuraAPI(
            HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH,
            {
                "type": "export_metadata",
                "version": 2,
                "args": {}
            }
        )
    } catch(err) {
        console.log('fetchMetadata: error fetching metadata')
        if(err.response)
            console.log(err.response.body)
        return
    }
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
    if(!metadata || !metadata.sources)
        return

    const sourceIndex = metadata.sources.findIndex((source) => {
        return (source.name == sourceName)
    })
    if (sourceIndex < 0)
        return

    // clear the table metadata for source name
    metadata.sources[sourceIndex].tables = []

    try {
        // replace the fetched & cleared metadata via REST API call
        // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/manage-metadata.html#replace-metadata
        const json = await callHasuraAPI(
            HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH,
            {
                "type": "replace_metadata",
                "version": 2,
                "args": {
                    metadata: metadata
                }
            }
        )
        //console.log(json)
        console.log('finished clearMetadata')
    } catch(err) {
        console.error('clearMetadata: error clearing metadata')
        if(err.response)
            console.error(err.response.body)
        else
            console.error(err)
    }
}

/*
* track all tables
* select all the tables, then track each table
* this function assumes no tables are being tracked
*/
async function trackAllTables(sourceName) {
    console.log('trackAllTables:', sourceName)
    let json
    try {
        // retrieve all db tables via Hasura pass-through SQL query
        json = await callHasuraAPI(
            HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH,
            {
                "type": "run_sql",
                "version": 2,
                "args": {
                    "source": sourceName,
                    "sql": SQL_SELECT_TABLES
                }
            }
        )
    } catch(err) {
        console.error('trackAllTables: error selecting tables')
        if(err.response)
            console.error(err.response.body)
        else
            console.error(err)
        return
    }
    const data = convertTuplesToObjects(json.result)
    //console.log(data)

    // create a bulk query (list of queries), each query tracks 1 table
    for (const table of data) {
        // execute the metadata queries via REST API call
        // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/table-view.html#pg-track-table
        try {
            await callHasuraAPI(
                HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH,
                {
                    "type": "pg_track_table",
                    "args": {
                        "source": sourceName,
                        "table": {
                            "schema": table.table_schema,
                            "name": table.table_name
                        },
                        "configuration": {}
                    }
                },
                false
            )
            console.log(`tracking table ${table.table_schema}.${table.table_name}`)
        } catch(err) {
            if(err.response && err.response.body) {
                if (err.response.body.includes('"code":"already-tracked"'))
                    console.log(`Table ${table.table_schema}.${table.table_name} is already tracked`)
                else {
                    console.error(`trackAllTables: error tracking ${table.table_schema}.${table.table_name}`)
                    console.error(err.response.body)
                }
            } else {
                console.error(`trackAllTables: error tracking ${table.table_schema}.${table.table_name}`)
                console.error(err)
            }
        }
    }

    console.log('finished trackAllTables')
}

/*
* track all foreign-keys/relationships
* select tables then track each table 
*/
async function trackAllForeignKeys(sourceName) {
    console.log('trackAllForeignKeys:', sourceName)
    let json
    try {
        // retrieve all db primary keys via Hasura pass-through SQL query
        json = await callHasuraAPI(
            HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH,
            {
                "type": "run_sql",
                "version": 2,
                "args": {
                    "source": sourceName,
                    "sql": SQL_SELECT_PRIMARY_KEYS
                }
            }
        )
    } catch(err) {
        console.error('trackAllForeignKeys: error selecting primary keys')
        if(err.response)
            console.error(err.response.body)
        else
            console.error(err)
        return
    }

    const primaryKeys = {}
    //for (let i = 0; i < json.result.length; i++) {
    for (const [index, primaryKey] of json.result.entries()) {
        // [table_schema, table_name, constraint_name, columns]
        if (index == 0) 
            continue

        primaryKeys[primaryKey[0]+'.'+primaryKey[1]] = JSON.parse(primaryKey[3])
    }
    //console.log(primaryKeys)

    try {
        // retrieve all db foreign keys via Hasura pass-through SQL query
        json = await callHasuraAPI(
            HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH,
            {
                "type": "run_sql",
                "version": 2,
                "args": {
                    "source": sourceName,
                    "sql": SQL_SELECT_FOREIGN_KEYS
                }
            }
        )
    } catch(err) {
        console.error('trackAllForeignKeys: error selecting foreign keys')
        if(err.response)
            console.error(err.response.body)
        else
            console.error(err)
        return
    }
    const data = convertTuplesToObjects(json.result)
    //console.log(data)

    for (const foreignKey of data) {
        const [singularTableName, pluralTableName] = singularPluralNames(foreignKey.table_name)
        const [singularRefTableName, pluralRefTableName] = singularPluralNames(foreignKey.ref_table)

        // create an array for the table & reference table columns in the foreign key
        const tableColumns = [] 
        const refTableColumns = [] 
        for (const [key, value] of Object.entries(JSON.parse(foreignKey.column_mapping))) {
            tableColumns.push(key)
            refTableColumns.push(value)
        }

        try {
            // create an object relationship (single instance) on the specified table for the reference table
            // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#pg-create-object-relationship
            // execute the metadata queries via REST API call
            json = await callHasuraAPI(
                HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH,
                {
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
                },
                false
            )
            console.log(`created object relationship ${singularRefTableName} on ${foreignKey.table_schema}.${foreignKey.table_name} using ${tableColumns}`)
        } catch(err) {
            if(err.response && err.response.body) {
                if (err.response.body.includes('"code":"already-exists"'))
                    console.log(`Object relationship ${singularRefTableName} on ${foreignKey.table_schema}.${foreignKey.table_name} using ${tableColumns}, it already exists`)
                else {
                    console.error(`trackAllForeignKeys: error creating object relationship ${singularRefTableName} on ${foreignKey.table_schema}.${foreignKey.table_name} using ${tableColumns}`)
                    console.error(err.response.body)
                }
            } else {
                console.error(`trackAllForeignKeys: error creating object relationship ${singularRefTableName} on ${foreignKey.table_schema}.${foreignKey.table_name} using ${tableColumns}`)
                console.error(err)
            }
        }

        // create a relationship on the reference table for the specified table
        // reverse direction of the relation ship above
        // create an array relationship if the column(s) in the current table is/are not the primary key
        // otherwise create an object relationship
        const tableName = foreignKey.table_schema+'.'+foreignKey.table_name
        const tablePrimaryKeyColumns = tableName in primaryKeys ? primaryKeys[tableName] : []
        const foreignKeyIsPrimaryKey = (JSON.stringify(tableColumns) === JSON.stringify(tablePrimaryKeyColumns))
        if (foreignKeyIsPrimaryKey)
            try {
                // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#pg-create-object-relationship
                // execute the metadata queries via REST API call
                json = await callHasuraAPI(
                    HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH,
                    {
                        type: 'pg_create_object_relationship',
                        args: {
                            source: sourceName,
                            table: {
                                schema: foreignKey.ref_table_table_schema,
                                name: foreignKey.ref_table
                            },
                            name: singularTableName,
                            using: {
                                table: {
                                    schema: foreignKey.table_schema,
                                    name: foreignKey.table_name
                                },
                                columns: tableColumns
                            }
                        }
                    },
                    false
                )
                console.log(`created object relationship ${singularRefTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}`)
            } catch(err) {
                if(err.response && err.response.body) {
                    if (err.response.body.includes('"code":"already-exists"'))
                            console.log(`Object relationship ${singularRefTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}, it already exists`)
                    else {
                        console.error(`trackAllForeignKeys: error creating object relationship ${singularTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}`)
                        console.error(err.response.body)
                    }
                } else {
                    console.error(`trackAllForeignKeys: error creating object relationship ${singularTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}`)
                    console.error(err)
                }
            }
        else
            try {
                // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#pg-create-array-relationship
                // execute the metadata queries via REST API call
                json = await callHasuraAPI(
                    HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH,
                    {
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
                    },
                    false
                )
                console.log(`created array relationship ${pluralTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}`)
            } catch(err) {
                if(err.response && err.response.body) {
                    if (err.response.body.includes('"code":"already-exists"'))
                            console.log(`Object relationship ${singularRefTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}, it already exists`)
                    else {
                        console.error(`trackAllForeignKeys: error creating array relationship ${pluralTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}`)
                        console.error(err.response.body)
                    }
                } else {
                    console.error(`trackAllForeignKeys: error creating array relationship ${pluralTableName} on ${foreignKey.ref_table_table_schema}.${foreignKey.ref_table} using ${tableColumns} from ${foreignKey.table_schema}.${foreignKey.table_name}`)
                    console.error(err)
                }
            }
    }

    console.log('finished trackAllForeignKeys')
}

/*
* add select permision to all tables
* select tables then add permission each table 
*/
async function addPermissionAllTables(sourceName, permissionArgs) {
    console.log('addPermissionAllTables:', sourceName)
    let json
    try {
        // retrieve all db tables via Hasura pass-through SQL query
        json = await callHasuraAPI(
            HASURA_BASE_URI + HASURA_QUERY_ENDPOINT_URI_PATH,
            {
                "type": "run_sql",
                "version": 2,
                "args": {
                    "source": sourceName,
                    "sql": SQL_SELECT_TABLES
                }
            }
        )
    } catch(err) {
        console.error('addPermissionAllTables: error selecting tables')
        if(err.response)
            console.error(err.response.body)
        else
            console.error(err)
    }
    const data = convertTuplesToObjects(json.result)
    //console.log(data)
    
    for (const table of data) {
        const args = JSON.parse(JSON.stringify(permissionArgs))
        args.source = sourceName
        args.table = {
            "schema": table.table_schema,
            "name": table.table_name
        }

        try {
            // execute the metadata queries via REST API call
            // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/permission.html#pg-create-select-permission
            json = await callHasuraAPI(
                HASURA_BASE_URI + HASURA_METADATA_ENDPOINTURI_URI_PATH,
                {
                    "type": "pg_create_select_permission",
                    args
                },
                false
            )
            console.log(`created select permission ${table.table_schema}.${table.table_name}`)
        } catch(err) {
            if(err.response && err.response.body) {
                if (err.response.body.includes('"code":"already-exists"'))
                    console.log(`Select permission on table ${table.table_schema}.${table.table_name}, it already exists`)
                else {
                    console.error(`addPermissionAllTables: error creating select permission on table ${table.table_schema}.${table.table_name}`)
                    console.error(err.response.body)
                }
            } else {
                console.error(`addPermissionAllTables: error creating select permission on table ${table.table_schema}.${table.table_name}`)
                console.error(err)
            }
        }
        console.log('finished addPermissionAllTables')
    }
}
