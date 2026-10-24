#!/bin/bash
# Adds a Global Secondary Index (GSI) to the coupons table so coupons can be
# found by provider_id and campaign_id with a fast Query instead of reading
# the whole table with a Scan.
#   Partition key: provider_id   (all coupons from one provider)
#   Sort key:      campaign_id   (narrows to one campaign of that provider)
#   Projection:    ALL           (query results include the whole coupon)
# The index gets its own capacity, sized the same as the table (25 RCU / 10 WCU).

REGION="us-east-1"
LOCALSTACK="http://localhost:4566"
TABLE_NAME="coupons"
INDEX_NAME="provider_id-campaign_id-index"

echo "Adding index $INDEX_NAME to table $TABLE_NAME"
lstk aws dynamodb update-table \
  --table-name $TABLE_NAME \
  --attribute-definitions \
      AttributeName=provider_id,AttributeType=S \
      AttributeName=campaign_id,AttributeType=S \
  --global-secondary-index-updates '[
    {
      "Create": {
        "IndexName": "provider_id-campaign_id-index",
        "KeySchema": [
          { "AttributeName": "provider_id", "KeyType": "HASH" },
          { "AttributeName": "campaign_id", "KeyType": "RANGE" }
        ],
        "Projection": { "ProjectionType": "ALL" },
        "ProvisionedThroughput": { "ReadCapacityUnits": 25, "WriteCapacityUnits": 10 }
      }
    }
  ]' \
  --endpoint-url $LOCALSTACK \
  --region $REGION || echo "Index already exists, continuing..."

lstk aws dynamodb wait table-exists \
  --table-name $TABLE_NAME \
  --endpoint-url $LOCALSTACK \
  --region $REGION

lstk aws dynamodb describe-table \
  --table-name $TABLE_NAME \
  --query "Table.GlobalSecondaryIndexes[].{Name:IndexName,Status:IndexStatus,Keys:KeySchema}" \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Test query: Fairmont coupons in the CHRISTMAS2022 campaign"
lstk aws dynamodb query \
  --table-name $TABLE_NAME \
  --index-name $INDEX_NAME \
  --key-condition-expression "provider_id = :p AND campaign_id = :c" \
  --expression-attribute-values '{":p":{"S":"FAIRMONT"},":c":{"S":"CHRISTMAS2022"}}' \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Index ready"
