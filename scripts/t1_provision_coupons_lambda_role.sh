#!/bin/bash

REGION="us-east-1"
LOCALSTACK="http://localhost:4566"

echo "Creating IAM role: coupons_lambda_role"

lstk aws iam create-role \
  --role-name coupons_lambda_role \
  --assume-role-policy-document file://scripts/coupons_lambda_role_assume_role_policy.json \
  --endpoint-url $LOCALSTACK \
  --region $REGION || echo "Role already exists, continuing..."

lstk aws iam put-role-policy \
  --role-name coupons_lambda_role \
  --policy-name coupons_lambda_policy \
  --policy-document file://scripts/coupons_production_policy.json \
  --endpoint-url $LOCALSTACK \
  --region $REGION

echo "IAM role ready"
