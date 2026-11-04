#!/bin/bash

API_BASE_URL="http://localhost:4566"
REGION="us-east-1"

function fail() {
  echo $1
  exit 1
}

echo "Creating production policy"
lstk aws iam create-policy \
  --policy-name "coupons_production_policy" \
  --policy-document file://scripts/coupons_production_policy.json \
  --endpoint-url $API_BASE_URL \
  --region $REGION || echo "Policy already exists, continuing..."

echo "Creating production role for lambda functions"
lstk aws iam create-role \
  --role-name "coupons_production_role" \
  --assume-role-policy-document file://scripts/coupons_lambda_role_assume_role_policy.json \
  --endpoint-url $API_BASE_URL \
  --region $REGION || echo "Role already exists, continuing..."

echo "Attaching policy to role"
lstk aws iam attach-role-policy \
  --role-name "coupons_production_role" \
  --policy-arn arn:aws:iam::000000000000:policy/coupons_production_policy \
  --endpoint-url $API_BASE_URL \
  --region $REGION

echo "Creating DynamoDB Table for users"
lstk aws dynamodb create-table \
  --table-name users \
  --attribute-definitions AttributeName=username,AttributeType=S \
  --key-schema AttributeName=username,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --endpoint-url $API_BASE_URL \
  --region $REGION || echo "Table already exists, continuing..."

echo "Adding sample users (passwords stored as bcrypt hashes, 12 rounds)"
# tester1 plain text: Pc4RM0AMKy5aSGfD
# tester2 plain text: 4LWs6xnc1t32BzXA
lstk aws dynamodb put-item \
  --table-name users \
  --item '{"username": {"S": "tester1"}, "password": {"S": "$2a$12$wCqYSCDDoHdlUCI7rBBHO..c4KleiSzZqH8NXMHdLIcLsVxFmvG7C"}}' \
  --endpoint-url $API_BASE_URL \
  --region $REGION

lstk aws dynamodb put-item \
  --table-name users \
  --item '{"username": {"S": "tester2"}, "password": {"S": "$2a$12$KWfAWTZM9npRke3tWZcoE.f1fD6jNTfYwYeZv4A7WTBOl1PCYxlnW"}}' \
  --endpoint-url $API_BASE_URL \
  --region $REGION

echo "Packaging coupons_get_by_id Lambda"
cd lambda/coupons_get_by_id || fail "Lambda folder missing"
npm install

"/c/Program Files/7-Zip/7z.exe" a coupons_get_by_id.zip .

lstk aws lambda create-function \
  --function-name coupons_get_by_id \
  --runtime nodejs18.x \
  --handler index.handler \
  --role arn:aws:iam::000000000000:role/coupons_production_role \
  --zip-file fileb://coupons_get_by_id.zip \
  --endpoint-url $API_BASE_URL \
  --region $REGION || echo "Lambda already exists, continuing..."

echo "Bootstrap complete"
