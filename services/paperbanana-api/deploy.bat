@echo off
echo Deploying PaperBanana API to Cloud Run...

REM Check for gcloud
gcloud version >nul 2>&1
if %errorlevel% neq 0 (
    echo gcloud CLI is not installed or not in PATH.
    echo Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
    pause
    exit /b 1
)

REM Authenticate if needed
echo Checking authentication...
gcloud auth print-identity_token >nul 2>&1
if %errorlevel% neq 0 (
    echo Please log in to Google Cloud...
    gcloud auth login
)

REM Set project
set /p PROJECT_ID="Enter your Google Cloud Project ID: "
gcloud config set project %PROJECT_ID%

REM Enable services
echo Enabling required services...
gcloud services enable run.googleapis.com artifactregistry.googleapis.com

REM Deploy
echo Deploying to Cloud Run...
gcloud run deploy paperbanana-api ^
    --source . ^
    --platform managed ^
    --region us-central1 ^
    --allow-unauthenticated ^
    --set-env-vars GOOGLE_API_KEY=%GOOGLE_API_KEY%

echo.
echo Deployment complete!
echo Please copy the Service URL shown above.
pause
