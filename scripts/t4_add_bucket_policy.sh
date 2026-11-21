#!/bin/bash
# Adds a bucket policy to "coupons" that blocks deleting imported files
# unless the request was made with multi-factor authentication (MFA).
#
# The policy (scripts/t4_bucket_policy.json) denies s3:DeleteObject and
# s3:DeleteObjectVersion for everyone when aws:MultiFactorAuthPresent is
# "false". BoolIfExists also denies the delete when the key is missing
# altogether (for example, requests made with long-term access keys), so
# only MFA-authenticated sessions can delete. A Deny always wins over any
# Allow, so no IAM policy can override it.

REGION="us-east-1"
LOCALSTACK="http://localhost:4566"
BUCKET_NAME="coupons"

# Run from the project root no matter where the script is called from
cd "$(dirname "$0")/.." || exit 1

echo "Adding bucket policy: deny deletes without MFA"
lstk aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file://scripts/t4_bucket_policy.json \
  --endpoint-url $LOCALSTACK \
  --region $REGION || { echo "Failed to add bucket policy"; exit 1; }

echo "Current bucket policy:"
lstk aws s3api get-bucket-policy \
  --bucket $BUCKET_NAME \
  --query Policy \
  --output text \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Bucket policy ready"
