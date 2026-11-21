#!/bin/bash
# Creates the private "coupons" S3 bucket in LocalStack.
#   - ACL "private": only the bucket owner has access, nothing is public.
#   - Public access block: stops anyone from later making files public.
# Then lets the Lambda role (coupons_production_role) write files to it.
# The course's production policy only allows S3 on "coupons.idealtrip.com",
# so an extra policy is added that allows PutObject on this bucket only.

REGION="us-east-1"
LOCALSTACK="http://localhost:4566"
BUCKET_NAME="coupons"
ROLE_NAME="coupons_production_role"

echo "Creating S3 bucket: $BUCKET_NAME (private ACL)"
lstk aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --acl private \
  --endpoint-url $LOCALSTACK \
  --region $REGION || echo "Bucket already exists, continuing..."

echo "Blocking all public access"
lstk aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Allowing $ROLE_NAME to upload files to the bucket"
lstk aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name coupons_s3_import_access \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowCouponImports",
        "Effect": "Allow",
        "Action": ["s3:PutObject"],
        "Resource": ["arn:aws:s3:::coupons/*"]
      }
    ]
  }' \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Bucket ACL:"
lstk aws s3api get-bucket-acl \
  --bucket $BUCKET_NAME \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "Bucket ready"
