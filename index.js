
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand  } from "@aws-sdk/lib-dynamodb";


//http methods
const getMethod = 'GET';
const postMethod = 'POST';
const patchMethod = 'PATCH';
const deleteMethod = 'DELETE';

const statusEndpoint = '/status';
const consultantEndpoint = '/consultant';


//client connection dynamoDB
const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const tableName = "dy-va-consultant-dev";
//manage create command to 
const manageData = {
    commandConsultanById: (phone_number = 0) => {
        return new GetCommand({
            TableName: tableName,
            Key: {
              phone_number: phone_number,
            },
        });
    },
    commandCreateConsultant: (data) => {
      return new PutCommand({
        TableName: tableName,
        Item:data,
      });
    },
    commandUpdateConsultant: (values, phone_number = 0) => {
      
      let updateExpression = "set ";
      const expressionAttributeValues = {};
      
      Object.keys(values).forEach((key, index) => {
        const placeholder = `:value${index}`;
        
        updateExpression += `${key} = ${placeholder}, `;
        
        const value = values[key];
        
        expressionAttributeValues[placeholder] = value; 
      });
    
      updateExpression = updateExpression.slice(0, -2);
      
      const params = {
        TableName: tableName,
        Key: {
          phone_number: phone_number
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      };
      
      return new UpdateCommand(params);
    }
};

export const handler = async (event) => {
  
  // console.log('Request event: ', event);
  let response;
  
  switch(true) {
    
    case event.httpMethod === getMethod && event.path === statusEndpoint:
      response = buildResponse(200, 'System operational');
      break;
      
    case event.httpMethod === getMethod && event.path === consultantEndpoint:
      
      response = getConsultantById(event);
      break;
      
    case event.httpMethod === postMethod && event.path === consultantEndpoint:
      response = createConsultant(event);
      break;
      
    case event.httpMethod === patchMethod && event.path === consultantEndpoint:
      response = updateConsultant(event);
      break;
      
    case event.httpMethod === deleteMethod && event.path === consultantEndpoint:
      response = deleteConsultant(event);
      break;
      
    default:
      response = buildResponse(404, '404 Not Found');
  }
  return response;
  
};

//get consultant 
async function getConsultantById(event){
  
  const { phone_number } = event.queryStringParameters;
  
  if(isNaN(+phone_number)){
    return buildResponse(400, `An Error ocurred while search number ${phone_number}`);
  }
  
  try{
    
    const [message, response] = await getConsultantByPhoneNumber(+phone_number);
   
    const data = {
      message: 'Consultant found',
      data: response
    };
    
    if(message){
      data.message = message;
      data.data = [];
    }
    
    return buildResponse(200, data);
    
  }catch(error){
    
    console.log(error);
    return buildResponse(500, "Internal server error, contact your administrator");
  }
  
}

//create consultant
async function createConsultant(event){
  
  if( !(event.body) ) return buildResponse(400, 'An error ocurred while created consultant');
  
  if(Object.keys(JSON.parse(event.body)).length === 0 ) return buildResponse(400, 'An error ocurred while created consultant, parameters missing');
  
  const [error, dataConsultant] = ConsultantDTO.create(JSON.parse(event.body));
  
  if(error) return buildResponse(400, error);
  
  // verify if phone_number exist
  const [, consultant] = await getConsultantByPhoneNumber(dataConsultant.phone_number);
  
  if(consultant) return buildResponse(409, 
    {
      "code": "existing_record",
      "message": "A consultancy with the provided information already exists.",
    }
  );
  
  //create consultant
  const command = manageData.commandCreateConsultant(dataConsultant);

  try{
    
    await docClient.send(command);
    
    const data = {
      message: 'Consultant created successfully',
      data: {
        dataConsultant
      }
    };
    
    return buildResponse(201, data);
    
  }catch(error){
    
    console.log({Error: error});
    return buildResponse(500, "Internal server error, contact your administrator");
    
  }

  
}

//modify consultant
async function updateConsultant(event){
  
  if(!event.queryStringParameters) return buildResponse(400, "Parameter phone_number is missing");
  
  const parameters = event.queryStringParameters;
  const body = JSON.parse(event.body);
  
  const data = {
    phone_number: parameters.phone_number,
    ...body
  };
  
  const [error, updateDto] = UpdateConsultantDTO.create(data);
  
  if(error) return buildResponse(400, error);
  
  
  const {phone_number, ...rest} = updateDto.values;

  const command = manageData.commandUpdateConsultant(rest, +phone_number);

  try{
    
    const response = await docClient.send(command);
    const payload = {
      message: 'Consultant successfully updated',
      data: [response?.Attributes]
    };
    
    return buildResponse(200, payload);
  }catch(error){
    
    console.log(error);
    return buildResponse(500, "Internal server error, contact your administrator");
    
  }

  
  
  
  
}

//delete consultant
async function deleteConsultant(event){
  
  const params = {
    TableName: tableName,
    Key: {
      phone_number: +(event.queryStringParameters.phone_number)
    }
  };
  
  const command = new DeleteCommand(params);
  
  try{
    
    await docClient.send(command);
    
    const payload = {
      message: 'Consultant deleted successfully'
    };
  
    return buildResponse(200, payload);
    
  }catch(error){
    console.log(error);
    return buildResponse(500, "Internal server error, contact your administrator");
  }

}


//get consultant by phone number
async function getConsultantByPhoneNumber(phone_number){
  
  const consultant = manageData.commandConsultanById(phone_number);
    
  const resp = await docClient.send(consultant);
  
  return (resp.Item) ? [undefined, resp.Item]: ['Phone number not exist', undefined];
}

//build response with status code and body
function buildResponse(statusCode, body){
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };

}


class ConsultantDTO {
  
  constructor(
    phone_number = 0,
    country_code = '',
    kore_user_id = '',
    consultant_id = '',
    consultant_name = '',
    last_login = '',
    tyc_sb = false
    
  ){
    this.phone_number  = phone_number;
    this.country_code  = country_code;
    this.kore_user_id  = kore_user_id;
    this.consultant_name = consultant_name
    this.consultant_id = consultant_id;
    this.last_login    = last_login;
    this.tyc_sb        = tyc_sb;
  
  }
  
  static create(object = {} ){
    const {
      phone_number, 
      country_code, 
      kore_user_id, 
      consultant_id,
      consultant_name,
      last_login,
      tyc_sb
    } = object;
    
    if(!phone_number){
      return ['phone number is required', undefined];
    }
    
    if(isNaN(phone_number)){
      return ['phone_number must be a number', undefined];
    }
    
    if(phone_number.toString().length < 10 || phone_number.toString().length > 13 ){
      return ['phone_number must be at least 10 characters and max 13 characters ', undefined];
    }
    
    if(!country_code){
      return ['country_code is required', undefined];
    }
    
    if(country_code.length > 2){
      return ['country_code must have two characters', undefined];
    }
    
    if(!kore_user_id){
      return ['kore_user_id is required', undefined];
    }
    
    if(kore_user_id.length < 32){
      return ['kore_user_id is invalid', undefined];
    }

    
    return [undefined, new ConsultantDTO(+phone_number, country_code, kore_user_id, consultant_name, consultant_id, consultant_name, last_login, tyc_sb) ];
    
  }
  
}


class UpdateConsultantDTO {
  
  constructor(
    phone_number = 0,
    last_login = "",
		consultant_id = "",
		consultant_name = "",
		tyc_sb
  ){
    this.last_login = last_login;
    this.phone_number = phone_number;
    this.consultant_id = consultant_id;
    this.consultant_name = consultant_name;
    this.tyc_sb = tyc_sb;
  }
  
  get values(){
    
    const returnObj = {};
    
    if( this.last_login ) returnObj.last_login = this.last_login;
    if( this.phone_number ) returnObj.phone_number = this.phone_number;
    if( this.consultant_id ) returnObj.consultant_id = this.consultant_id;
    if( this.consultant_name ) returnObj.consultant_name = this.consultant_name;
    if( typeof this.tyc_sb === 'boolean' ) returnObj.tyc_sb = this.tyc_sb;
    
    return returnObj;
    
  }
  
  static create(props = {}){
    const {last_login, consultant_id, consultant_name, tyc_sb, phone_number} = props;
    
    if(!phone_number || isNaN(Number(phone_number))) return ['phone_number must be a number'];
    
    let newLastLogin = last_login;
    
    if( last_login ){
      newLastLogin = new Date(last_login);
      
      if( newLastLogin.toString() === 'Invalid Date'){
        return ['last_login must be a valid date']
      }
    }
    
    
    return [undefined, new UpdateConsultantDTO(+phone_number, last_login, consultant_id, consultant_name, tyc_sb)]
    
  }
  
}



