#!/bin/bash

API_NAME="coupons"
REGION="us-east-1"
LOCALSTACK="http://localhost:4566"

echo "Creating REST API"

API_ID=$(lstk aws apigateway create-rest-api \
  --name $API_NAME \
  --endpoint-url $LOCALSTACK \
  --region $REGION \
  --query 'id' \
  --output text)

echo $API_ID > api_id.txt
echo "API_ID=$API_ID"

ROOT_ID=$(lstk aws apigateway get-resources \
  --rest-api-id $API_ID \
  --endpoint-url $LOCALSTACK \
  --region $REGION \
  --query 'items[0].id' \
  --output text)

echo "ROOT_ID=$ROOT_ID"

RESOURCE_ID=$(lstk aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part coupons_poc \
  --endpoint-url $LOCALSTACK \
  --region $REGION \
  --query 'id' \
  --output text)

echo "RESOURCE_ID=$RESOURCE_ID"

lstk aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --authorization-type NONE \
  --endpoint-url $LOCALSTACK \
  --region $REGION

lstk aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:000000000000:function:coupons_list/invocations \
  --endpoint-url $LOCALSTACK \
  --region $REGION

lstk aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name dev \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "API deployed successfully"
echo "Test URL:"
echo "http://localhost:4566/restapis/$API_ID/dev/_user_request_/coupons_poc"
