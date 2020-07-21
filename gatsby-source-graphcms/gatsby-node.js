const {
  wrapQueryExecutorWithQueue,
  loadSchema,
  generateDefaultFragments,
  compileNodeQueries,
  buildNodeDefinitions,
  createSchemaCustomization,
  sourceAllNodes,
  sourceNodeChanges,
} = require('gatsby-graphql-source-toolkit')
const { createRemoteFileNode } = require('gatsby-source-filesystem')
const fetch = require('node-fetch')
const pluralize = require('pluralize')

exports.onPreBootstrap = ({ reporter }, pluginOptions) => {
  if (!pluginOptions || !pluginOptions.endpoint)
    return reporter.panic(
      'gatsby-source-graphcms: You must provide your GraphCMS endpoint URL'
    )

  if (!pluginOptions || !pluginOptions.token)
    return reporter.panic(
      'gatsby-source-graphcms: You must provide a GraphCMS API token'
    )
}

const createSourcingConfig = async (gatsbyApi, { endpoint, token }) => {
  const execute = async ({ operationName, query, variables = {} }) => {
    return await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ query, variables, operationName }),
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    }).then((res) => res.json())
  }
  const schema = await loadSchema(execute)

  const nodeInterface = schema.getType('Node')
  const possibleTypes = schema.getPossibleTypes(nodeInterface)

  const gatsbyNodeTypes = possibleTypes.map((type) => ({
    remoteTypeName: type.name,
    remoteIdFields: ['__typename', 'id'],
    queries: `
      query LIST_${pluralize(type.name).toUpperCase()} { ${pluralize(
      type.name.toLowerCase()
    )}(first: $limit, skip: $offset) }
      query NODE_${type.name.toUpperCase()}($where: ${
      type.name
    }WhereUniqueInput!) { ${type.name.toLowerCase()}(where: $where) }`,
    nodeQueryVariables: ({ id }) => ({ where: { id } }),
  }))

  const fragments = generateDefaultFragments({ schema, gatsbyNodeTypes })

  const documents = compileNodeQueries({
    schema,
    gatsbyNodeTypes,
    customFragments: fragments,
  })

  return {
    gatsbyApi,
    schema,
    execute: wrapQueryExecutorWithQueue(execute, { concurrency: 10 }),
    gatsbyTypePrefix: `GraphCMS_`,
    gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
  }
}

exports.sourceNodes = async (gatsbyApi, pluginOptions) => {
  const { webhookBody } = gatsbyApi

  const config = await createSourcingConfig(gatsbyApi, pluginOptions)

  await createSchemaCustomization(config)

  if (webhookBody && Object.keys(webhookBody).length) {
    const { operation, data } = webhookBody

    const nodeEvent = (operation, { __typename, id }) => {
      switch (operation) {
        case 'delete':
        case 'unpublish':
          return {
            eventName: 'DELETE',
            remoteTypeName: __typename,
            remoteId: { __typename, id },
          }
        case 'create':
        case 'publish':
        case 'update':
          return {
            eventName: 'UPDATE',
            remoteTypeName: __typename,
            remoteId: { __typename, id },
          }
      }
    }

    await sourceNodeChanges(config, {
      nodeEvents: [nodeEvent(operation, data)],
    })
  } else {
    await sourceAllNodes(config)
  }
}

exports.onCreateNode = async (
  { node, actions: { createNode }, createNodeId, getCache },
  { downloadLocalImages = false }
) => {
  if (
    downloadLocalImages &&
    node.remoteTypeName === 'Asset' &&
    node.mimeType.includes('image/')
  ) {
    const fileNode = await createRemoteFileNode({
      url: node.url,
      parentNodeId: node.id,
      createNode,
      createNodeId,
      getCache,
    })

    if (fileNode) node.localFile = fileNode.id
  }
}

exports.createSchemaCustomization = (
  { actions: { createTypes } },
  { downloadLocalImages = false }
) => {
  if (downloadLocalImages)
    createTypes(`
    type GraphCMS_Asset {
      localFile: File @link
    }
  `)
}