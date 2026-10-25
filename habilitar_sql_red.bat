@echo off
title Habilitar TCP/IP en SQL Server
echo Solicitando permisos de administrador de Windows...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File \"\"%~dp0habilitar_sql_red.ps1\"\"' -Verb RunAs"
