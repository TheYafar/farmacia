import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { leerBcv, TasaService } from '../src/tasa/tasa';

const HTML = `<div id="euro"><div class="col-sm-6 col-xs-6 centrado"><strong> 1.009,07172979 </strong></div></div>
<div id="dolar"><div class="col-sm-6 col-xs-6 centrado"><strong> 918,76620000 </strong></div></div>
<span class="date-display-single" content="2026-11-20T00:00:00-04:00">`;
const resp = (cuerpo: string | object, ok = true) => ({ ok, status: ok ? 200 : 500, text: async () => String(cuerpo), json: async () => cuerpo }) as unknown as Response;

describe('Tasa del BCV', () => {
  it('lee el dólar y el euro de la página del BCV', async () => {
    const r = await leerBcv((async () => resp(HTML)) as typeof fetch);
    assert.equal(r.usd, 918.7662);
    assert.equal(r.eur, 1009.07172979);
    assert.equal(r.origen, 'bcv.org.ve');
  });

  it('si la página del BCV falla, usa dolarapi', async () => {
    const f = (async (url: string) => {
      if (url.includes('bcv.org.ve')) throw new Error('certificado');
      return resp({ promedio: url.includes('euros') ? 1009.07 : 918.77, fechaActualizacion: '2026-11-20T00:00:00-04:00' });
    }) as typeof fetch;
    const r = await leerBcv(f);
    assert.equal(r.usd, 918.77);
    assert.match(r.origen, /dolarapi/);
  });

  it('si todo falla, avisa que hay que escribirla a mano', async () => {
    await assert.rejects(leerBcv((async () => { throw new Error('sin red'); }) as typeof fetch), /a mano/);
  });

  it('aplica el ajuste de la farmacia: + Bs o + %', () => {
    const base = { bcvUsd: new Prisma.Decimal(918.7662), bcvEur: new Prisma.Decimal(1009.0717), tasaAjusteValor: new Prisma.Decimal(0) };
    assert.equal(TasaService.calcular({ ...base, tasaModo: 'BCV_USD', tasaAjusteTipo: 'NINGUNO' })!.valor.toFixed(4), '918.7662');
    const bs = TasaService.calcular({ ...base, tasaModo: 'BCV_USD', tasaAjusteTipo: 'BS', tasaAjusteValor: new Prisma.Decimal(1) })!;
    assert.equal(bs.valor.toFixed(4), '919.7662');
    assert.equal(bs.fuente, 'BCV dólar 918,77 + 1,00 Bs');
    const pct = TasaService.calcular({ ...base, tasaModo: 'BCV_EUR', tasaAjusteTipo: 'PCT', tasaAjusteValor: new Prisma.Decimal(2) })!;
    assert.equal(pct.valor.toFixed(4), '1029.2531');
    assert.match(pct.fuente, /^BCV euro 1\.009,07 \+ 2,00 %$/);
  });
});
