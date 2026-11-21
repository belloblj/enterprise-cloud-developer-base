#!/bin/bash
# Packages the new coupons_import_presigned_url code and deploys it to LocalStack.
# Updates the function if it exists, otherwise creates it.
#
# The zip holds index.js plus the S3 client and the URL signer
# (@aws-sdk/s3-request-presigner), bundled together so their versions match.
# Test tools are left out.

FUNCTION_NAME="coupons_import_presigned_url"
REGION="us-east-1"
LOCALSTACK="http://localhost:4566"
ROLE_ARN="arn:aws:iam::000000000000:role/coupons_production_role"
ZIP_FILE="$FUNCTION_NAME.zip"
ENV_VARS="Variables={BUCKET_NAME=coupons,S3_PUBLIC_ENDPOINT=http://localhost:4566}"

function fail() {
  echo "$1"
  exit 1
}

# Run from the project root no matter where the script is called from
cd "$(dirname "$0")/.." || exit 1

echo "Packaging lambda: $FUNCTION_NAME"
cd lambda/$FUNCTION_NAME || fail "Lambda folder missing"
rm -rf build $ZIP_FILE
mkdir build
cp index.js package.json build/
(cd build && npm install --omit=dev --no-audit --no-fund --silent) || fail "npm install failed"
cd build || exit 1
if command -v zip > /dev/null; then
  zip -qr ../$ZIP_FILE .
elif [ -x "/c/Program Files/7-Zip/7z.exe" ]; then
  "/c/Program Files/7-Zip/7z.exe" a -tzip ../$ZIP_FILE . > /dev/null
else
  fail "Need zip or 7-Zip to package the function"
fi
cd .. && rm -rf build
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

# S3_PUBLIC_ENDPOINT: the URL is used from outside LocalStack, so it is
# signed for http://localhost:4566 (the address the client calls)
echo "Setting handler, timeout, bucket name and public S3 address"
lstk aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --handler index.handler \
  --timeout 15 \
  --memory-size 256 \
  --environment "$ENV_VARS" \
  --endpoint-url $LOCALSTACK \
  --region $REGION

lstk aws lambda wait function-updated-v2 \
  --function-name $FUNCTION_NAME \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Lambda $FUNCTION_NAME updated"
