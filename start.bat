@echo off
title Solana AI Bot
echo.
echo  ==============================
echo   Solana AI Bot - Starting...
echo  ==============================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Python not found.
  echo  Download from: https://python.org/downloads
  echo  Make sure to check "Add Python to PATH" during install!
  pause
  exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js not found.
  echo  Download from: https://nodejs.org
  pause
  exit /b 1
)

:: Create data directory
if not exist "data" mkdir data

:: Install dashboard deps if needed
if not exist "dashboard\node_modules" (
  echo  Installing dashboard packages (first time only)...
  cd dashboard
  npm install
  cd ..
  echo  Done!
)

echo.
echo  Starting ML engine on http://localhost:8000
start "Solana AI - ML Engine" cmd /k "cd ml-engine && python api_server.py"

timeout /t 3 /nobreak >nul

echo  Starting dashboard on http://localhost:3000
start "Solana AI - Dashboard" cmd /k "cd dashboard && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo  ==============================
echo   Bot is running!
echo.
echo   Dashboard: http://localhost:3000
echo   API:       http://localhost:8000
echo.
echo   Open http://localhost:3000 in your browser
echo  ==============================
echo.
echo  Close the two terminal windows to stop the bot.
echo.
pause
