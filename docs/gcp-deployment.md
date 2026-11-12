# GCP preview deployment

This guide configures GitHub Actions to publish the Docker image to Artifact Registry and deploy it to Cloud Run using keyless Workload Identity Federation.

## Important preview limits

- The Cloud Run URL is public. Anyone with the URL can use the demo.
- The app uses synthetic demo records and its role selector is not authentication. Do not enter real customer, employee, or contact data.
- SQLite is stored in `/tmp` inside the container. Updates can be lost when Cloud Run restarts or replaces the instance. The deployment limits the service to one instance, but this does not make the database durable.
- Before storing durable records, migrate both the Node API and Python assistant to Cloud SQL for PostgreSQL and add real authentication and authorization.
- The AI assistant is not configured by this preview. Gemini credentials are not required or included in the Docker image.

## 1. Prepare the Google Cloud project

Open **Cloud Shell** from the Google Cloud Console for project `slabspro-slabsuser33`. These commands use `us-central1`; change `REGION` only if you choose a different supported region.

```bash
export PROJECT_ID="slabspro-slabsuser33"
export REGION="us-central1"
export REPOSITORY="Tanisha-P1/northcase-gate"
export POOL_ID="github-actions"
export PROVIDER_ID="northcase-gate"
export DEPLOYER_SA_NAME="northcase-github-deployer"
export RUNTIME_SA_NAME="northcase-cloud-run"

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  sts.googleapis.com

gcloud artifacts repositories create northgate \
  --location="$REGION" \
  --repository-format=docker \
  --description="Northgate Chase preview images"

gcloud iam service-accounts create "$DEPLOYER_SA_NAME" \
  --display-name="Northcase GitHub Actions deployer"
gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
  --display-name="Northcase Cloud Run runtime"

export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export DEPLOYER_SA="${DEPLOYER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/artifactregistry.writer"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="Northcase GitHub repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${REPOSITORY}' && assertion.ref == 'refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPOSITORY}"
```

These are one-time setup commands. The account running them needs permission to enable APIs, create service accounts and Workload Identity resources, and grant the listed IAM roles. If your account is managed by an organization, ask its Cloud administrator to run the setup or grant those permissions. Google Cloud may require billing to be enabled for the project.

Print the project number and exact provider name for the GitHub variables:

```bash
export WIF_PROVIDER="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --format='value(name)')"

printf 'GCP project number: %s\nWorkload Identity provider: %s\nDeployer service account: %s\nRuntime service account: %s\n' \
  "$PROJECT_NUMBER" "$WIF_PROVIDER" "$DEPLOYER_SA" "$RUNTIME_SA"
```

## 2. Add GitHub Actions variables

In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**, then add these repository variables:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `slabspro-slabsuser33` |
| `GCP_REGION` | `us-central1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | The Workload Identity provider printed by the Cloud Shell commands above |
| `GCP_DEPLOYER_SERVICE_ACCOUNT` | The deployer service account printed by the Cloud Shell commands above |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | The runtime service account printed by the Cloud Shell commands above |

These are resource identifiers, not credentials. The workflow uses short-lived credentials through Workload Identity Federation; do not create or upload a service-account key.

Cloud Run and Artifact Registry can incur charges. Review current GCP pricing and configure a billing budget alert before deploying.

## 3. Push the workflow to GitHub

From the project directory in PowerShell, commit and push the Docker and workflow changes:

```powershell
git add Dockerfile .dockerignore docker/entrypoint.sh server/index.mjs README.md docs/gcp-deployment.md .github/workflows/container-ci.yml
git commit -m "Add Docker and Cloud Run CI/CD"
git push
```

On the push to `main`, GitHub Actions runs tests, frontend build/lint, and a container build. Once the variables and Google Cloud setup are correct, the deploy job publishes the image to Artifact Registry and deploys the public preview to Cloud Run. The service URL appears in the Actions run summary. Pull requests run CI but do not deploy.
