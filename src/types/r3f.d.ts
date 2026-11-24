// types/r3f.d.ts
import '@react-three/fiber';

// En RN no existe el lib DOM; para evitar ruidos con PointerEvent en handlers,
// puedes declarar un alias mínimo (no afecta en runtime).
// Si ya tienes lib DOM, borra este bloque.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface PointerEvent {}

  namespace JSX {
    // Extiende los intrinsic elements (mesh, group, etc.) con las props de R3F
    // para que existan onPointerDown, castShadow, receiveShadow, ...
    interface IntrinsicElements
      extends import('@react-three/fiber').ThreeElements {}
  }
}
