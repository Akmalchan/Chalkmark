#!/usr/bin/env bash
# Deploy Chalkmark to Cloud Run with Vertex AI (Gemini), Firestore and Cloud Storage.
# Usage: PROJECT=my-hackathon-project ./scripts/deploy-cloud-run.sh
# Optional: a Secret Manager secret `gemini-api-key` (Gemini API key in this project) enables YouTube links and Gemma titles.
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-chalkmark}"
BUCKET="${BUCKET:-${PROJECT}-chalkmark}"
SA_NAME="chalkmark-run"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

if [[ -z "$PROJECT" ]]; then echo "Set PROJECT (gcloud project id)"; exit 1; fi
echo "Deploying $SERVICE to $PROJECT ($REGION), bucket gs://$BUCKET"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com firestore.googleapis.com storage.googleapis.com --project "$PROJECT"

# Firestore (native mode) holds the notes; Cloud Storage holds board images. Never video.
gcloud firestore databases create --location=nam5 --project "$PROJECT" 2>/dev/null || echo "Firestore already exists"
gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --project "$PROJECT" 2>/dev/null || echo "Bucket already exists"

# Source deploys build into this repository; gcloud only offers to create it interactively.
gcloud artifacts repositories create cloud-run-source-deploy --repository-format=docker --location="$REGION" \
  --project "$PROJECT" 2>/dev/null || echo "Artifact Registry repository already exists"

gcloud iam service-accounts create "$SA_NAME" --display-name "Chalkmark Cloud Run" --project "$PROJECT" 2>/dev/null || echo "Service account already exists"
for role in roles/aiplatform.user roles/datastore.user; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" --condition=None >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" --role roles/storage.objectAdmin >/dev/null

ENV_VARS="GOOGLE_VERTEX_PROJECT=$PROJECT,GOOGLE_VERTEX_LOCATION=global,GOOGLE_CLOUD_PROJECT=$PROJECT,GCS_BUCKET=$BUCKET"

# YouTube links and Gemma go through the Gemini API (Vertex rejects YouTube URLs). Its key lives in Secret
# Manager as `gemini-api-key` (create one in this project so it bills to the same account).
SECRETS=()
if gcloud secrets describe gemini-api-key --project "$PROJECT" >/dev/null 2>&1; then
  SECRETS=(--set-secrets "GOOGLE_GENERATIVE_AI_API_KEY=gemini-api-key:latest")
fi

gcloud run deploy "$SERVICE" --source . --project "$PROJECT" --region "$REGION" \
  --service-account "$SA" --allow-unauthenticated \
  --memory 1Gi --cpu 1 --timeout 300 --concurrency 40 \
  --set-env-vars "$ENV_VARS" "${SECRETS[@]}"

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)'
