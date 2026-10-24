#!/bin/bash
# Adds the Part 2 routes to the existing "coupons" REST API (id in api_id.txt):
#   GET /coupons/{id}  -> coupons_get_by_id
#   PUT /coupons/{id}  -> coupons_update
# Uses the AWS_PROXY (Lambda proxy) integration, the same type as /coupons_poc,
# so the {id} path parameter reaches the functions as event.pathParameters.id.
# Safe to run more than once.

REGION="us-east-1"
LOCALSTACK="http://localhost:4566"
ACCOUNT_ID="000000000000"
STAGE="dev"

function fail() {
  echo "$1"
  exit 1
}

# Run from the project root no matter where the script is called from
cd "$(dirname "$0")/.." || exit 1

[ -f api_id.txt ] || fail "api_id.txt not found - run scripts/t1_provision_coupons_endpoint.sh first"
API_ID=$(tr -d '[:space:]' < api_id.txt)
echo "API_ID=$API_ID"

function resource_id() {
  lstk aws apigateway get-resources \
    --rest-api-id $API_ID \
    --query "items[?path=='$1'].id | [0]" \
    --output text \
    --endpoint-url $LOCALSTACK \
    --region $REGION
}

ROOT_ID=$(resource_id "/")
echo "ROOT_ID=$ROOT_ID"

COUPONS_ID=$(resource_id "/coupons")
if [ -z "$COUPONS_ID" ] || [ "$COUPONS_ID" = "None" ]; then
  COUPONS_ID=$(lstk aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ROOT_ID \
    --path-part coupons \
    --query 'id' --output text \
    --endpoint-url $LOCALSTACK \
    --region $REGION)
fi
echo "COUPONS_ID=$COUPONS_ID"

BY_ID_ID=$(resource_id "/coupons/{id}")
if [ -z "$BY_ID_ID" ] || [ "$BY_ID_ID" = "None" ]; then
  BY_ID_ID=$(lstk aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $COUPONS_ID \
    --path-part "{id}" \
    --query 'id' --output text \
    --endpoint-url $LOCALSTACK \
    --region $REGION)
fi
echo "BY_ID_ID=$BY_ID_ID"

function add_method() {
  local METHOD=$1
  local FUNCTION_NAME=$2
  local FUNCTION_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME"

  echo "Adding $METHOD /coupons/{id} -> $FUNCTION_NAME"

  lstk aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $BY_ID_ID \
    --http-method $METHOD \
    --authorization-type NONE \
    --request-parameters "method.request.path.id=true" \
    --endpoint-url $LOCALSTACK \
    --region $REGION > /dev/null 2>&1 || echo "Method already exists, continuing..."

  lstk aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $BY_ID_ID \
    --http-method $METHOD \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$FUNCTION_ARN/invocations \
    --endpoint-url $LOCALSTACK \
    --region $REGION > /dev/null

  lstk aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id apigateway-$METHOD-coupons-by-id \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/$METHOD/coupons/*" \
    --endpoint-url $LOCALSTACK \
    --region $REGION > /dev/null 2>&1 || echo "Permission already exists, continuing..."
}

add_method GET coupons_get_by_id
add_method PUT coupons_update

lstk aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name $STAGE \
  --endpoint-url $LOCALSTACK \
  --region $REGION > /dev/null

echo "API deployed successfully"
echo "Test URL:"
echo "http://localhost:4566/restapis/$API_ID/$STAGE/_user_request_/coupons/319326de971100158f6fa0daeec978fba1f17e4b"
