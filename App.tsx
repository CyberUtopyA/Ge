// App.tsx
import React, { useEffect } from "react";
import { StatusBar, View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import NodeHost from "./src/utopy/ui/PortalHost";
import { initSpores, spore } from "./src/utopy/spore";

// Superficies
import { GoodEnergySurface } from "./src/goodenergy/ui/GoodEnergy.surface";
import { ModelerSurface } from "./src/modeler/Surface";

// Boots
import { prepareGoodEnergy, startGoodEnergy } from "./src/goodenergy";
import { bootModeler } from "./src/modeler";
import { bootstrapEnergyCoreController } from "./src/goodenergy/energy.core";

export default function App() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) PREPARE GE (NO usa spore todavía, solo manifest + handlers "inofensivos")
      const manifest = prepareGoodEnergy();

      // 2) INIT SPORES (token listo por frame)
      await initSpores(manifest);

      if (cancelled) return;

      // 3) START GE (AHORA sí: capabilities, modeler bus, intents iniciales)
      await startGoodEnergy();

      if (cancelled) return;

      // 4) Boot modeler (ya con spore inicializado)
      await bootModeler();

      if (cancelled) return;

      // 5) Controller. Los providers de señales se conectan explícitamente.
      bootstrapEnergyCoreController("energy:core");

      if (cancelled) return;

      // 6) Señales iniciales
      await spore.sayIntent({ sym: "🧠", say: "alive", ns: "system" });
      await spore.sayIntent({ sym: "⚡", say: "abrir", ns: "energy:core" });
      await spore.sayIntent({ sym: "🧬", say: "abrir", ns: "modeler:core" });
    })().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7F8F3" />

        <View style={styles.content}>
          {/* GoodEnergy en pantalla */}
          <NodeHost ns="energy:core" Surface={GoodEnergySurface} />

          {/* Modeler montado en segundo plano */}
          <View style={styles.hiddenHost}>
            <NodeHost ns="modeler:core" Surface={ModelerSurface} />
          </View>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F8F3" },
  content: { flex: 1, position: "relative" },
  hiddenHost: {
    position: "absolute",
    opacity: 0,
    width: 0,
    height: 0,
    overflow: "hidden",
  },
});
