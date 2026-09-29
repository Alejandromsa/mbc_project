import { describe, expect, it } from 'vitest';
import { leerConfig } from './config.js';

const BASE = { DATABASE_URL: 'postgres://u:c@localhost:5440/processiq', ORIGEN_PUBLICO: 'https://mbc.prueba/' };

describe('leerConfig', () => {
  it('valores por defecto: puerto 8080, sesiones de 12 h; vacías cuentan como ausentes', () => {
    for (const extra of [{}, { PORT: '', HORAS_SESION: '' }, { PORT: '  ', HORAS_SESION: ' ' }]) {
      const c = leerConfig({ ...BASE, ...extra });
      expect([c.puerto, c.horasSesion, c.origenPublico]).toEqual([8080, 12, 'https://mbc.prueba']);
    }
    const c = leerConfig({ ...BASE, PORT: '8790', HORAS_SESION: '1.5' });
    expect([c.puerto, c.horasSesion]).toEqual([8790, 1.5]);
  });

  it('HORAS_SESION y PORT no numéricos o fuera de rango: error que nombra la variable', () => {
    expect(() => leerConfig({ ...BASE, HORAS_SESION: 'doce' })).toThrow('HORAS_SESION debe ser un número mayor que 0 (vale "doce")');
    expect(() => leerConfig({ ...BASE, HORAS_SESION: '0' })).toThrow('HORAS_SESION debe ser un número mayor que 0');
    expect(() => leerConfig({ ...BASE, HORAS_SESION: '-3' })).toThrow('HORAS_SESION');
    expect(() => leerConfig({ ...BASE, PORT: 'ochenta' })).toThrow('PORT debe ser un número de puerto entre 1 y 65535 (vale "ochenta")');
    expect(() => leerConfig({ ...BASE, PORT: '80.5' })).toThrow('PORT');
    expect(() => leerConfig({ ...BASE, PORT: '70000' })).toThrow('PORT');
    expect(() => leerConfig({ ...BASE, PORT: '0' })).toThrow('PORT');
  });

  it('la IA está configurada con la clave (desarrollo) o con IA_CONFIGURADA=si (Docker, sin la clave)', () => {
    expect(leerConfig(BASE).ia.configurada).toBe(false);
    expect(leerConfig({ ...BASE, IA_CONFIGURADA: '' }).ia.configurada).toBe(false);
    expect(leerConfig({ ...BASE, IA_CONFIGURADA: 'no' }).ia.configurada).toBe(false);
    expect(leerConfig({ ...BASE, IA_CONFIGURADA: 'si' }).ia.configurada).toBe(true);
    expect(leerConfig({ ...BASE, IA_CONFIGURADA: ' Sí ' }).ia.configurada).toBe(true);
    expect(leerConfig({ ...BASE, ANTHROPIC_API_KEY: 'sk-ant-prueba' }).ia.configurada).toBe(true);
  });

  it('sigue exigiendo DATABASE_URL y un ORIGEN_PUBLICO con forma de origen', () => {
    expect(() => leerConfig({ ORIGEN_PUBLICO: BASE.ORIGEN_PUBLICO })).toThrow('Falta DATABASE_URL');
    expect(() => leerConfig({ ...BASE, ORIGEN_PUBLICO: 'https://mbc.prueba/app' })).toThrow('ORIGEN_PUBLICO');
  });
});
