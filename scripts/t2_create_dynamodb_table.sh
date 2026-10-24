#!/bin/bash
# Creates the "coupons" DynamoDB table in LocalStack and loads the sample coupons.
#
# Capacity calculation (average item size = 1 KB):
#   Reads:  1 RCU = 1 strongly consistent read/sec of an item up to 4 KB
#                 = 2 eventually consistent reads/sec of an item up to 4 KB
#           A 1 KB item rounds up to 4 KB, so each read needs 1 read unit.
#           50 eventually consistent reads/sec / 2 = 25 RCU
#   Writes: 1 WCU = 1 write/sec of an item up to 1 KB
#           (writes have no "eventually consistent" option, every write costs the same)
#           A 1 KB item needs 1 write unit.
#           10 writes/sec x 1 = 10 WCU
#
# Key: coupon_id (string), matching samples/t2_coupons_get_by_id_response.json

REGION="us-east-1"
LOCALSTACK="http://localhost:4566"
TABLE_NAME="coupons"

# Run from the project root no matter where the script is called from
cd "$(dirname "$0")/.." || exit 1

echo "Creating DynamoDB table: $TABLE_NAME"
lstk aws dynamodb create-table \
  --table-name $TABLE_NAME \
  --attribute-definitions AttributeName=coupon_id,AttributeType=S \
  --key-schema AttributeName=coupon_id,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=25,WriteCapacityUnits=10 \
  --endpoint-url $LOCALSTACK \
  --region $REGION || echo "Table already exists, continuing..."

lstk aws dynamodb wait table-exists \
  --table-name $TABLE_NAME \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Loading sample coupons"
lstk aws dynamodb batch-write-item \
  --request-items file://scripts/t2_sample_coupons.json \
  --endpoint-url $LOCALSTACK \
  --region $REGION

lstk aws dynamodb describe-table \
  --table-name $TABLE_NAME \
  --query "Table.{Name:TableName,Status:TableStatus,Key:KeySchema,Throughput:ProvisionedThroughput,Items:ItemCount}" \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Table ready"
