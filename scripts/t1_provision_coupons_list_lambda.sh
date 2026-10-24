#!/bin/bash

FUNCTION_NAME="coupons_list"
REGION="us-east-1"
LOCALSTACK="http://localhost:4566"

echo "Packaging lambda: $FUNCTION_NAME"

cd lambda/coupons_list || exit 1
"/c/Program Files/7-Zip/7z.exe" a coupons_list.zip .

echo "Creating lambda function"

lstk aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --runtime nodejs18.x \
  --handler index.handler \
  --role arn:aws:iam::000000000000:role/coupons_lambda_role \
  --zip-file fileb://coupons_list.zip \
  --endpoint-url $LOCALSTACK \
  --region $REGION || echo "Lambda already exists, continuing..."

echo "Lambda ready"
