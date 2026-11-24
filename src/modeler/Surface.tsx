// src/modeler/Surface.tsx
import React from "react";
import { View, Text } from "react-native";
import type { NodeSurfaceProps } from "../utopy/ui/PortalHost";

// ➜ reemplaza este stub por tu canvas real cuando quieras
export const ModelerSurface: React.FC<NodeSurfaceProps> = ({ ns, onEmit }) => {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff" }}>ModelerSurface ({ns})</Text>
    </View>
  );
};
