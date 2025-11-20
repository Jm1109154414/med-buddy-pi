# PillMate ESP32 - Cliente Arduino

Este directorio contiene el código Arduino para conectar tu pastillero ESP32 al backend de PillMate.

## 📋 Requisitos

### Hardware
- ESP32 (cualquier variante)
- Servo motor (para dispensar pastillas)
- LED y Buzzer para alarmas
- Alimentación 5V

### Software
- Arduino IDE 1.8.x o 2.x
- Librerías requeridas:
  - `ArduinoJson` (v6.x)
  - `HTTPClient` (incluida en ESP32)
  - `WiFi` (incluida en ESP32)

## 🚀 Instalación

### 1. Instalar Arduino IDE
Descarga desde [arduino.cc](https://www.arduino.cc/en/software)

### 2. Configurar soporte para ESP32
1. Abre Arduino IDE
2. Ve a `Archivo > Preferencias`
3. En "Gestor de URLs Adicionales de Tarjetas", añade:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Ve a `Herramientas > Placa > Gestor de tarjetas`
5. Busca "ESP32" e instala "esp32 by Espressif Systems"

### 3. Instalar librerías
1. Ve a `Programa > Incluir Librería > Gestionar Bibliotecas`
2. Busca e instala:
   - **ArduinoJson** (versión 6.21.0 o superior)

### 4. Configurar credenciales
1. Abre `pillmate-esp32/config.h`
2. Actualiza los valores:
   ```cpp
   #define WIFI_SSID "TuRedWiFi"
   #define WIFI_PASSWORD "TuPasswordWiFi"
   #define DEVICE_SERIAL "PILL-001-ABC123"  // De la PWA
   #define DEVICE_SECRET "tu-secreto-aqui"   // De la PWA
   ```

### 5. Cargar el código
1. Conecta tu ESP32 al PC vía USB
2. Selecciona tu placa en `Herramientas > Placa > ESP32`
3. Selecciona el puerto correcto en `Herramientas > Puerto`
4. Haz clic en "Subir" (→)

## 📡 Cómo funciona

### Flujo de autenticación
Todas las peticiones HTTP incluyen headers de autenticación:
```cpp
http.addHeader("x-device-serial", DEVICE_SERIAL);
http.addHeader("x-device-secret", DEVICE_SECRET);
```

### Endpoints disponibles

#### 1. Obtener configuración (`devices-config`)
- **Método**: GET
- **Frecuencia**: Cada 5 minutos
- **Retorna**: Compartimentos, horarios, timezone

#### 2. Reportar evento de dosis (`events-dose`)
- **Método**: POST
- **Cuándo**: Cuando el usuario confirma que tomó la pastilla
- **Payload**: compartmentId, scheduledAt, status, scheduleId

#### 3. Iniciar alarma (`alarm-start`)
- **Método**: POST
- **Cuándo**: Cuando llega la hora de tomar medicina
- **Efecto**: Envía notificación push al usuario

#### 4. Consultar comandos (`commands-poll`)
- **Método**: GET
- **Frecuencia**: Cada 30 segundos
- **Retorna**: Comandos pendientes (snooze, apply_config, reboot)

#### 5. Confirmar comando (`commands-ack`)
- **Método**: POST
- **Cuándo**: Después de ejecutar un comando
- **Payload**: commandId, status (done/error)

## 🔧 Personalización

### Añadir servo para dispensar
```cpp
#include <ESP32Servo.h>

Servo dispenser;

void dispenseFromCompartment(int compartmentIdx) {
  // Usar el ángulo configurado en el compartimento
  dispenser.write(90); // Ajusta según tu hardware
  delay(1000);
  dispenser.write(0);
  
  // Reportar que se dispensó
  reportDoseEvent(
    compartments[compartmentIdx].id,
    getCurrentTimestamp(),
    "taken"
  );
}
```

### Verificar horarios
```cpp
void checkSchedules() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  localtime_r(&now, &timeinfo);
  
  char currentTime[6];
  sprintf(currentTime, "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min);
  
  for (int i = 0; i < scheduleCount; i++) {
    if (schedules[i].timeOfDay == String(currentTime)) {
      // Es hora de tomar medicina
      String compartmentId = schedules[i].compartmentId;
      triggerAlarm(compartmentId, getCurrentTimestamp());
      
      if (schedules[i].enableLed) activateLED();
      if (schedules[i].enableBuzzer) activateBuzzer();
    }
  }
}
```

## 🐛 Debugging

### Monitor serial
Abre el monitor serial en `Herramientas > Monitor Serie` (115200 baud)

Verás logs como:
```
=== PillMate ESP32 Client ===
Iniciando...
Conectando a WiFi: MiRed
..........
WiFi conectado!
IP: 192.168.1.100
Esperando sincronización NTP...
NTP sincronizado
✓ Configuración actualizada
  Device ID: abc-123-def
  Timezone: America/Mexico_City
  Compartimentos: 3
  Horarios: 5
Sistema listo!
```

### Problemas comunes

**Error 401 (Unauthorized)**
- Verifica que `DEVICE_SERIAL` y `DEVICE_SECRET` coincidan con los registrados en la PWA
- El secret debe ser el texto plano, no el hash

**Error 404 (Device not found)**
- Primero registra el dispositivo en la PWA (`/device`)
- Verifica que el serial sea exactamente el mismo

**WiFi no conecta**
- Verifica SSID y contraseña
- Asegúrate que tu ESP32 esté en rango del WiFi

**JSON parse error**
- Aumenta el tamaño del `DynamicJsonDocument` si la configuración es muy grande
- Verifica que el backend esté respondiendo JSON válido

## 📚 Recursos adicionales

- [Documentación ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/)
- [ArduinoJson Assistant](https://arduinojson.org/v6/assistant/)
- [PillMate Backend API](../README.md)

## 🔐 Seguridad

- **NUNCA** subas `config.h` a GitHub u otros repositorios públicos
- El `DEVICE_SECRET` debe mantenerse privado
- Cada dispositivo debe tener un serial y secret únicos
- Considera usar HTTPS para todas las conexiones (ESP32 lo soporta)

## 📞 Soporte

Si tienes problemas:
1. Revisa el monitor serial para ver errores específicos
2. Verifica que el backend esté funcionando (`/functions/v1/health`)
3. Prueba las peticiones manualmente con `curl` para aislar el problema
