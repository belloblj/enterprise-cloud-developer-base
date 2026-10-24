#!/bin/bash
# Packages the new coupons_update code and deploys it to LocalStack.
# Updates the function if it exists. The bootstrap script does not create
# coupons_update, so on a fresh environment this creates it.
#
# Only index.js goes in the zip: the AWS SDK v3 used by the code is already
# built into the nodejs18.x runtime, and node_modules only holds test tools.

FUNCTION_NAME="coupons_update"
REGION="us-east-1"
LOCALSTACK="http://localhost:4566"
ROLE_ARN="arn:aws:iam::000000000000:role/coupons_production_role"
ZIP_FILE="$FUNCTION_NAME.zip"

function fail() {
  echo "$1"
  exit 1
}

# Run from the project root no matter where the script is called from
cd "$(dirname "$0")/.." || exit 1

echo "Packaging lambda: $FUNCTION_NAME"
cd lambda/$FUNCTION_NAME || fail "Lambda folder missing"
rm -f $ZIP_FILE   # start fresh so no old files are left inside the zip
if command -v zip > /dev/null; then
  zip -q $ZIP_FILE index.js
elif [ -x "/c/Program Files/7-Zip/7z.exe" ]; then
  "/c/Program Files/7-Zip/7z.exe" a -tzip $ZIP_FILE index.js > /dev/null
else
  fail "Need zip or 7-Zip to package the function"
fi
cd ../.. || exit 1

if lstk aws lambda get-function --function-name $FUNCTION_NAME \
     --endpoint-url $LOCALSTACK --region $REGION > /dev/null 2>&1; then
  echo "Updating function code"
  lstk aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda/$FUNCTION_NAME/$ZIP_FILE \
    --endpoint-url $LOCALSTACK \
    --region $REGION
else
  echo "Function not found, creating it"
  lstk aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime nodejs18.x \
    --handler index.handler \
    --role $ROLE_ARN \
    --zip-file fileb://lambda/$FUNCTION_NAME/$ZIP_FILE \
    --endpoint-url $LOCALSTACK \
    --region $REGION
  lstk aws lambda wait function-active-v2 \
    --function-name $FUNCTION_NAME \
    --endpoint-url $LOCALSTACK \
    --region $REGION
fi

lstk aws lambda wait function-updated-v2 \
  --function-name $FUNCTION_NAME \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Setting handler and table name"
lstk aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --handler index.handler \
  --environment "Variables={TABLE_NAME=coupons}" \
  --endpoint-url $LOCALSTACK \
  --region $REGION

lstk aws lambda wait function-updated-v2 \
  --function-name $FUNCTION_NAME \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Lambda $FUNCTION_NAME updated"
