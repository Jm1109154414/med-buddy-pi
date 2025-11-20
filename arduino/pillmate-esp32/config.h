/*
 * PillMate ESP32 - Archivo de Configuración
 * 
 * IMPORTANTE: NO subas este archivo a repositorios públicos
 * Contiene tus credenciales secretas
 */

#ifndef CONFIG_H
#define CONFIG_H

// Credenciales WiFi
#define WIFI_SSID "TuRedWiFi"
#define WIFI_PASSWORD "TuPasswordWiFi"

// URL de tu proyecto Supabase
#define SUPABASE_URL "https://cnbjuqvppulnfdxscesr.supabase.co"

// Credenciales del dispositivo (obtenidas al registrar el pastillero en la PWA)
#define DEVICE_SERIAL "TU_SERIAL_AQUI"  // Ejemplo: "PILL-001-ABC123"
#define DEVICE_SECRET "TU_SECRET_AQUI"  // Ejemplo: "mi-secreto-super-seguro-123"

#endif
