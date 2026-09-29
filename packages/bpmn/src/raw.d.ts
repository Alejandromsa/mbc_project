// Las pruebas leen los fixtures con el sufijo ?raw de Vite (Vitest): así el paquete
// no necesita los tipos de Node.
declare module '*?raw' {
  const texto: string;
  export default texto;
}
