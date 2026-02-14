@echo off
echo Starting PaperBanana API Service...
echo Checking for Python...
python --version
if %errorlevel% neq 0 (
    echo Python is not found. Please install Python 3.10+ and add it to your PATH.
    pause
    exit /b 1
)

echo Installing dependencies...
pip install -r requirements.txt

echo Starting Server...
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
