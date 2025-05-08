export default () => ({
  mongoDB: {
    mongodbUri: process.env.MONGO_DB_URI,
    manifestDBName: process.env.TL_MANIFEST_DB_NAME,
    propscopeDbName: process.env.TL_PROPSCOPE_DB_NAME,
    propScopeManifestCollectionName:
      process.env.PROPSCOPE_MANIFEST_COLLECTION_NAME,
    propScopeCollectionName: process.env.PROPSCOPE_COLLECTION_NAME,
  },

  maptiler: {
    mapTilerApiKey: process.env.MAPTILER_API_KEY,
    mapTilerStyleUrl: process.env.MAPTILER_STYLE_URL,
    mapTilerTilesUrl: 'https://api.maptiler.com/tiles',
  },

  appConfig : {
    serverGrpcUrl: process.env.SERVER_GRPC_URL
  }
});
