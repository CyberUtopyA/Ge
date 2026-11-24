# GE Physical Core (KMP)

Módulo paralelo al GE React Native actual. `commonMain` contiene modelos y reglas puras; los providers de medición, tiempo, IDs, persistencia, transporte, voz y autoridad son interfaces del host. Las carpetas Android, iOS y desktop quedan listas para adapters. Compose se incorpora cuando se migre una proyección de UI.

Desde esta carpeta, en Windows:

```powershell
..\android\gradlew.bat desktopTest
..\android\gradlew.bat compileDebugKotlinAndroid
```

La tarea Android requiere `ANDROID_HOME` apuntando al SDK. El target iOS se valida en macOS. El módulo no está conectado aún al Runtime ni a la UI React Native; la implementación TypeScript sigue activa.
