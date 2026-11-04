#!/bin/bash
# Adds the Part 3 routes to the existing "coupons" REST API (id in api_id.txt):
#   POST /token               -> coupons_get_token  (returns a JWT, 403 on bad credentials)
#   GET  /coupons/to_secure   -> coupons_to_secure  (403 when the token is invalid)
# Uses the AWS_PROXY (Lambda proxy) integration, like the other endpoints,
# so the request body and the Authorization header reach the functions.
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

# Creates a resource under a parent if it doesn't exist yet, prints its id
function ensure_resource() {
  local PATH_FULL=$1 PARENT_ID=$2 PART=$3
  local ID
  ID=$(resource_id "$PATH_FULL")
  if [ -z "$ID" ] || [ "$ID" = "None" ]; then
    ID=$(lstk aws apigateway create-resource \
      --rest-api-id $API_ID \
      --parent-id $PARENT_ID \
      --path-part "$PART" \
      --query 'id' --output text \
      --endpoint-url $LOCALSTACK \
      --region $REGION)
  fi
  echo "$ID"
}

ROOT_ID=$(resource_id "/")
TOKEN_ID=$(ensure_resource "/token" "$ROOT_ID" "token")
COUPONS_ID=$(ensure_resource "/coupons" "$ROOT_ID" "coupons")
TO_SECURE_ID=$(ensure_resource "/coupons/to_secure" "$COUPONS_ID" "to_secure")
echo "TOKEN_ID=$TOKEN_ID  TO_SECURE_ID=$TO_SECURE_ID"

function add_method() {
  local METHOD=$1 RESOURCE_ID=$2 RESOURCE_PATH=$3 FUNCTION_NAME=$4
  local FUNCTION_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME"

  echo "Adding $METHOD $RESOURCE_PATH -> $FUNCTION_NAME"

  lstk aws apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method $METHOD \
    --authorization-type NONE \
    --endpoint-url $LOCALSTACK \
    --region $REGION > /dev/null 2>&1 || echo "Method already exists, continuing..."

  lstk aws apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $RESOURCE_ID \
    --http-method $METHOD \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$FUNCTION_ARN/invocations \
    --endpoint-url $LOCALSTACK \
    --region $REGION > /dev/null

  lstk aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id apigateway-$METHOD-$FUNCTION_NAME \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/$METHOD$RESOURCE_PATH" \
    --endpoint-url $LOCALSTACK \
    --region $REGION > /dev/null 2>&1 || echo "Permission already exists, continuing..."
}

add_method POST "$TOKEN_ID" "/token" coupons_get_token
add_method GET "$TO_SECURE_ID" "/coupons/to_secure" coupons_to_secure

lstk aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name $STAGE \
  --endpoint-url $LOCALSTACK \
  --region $REGION > /dev/null

echo "API deployed successfully"
echo "Test URLs:"
echo "POST http://localhost:4566/restapis/$API_ID/$STAGE/_user_request_/token"
echo "GET  http://localhost:4566/restapis/$API_ID/$STAGE/_user_request_/coupons/to_secure"
