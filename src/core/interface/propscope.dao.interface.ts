export interface IPropscopeDAO {
  getManifestByPropertyType(collectionName, property_type);
  getGroupNamefromManifest(collectionName, property_type);
  updateManifestByPropertyType(collectionName, property_type, data);
  insertPropScopeData(propscopeId, createPropscopeDto);
  insertPropscopeFeatures(documents)
  insertPropscopeMetaData(documents)
  updatePropscopeStatus(collectionName,propscopeId,updateStatus)
  
}
