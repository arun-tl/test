import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { PropScope, PropScopeFeature , PropScopeMeta} from 'src/schema/propscope.schema';
import { CreatePropscopeDto } from '../dto/propscope.dto';
import { IPropscopeDAO as PropscopeDAO } from '../interface/propscope.dao.interface';

@Injectable()
export class PropscopeDao implements PropscopeDAO {
  private readonly logger = new Logger('PropscopeDao');

  constructor(
    @InjectConnection('manifestConnectionDb')
    private readonly connection: Connection,
    @InjectConnection('propScopeConnectionDb')
    private readonly propConnection: Connection,
    @InjectModel('PropScope', 'propScopeConnectionDb')
    private readonly propscopeModel: Model<PropScope>,
    @InjectModel('PropScopeFeature', 'propScopeConnectionDb')
    private readonly propScopeFeatureModel: Model<PropScopeFeature>,
    @InjectModel('PropScopeMeta', 'propScopeConnectionDb')
    private readonly propScopeMetaModel: Model<PropScopeMeta>,
  ) {}

  private async validateCollection(collectionName: string): Promise<any> {
    if (!this.connection || !this.connection.db) {
      this.logger.error('MongoDB connection is not established');
      throw new HttpException('Database connection is unavailable', 500);
    }

    const collections = await this.connection.db.listCollections().toArray();
    const collectionExists = collections.some(
      (col) => col.name === collectionName,
    );

    if (!collectionExists) {
      this.logger.error(`Collection ${collectionName} does not exist`);
      throw new HttpException(`Collection ${collectionName} not found`, 404);
    }

    return this.connection.db.collection(collectionName);
  }

  private async validatePropScopeCollection(
    collectionName: string,
  ): Promise<any> {
    if (!this.propConnection || !this.propConnection.db) {
      this.logger.error('MongoDB connection is not established');
      throw new HttpException('Database connection is unavailable', 500);
    }

    const collections = await this.propConnection.db
      .listCollections()
      .toArray();
    const collectionExists = collections.some(
      (col) => col.name === collectionName,
    );

    if (!collectionExists) {
      this.logger.error(`Collection ${collectionName} does not exist`);
      throw new HttpException(`Collection ${collectionName} not found`, 404);
    }

    return this.propConnection.db.collection(collectionName);
  }

  /**
   * Fetch all documents from a given collection.
   * @param collectionName - The MongoDB collection name
   * @returns Array of documents
   */

  async getManifestByPropertyType(
    collectionName: string,
    property_type: string,
  ): Promise<any> {
    try {
      const collection = await this.validateCollection(collectionName);
      const result = await collection.findOne({ type: property_type });

      if (!result) {
        this.logger.warn(
          `No documents found in ${collectionName} for type: ${property_type}`,
        );
        throw new HttpException('No documents found', 404);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error fetching manifest from ${collectionName}: ${error.message}`,
      );
      throw new HttpException(
        `Failed to fetch documents from ${collectionName}`,
        error.status || 500,
      );
    }
  }

  async getGroupNamefromManifest(
    collectionName: string,
    property_type: string,
  ): Promise<string[]> {
    try {
      const collection = await this.validateCollection(collectionName);

      const pipeline = [
        { $match: { type: property_type } },
        { $project: { _id: 0, groups: '$groups.name' } },
      ];

      const result = await collection.aggregate(pipeline).toArray();

      if (!result?.[0]?.groups) {
        this.logger.warn(`No groups found for type: ${property_type}`);
        throw new HttpException('Groups not found', 404);
      }

      return result[0].groups;
    } catch (error) {
      this.logger.error(`Error in getGroupNamefromManifest: ${error.message}`);
      throw new HttpException(
        `Failed to fetch groups from ${collectionName}`,
        error.status || 500,
      );
    }
  }

  async updateManifestByPropertyType(
    collectionName: string,
    property_type: string,
    data: object,
  ): Promise<object> {
    try {
      const collection = await this.validateCollection(collectionName);

      const response = await collection.updateOne(
        { type: property_type },
        { $set: data },
      );

      if (response.matchedCount === 0) {
        this.logger.warn(
          `No documents found in ${collectionName} for property type: ${property_type}`,
        );
        throw new HttpException(`No matching documents found`, 404);
      }

      this.logger.log(
        `Successfully updated document in ${collectionName} for property type: ${property_type}`,
      );

      return {
        acknowledged: response.acknowledged,
        matchedCount: response.matchedCount,
        modifiedCount: response.modifiedCount,
      };
    } catch (error) {
      this.logger.error(
        `Error updating document in ${collectionName}: ${error.message}`,
      );
      throw new HttpException(
        `Failed to update document in ${collectionName}`,
        error.status || 500,
      );
    }
  }

  async createPropscopeEntry(
    propscopeId: string,
    propertyType: string,
    lat : number, 
    lon : number
  ): Promise<any> {
    try {
      let response = await this.propscopeModel.create({
        propscope_id: propscopeId,
        property_type: propertyType,
        location : {
          type : "Point",
          coordinates : [lat , lon]
        }
      });

      this.logger.log('Proscope entry created successfully');
      return response;
    } catch (error) {
      this.logger.error(
        'Error inserting value for propscope',
        JSON.stringify(error),
      );
    }
  }

  async getPropScopeStatus(
    collectionName: string,
    propscopeId: string,
  ): Promise<any> {
    try {
      const collection = await this.validatePropScopeCollection(collectionName);
      const pipeline = [
        { $match: { propscope_id: propscopeId } },
        {
          $project: {
            _id: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        },
      ];

      const result = await collection.aggregate(pipeline).toArray();

      if (!result || !result?.[0]) {
        this.logger.warn(
          `No documents found with propscopeId : ${propscopeId}`,
        );
        throw new HttpException('Propscope not found', 404);
      }

      return result[0];
    } catch (error) {
      this.logger.error(
        'Error finding propscope document',
        JSON.stringify(error),
      );
      throw new HttpException('Propscope not found', 404);
    }
  }

  async insertPropScopeData(
    propscopeId: string,
    createPropscopeDto: CreatePropscopeDto,
  ): Promise<any> {
    try {
      let response = await this.propscopeModel.create({
        propscope_id: propscopeId,
        group_name: createPropscopeDto.name,
        display_name: createPropscopeDto.display_name,
        subgroup: createPropscopeDto.sub_groups,
      });

      this.logger.log('Proscope data inserted success');
      return response;
    } catch (error) {
      this.logger.log(
        'Error inserting value for propscope',
        JSON.stringify(error),
      );
    }
  }

  async insertPropscopeMetaData(documents: any): Promise<any> {
    try {
      let response = await this.propScopeMetaModel.insertMany(documents);
      this.logger.debug(`Meta Data inserted to database`);
      return response;
    } catch (error) {
      this.logger.error(
        'Error inserting metadata to collection',
        JSON.stringify(error),
      );
    }
  }

  async insertPropscopeFeatures(documents: any): Promise<any> {
    try {
      let response = await this.propScopeFeatureModel.insertMany(documents);
      this.logger.debug(`Data inserted to database`);
      return response;
    } catch (error) {
      this.logger.error("Errr" , JSON.stringify(error));
      this.logger.error(
        'Error inserting feature collection',
        JSON.stringify(error),
      );
    }
  }

  async updatePropscopeStatus(
    collectionName: string,
    propscopeId: string,
    updateStatus: boolean,
  ): Promise<object> {
    try {
      const collection = await this.validatePropScopeCollection(collectionName);
      const updateData = { propscope_instance_status: updateStatus };
      const response = await collection.updateOne(
        { propscope_id: propscopeId },
        { $set: updateData },
      );

      if (response.matchedCount === 0) {
        this.logger.warn(`No documents for propscopeid : ${propscopeId}`);
        throw new HttpException(`No matching documents found`, 404);
      }

      this.logger.debug(
        `Successfully updated status of proscope for : ${propscopeId}`,
      );

      const acknowledgement = {
        acknowledged: response.acknowledged,
        matchedCount: response.matchedCount,
        modifiedCount: response.modifiedCount,
      };

      this.logger.debug('Update Ack', JSON.stringify(acknowledgement));

      return acknowledgement;
    } catch (error) {
      this.logger.error(
        `Error updating document in ${collectionName}: ${error.message}`,
      );
      throw new HttpException(
        `Failed to update document in ${collectionName}`,
        error.status || 500,
      );
    }
  }
}
