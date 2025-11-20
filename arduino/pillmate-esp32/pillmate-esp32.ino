/*
 * PillMate ESP32 Client
 * 
 * Este sketch conecta tu pastillero ESP32 con el backend de PillMate
 * Configura las credenciales en config.h antes de usar
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "config.h"

// URLs de las Edge Functions
const String BASE_URL = SUPABASE_URL;
const String CONFIG_ENDPOINT = BASE_URL + "/functions/v1/devices-config";
const String DOSE_EVENT_ENDPOINT = BASE_URL + "/functions/v1/events-dose";
const String ALARM_START_ENDPOINT = BASE_URL + "/functions/v1/alarm-start";
const String COMMANDS_POLL_ENDPOINT = BASE_URL + "/functions/v1/commands-poll";
const String COMMANDS_ACK_ENDPOINT = BASE_URL + "/functions/v1/commands-ack";

// Configuración NTP
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = -6 * 3600; // México (UTC-6)
const int daylightOffset_sec = 0;

// Variables globales
struct Compartment {
  String id;
  String title;
  int idx;
  bool active;
};

struct Schedule {
  String id;
  String compartmentId;
  String timeOfDay;
  int daysOfWeek;
  int windowMinutes;
  bool enableBuzzer;
  bool enableLed;
};

Compartment compartments[5];
Schedule schedules[15]; // Máximo 3 schedules por compartimento
int compartmentCount = 0;
int scheduleCount = 0;
String deviceId = "";
String timezone = "";

unsigned long lastConfigFetch = 0;
unsigned long lastCommandPoll = 0;
const unsigned long CONFIG_INTERVAL = 300000; // 5 minutos
const unsigned long POLL_INTERVAL = 30000; // 30 segundos

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=== PillMate ESP32 Client ===");
  Serial.println("Iniciando...");
  
  // Conectar WiFi
  connectWiFi();
  
  // Configurar NTP para timestamps
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  Serial.println("Esperando sincronización NTP...");
  while (!time(nullptr)) {
    Serial.print(".");
    delay(1000);
  }
  Serial.println("\nNTP sincronizado");
  
  // Obtener configuración inicial
  fetchDeviceConfig();
  
  // Configurar pines (ajusta según tu hardware)
  pinMode(LED_BUILTIN, OUTPUT);
  
  Serial.println("Sistema listo!");
}

void loop() {
  unsigned long now = millis();
  
  // Polling de comandos cada 30 segundos
  if (now - lastCommandPoll > POLL_INTERVAL) {
    lastCommandPoll = now;
    pollCommands();
  }
  
  // Actualizar configuración cada 5 minutos
  if (now - lastConfigFetch > CONFIG_INTERVAL) {
    lastConfigFetch = now;
    fetchDeviceConfig();
  }
  
  // Aquí irían tus verificaciones de horarios, etc.
  // checkSchedules();
  
  delay(1000);
}

void connectWiFi() {
  Serial.print("Conectando a WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nError: No se pudo conectar a WiFi");
  }
}

void fetchDeviceConfig() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi desconectado, reintentando...");
    connectWiFi();
    return;
  }
  
  HTTPClient http;
  http.begin(CONFIG_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-serial", DEVICE_SERIAL);
  http.addHeader("x-device-secret", DEVICE_SECRET);
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    
    // Parsear JSON
    DynamicJsonDocument doc(4096);
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      deviceId = doc["deviceId"].as<String>();
      timezone = doc["timezone"].as<String>();
      
      // Parsear compartimentos
      JsonArray comps = doc["compartments"];
      compartmentCount = 0;
      for (JsonObject comp : comps) {
        compartments[compartmentCount].id = comp["id"].as<String>();
        compartments[compartmentCount].title = comp["title"].as<String>();
        compartments[compartmentCount].idx = comp["idx"];
        compartments[compartmentCount].active = comp["active"];
        compartmentCount++;
      }
      
      // Parsear horarios
      JsonArray scheds = doc["schedules"];
      scheduleCount = 0;
      for (JsonObject sched : scheds) {
        schedules[scheduleCount].id = sched["id"].as<String>();
        schedules[scheduleCount].compartmentId = sched["compartment_id"].as<String>();
        schedules[scheduleCount].timeOfDay = sched["time_of_day"].as<String>();
        schedules[scheduleCount].daysOfWeek = sched["days_of_week"];
        schedules[scheduleCount].windowMinutes = sched["window_minutes"];
        schedules[scheduleCount].enableBuzzer = sched["enable_buzzer"];
        schedules[scheduleCount].enableLed = sched["enable_led"];
        scheduleCount++;
      }
      
      Serial.println("✓ Configuración actualizada");
      Serial.printf("  Device ID: %s\n", deviceId.c_str());
      Serial.printf("  Timezone: %s\n", timezone.c_str());
      Serial.printf("  Compartimentos: %d\n", compartmentCount);
      Serial.printf("  Horarios: %d\n", scheduleCount);
    } else {
      Serial.println("✗ Error parseando JSON de configuración");
    }
  } else {
    Serial.printf("✗ Error obteniendo configuración: %d\n", httpCode);
    if (httpCode > 0) {
      Serial.println(http.getString());
    }
  }
  
  http.end();
}

void reportDoseEvent(String compartmentId, String scheduledAt, String status, String scheduleId = "") {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(DOSE_EVENT_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  
  // Crear payload JSON
  DynamicJsonDocument doc(512);
  doc["serial"] = DEVICE_SERIAL;
  doc["secret"] = DEVICE_SECRET;
  doc["compartmentId"] = compartmentId;
  doc["scheduledAt"] = scheduledAt;
  doc["status"] = status;
  doc["source"] = "auto";
  doc["actualAt"] = getCurrentTimestamp();
  
  if (scheduleId.length() > 0) {
    doc["scheduleId"] = scheduleId;
  }
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  int httpCode = http.POST(jsonPayload);
  
  if (httpCode == 200) {
    Serial.println("✓ Evento de dosis reportado");
  } else {
    Serial.printf("✗ Error reportando evento: %d\n", httpCode);
  }
  
  http.end();
}

void triggerAlarm(String compartmentId, String scheduledAt) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(ALARM_START_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(256);
  doc["serial"] = DEVICE_SERIAL;
  doc["secret"] = DEVICE_SECRET;
  doc["compartmentId"] = compartmentId;
  doc["scheduledAt"] = scheduledAt;
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  int httpCode = http.POST(jsonPayload);
  
  if (httpCode == 200) {
    Serial.println("✓ Alarma iniciada - Notificación enviada al usuario");
    
    // Activar alarma local (LED, buzzer, etc.)
    activateLocalAlarm();
  } else {
    Serial.printf("✗ Error iniciando alarma: %d\n", httpCode);
  }
  
  http.end();
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(COMMANDS_POLL_ENDPOINT);
  http.addHeader("x-device-serial", DEVICE_SERIAL);
  http.addHeader("x-device-secret", DEVICE_SECRET);
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    
    DynamicJsonDocument doc(2048);
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      JsonArray commands = doc["commands"];
      
      if (commands.size() > 0) {
        Serial.printf("📥 Recibidos %d comandos\n", commands.size());
        
        for (JsonObject cmd : commands) {
          String commandId = cmd["id"].as<String>();
          String type = cmd["type"].as<String>();
          JsonObject payload = cmd["payload"];
          
          Serial.printf("  Comando: %s (ID: %s)\n", type.c_str(), commandId.c_str());
          
          // Procesar comando
          bool success = processCommand(type, payload);
          
          // Enviar ACK
          acknowledgeCommand(commandId, success ? "done" : "error", 
                           success ? "" : "Error procesando comando");
        }
      }
    }
  } else if (httpCode != 404) {
    Serial.printf("✗ Error polling comandos: %d\n", httpCode);
  }
  
  http.end();
}

bool processCommand(String type, JsonObject payload) {
  if (type == "snooze") {
    int minutes = payload["minutes"];
    Serial.printf("  → Posponer alarma %d minutos\n", minutes);
    // Implementar lógica de snooze
    return true;
    
  } else if (type == "apply_config") {
    Serial.println("  → Aplicar nueva configuración");
    fetchDeviceConfig();
    return true;
    
  } else if (type == "reboot") {
    Serial.println("  → Reiniciar dispositivo");
    delay(1000);
    ESP.restart();
    return true;
    
  } else {
    Serial.printf("  → Comando desconocido: %s\n", type.c_str());
    return false;
  }
}

void acknowledgeCommand(String commandId, String status, String detail) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(COMMANDS_ACK_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(256);
  doc["serial"] = DEVICE_SERIAL;
  doc["secret"] = DEVICE_SECRET;
  doc["commandId"] = commandId;
  doc["status"] = status;
  
  if (detail.length() > 0) {
    doc["detail"] = detail;
  }
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  int httpCode = http.POST(jsonPayload);
  
  if (httpCode == 200) {
    Serial.printf("  ✓ ACK enviado: %s\n", status.c_str());
  } else {
    Serial.printf("  ✗ Error enviando ACK: %d\n", httpCode);
  }
  
  http.end();
}

void activateLocalAlarm() {
  // Implementar tu lógica de alarma local aquí
  // Por ejemplo: encender LED, activar buzzer, mover servo
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("🔔 Alarma local activada");
  
  // Ejemplo: parpadear LED
  for (int i = 0; i < 10; i++) {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(200);
    digitalWrite(LED_BUILTIN, LOW);
    delay(200);
  }
}

String getCurrentTimestamp() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  
  return String(buffer);
}
